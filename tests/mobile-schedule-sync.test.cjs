const test = require('node:test');
const assert = require('node:assert/strict');
const { createScheduleSync, keyForUser } = require('../mobile/src/lib/schedule-sync');

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const activity = (patch = {}) => ({ id: 'piano', title: 'Piano', startDate: '2026-10-30', start: '15:00', end: '16:00', ...patch });
const row = (events = [activity()]) => ({ updated_at: '2026-10-30T10:00:00.123456+00:00', schedule: {
  version: 2, activeCalendarId: 'home', calendars: [{ id: 'home', name: 'Home' }, { id: 'other', name: 'Other' }],
  calendarData: { home: { kids: [], activities: events, unknown: { retain: true } }, other: { activities: [activity({ id: 'keep' })] } },
  activities: clone(events), profile: { name: 'Keep profile' }, future: { retain: [1, 2] },
} });
function storage() {
  const data = new Map();
  return { data, failWrite: false, failRead: false,
    async getItem(key) { if (this.failRead) throw Error('Disk error'); return data.get(key) ?? null; },
    async setItem(key, value) { if (this.failWrite) throw Error('Disk error'); data.set(key, value); } };
}
function client(initial = row()) {
  const state = { row: clone(initial), online: true, userId: 'a', writes: 0, reads: 0, loseResponse: false, beforeUpdate: null };
  return { state, auth: { async getUser() { if (!state.online) throw new TypeError('Network request failed'); return { data: { user: { id: state.userId } }, error: null }; } },
    from(table) {
      assert.equal(table, 'family_schedules'); let update; const filters = {};
      const query = { select() { return query; }, eq(key, value) { filters[key] = value; return query; },
        update(value) { update = clone(value); return query; },
        async maybeSingle() {
          if (!state.online) throw new TypeError('Network request failed');
          assert.equal(filters.user_id, 'a');
          if (!update) { state.reads++; const data = clone(state.row); await state.onRead?.(); return { data, error: null }; }
          state.beforeUpdate?.();
          if (state.row.updated_at !== filters.updated_at) return { data: null, error: null };
          state.row = update; state.writes++;
          if (state.loseResponse) { state.loseResponse = false; throw new TypeError('Network response lost'); }
          const data = clone(state.row); await state.onWritten?.(); return { data, error: null };
        } };
      return query;
    } };
}
function setup() { const device = storage(), remote = client(); const sync = createScheduleSync({ storage: device, client: remote, userId: 'a' }); return { device, remote, sync }; }
const code = expected => error => error.code === expected;
const events = sync => sync.getState().row.schedule.calendarData.home.activities;
async function disconnected() {
  const fixture = setup(); await fixture.sync.refresh(); fixture.remote.state.online = false;
  await fixture.sync.refresh(); return fixture;
}

test('cached owner calendar reopens while offline without another account seeing it', async () => {
  const { device, remote, sync } = setup(); await sync.refresh(); sync.stop(); remote.state.online = false;
  const reopened = createScheduleSync({ storage: device, client: remote, userId: 'a' });
  await reopened.load(); assert.equal(reopened.getState().status, 'CACHED');
  await reopened.refresh(); assert.equal(reopened.getState().status, 'OFFLINE');
  assert.equal(events(reopened)[0].title, 'Piano');
  const other = createScheduleSync({ storage: device, client: remote, userId: 'b' });
  await other.load(); assert.equal(other.getState().row, null); assert.equal(other.getState().pendingCount, 0);
  assert.notEqual(keyForUser('a'), keyForUser('b'));
});

