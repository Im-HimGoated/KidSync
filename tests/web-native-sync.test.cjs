const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createScheduleSync } = require('../mobile/src/lib/schedule-sync');
const cloudSnapshotSync = require('../assets/cloud-snapshot-sync');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function webFunction(name, async = false) {
  const start = html.indexOf(`    ${async ? 'async ' : ''}function ${name}(`);
  const end = html.indexOf('\n    }', start);
  assert.ok(start >= 0 && end > start, name);
  return html.slice(start, end + 6);
}

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const account = 'sync-test-owner';
const calendarId = 'family';
const plan = (id, title) => ({ id, title, startDate: '2026-11-14', start: '15:00', end: '16:00' });
const calendarData = activities => ({ activities, kids: [], presets: [], history: [], audit: [], settings: {}, view: 'week' });

function database() {
  const initial = calendarData([plan('practice', 'Practice')]);
  const state = { row: { updated_at: '2026-11-13T20:00:00.123456+00:00', schedule: {
    version: 2, activeCalendarId: calendarId, calendars: [{ id: calendarId, name: 'Family' }, { id: 'other', name: 'Other' }],
    calendarData: { [calendarId]: initial, other: calendarData([plan('other', 'Other calendar')]) },
    profile: {}, ...initial,
    remoteOnly: { keep: true },
  } } };
  function connect() {
    const connection = { online: true };
    function available() {
      if (!connection.online) throw new TypeError('Network request failed');
    }
    return {
      connection,
      auth: { async getUser() { available(); return { data: { user: { id: account } }, error: null }; } },
      from(table) {
        assert.equal(table, 'family_schedules');
        const filters = {};
        let update;
        const query = {
          select() { return query; },
          eq(name, value) { filters[name] = value; return query; },
          update(value) { update = clone(value); return query; },
          async maybeSingle() {
            available();
            assert.equal(filters.user_id, account);
            if (update) {
              await connection.beforeUpdate?.();
              if (state.row.updated_at !== filters.updated_at) return { data: null, error: null };
              assert.ok(Date.parse(update.updated_at) > Date.parse(state.row.updated_at), 'version advances per save');
              state.row = update;
            }
            return { data: clone(state.row), error: null };
          },
        };
        return query;
      },
    };
  }
  return { state, connect };
}

function webDevice(client) {
  const data = new Map(), calendarKey = (name, id) => `${id}:${name}`;
  const statuses = [], errors = [];
  let edit = 0;
  const context = vm.createContext({
    localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) },
    cloudClient: client, cloudSession: { user: { id: account } }, activeAccount: { id: account, provider: 'supabase' },
    cloudSyncBusy: false, cloudSyncRequested: false, cloudSaveTimer: null, cloudBaseline: null, cloudHydrating: false,
    navigator: { onLine: true }, accountDataKey: (id, key) => `${id}:${key}`,
    CLOUD_PENDING_KEY: 'pending', CLOUD_UPDATED_KEY: 'updated', CLOUD_BASE_KEY: 'baseline',
    setCloudSaveState: status => statuses.push(status), reportClientError: error => errors.push(error),
    window: { KidsSyncCloudSnapshotSync: cloudSnapshotSync, clearTimeout() {}, setTimeout() {} },
    calendars: [], currentCalendarId: calendarId, currentView: 'week',
    kidProfiles: [], savedPresets: [], scheduleHistory: [], activityAudit: [], userSettings: {},
    state: { activities: [], visibleKids: new Set(), stackFront: new Map() },
    palettes: {}, calendarStorageKey: calendarKey, baseScheduleStorageKey: name => name,
    CALENDARS_STORAGE_NAME: 'calendars', persistActiveCalendar() {},
    scheduleStorageKey: name => calendarKey(name, context.currentCalendarId),
    profileStorageKey: () => 'profile', loadFamilyProfile: () => JSON.parse(data.get('profile') || '{}'),
    normalizeFamilyProfile: profile => profile, buildKids: () => [],
    loadSettings: () => JSON.parse(data.get(calendarKey('settings', context.currentCalendarId)) || '{}'),
    loadCalendarView: () => context.currentView, applySettings() {},
    updateAccountIdentity() {}, populateFormOptions() {}, renderAll() {}, startNotificationChecks() {}, openWelcomeBackIfNeeded() {},
  });
  const functions = ['cloudPendingKey', 'cloudUpdatedKey', 'getCloudBaseline', 'rememberCloudBaseline',
    'hasPendingCloudSave', 'markCloudSavePending', 'buildCloudSnapshot', 'applyCloudSnapshot'];
  vm.runInContext([...functions.map(name => webFunction(name)),
    webFunction('flushCloudSave', true), webFunction('hydrateCloudSchedule', true)].join('\n'), context);
  return {
    read: () => context.hydrateCloudSchedule({ live: true }),
    plans: () => clone(context.state.activities),
    setPlans: activities => {
      context.state.activities = clone(activities);
      data.set(context.cloudPendingKey(), String(++edit));
    },
    save: () => context.flushCloudSave(),
    status: () => statuses.at(-1),
    error: () => errors.at(-1),
    hasPending: () => context.hasPendingCloudSave(),
  };
}

function nativeDevice(client) {
  const data = new Map();
  const sync = createScheduleSync({ client, userId: account,
    storage: { async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { data.set(key, value); } } });
  const plans = () => sync.getState().row.schedule.calendarData[calendarId].activities;
  return { sync, plans };
}

