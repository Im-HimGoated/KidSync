const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sync = require('../assets/cloud-snapshot-sync.js');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function source(name, async = false) {
  const start = html.indexOf(`    ${async ? 'async ' : ''}function ${name}(`);
  const end = html.indexOf('\n    }', start);
  assert(start >= 0 && end > start, name);
  return html.slice(start, end + 6);
}

// Independent client storage and production sync functions, with a simulated
// Supabase SDK boundary. These are not a substitute for live RLS/device checks.
function database() {
  const rows = new Map();
  return { rows, failWrites: false, beforeWrite: null };
}

function device(db, userId = 'same-account') {
  const storage = new Map();
  const scheduled = [];
  const statuses = [];
  const client = {
    from(table) {
      assert.equal(table, 'family_schedules');
      let payload;
      let requestedUser, previousVersion, inserting;
      return {
        insert(value) {
          assert.equal(value.user_id, userId);
          payload = JSON.parse(JSON.stringify(value));
          inserting = true;
          return this;
        },
        update(value) { payload = JSON.parse(JSON.stringify(value)); return this; },
        select() { return this; },
        eq(column, value) {
          if (column === 'user_id') requestedUser = value;
          else { assert.equal(column, 'updated_at'); previousVersion = value; }
          return this;
        },
        async maybeSingle() {
          if (!inserting) assert.equal(requestedUser, userId);
          const row = db.rows.get(requestedUser);
          if (payload) {
            if (db.failWrites) return { error: new Error('Simulated network failure') };
            if (db.beforeWrite) db.beforeWrite();
            const latest = db.rows.get(userId);
            if (inserting && latest) return { error: { code: '23505' } };
            if (!inserting && latest?.updated_at !== previousVersion) return { data: null };
            const data = { schedule: payload.schedule, updated_at: payload.updated_at };
            db.rows.set(userId, data);
            return { data: JSON.parse(JSON.stringify(data)), error: null };
          }
          return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
        }
      };
    }
  };
  const context = vm.createContext({
    cloudClient: client, cloudSession: { user: { id: userId } }, activeAccount: { id: userId, provider: 'supabase' },
    cloudSyncBusy: false, cloudSyncRequested: false, cloudSaveTimer: null,
    cloudBaseline: null, CLOUD_UPDATED_KEY: 'updated', CLOUD_BASE_KEY: 'baseline', accountDataKey: (_user, key) => key,
    navigator: { onLine: true }, snapshot: { activities: [] },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    cloudPendingKey: () => 'pending', cloudUpdatedKey: () => 'updated',
    setCloudSaveState: status => statuses.push(status), reportClientError() {}, openWelcomeBackIfNeeded() {},
    window: { KidsSyncCloudSnapshotSync: sync, clearTimeout() {}, setTimeout: (fn, delay) => scheduled.push({ fn, delay }) }
  });
  context.buildCloudSnapshot = () => JSON.parse(JSON.stringify(context.snapshot));
  context.applyCloudSnapshot = value => { context.snapshot = JSON.parse(JSON.stringify(value)); };
  vm.runInContext([
    source('hasPendingCloudSave'), source('markCloudSavePending'),
    source('getCloudBaseline'), source('rememberCloudBaseline'),
    source('flushCloudSave', true), source('hydrateCloudSchedule', true)
  ].join('\n'), context);
  return {
    context, storage, statuses, scheduled,
    edit(activities, version = 'local-edit') {
      context.snapshot = { activities };
      storage.set('pending', version);
    },
    save: () => context.flushCloudSave(),
    refresh: () => context.hydrateCloudSchedule()
  };
}

test('independent devices exchange a created event, edit, and deletion through cloud snapshots', async () => {
  const db = database();
  const first = device(db);
  const second = device(db);
  first.edit([{ id: 'sync-test', title: 'Original' }]);
  assert.equal(await first.save(), true);
  assert.equal(first.storage.has('pending'), false);
  assert.equal(await second.refresh(), true);
  assert.equal(second.context.snapshot.activities[0].title, 'Original');
  second.edit([{ id: 'sync-test', title: 'Edited on second device' }]);
  assert.equal(await second.save(), true);
  assert.equal(await first.refresh(), true);
  assert.equal(first.context.snapshot.activities[0].title, 'Edited on second device');
  second.edit([]);
  assert.equal(await second.save(), true);
  assert.equal(await first.refresh(), true);
  assert.equal(first.context.snapshot.activities.length, 0);
  assert.equal(first.statuses.at(-1), 'cloud');
});

