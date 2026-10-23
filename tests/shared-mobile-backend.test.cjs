const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { readSchedule, calendarEntries, watchSchedule } = require('../shared/backend/schedules');
const config = require('../shared/backend/config');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fakeClient() {
  const requests = [];
  const filters = [];
  let event, status, removed = 0;
  const channel = {
    on(type, filter, callback) { assert.equal(type, 'postgres_changes'); filters.push(filter); event = callback; return this; },
    subscribe(callback) { status = callback; return this; }
  };
  return {
    requests, filters,
    from(table) {
      assert.equal(table, 'family_schedules');
      return {
        select(columns) {
          assert.equal(columns, 'schedule, updated_at');
          return { eq(key, id) {
            assert.equal(key, 'user_id'); assert.equal(id, 'owner-1');
            return { maybeSingle() { return new Promise(resolve => requests.push(resolve)); } };
          } };
        }
      };
    },
    channel() { return channel; },
    removeChannel(actual) { assert.equal(actual, channel); removed++; },
    change() { return event(); },
    subscribed() { status('SUBSCRIBED'); },
    removed: () => removed
  };
}

test('browser and React Native import one identical public backend configuration', () => {
  const context = vm.createContext({});
  vm.runInContext(source('shared/backend/config.js'), context);
  assert.equal(context.KIDSSYNC_SUPABASE.url, config.url);
  assert.equal(context.KIDSSYNC_SUPABASE.publishableKey, config.publishableKey);
  assert.match(config.publishableKey, /^sb_publishable_/);
  const html = source('index.html');
  assert.ok(html.indexOf('./shared/backend/config.js') < html.indexOf('./supabase-config.js'));
  assert.match(source('mobile/src/lib/supabase.js'), /import config from '\.\.\/\.\.\/\.\.\/shared\/backend\/config'/);
  assert.match(source('sw.js'), /"\.\/shared\/backend\/config.js"/);
});

test('native auth persists sessions and uses process locking, without URL detection', () => {
  const client = source('mobile/src/lib/supabase.js');
  for (const value of ['storage: AsyncStorage', 'persistSession: true', 'detectSessionInUrl: false', 'lock: processLock']) assert.ok(client.includes(value));
  const app = source('mobile/src/App.js');
  for (const value of ['startAutoRefresh()', 'stopAutoRefresh()', "AppState.addEventListener('change'", 'sync.refresh()', 'sync.stop()', 'subscription.unsubscribe()']) assert.ok(app.includes(value));
  assert.doesNotMatch(app, /\.upsert\(|\.insert\(|\.update\(|\.delete\(/);
});

test('schedule adapter preserves the complete web snapshot and unknown fields', () => {
  const snapshot = { version: 2, calendars: [{ id: 'school', name: 'School' }], activeCalendarId: 'school',
    calendarData: { school: { kids: [], activities: [{ id: 1, title: 'Coding', futureField: true }], audit: [1] } }, futureField: {} };
  const before = JSON.stringify(snapshot);
  const entries = calendarEntries(snapshot);
  assert.equal(entries[0].data, snapshot.calendarData.school);
  assert.equal(entries[0].data.activities[0].futureField, true);
  assert.equal(JSON.stringify(snapshot), before);
});

test('empty accounts get no example children or calendars; legacy snapshots remain readable', () => {
  assert.deepEqual(calendarEntries(null), []);
  assert.deepEqual(calendarEntries({ calendars: [], calendarData: {} }), []);
  const legacy = { kids: [], activities: [] };
  assert.equal(calendarEntries(legacy)[0].data, legacy);
});

test('reader uses the existing owner row and rejects database errors', async () => {
  const client = fakeClient();
  const read = readSchedule(client, 'owner-1');
  client.requests[0]({ data: null, error: null });
  assert.equal(await read, null);
  await assert.rejects(readSchedule(client, ''), /Sign in/);
  const failed = readSchedule(client, 'owner-1');
  client.requests[1]({ data: null, error: new Error('denied') });
  await assert.rejects(failed, /denied/);
});

test('Realtime scopes subscriptions to the signed-in owner and fetches on changes', async () => {
  const client = fakeClient(); const rows = [];
  const watcher = watchSchedule(client, 'owner-1', { onData: row => rows.push(row) });
  assert.deepEqual(client.filters, [{ event: '*', schema: 'public', table: 'family_schedules', filter: 'user_id=eq.owner-1' }]);
  client.requests[0]({ data: { updated_at: 'first' }, error: null }); await tick();
  client.subscribed();
  client.requests[1]({ data: { updated_at: 'subscribed' }, error: null }); await tick();
  client.change();
  client.requests[2]({ data: { updated_at: 'changed' }, error: null }); await tick();
  assert.deepEqual(rows.map(row => row.updated_at), ['first', 'subscribed', 'changed']);
  watcher.stop(); watcher.stop(); assert.equal(client.removed(), 1);
});

test('out-of-order network reads never replace a newer response', async () => {
  const client = fakeClient(); const rows = [];
  const watcher = watchSchedule(client, 'owner-1', { onData: row => rows.push(row) });
  watcher.refresh();
  client.requests[1]({ data: 'newer', error: null }); await tick();
  client.requests[0]({ data: 'older', error: null }); await tick();
  assert.deepEqual(rows, ['newer']); watcher.stop();
});

test('stopping an old account subscription suppresses in-flight data and errors', async () => {
  const client = fakeClient(); const received = [];
  const watcher = watchSchedule(client, 'owner-1', { onData: row => received.push(row), onError: error => received.push(error) });
  watcher.stop();
  client.requests[0]({ error: new Error('old account') }); await tick();
  await watcher.refresh(); client.change(); await tick();
  assert.deepEqual(received, []); assert.equal(client.requests.length, 1);
});

test('failed refresh surfaces errors and a later refresh recovers', async () => {
  const client = fakeClient(); const received = [];
  const watcher = watchSchedule(client, 'owner-1', { onData: row => received.push(row), onError: error => received.push(error.message) });
  client.requests[0]({ error: new Error('offline') }); await tick();
  watcher.refresh(); client.requests[1]({ data: 'recovered' }); await tick();
  assert.deepEqual(received, ['offline', 'recovered']); watcher.stop();
});
