const test = require('node:test');
const assert = require('node:assert/strict');
const { saveActivity, deleteActivity, createCalendar } = require('../shared/backend/mobile-calendar');

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const event = (extra = {}) => ({ id: 'event-1', title: 'Piano', child: '__family__', startDate: '2026-10-22',
  start: '15:00', end: '16:00', recurrence: 'none', ...extra });
const snapshot = () => ({
  version: 2, activeCalendarId: 'home', calendars: [{ id: 'home', name: 'Home', futureMetadata: { one: true } }, { id: 'work', name: 'Work' }],
  calendarData: {
    home: { activities: [event()], kids: [], presets: [{ title: 'Keep' }], history: [1], audit: [2], futureData: { a: [1, 2] } },
    work: { activities: [event({ id: 'other', title: 'Work' })], settings: { future: true } }
  },
  activities: [event()], kids: [{ name: 'Keep' }], history: ['root'], audit: ['root'],
  futureSnapshot: { nested: { preserve: true } }, syncVersion: { value: 'unchanged' }
});
const row = schedule => ({ schedule, updated_at: '2026-10-22T10:00:00.123456+00:00' });

function fakeClient(initial = row(snapshot()), options = {}) {
  const state = { row: clone(initial), reads: 0, updates: [], inserts: [], auths: 0 };
  return {
    state,
    auth: { async getUser() {
      state.auths += 1;
      return { data: { user: options.noUser ? null : { id: options.userId || 'owner-1' } }, error: options.authError };
    } },
    from(table) {
      assert.equal(table, 'family_schedules');
      let operation = 'read'; let payload; const filters = {};
      const query = {
        select(columns) { assert.equal(columns, 'schedule, updated_at'); return query; },
        eq(key, value) { filters[key] = value; return query; },
        update(value) { operation = 'update'; payload = clone(value); return query; },
        insert(value) { operation = 'insert'; payload = clone(value); return query; },
        async maybeSingle() {
          if (operation === 'read') {
            assert.deepEqual(filters, { user_id: 'owner-1' });
            state.reads += 1;
            options.beforeRead?.(state);
            return { data: clone(state.row), error: options.readError };
          }
          if (operation === 'insert') {
            state.inserts.push(payload);
            options.beforeInsert?.(state);
            if (options.insertError) return { data: null, error: options.insertError };
            if (state.row) return { data: null, error: { code: '23505' } };
            assert.equal(payload.user_id, 'owner-1');
            state.row = { schedule: payload.schedule, updated_at: payload.updated_at };
            return { data: clone(state.row), error: null };
          }
          state.updates.push({ payload, filters });
          options.beforeUpdate?.(state);
          if (options.updateError) return { data: null, error: options.updateError };
          assert.equal(filters.user_id, 'owner-1');
          assert.equal(typeof filters.updated_at, 'string');
          assert.deepEqual(Object.keys(filters).sort(), ['updated_at', 'user_id']);
          if (!state.row || state.row.updated_at !== filters.updated_at) return { data: null, error: null };
          state.row = { schedule: payload.schedule, updated_at: payload.updated_at };
          return { data: clone(state.row), error: null };
        }
      };
      return query;
    }
  };
}

const hasCode = code => error => error.code === code;

test('creates an activity from a fresh row, preserving newer unrelated events and all other fields', async () => {
  const latest = snapshot();
  latest.calendarData.home.activities.push(event({ id: 'web-new', title: 'Added on the website' }));
  latest.activities.push(event({ id: 'web-new', title: 'Added on the website' }));
  latest.futureSnapshot.latestWebField = true;
  const before = clone(latest); const client = fakeClient(row(latest));
  const nextEvent = event({ id: 'new-native', title: 'Library' });
  const result = await saveActivity(client, 'owner-1', 'home', nextEvent);
  const expected = clone(before);
  expected.calendarData.home.activities.push(nextEvent); expected.activities.push(nextEvent);
  assert.deepEqual(result.schedule, expected);
  assert.deepEqual(latest, before);
  assert.equal(client.state.reads, 1); assert.equal(client.state.updates.length, 1);
  assert.equal(client.state.inserts.length, 0);
  assert.equal(client.state.updates[0].filters.updated_at, '2026-10-22T10:00:00.123456+00:00');
});