test('an unrelated account does not hydrate another account snapshot', async () => {
  const db = database();
  const first = device(db);
  first.edit([{ id: 'private-event' }]);
  await first.save();
  const other = device(db, 'another-account');
  await other.refresh();
  assert.equal(other.context.snapshot.activities.length, 0);
  assert.equal(db.rows.get('same-account').schedule.activities[0].id, 'private-event');
  assert.equal(db.rows.get('another-account').schedule.activities.length, 0);
});

test('failed and offline uploads retain pending edits until a successful retry', async () => {
  const db = database();
  const first = device(db);
  first.edit([{ id: 'offline-event' }]);
  first.context.navigator.onLine = false;
  assert.equal(await first.save(), false);
  assert.equal(first.statuses.at(-1), 'offline');
  first.context.navigator.onLine = true;
  db.failWrites = true;
  assert.equal(await first.save(), false);
  assert.equal(first.statuses.at(-1), 'syncFailed');
  assert.equal(first.storage.get('pending'), 'local-edit');
  assert.equal(db.rows.size, 0);
  db.failWrites = false;
  assert.equal(await first.refresh(), true);
  assert.equal(first.storage.has('pending'), false);
  assert.equal(db.rows.get('same-account').schedule.activities[0].id, 'offline-event');
});

test('edits arriving during an upload remain pending and trigger another save', async () => {
  const db = database();
  const first = device(db);
  first.edit([{ id: 'initial' }], 'version-1');
  db.beforeWrite = () => {
    db.beforeWrite = null;
    first.edit([{ id: 'initial' }, { id: 'newer' }], 'version-2');
  };
  assert.equal(await first.save(), true);
  assert.equal(first.storage.get('pending'), 'version-2');
  assert.equal(first.statuses.at(-1), 'syncing');
  assert.equal(first.scheduled.at(-1).delay, 900);
  await first.scheduled.at(-1).fn();
  assert.equal(first.storage.has('pending'), false);
  assert.equal(db.rows.get('same-account').schedule.activities.length, 2);
});

test('a pre-existing cloud row without an acknowledged baseline retains a browser draft for recovery', async () => {
  const db = database();
  const phone = device(db);
  phone.edit([{ id: 'phone', title: 'Phone plan' }]);
  assert.equal(await phone.save(), true);
  const browser = device(db);
  browser.storage.set('updated', db.rows.get('same-account').updated_at);
  browser.edit([{ id: 'legacy-offline', title: 'Unsynced browser plan' }]);
  assert.equal(await browser.save(), false);
  assert.equal(browser.statuses.at(-1), 'syncConflict');
  assert.equal(browser.storage.get('pending'), 'local-edit');
  assert.equal(browser.context.snapshot.activities[0].id, 'legacy-offline');
  assert.equal(db.rows.get('same-account').schedule.activities[0].id, 'phone');
});

test('conflict recovery backs up before applying cloud data and aborts if pending edits change', async () => {
  const db = database();
  const phone = device(db);
  phone.edit([{ id: 'phone' }]);
  await phone.save();
  const browser = device(db);
  const operations = [];
  browser.context.window.confirm = () => true;
  browser.context.t = text => text;
  browser.context.renderCloudSettings = () => {};
  browser.context.downloadCalendarFile = content => operations.push(['backup', JSON.parse(content).activities[0].id]);
  const apply = browser.context.applyCloudSnapshot;
  browser.context.applyCloudSnapshot = snapshot => { operations.push(['apply', snapshot.activities[0].id]); apply(snapshot); };
  vm.runInContext(source('recoverCloudSchedule', true), browser.context);
  browser.edit([{ id: 'browser' }]);
  browser.context.cloudSaveState = 'syncConflict';
  const interrupted = browser.context.recoverCloudSchedule();
  browser.edit([{ id: 'newer' }], 'newer-version');
  await interrupted;
  assert.deepEqual(operations, []);
  assert.equal(browser.storage.get('pending'), 'newer-version');
  await browser.context.recoverCloudSchedule();
  assert.deepEqual(operations, [['backup', 'newer'], ['apply', 'phone']]);
  assert.equal(browser.storage.has('pending'), false);
  assert.equal(browser.statuses.at(-1), 'cloud');
});
