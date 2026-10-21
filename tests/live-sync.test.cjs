const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'assets/live-sync.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function source(name, async = false) {
  const start = html.indexOf(`    ${async ? 'async ' : ''}function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}

function setup({ signedIn = true } = {}) {
  const timers = new Map();
  const intervals = new Map();
  const events = {};
  const changes = [];
  const reads = [];
  const removed = [];
  let number = 0;
  let onStatus;
  let onAuth;
  const channel = { on(type, filter, handler) { changes.push({ type, filter, handler }); return this; }, subscribe(fn) { onStatus = fn; return this; } };
  const context = vm.createContext({
    activeAccount: signedIn ? { provider: 'supabase' } : null,
    cloudSession: signedIn ? { user: { id: 'test-user' } } : null,
    cloudSyncBusy: false, cloudHydrating: false, pending: false, editing: false,
    navigator: { onLine: true }, reportClientError() {},
    document: { hidden: false, querySelector: () => context.editing ? {} : null, addEventListener: (name, fn) => { events[name] = fn; } },
    window: {
      setTimeout(fn, delay) { const id = ++number; timers.set(id, { fn, delay }); return id; },
      clearTimeout: id => timers.delete(id),
      setInterval(fn, delay) { const id = ++number; intervals.set(id, { fn, delay }); return id; },
      clearInterval: id => intervals.delete(id), addEventListener: (name, fn) => { events[name] = fn; }
    },
    cloudClient: {
      channel(name) { assert.equal(name, 'family-schedule:test-user'); return channel; },
      removeChannel: value => { removed.push(value); },
      auth: { onAuthStateChange: fn => { onAuth = fn; } }
    },
    hasPendingCloudSave: () => context.pending,
    hydrateCloudSchedule: async options => { reads.push(options); return true; }
  });
  vm.runInContext(script, context);
  return {
    context, timers, intervals, events, changes, reads, removed,
    status: value => onStatus(value), auth: value => onAuth(value),
    async tick() {
      const [id, timer] = timers.entries().next().value || [];
      assert(timer, 'Expected scheduled work');
      timers.delete(id);
      await timer.fn();
    }
  };
}

test('Realtime subscriptions only target the signed-in user schedule and coalesce bursts', async () => {
  const f = setup();
  assert.equal(f.changes.length, 2);
  assert.deepEqual(f.changes.map(change => change.filter.event), ['INSERT', 'UPDATE']);
  for (const change of f.changes) {
    assert.equal(change.type, 'postgres_changes');
    assert.equal(change.filter.table, 'family_schedules');
    assert.equal(change.filter.filter, 'user_id=eq.test-user');
  }
  await f.tick();
  f.changes[1].handler();
  f.changes[1].handler();
  assert.equal(f.timers.size, 1);
  await f.tick();
  assert.equal(f.reads.length, 2);
  assert(f.reads.every(options => options.live === true));
});

test('open dialogs, pending saves, and uploads defer refresh until editing is finished', async () => {
  for (const property of ['editing', 'pending', 'cloudSyncBusy', 'cloudHydrating']) {
    const f = setup();
    f.context[property] = true;
    await f.tick();
    assert.equal(f.reads.length, 0, property);
    f.context[property] = false;
    f.events.close();
    await f.tick();
    assert.equal(f.reads.length, 1, property);
  }
});

test('connection errors use automatic fallback and visible/online sessions catch up', async () => {
  const f = setup();
  await f.tick();
  f.status('CHANNEL_ERROR');
  await f.tick();
  assert.equal(f.reads.length, 2);
  const fallback = [...f.intervals.values()][0];
  assert.equal(fallback.delay, 5000);
  f.context.document.hidden = true;
  fallback.fn();
  assert.equal(f.timers.size, 0);
  f.context.document.hidden = false;
  f.events.visibilitychange();
  await f.tick();
  assert.equal(f.reads.length, 3);
  f.context.navigator.onLine = false;
  fallback.fn();
  assert.equal(f.timers.size, 0);
  f.context.navigator.onLine = true;
  f.events.online();
  await f.tick();
  assert.equal(f.reads.length, 4);
});

test('logout removes subscriptions/timers and ignores callbacks from the old account', async () => {
  const f = setup();
  await f.tick();
  f.auth('SIGNED_OUT');
  assert.equal(f.removed.length, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.intervals.size, 0);
  f.changes[1].handler();
  f.status('SUBSCRIBED');
  assert.equal(f.timers.size, 0);
});

test('guests never create a subscription or background database reads', () => {
  const f = setup({ signedIn: false });
  assert.equal(f.changes.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.intervals.size, 0);
});

test('a database change arriving during a read schedules a second catch-up', async () => {
  const f = setup();
  let finish;
  f.context.hydrateCloudSchedule = () => new Promise(resolve => { finish = resolve; });
  const first = f.tick();
  f.changes[1].handler();
  finish(true);
  await first;
  assert.equal(f.timers.size, 1);
});

function reader() {
  let resolve;
  const stored = new Map();
  const applied = [];
  const ctx = vm.createContext({
    cloudClient: { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: () => new Promise(done => { resolve = done; }) }) },
    cloudSession: { user: { id: 'test-user' } }, activeAccount: { provider: 'supabase' },
    cloudSyncBusy: false, pending: false, editing: false,
    hasPendingCloudSave: () => ctx.pending,
    navigator: { onLine: true }, cloudUpdatedKey: () => 'updated',
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    applyCloudSnapshot: (value, options) => applied.push({ value, options }),
    setCloudSaveState() {}, reportClientError() {},
    window: { KidsSyncLiveSync: { isEditing: () => ctx.editing }, setTimeout() {} }, openWelcomeBackIfNeeded() {}
  });
  vm.runInContext(source('hydrateCloudSchedule', true), ctx);
  return { ctx, stored, applied, finish: () => resolve({ data: { schedule: { activities: [] }, updated_at: 'remote-version' } }) };
}

test('live hydration rejects reads that race with an edit, upload, account switch or local save', async () => {
  for (const change of [f => { f.ctx.pending = true; }, f => { f.ctx.editing = true; }, f => { f.ctx.cloudSyncBusy = true; }, f => { f.ctx.cloudSession = null; }, f => f.stored.set('updated', 'new-local-save')]) {
    const f = reader();
    const pending = f.ctx.hydrateCloudSchedule({ live: true });
    change(f);
    f.finish();
    assert.equal(await pending, false);
    assert.equal(f.applied.length, 0);
  }
});

test('live hydration asks the snapshot renderer to preserve local navigation', async () => {
  const f = reader();
  const pending = f.ctx.hydrateCloudSchedule({ live: true });
  f.finish();
  assert.equal(await pending, true);
  assert.equal(f.applied[0].options.preserveView, true);
});

test('live snapshots keep the selected calendar, view and child filters', () => {
  const storage = new Map();
  let focusCalls = 0;
  const ctx = vm.createContext({
    currentCalendarId: 'local', currentView: 'month', calendars: [], cloudHydrating: false,
    kidProfiles: [{ name: 'Alex' }, { name: 'Taylor' }],
    state: { visibleKids: new Set(['Alex']), stackFront: new Set() }, palettes: { blue: {} },
    normalizeKidProfile: kid => kid, buildKids: kids => kids,
    CALENDARS_STORAGE_NAME: 'calendars', baseScheduleStorageKey: name => name,
    calendarStorageKey: (name, id) => `${id}.${name}`, scheduleStorageKey: name => `local.${name}`,
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    persistActiveCalendar() {}, applySettings() {}, updateAccountIdentity() {}, populateFormOptions() {}, renderAll() {}, startNotificationChecks() {},
    scheduleSmartCalendarFocus: () => { focusCalls += 1; }
  });
  vm.runInContext(source('applyCloudSnapshot'), ctx);
  ctx.applyCloudSnapshot({
    calendars: [{ id: 'local', name: 'Local' }, { id: 'remote', name: 'Remote' }], activeCalendarId: 'remote',
    calendarData: {
      local: { kids: [{ name: 'Alex', palette: 'blue' }, { name: 'Taylor', palette: 'blue' }], activities: [{ id: 'incoming' }], view: 'week' },
      remote: { activities: [{ id: 'other-calendar' }], view: 'today' }
    }
  }, { preserveView: true });
  assert.equal(ctx.currentCalendarId, 'local');
  assert.equal(ctx.currentView, 'month');
  assert.deepEqual([...ctx.state.visibleKids], ['Alex']);
  assert.equal(ctx.state.activities[0].id, 'incoming');
  assert.equal(focusCalls, 0);
  assert.equal(ctx.cloudHydrating, false);
});

test('live sync is initialized after authentication, bundled offline, and has an idempotent publication migration', () => {
  assert.match(html, /await hydrateCloudSchedule\(\);\s+window.KidsSyncLiveSync\?\.start\(\)/);
  assert.match(html, /else if \(!document.hidden\) \{\s+if \(window.KidsSyncLiveSync\) window.KidsSyncLiveSync.refresh\(\)/);
  assert(html.includes('./assets/live-sync.js?v=1'));
  assert(fs.readFileSync(path.join(root, 'sw.js'), 'utf8').includes('./assets/live-sync.js?v=1'));
  const sql = fs.readFileSync(path.join(root, 'supabase/live-sync.sql'), 'utf8');
  assert.match(sql, /pg_publication_tables/);
  assert.match(sql, /alter publication supabase_realtime add table public.family_schedules/);
  assert.doesNotMatch(sql, /disable row level security|grant .* to anon|drop table/i);
});