test('offline edits are durable before success and replay against fresh data without losing unrelated web changes', async () => {
  const { device, remote, sync } = await disconnected();
  const result = await sync.saveActivity('home', { id: 'piano', title: 'New title' }, { original: activity() });
  assert.equal(result.pending, true); assert.equal(events(sync)[0].title, 'New title');
  await sync.refresh(); assert.equal(remote.state.writes, 0);
  sync.stop();
  const reopened = createScheduleSync({ storage: device, client: remote, userId: 'a' }); await reopened.load();
  assert.equal(events(reopened)[0].title, 'New title'); assert.equal(reopened.getState().pendingCount, 1);
  remote.state.row.schedule.calendarData.home.activities.push(activity({ id: 'web', title: 'Added online' }));
  remote.state.row.schedule.future.newWebField = true;
  remote.state.online = true; await reopened.refresh();
  assert.equal(reopened.getState().pendingCount, 0); assert.equal(remote.state.writes, 1);
  assert.equal(remote.state.row.schedule.calendarData.home.activities[1].id, 'web');
  assert.deepEqual(remote.state.row.schedule.calendarData.other, row().schedule.calendarData.other);
  assert.equal(remote.state.row.schedule.future.newWebField, true);
  assert.equal(remote.state.row.schedule.activities[0].title, 'New title');
});

test('a competing change blocks the queue and retains the device version through restart', async () => {
  const { device, remote, sync } = await disconnected();
  await sync.saveActivity('home', { id: 'piano', title: 'My edit' }, { original: activity() }); await sync.refresh();
  remote.state.row.schedule.calendarData.home.activities[0].title = 'Other device edit';
  remote.state.online = true; await sync.refresh();
  assert.equal(sync.getState().status, 'CONFLICT'); assert.equal(remote.state.writes, 0);
  assert.equal(events(sync)[0].title, 'My edit');
  assert.equal(sync.getState().confirmedRow.schedule.calendarData.home.activities[0].title, 'Other device edit');
  await assert.rejects(sync.saveActivity('home', activity({ id: 'new' })), code('SYNC_CONFLICT'));
  const reopened = createScheduleSync({ storage: device, client: remote, userId: 'a' }); await reopened.load();
  assert.equal(reopened.getState().conflicts.length, 1);
  await reopened.refresh(); assert.equal(remote.state.writes, 0);
  await reopened.discardPending(); assert.equal(events(reopened)[0].title, 'Other device edit');
});

test('CAS conflict between fresh read and write never silently overwrites newer state', async () => {
  const { remote, sync } = await disconnected();
  await sync.saveActivity('home', { id: 'piano', title: 'My edit' }, { original: activity() }); await sync.refresh();
  remote.state.online = true;
  remote.state.beforeUpdate = () => { remote.state.row.updated_at = '2026-10-30T11:00:00Z'; remote.state.row.schedule.profile.name = 'New online profile'; };
  await sync.refresh();
  assert.equal(sync.getState().status, 'CONFLICT'); assert.equal(sync.getState().pendingCount, 1);
  assert.equal(remote.state.writes, 0); assert.equal(remote.state.row.schedule.profile.name, 'New online profile');
});

test('lost server response is acknowledged by exact desired state on retry, without duplicate creation', async () => {
  const { remote, sync } = await disconnected();
  await sync.saveActivity('home', activity({ id: 'new', title: 'Library' })); await sync.refresh();
  remote.state.online = true; remote.state.loseResponse = true; await sync.refresh();
  assert.equal(sync.getState().pendingCount, 1); assert.equal(remote.state.writes, 1);
  await sync.refresh(); assert.equal(sync.getState().pendingCount, 0); assert.equal(remote.state.writes, 1);
  assert.equal(events(sync).filter(event => event.id === 'new').length, 1);
});

test('offline create, edit and delete of the same plan replay in order', async () => {
  const { remote, sync } = await disconnected(); const added = activity({ id: 'new' }); const edited = { ...added, title: 'Changed' };
  await sync.saveActivity('home', added); await sync.saveActivity('home', edited, { original: added });
  await sync.deleteActivity('home', edited.id, { original: edited }); await sync.refresh();
  assert.equal(events(sync).length, 1); assert.equal(sync.getState().pendingCount, 3);
  remote.state.online = true; await sync.refresh();
  assert.equal(sync.getState().pendingCount, 0); assert.equal(remote.state.writes, 3);
  assert.deepEqual(events(sync), [activity()]);
});