test('partial edit retains unknown activity fields and root compatibility mirror fields', async () => {
  const initial = snapshot(); const original = event({ futureEvent: { nested: [1, 2] }, notes: 'Keep me' });
  initial.calendarData.home.activities = [original];
  initial.activities = [{ ...original, mirrorOnly: 'retain' }, event({ id: 'mirror-only', title: 'Keep this mirror entry' })];
  const client = fakeClient(row(initial));
  const result = await saveActivity(client, 'owner-1', 'home', { id: original.id, title: 'New title' }, { original });
  assert.deepEqual(result.schedule.calendarData.home.activities, [{ ...original, title: 'New title' }]);
  assert.deepEqual(result.schedule.activities, [{ ...original, mirrorOnly: 'retain', title: 'New title' }, initial.activities[1]]);
  assert.deepEqual(result.schedule.calendarData.work, initial.calendarData.work);
  assert.deepEqual(result.schedule.syncVersion, initial.syncVersion);
  assert.equal(result.schedule.version, 2);
});

test('editing an inactive calendar leaves active-calendar mirrors unchanged', async () => {
  const initial = snapshot(); const original = initial.calendarData.work.activities[0];
  const client = fakeClient(row(initial));
  const result = await saveActivity(client, 'owner-1', 'work', { id: 'other', title: 'Changed work' }, { original });
  assert.deepEqual(result.schedule.activities, initial.activities);
  assert.deepEqual(result.schedule.calendarData.home, initial.calendarData.home);
  assert.equal(result.schedule.activeCalendarId, 'home');
});

test('deletes only the intended activity and its active compatibility mirror', async () => {
  const initial = snapshot(); const original = initial.calendarData.home.activities[0];
  initial.calendarData.home.activities.push(event({ id: 'keep' }));
  initial.activities.push(event({ id: 'keep' }));
  const client = fakeClient(row(initial));
  const result = await deleteActivity(client, 'owner-1', 'home', original.id, { original });
  assert.deepEqual(result.schedule.calendarData.home.activities, [initial.calendarData.home.activities[1]]);
  assert.deepEqual(result.schedule.activities, [initial.activities[1]]);
  assert.deepEqual(result.schedule.calendarData.work, initial.calendarData.work);
});

test('activity edits compare raw originals without depending on object key order', async () => {
  const client = fakeClient(); const original = Object.fromEntries(Object.entries(event()).reverse());
  await saveActivity(client, 'owner-1', 'home', { id: original.id, title: 'Updated' }, { original });
  assert.equal(client.state.updates.length, 1);
});

test('edits and deletes reject same-event changes from the website', async () => {
  for (const action of ['edit', 'delete']) {
    const initial = snapshot(); initial.calendarData.home.activities[0].notes = 'Changed on web';
    const client = fakeClient(row(initial));
    const task = action === 'edit'
      ? saveActivity(client, 'owner-1', 'home', { id: 'event-1', title: 'Native edit' }, { original: event() })
      : deleteActivity(client, 'owner-1', 'home', 'event-1', { original: event() });
    await assert.rejects(task, hasCode('CONFLICT'));
    assert.equal(client.state.updates.length, 0);
  }
});

test('edits and deletes reject an activity removed since the screen opened', async () => {
  for (const action of ['edit', 'delete']) {
    const initial = snapshot(); initial.calendarData.home.activities = [];
    const client = fakeClient(row(initial));
    await assert.rejects(action === 'edit'
      ? saveActivity(client, 'owner-1', 'home', event(), { original: event() })
      : deleteActivity(client, 'owner-1', 'home', 'event-1', { original: event() }), hasCode('CONFLICT'));
    assert.equal(client.state.updates.length, 0);
  }
});

test('activity ID collisions and deletion without an original never overwrite data', async () => {
  const client = fakeClient();
  await assert.rejects(saveActivity(client, 'owner-1', 'home', event()), hasCode('CONFLICT'));
  await assert.rejects(deleteActivity(client, 'owner-1', 'home', 'event-1'), hasCode('CONFLICT'));
  assert.equal(client.state.updates.length, 0);
});

test('CAS failure reports a conflict, retaining a concurrently committed web change without retry/upsert', async () => {
  const client = fakeClient(undefined, { beforeUpdate(state) {
    state.row.schedule.calendarData.work.activities.push(event({ id: 'race', title: 'Concurrent change' }));
    state.row.updated_at = '2026-10-22T10:00:01.000Z';
  } });
  await assert.rejects(saveActivity(client, 'owner-1', 'home', event({ id: 'native' })), hasCode('CONFLICT'));
  assert.equal(client.state.row.schedule.calendarData.work.activities.at(-1).id, 'race');
  assert.equal(client.state.row.schedule.calendarData.home.activities.length, 1);
  assert.equal(client.state.updates.length, 1); assert.equal(client.state.reads, 1); assert.equal(client.state.inserts.length, 0);
});