test('website and native owner clients exchange each other’s created, edited, and deleted plans', async () => {
  const cloud = database(), web = webDevice(cloud.connect()), { sync, plans } = nativeDevice(cloud.connect());
  assert.equal(await web.read(), true);
  await sync.refresh();

  await sync.saveActivity(calendarId, plan('native', 'Created on phone'));
  await sync.refresh();
  assert.equal(await web.read(), true);
  assert.equal(web.plans().find(item => item.id === 'native').title, 'Created on phone');
  web.setPlans(web.plans().map(item => item.id === 'native' ? { ...item, title: 'Edited on web' } : item));
  assert.equal(await web.save(), true);
  await sync.refresh();
  const nativePlan = plans().find(item => item.id === 'native');
  assert.equal(nativePlan.title, 'Edited on web');
  await sync.deleteActivity(calendarId, nativePlan.id, { original: nativePlan });
  await sync.refresh();
  assert.equal(await web.read(), true);
  assert.equal(web.plans().some(item => item.id === 'native'), false);

  web.setPlans([...web.plans(), plan('web', 'Created on web')]);
  assert.equal(await web.save(), true);
  await sync.refresh();
  const webPlan = plans().find(item => item.id === 'web');
  assert.equal(webPlan.title, 'Created on web');
  await sync.saveActivity(calendarId, { ...webPlan, title: 'Edited on phone' }, { original: webPlan });
  await sync.refresh();
  assert.equal(await web.read(), true);
  assert.equal(web.plans().find(item => item.id === 'web').title, 'Edited on phone');
  web.setPlans(web.plans().filter(item => item.id !== 'web'));
  assert.equal(await web.save(), true);
  await sync.refresh();
  assert.deepEqual(plans(), [plan('practice', 'Practice')]);
  assert.deepEqual(cloud.state.row.schedule.activities, plans());
  assert.deepEqual(cloud.state.row.schedule.remoteOnly, { keep: true });
});

test('offline native and stale website changes preserve unrelated edits and calendars', async () => {
  const cloud = database(), web = webDevice(cloud.connect()), native = cloud.connect();
  const { sync, plans } = nativeDevice(native);
  assert.equal(await web.read(), true);
  await sync.refresh();
  const practice = plans()[0];

  native.connection.online = false;
  await sync.saveActivity(calendarId, { ...practice, title: 'Edited offline on phone' }, { original: practice });
  await sync.refresh();
  assert.equal(sync.getState().status, 'OFFLINE');
  assert.equal(sync.getState().pendingCount, 1);
  web.setPlans([...web.plans(), plan('web-first', 'First web plan')]);
  assert.equal(await web.save(), true);

  native.connection.online = true;
  await sync.refresh();
  assert.equal(sync.getState().pendingCount, 0);
  assert.equal(plans().find(item => item.id === 'web-first').title, 'First web plan');
  assert.equal(plans().find(item => item.id === 'practice').title, 'Edited offline on phone');

  // Save again from the website's stale local view, before receiving the
  // phone's replay. The website must preserve a plan it did not edit.
  assert.equal(web.plans().find(item => item.id === 'practice').title, 'Practice');
  web.setPlans([...web.plans(), plan('web-second', 'Second web plan')]);
  assert.equal(await web.save(), true);
  assert.equal(await web.read(), true);
  await sync.refresh();
  const expected = [plan('practice', 'Edited offline on phone'), plan('web-first', 'First web plan'), plan('web-second', 'Second web plan')];
  assert.deepEqual(web.plans(), expected);
  assert.deepEqual(plans(), expected);
  assert.deepEqual(cloud.state.row.schedule.calendarData.other.activities, [plan('other', 'Other calendar')]);
  assert.deepEqual(cloud.state.row.schedule.remoteOnly, { keep: true });
});

test('the website retains its draft if it would overwrite the same plan edited on native', async () => {
  const cloud = database(), web = webDevice(cloud.connect()), { sync, plans } = nativeDevice(cloud.connect());
  assert.equal(await web.read(), true);
  await sync.refresh();
  const practice = plans()[0];
  web.setPlans([plan('practice', 'Unpublished web edit')]);

  await sync.saveActivity(calendarId, { ...practice, title: 'Confirmed native edit' }, { original: practice });
  await sync.refresh();
  assert.equal(await web.save(), false);
  assert.equal(web.error().code, 'SYNC_CONFLICT');
  assert.equal(web.status(), 'syncConflict');
  assert.equal(web.hasPending(), true);
  assert.equal(cloud.state.row.schedule.calendarData[calendarId].activities[0].title, 'Confirmed native edit');
  assert.equal(web.plans()[0].title, 'Unpublished web edit');
});

test('website compare-and-set retries when native commits after its read', async () => {
  const cloud = database(), browser = cloud.connect(), web = webDevice(browser);
  const { sync, plans } = nativeDevice(cloud.connect());
  assert.equal(await web.read(), true);
  await sync.refresh();
  web.setPlans([...web.plans(), plan('web', 'Written by website')]);
  browser.connection.beforeUpdate = async () => {
    browser.connection.beforeUpdate = null;
    await sync.saveActivity(calendarId, plan('native', 'Written by phone'));
    await sync.refresh();
    assert.equal(sync.getState().pendingCount, 0);
  };

  assert.equal(await web.save(), true);
  await sync.refresh();
  assert.equal(await web.read(), true);
  assert.deepEqual(plans(), web.plans());
  assert.deepEqual(plans().map(item => item.id).sort(), ['native', 'practice', 'web']);
});