test('storage failures reject edits without claiming success or losing the last saved queue', async () => {
  const { device, remote, sync } = await disconnected();
  const before = device.data.get(keyForUser('a')); device.failWrite = true;
  await assert.rejects(sync.saveActivity('home', activity({ id: 'new' })), code('STORAGE_ERROR'));
  assert.equal(device.data.get(keyForUser('a')), before); assert.equal(sync.getState().pendingCount, 0);
  assert.equal(events(sync).length, 1); assert.equal(remote.state.writes, 0);
});

test('failed local acknowledgement after successful upload survives reopening and retries idempotently', async () => {
  const { device, remote, sync } = await disconnected();
  await sync.saveActivity('home', activity({ id: 'new' })); await sync.refresh(); remote.state.online = true;
  remote.state.beforeUpdate = () => { device.failWrite = true; };
  await sync.refresh(); assert.equal(remote.state.writes, 1); assert.equal(sync.getState().pendingCount, 1);
  device.failWrite = false; remote.state.beforeUpdate = null; sync.stop();
  const reopened = createScheduleSync({ storage: device, client: remote, userId: 'a' }); await reopened.refresh();
  assert.equal(remote.state.writes, 1); assert.equal(reopened.getState().pendingCount, 0);
});

test('account changes prevent replay into another account and stopped controllers never emit another user data', async () => {
  const { device, remote, sync } = await disconnected();
  await sync.saveActivity('home', activity({ id: 'new' })); await sync.refresh();
  remote.state.online = true; remote.state.userId = 'b'; await sync.refresh();
  assert.equal(sync.getState().status, 'AUTH_REQUIRED'); assert.equal(remote.state.writes, 0);
  sync.stop(); await assert.rejects(sync.saveActivity('home', activity({ id: 'another' })), code('STALE_SCOPE'));
  const b = createScheduleSync({ storage: device, client: remote, userId: 'b' }); await b.load();
  assert.equal(b.getState().pendingCount, 0); assert.equal(b.getState().row, null);
});

test('corrupt cache is never overwritten by refresh, enqueue, or confirmed-row import', async () => {
  const { device, remote, sync } = setup(); device.data.set(keyForUser('a'), '{broken');
  await assert.rejects(sync.load(), code('CACHE_INVALID')); await sync.refresh();
  await assert.rejects(sync.saveActivity('home', activity({ id: 'new' })), code('CACHE_INVALID'));
  await assert.rejects(sync.acceptConfirmed(row()), code('CACHE_INVALID'));
  assert.equal(device.data.get(keyForUser('a')), '{broken'); assert.equal(remote.state.reads, 0);
});

test('remote calendar deletion retains the queued draft and requires review', async () => {
  const { remote, sync } = await disconnected();
  await sync.saveActivity('home', { id: 'piano', title: 'Keep draft' }, { original: activity() }); await sync.refresh();
  remote.state.row.schedule.calendars = [{ id: 'other', name: 'Other' }]; delete remote.state.row.schedule.calendarData.home;
  remote.state.online = true; await sync.refresh();
  assert.equal(sync.getState().status, 'CONFLICT'); assert.equal(sync.getState().pending[0].event.title, 'Keep draft');
  assert.equal(remote.state.writes, 0); assert.equal(sync.getState().row.schedule.calendarData.home, undefined);
});

test('readonly and shared-source plans cannot enter the owner outbox', async () => {
  const { sync } = await disconnected();
  await assert.rejects(sync.saveActivity('home', activity({ id: 'holiday', isBuiltInHoliday: true })), code('INVALID_ACTIVITY'));
  await assert.rejects(sync.saveActivity('home', activity({ id: 'google', externalSource: 'google' })), code('INVALID_ACTIVITY'));
  await assert.rejects(sync.deleteActivity('home', 'piano', { original: activity({ externalSource: 'google' }) }), code('FORBIDDEN'));
  assert.equal(sync.getState().pendingCount, 0);
});