test('CAS filters stay bounded for realistic large account snapshots', async () => {
  const initial = snapshot();
  initial.calendarData.home.activities = Array.from({ length: 1000 }, (_, index) => event({
    id: `large-${index}`, notes: 'A family activity with a location, equipment, and other reminders. '.repeat(4)
  }));
  initial.activities = clone(initial.calendarData.home.activities);
  assert.ok(JSON.stringify(initial).length > 10000);
  const client = fakeClient(row(initial));
  await saveActivity(client, 'owner-1', 'home', event({ id: 'native' }));
  assert.deepEqual(client.state.updates[0].filters, { user_id: 'owner-1', updated_at: '2026-10-22T10:00:00.123456+00:00' });
  assert.ok(JSON.stringify(client.state.updates[0].filters).length < 200);
  assert.equal(client.state.row.schedule.calendarData.home.activities.length, 1001);
});

test('legacy owner snapshots remain legacy and keep every non-activity field', async () => {
  const legacy = { version: 1, activities: [event()], kids: [], presets: [1], settings: { a: true }, unknown: { b: 2 } };
  const client = fakeClient(row(legacy)); const addition = event({ id: 'new' });
  const result = await saveActivity(client, 'owner-1', 'family', addition);
  assert.deepEqual(result.schedule, { ...legacy, activities: [...legacy.activities, addition] });
  assert.equal(Object.hasOwn(result.schedule, 'calendars'), false);
  await deleteActivity(client, 'owner-1', 'family', addition.id, { original: addition });
  assert.deepEqual(client.state.row.schedule, legacy);
});

test('missing rows, missing calendar IDs, and malformed calendars never trigger activity inserts or fallback calendars', async () => {
  for (const [initial, id] of [[null, 'home'], [row(snapshot()), 'missing'], [row({}), 'family'],
    [row({ calendars: [], calendarData: {} }), 'home'],
    [row({ calendars: [{ id: 'home' }], calendarData: { home: { activities: 'unknown data' } } }), 'home']]) {
    const client = fakeClient(initial);
    await assert.rejects(saveActivity(client, 'owner-1', id, event({ id: 'native' })), hasCode('NO_CALENDAR'));
    assert.equal(client.state.updates.length, 0); assert.equal(client.state.inserts.length, 0);
  }
});

test('missing/invalid row versions fail closed before any PATCH', async () => {
  const initial = row(snapshot()); initial.updated_at = null; const client = fakeClient(initial);
  await assert.rejects(saveActivity(client, 'owner-1', 'home', event({ id: 'native' })), hasCode('CONFLICT'));
  assert.equal(client.state.updates.length, 0);
});

test('native write version advances even when the stored timestamp is ahead of the device clock', async () => {
  const initial = row(snapshot()); initial.updated_at = '2099-01-01T00:00:00.500123Z'; const client = fakeClient(initial);
  const result = await saveActivity(client, 'owner-1', 'home', event({ id: 'native' }));
  assert.ok(Date.parse(result.updated_at) > Date.parse(initial.updated_at));
});

test('invalid activity dates, times, IDs, and non-JSON values are rejected without writes', async () => {
  const invalid = [event({ id: '' }), event({ title: ' ' }), event({ startDate: '2026-02-29' }),
    event({ startDate: '2026-2-01' }), event({ start: '25:00' }), event({ end: '15:00' }), event({ end: '14:59' }),
    event({ endDate: '2026-10-21' }), event({ startDate: '' }), event({ notes: undefined }), event({ future: NaN })];
  const circular = event(); circular.future = circular; invalid.push(circular);
  for (const activity of invalid) {
    const client = fakeClient();
    await assert.rejects(saveActivity(client, 'owner-1', 'home', activity), hasCode('INVALID_ACTIVITY'));
    assert.equal(client.state.updates.length, 0); assert.equal(client.state.inserts.length, 0);
  }
});

test('all-day activities can have empty times, and a valid leap-day date is accepted', async () => {
  const client = fakeClient();
  await saveActivity(client, 'owner-1', 'home', event({ id: 'all-day', allDay: true, start: '', end: '', startDate: '2028-02-29' }));
  assert.equal(client.state.updates.length, 1);
});

test('unauthenticated and different-user calls are forbidden before reading or writing an owner row', async () => {
  for (const [userId, options] of [['', {}], ['owner-1', { noUser: true }], ['owner-1', { userId: 'viewer' }]]) {
    const client = fakeClient(undefined, options);
    await assert.rejects(saveActivity(client, userId, 'home', event({ id: 'native' })), hasCode('FORBIDDEN'));
    assert.equal(client.state.reads, 0); assert.equal(client.state.updates.length, 0);
  }
});

test('permission failures are localized domain errors and ordinary network errors remain retryable', async () => {
  const denied = fakeClient(undefined, { updateError: { code: '42501', message: 'denied' } });
  await assert.rejects(saveActivity(denied, 'owner-1', 'home', event({ id: 'native' })), hasCode('FORBIDDEN'));
  const network = new Error('offline'); const offline = fakeClient(undefined, { readError: network });
  await assert.rejects(saveActivity(offline, 'owner-1', 'home', event({ id: 'native' })), error => error === network);
});

test('explicit calendar creation inserts a minimal empty v2 owner snapshot with no sample activities or children', async () => {
  const client = fakeClient(null); const result = await createCalendar(client, 'owner-1', { name: '  Our family  ' });
  assert.equal(client.state.inserts.length, 1); assert.equal(client.state.updates.length, 0);
  assert.equal(result.schedule.version, 2);
  assert.deepEqual(result.schedule.calendars, [{ id: result.calendarId, name: 'Our family' }]);
  assert.deepEqual(result.schedule.calendarData[result.calendarId], { kids: [], activities: [] });
  assert.deepEqual(result.schedule.kids, []); assert.deepEqual(result.schedule.activities, []);
  assert.equal(result.schedule.activeCalendarId, result.calendarId);
});

test('creating another calendar preserves the complete current snapshot and its active mirrors', async () => {
  const initial = snapshot(); const client = fakeClient(row(initial));
  const result = await createCalendar(client, 'owner-1', { name: 'A new calendar' });
  const expected = clone(initial);
  expected.calendars.push({ id: result.calendarId, name: 'A new calendar' });
  expected.calendarData[result.calendarId] = { kids: [], activities: [] };
  assert.deepEqual(result.schedule, expected);
  assert.equal(client.state.updates.length, 1); assert.equal(client.state.inserts.length, 0);
});

test('explicitly adding a calendar to a legacy account retains all legacy data and version fields', async () => {
  const legacy = { version: 1, activities: [event()], kids: [{ name: 'Person' }], future: { keep: [1] } };
  const client = fakeClient(row(legacy)); const result = await createCalendar(client, 'owner-1', { name: 'New' });
  assert.equal(result.schedule.version, 1); assert.deepEqual(result.schedule.activities, legacy.activities);
  assert.deepEqual(result.schedule.calendarData.family, legacy);
  assert.deepEqual(result.schedule.calendarData[result.calendarId], { kids: [], activities: [] });
  assert.deepEqual(result.schedule.future, legacy.future);
  assert.equal(result.schedule.activeCalendarId, 'family');
});

test('calendar insert races and existing-row creation races report CONFLICT without overwriting another write', async () => {
  const first = fakeClient(null, { beforeInsert(state) { state.row = row(snapshot()); } });
  await assert.rejects(createCalendar(first, 'owner-1', { name: 'New' }), hasCode('CONFLICT'));
  assert.deepEqual(first.state.row.schedule, snapshot()); assert.equal(first.state.inserts.length, 1);
  const second = fakeClient(undefined, { beforeUpdate(state) {
    state.row.schedule.futureSnapshot.web = true;
    state.row.updated_at = '2026-10-22T10:00:01.000Z';
  } });
  await assert.rejects(createCalendar(second, 'owner-1', { name: 'New' }), hasCode('CONFLICT'));
  assert.equal(second.state.row.schedule.calendars.length, 2); assert.equal(second.state.updates.length, 1);
});

test('calendar creation rejects empty names, missing users, and malformed snapshots', async () => {
  for (const name of ['', ' ', 'a'.repeat(101)]) {
    const client = fakeClient(null);
    await assert.rejects(createCalendar(client, 'owner-1', { name }), hasCode('INVALID_ACTIVITY'));
    assert.equal(client.state.inserts.length, 0);
  }
  await assert.rejects(createCalendar(fakeClient(null), '', { name: 'New' }), hasCode('FORBIDDEN'));
  const malformed = fakeClient(row({ calendars: [{ id: 'a' }], activities: [] }));
  await assert.rejects(createCalendar(malformed, 'owner-1', { name: 'New' }), hasCode('NO_CALENDAR'));
  assert.equal(malformed.state.updates.length, 0);
});