test('unrelated remote field changes to the same event require review rather than losing unknown fields', async () => {
  const { remote, sync } = await disconnected();
  await sync.saveActivity('home', { id: 'piano', title: 'My edit' }, { original: activity() }); await sync.refresh();
  remote.state.row.schedule.calendarData.home.activities[0].futureField = 'Keep remotely';
  remote.state.online = true; await sync.refresh();
  assert.equal(sync.getState().status, 'CONFLICT'); assert.equal(remote.state.writes, 0);
  assert.equal(remote.state.row.schedule.calendarData.home.activities[0].futureField, 'Keep remotely');
});

test('simultaneous local edits serialize without dropping either durable intent', async () => {
  const { device, remote, sync } = await disconnected();
  await Promise.all([sync.saveActivity('home', activity({ id: 'first' })), sync.saveActivity('home', activity({ id: 'second' }))]);
  await sync.refresh(); assert.equal(sync.getState().pendingCount, 2);
  assert.equal(JSON.parse(device.data.get(keyForUser('a'))).pending.length, 2);
  remote.state.online = true; await Promise.all([sync.refresh(), sync.refresh()]);
  assert.equal(remote.state.writes, 2); assert.equal(sync.getState().pendingCount, 0);
});

test('sign-out during a successful upload acknowledges only that account and does not replay the next edit', async () => {
  const { device, remote, sync } = await disconnected();
  await sync.saveActivity('home', activity({ id: 'first' })); await sync.saveActivity('home', activity({ id: 'second' })); await sync.refresh();
  remote.state.online = true;
  remote.state.beforeUpdate = () => { sync.stop(); remote.state.userId = 'b'; };
  await sync.refresh();
  assert.equal(remote.state.writes, 1);
  const stored = JSON.parse(device.data.get(keyForUser('a')));
  assert.equal(stored.pending.length, 1); assert.equal(stored.pending[0].eventId, 'second');
  assert.equal(stored.row.schedule.calendarData.home.activities.some(event => event.id === 'first'), true);
  assert.equal(device.data.has(keyForUser('b')), false);
});

test('failed cache reads never turn an unseen cache into an empty editable calendar', async () => {
  const { device, remote, sync } = setup(); device.failRead = true;
  await assert.rejects(sync.load(), code('STORAGE_ERROR'));
  await sync.refresh(); assert.equal(sync.getState().status, 'STORAGE_ERROR'); assert.equal(remote.state.reads, 0);
  await assert.rejects(sync.saveActivity('home', activity({ id: 'new' })), code('STORAGE_ERROR'));
  assert.equal(remote.state.writes, 0); assert.equal(device.data.size, 0);
});

test('retry rechecks the original conflict and never offers an overwrite shortcut', async () => {
  const { remote, sync } = await disconnected();
  await sync.saveActivity('home', { id: 'piano', title: 'My edit' }, { original: activity() }); await sync.refresh();
  remote.state.row.schedule.calendarData.home.activities[0].title = 'Other device edit'; remote.state.online = true;
  await sync.refresh(); await sync.retry();
  assert.equal(sync.getState().status, 'CONFLICT'); assert.equal(remote.state.writes, 0);
  assert.equal(sync.getState().pendingCount, 1);
});

test('legacy owner snapshots cache and replay without converting their format or discarding fields', async () => {
  const device = storage(), remote = client({ updated_at: row().updated_at, schedule: { activities: [activity()], kids: [{ name: 'Maya' }], custom: 'retain' } });
  const sync = createScheduleSync({ storage: device, client: remote, userId: 'a' }); await sync.refresh();
  remote.state.online = false; await sync.refresh();
  await sync.saveActivity('family', { id: 'piano', title: 'New title' }, { original: activity() }); await sync.refresh();
  remote.state.online = true; await sync.refresh();
  assert.equal(remote.state.row.schedule.calendars, undefined); assert.equal(remote.state.row.schedule.custom, 'retain');
  assert.equal(remote.state.row.schedule.activities[0].title, 'New title'); assert.equal(sync.getState().pendingCount, 0);
});

test('sync labels have the same states and retention/confirmation copy in both languages', () => {
  const copy = require('../mobile/src/lib/sync-copy');
  assert.deepEqual(Object.keys(copy.en).sort(), Object.keys(copy.zh).sort());
  assert.match(copy.en.pending(1), /1 change waiting/); assert.match(copy.en.pending(2), /2 changes waiting/);
  assert.match(copy.en.confirmBody, /already saved to your account are kept/);
});

test('queue limit preserves all existing device changes and refuses only the extra edit', async () => {
  const { sync } = await disconnected();
  for (let index = 0; index < 50; index++) await sync.saveActivity('home', activity({ id: `event-${index}` }));
  await assert.rejects(sync.saveActivity('home', activity({ id: 'too-many' })), code('QUEUE_FULL'));
  await sync.refresh(); assert.equal(sync.getState().pendingCount, 50); assert.equal(events(sync).length, 51);
});

test('all-day queue entries normalize unused clock values before any cloud write', async () => {
  const { remote, sync } = await disconnected();
  await sync.saveActivity('home', activity({ id: 'all-day', allDay: true, start: { invalid: true }, end: ['invalid'] })); await sync.refresh();
  remote.state.online = true; await sync.refresh();
  const result = remote.state.row.schedule.calendarData.home.activities.find(event => event.id === 'all-day');
  assert.equal(result.start, ''); assert.equal(result.end, '');
});

test('idle background refresh keeps the confirmed up-to-date status instead of flashing a spinner', async () => {
  const device = storage(), remote = client(), statuses = [];
  const sync = createScheduleSync({ storage: device, client: remote, userId: 'a', onChange: state => statuses.push(state.status) });
  await sync.refresh(); statuses.length = 0; await sync.refresh();
  assert.equal(statuses.every(status => status === 'SUBSCRIBED'), true);
});

test('overnight queued events keep their real end date and midnight bounds during replay', async () => {
  const { remote, sync } = await disconnected();
  const overnight = activity({ id: 'overnight', start: '23:00', end: '00:00', endDate: '2026-10-31' });
  await sync.saveActivity('home', overnight); await sync.refresh();
  remote.state.online = true; await sync.refresh();
  assert.deepEqual(events(sync).find(event => event.id === 'overnight'), overnight);
  assert.equal(sync.getState().pendingCount, 0);
  await assert.rejects(sync.saveActivity('home', activity({ id: 'invalid-overnight', start: '23:00', end: '00:00' })), code('INVALID_ACTIVITY'));
});

test('an old in-flight refresh cannot replace a newly confirmed online calendar import', async () => {
  const { device, remote, sync } = setup(); await sync.refresh();
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const reading = new Promise(resolve => { started = resolve; });
  remote.state.onRead = async () => { started(); await gate; };
  const refresh = sync.refresh(); await reading;
  const confirmed = row([activity(), activity({ id: 'imported', title: 'Newly imported plan' })]);
  confirmed.updated_at = '2026-10-30T11:00:00Z'; remote.state.row = clone(confirmed);
  await sync.acceptConfirmed(confirmed); release(); await refresh;
  assert.equal(events(sync).some(event => event.id === 'imported'), true);
  assert.deepEqual(JSON.parse(device.data.get(keyForUser('a'))).row, confirmed);
});

test('a delayed outbox acknowledgement keeps a newer online confirmation while acknowledging its own edit', async () => {
  const { device, remote, sync } = await disconnected();
  await sync.saveActivity('home', activity({ id: 'queued' })); await sync.refresh();
  let release, written;
  const gate = new Promise(resolve => { release = resolve; });
  const writing = new Promise(resolve => { written = resolve; });
  remote.state.online = true; remote.state.onWritten = async () => { written(); await gate; };
  const refresh = sync.refresh(); await writing;
  const confirmed = clone(remote.state.row);
  confirmed.updated_at = '2030-01-01T00:00:00Z'; confirmed.schedule.profile.name = 'New online confirmation';
  remote.state.row = clone(confirmed); await sync.acceptConfirmed(confirmed);
  release(); await refresh;
  assert.equal(sync.getState().pendingCount, 0); assert.equal(events(sync).some(event => event.id === 'queued'), true);
  assert.deepEqual(sync.getState().confirmedRow, confirmed);
  assert.deepEqual(JSON.parse(device.data.get(keyForUser('a'))).row, confirmed);
});
