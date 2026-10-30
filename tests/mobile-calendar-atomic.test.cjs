const test = require('node:test');
const assert = require('node:assert/strict');
const { saveActivity, deleteActivity, mutateActivities, restoreActivities } = require('../shared/backend/mobile-calendar');

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const owner = 'owner-atomic';
const event = extra => ({ id: 'series', title: 'Swimming', child: '__family__', startDate: '2026-10-22',
  start: '15:00', end: '16:00', recurrence: 'weekly', repeatDays: [4], repeatInterval: 1,
  excludedDates: ['2026-11-12'], future: { nested: ['preserve', { value: 2 }] }, ...extra });
const initialSnapshot = () => {
  const original = event();
  return { version: 2, activeCalendarId: 'home', calendars: [{ id: 'home', name: 'Home' }, { id: 'work', name: 'Work' }],
    calendarData: {
      home: { activities: [original, event({ id: 'unrelated', title: 'Library' })], kids: [], presets: [1], audit: [{ id: 'old' }], unknown: { keep: true } },
      work: { activities: [event({ id: 'work-plan' })], settings: { week: 'sunday' } }
    },
    activities: [{ ...clone(original), mirrorOnly: { nested: ['raw'] }, location: 'Mirror-specific location' }, event({ id: 'mirror-only' })],
    kids: [{ id: 'kid', name: 'Keep' }], audit: [{ id: 'root-audit' }], history: ['root-history'],
    profile: { name: 'Family' }, futureSnapshot: { nested: [1, { keep: 'verbatim' }] }
  };
};
const row = schedule => ({ schedule, updated_at: '2026-10-30T10:00:00.123456Z' });
const code = expected => error => error.code === expected;

function fakeClient(initial = row(initialSnapshot()), options = {}) {
  const state = { row: clone(initial), reads: 0, updates: [], inserts: [], beforeUpdate: null };
  return { state, auth: { async getUser() { return { data: { user: { id: options.authId || owner } }, error: null }; } },
    from(table) {
      assert.equal(table, 'family_schedules');
      let operation = 'read', payload; const filters = {};
      const query = {
        select(columns) { assert.equal(columns, 'schedule, updated_at'); return query; },
        eq(key, value) { filters[key] = value; return query; },
        update(value) { operation = 'update'; payload = clone(value); return query; },
        insert(value) { operation = 'insert'; payload = clone(value); return query; },
        async maybeSingle() {
          if (operation === 'read') {
            state.reads++;
            assert.deepEqual(filters, { user_id: owner });
            return { data: clone(state.row), error: null };
          }
          if (operation === 'insert') { state.inserts.push(payload); throw Error('Unexpected insert'); }
          state.updates.push({ payload, filters: { ...filters } });
          state.beforeUpdate?.(state);
          assert.equal(filters.user_id, owner);
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

function splitChanges(original = event()) {
  const detached = { ...clone(original), id: 'detached', title: 'Swimming with coach', startDate: '2026-10-30',
    recurrence: 'none', repeatDays: [], repeatInterval: 1, repeatUntil: '', excludedDates: [] };
  return [{ original, event: { id: original.id, excludedDates: [...original.excludedDates, '2026-10-29'] } },
    { original: null, event: detached }];
}

test('malformed falsy event patches never become a silent no-op write', async () => {
  for (const patch of [false, 0, '', [], 'activity']) {
    const initial = initialSnapshot(), client = fakeClient(row(initial));
    await assert.rejects(mutateActivities(client, owner, 'home', [{ original: initial.calendarData.home.activities[0], event: patch }]), code('INVALID_ACTIVITY'));
    assert.equal(client.state.reads, 0); assert.equal(client.state.updates.length, 0);
    assert.deepEqual(client.state.row.schedule, initial);
  }
});

test('one-occurrence exclusion and detached event commit in one CAS, preserving canonical fields and input objects', async () => {
  const initial = initialSnapshot(), before = clone(initial), changes = splitChanges(initial.calendarData.home.activities[0]);
  const untouchedChanges = clone(changes), client = fakeClient(row(initial));
  const result = await mutateActivities(client, owner, 'home', changes);
  const expected = clone(before), series = { ...expected.calendarData.home.activities[0], excludedDates: ['2026-11-12', '2026-10-29'] };
  expected.calendarData.home.activities[0] = series;
  expected.calendarData.home.activities.push(changes[1].event);
  expected.activities[0].excludedDates = ['2026-11-12', '2026-10-29'];
  expected.activities.push(changes[1].event);
  assert.deepEqual(result.schedule, expected);
  assert.deepEqual(initial, before); assert.deepEqual(changes, untouchedChanges);
  assert.equal(client.state.reads, 1); assert.equal(client.state.updates.length, 1); assert.equal(client.state.inserts.length, 0);
  assert.deepEqual(result.undoToken.changes.map(change => change.id), ['series', 'detached']);
  assert.equal(result.undoToken.userId, owner); assert.equal(result.undoToken.calendarId, 'home');
});

test('stale raw original or detached ID collision rejects the whole mutation before a PATCH', async () => {
  for (const kind of ['stale', 'collision', 'duplicate-stored']) {
    const initial = initialSnapshot(), changes = splitChanges(clone(initial.calendarData.home.activities[0]));
    if (kind === 'stale') initial.calendarData.home.activities[0].future.nested.push('web-edit');
    if (kind === 'collision') initial.calendarData.home.activities.push(changes[1].event);
    if (kind === 'duplicate-stored') initial.calendarData.home.activities.push(clone(initial.calendarData.home.activities[0]));
    const before = clone(initial), client = fakeClient(row(initial));
    await assert.rejects(mutateActivities(client, owner, 'home', changes), code('CONFLICT'));
    assert.equal(client.state.updates.length, 0); assert.deepEqual(client.state.row.schedule, before);
  }
});

test('invalid related event or duplicate requested IDs cannot leave an exclusion behind', async () => {
  for (const kind of ['invalid-event', 'duplicate-id']) {
    const initial = initialSnapshot(), changes = splitChanges(initial.calendarData.home.activities[0]);
    if (kind === 'invalid-event') changes[1].event.start = '25:00';
    else changes[1].event.id = 'series';
    const client = fakeClient(row(initial));
    await assert.rejects(mutateActivities(client, owner, 'home', changes), code('INVALID_ACTIVITY'));
    assert.equal(client.state.updates.length, 0); assert.deepEqual(client.state.row.schedule, initial);
  }
});

test('CAS race retains the competing write and commits neither half of an occurrence split', async () => {
  const initial = initialSnapshot(), client = fakeClient(row(initial));
  client.state.beforeUpdate = state => {
    state.row.schedule.calendarData.work.activities.push(event({ id: 'concurrent' }));
    state.row.updated_at = '2026-10-30T10:00:01.000Z';
  };
  await assert.rejects(mutateActivities(client, owner, 'home', splitChanges(initial.calendarData.home.activities[0])), code('CONFLICT'));
  assert.deepEqual(client.state.row.schedule.calendarData.home.activities, initial.calendarData.home.activities);
  assert.deepEqual(client.state.row.schedule.activities, initial.activities);
  assert.equal(client.state.row.schedule.calendarData.work.activities.at(-1).id, 'concurrent');
  assert.equal(client.state.updates.length, 1);
});

test('undo split restores exact event and mismatched mirror metadata while retaining unrelated later edits', async () => {
  const initial = initialSnapshot(), client = fakeClient(row(initial));
  const result = await mutateActivities(client, owner, 'home', splitChanges(initial.calendarData.home.activities[0]));
  client.state.row.schedule.calendarData.home.activities[1].notes = 'Edited later';
  client.state.row.schedule.calendarData.work.activities.push(event({ id: 'later-work' }));
  client.state.row.schedule.activities.push(event({ id: 'later-mirror' }));
  client.state.row.schedule.futureSnapshot.latest = { keep: 'new' };
  const expected = clone(client.state.row.schedule);
  expected.calendarData.home.activities = [initial.calendarData.home.activities[0], expected.calendarData.home.activities[1]];
  expected.activities = [initial.activities[0], initial.activities[1], expected.activities.at(-1)];
  const restored = await restoreActivities(client, owner, 'home', result.undoToken);
  assert.deepEqual(restored.schedule, expected);
  assert.deepEqual(restored.schedule.activities[0].mirrorOnly, initial.activities[0].mirrorOnly);
  assert.equal(client.state.updates.length, 2);
});

test('undo rejects a change to either affected canonical record or its active mirror without overwriting it', async () => {
  for (const kind of ['series', 'detached', 'mirror']) {
    const initial = initialSnapshot(), client = fakeClient(row(initial));
    const result = await mutateActivities(client, owner, 'home', splitChanges(initial.calendarData.home.activities[0]));
    const target = kind === 'mirror' ? client.state.row.schedule.activities[0]
      : client.state.row.schedule.calendarData.home.activities.find(item => item.id === kind);
    target.notes = 'A later edit must survive';
    const beforeUndo = clone(client.state.row);
    await assert.rejects(restoreActivities(client, owner, 'home', result.undoToken), code('CONFLICT'));
    assert.deepEqual(client.state.row, beforeUndo); assert.equal(client.state.updates.length, 1);
  }
});

test('undo tokens are restricted to their account/calendar and still authenticate the current owner', async () => {
  const initial = initialSnapshot(), client = fakeClient(row(initial));
  const result = await deleteActivity(client, owner, 'home', 'series', { original: initial.calendarData.home.activities[0] });
  const reads = client.state.reads;
  await assert.rejects(restoreActivities(client, 'different-owner', 'home', result.undoToken), code('CONFLICT'));
  await assert.rejects(restoreActivities(client, owner, 'work', result.undoToken), code('CONFLICT'));
  assert.equal(client.state.reads, reads);
  const unauthorized = fakeClient(client.state.row, { authId: 'someone-else' });
  await assert.rejects(restoreActivities(unauthorized, owner, 'home', result.undoToken), code('FORBIDDEN'));
  assert.equal(unauthorized.state.reads, 0); assert.equal(unauthorized.state.updates.length, 0);
});

test('undo deletion refuses a recreated ID and cannot replay successfully twice', async () => {
  const initial = initialSnapshot(), client = fakeClient(row(initial)), original = initial.calendarData.home.activities[0];
  const result = await deleteActivity(client, owner, 'home', original.id, { original });
  client.state.row.schedule.calendarData.home.activities.push(event({ title: 'Recreated by someone else' }));
  await assert.rejects(restoreActivities(client, owner, 'home', result.undoToken), code('CONFLICT'));
  assert.equal(client.state.updates.length, 1);
  client.state.row.schedule.calendarData.home.activities.pop();
  await restoreActivities(client, owner, 'home', result.undoToken);
  await assert.rejects(restoreActivities(client, owner, 'home', result.undoToken), code('CONFLICT'));
  assert.equal(client.state.updates.length, 2);
});

test('undo CAS race does not restore stale data or remove a concurrent edit', async () => {
  const initial = initialSnapshot(), client = fakeClient(row(initial));
  const result = await deleteActivity(client, owner, 'home', 'series', { original: initial.calendarData.home.activities[0] });
  client.state.beforeUpdate = state => {
    state.row.schedule.calendarData.work.settings.latest = true;
    state.row.updated_at = '2099-01-01T00:00:00.000Z';
  };
  await assert.rejects(restoreActivities(client, owner, 'home', result.undoToken), code('CONFLICT'));
  assert.equal(client.state.row.schedule.calendarData.work.settings.latest, true);
  assert.equal(client.state.row.schedule.calendarData.home.activities.some(item => item.id === 'series'), false);
  assert.equal(client.state.updates.length, 2);
});

test('undo after an inactive calendar becomes active preserves new mirror-only keys and removes introduced fields', async () => {
  const initial = initialSnapshot(), original = clone(initial.calendarData.home.activities[0]);
  initial.activeCalendarId = 'work'; initial.activities = clone(initial.calendarData.work.activities);
  const client = fakeClient(row(initial));
  const result = await mutateActivities(client, owner, 'home', [{ original, event: { id: original.id, title: 'New name', addedByEdit: { remove: true } } }]);
  assert.equal(result.undoToken.mirrored, false);
  assert.deepEqual(result.schedule.activities, initial.activities);
  client.state.row.schedule.activeCalendarId = 'home';
  client.state.row.schedule.activities = client.state.row.schedule.calendarData.home.activities.map(item => ({ ...clone(item), activatedMirrorOnly: { keep: true } }));
  const restored = await restoreActivities(client, owner, 'home', result.undoToken);
  assert.deepEqual(restored.schedule.calendarData.home.activities[0], original);
  assert.deepEqual(restored.schedule.activities[0], { ...original, activatedMirrorOnly: { keep: true } });
});

test('inactive-to-active undo fails safely when an affected mirror field changed after activation', async () => {
  const initial = initialSnapshot(), original = clone(initial.calendarData.home.activities[0]);
  initial.activeCalendarId = 'work'; initial.activities = clone(initial.calendarData.work.activities);
  const client = fakeClient(row(initial));
  const result = await mutateActivities(client, owner, 'home', [{ original, event: { id: original.id, title: 'New name' } }]);
  client.state.row.schedule.activeCalendarId = 'home';
  client.state.row.schedule.activities = clone(client.state.row.schedule.calendarData.home.activities);
  client.state.row.schedule.activities[0].title = 'Another mirror edit';
  const before = clone(client.state.row);
  await assert.rejects(restoreActivities(client, owner, 'home', result.undoToken), code('CONFLICT'));
  assert.deepEqual(client.state.row, before); assert.equal(client.state.updates.length, 1);
});

test('undo of a formerly active calendar never replaces the current calendar root mirror', async () => {
  const initial = initialSnapshot(), client = fakeClient(row(initial));
  const result = await deleteActivity(client, owner, 'home', 'series', { original: initial.calendarData.home.activities[0] });
  client.state.row.schedule.activeCalendarId = 'work';
  client.state.row.schedule.activities = clone(client.state.row.schedule.calendarData.work.activities);
  const currentMirrors = clone(client.state.row.schedule.activities);
  const restored = await restoreActivities(client, owner, 'home', result.undoToken);
  assert.deepEqual(restored.schedule.activities, currentMirrors);
  assert.deepEqual(restored.schedule.calendarData.home.activities, initial.calendarData.home.activities);
});

test('legacy events with missing clocks can be deleted and restored byte-for-byte without creating v2 data', async () => {
  const original = { id: 7, title: 'Legacy weekly school', day: 'wednesday', future: { untouched: [null, 4] } };
  const legacy = { version: 1, activities: [original, { id: 8, title: 'Other', day: 'friday' }], kids: [], settings: { keep: true }, unknown: 'retain' };
  const client = fakeClient(row(legacy));
  const result = await deleteActivity(client, owner, 'family', 7, { original });
  assert.equal(result.schedule.activities.length, 1);
  const restored = await restoreActivities(client, owner, 'family', result.undoToken);
  assert.deepEqual(restored.schedule, legacy);
  assert.equal(Object.hasOwn(restored.schedule, 'calendarData'), false);
});

test('undoing an atomic multi-delete restores original order in canonical activities and root mirrors', async () => {
  const initial = initialSnapshot();
  const events = [event({ id: 'first' }), event({ id: 'second' }), event({ id: 'third' })];
  initial.calendarData.home.activities = clone(events);
  initial.activities = events.map(item => ({ ...clone(item), mirrorOnly: item.id }));
  const client = fakeClient(row(initial));
  const result = await mutateActivities(client, owner, 'home', events.slice(0, 2).map(original => ({ original, event: null })));
  assert.deepEqual(result.schedule.calendarData.home.activities.map(item => item.id), ['third']);
  const restored = await restoreActivities(client, owner, 'home', result.undoToken);
  assert.deepEqual(restored.schedule, initial);
});

test('exclusion-only mutation of a legacy series keeps missing clocks and restores the original shape', async () => {
  const original = { id: 'old-weekly', title: 'Legacy weekly school', day: 'wednesday', unknown: ['keep'] };
  const legacy = { activities: [original], unknown: 'root' }, client = fakeClient(row(legacy));
  const result = await mutateActivities(client, owner, 'family', [{ original, event: { id: original.id, excludedDates: ['2026-10-28'] } }]);
  assert.deepEqual(result.schedule.activities[0], { ...original, excludedDates: ['2026-10-28'] });
  const restored = await restoreActivities(client, owner, 'family', result.undoToken);
  assert.deepEqual(restored.schedule, legacy);
});

test('multi-day timed plans accept overnight end clocks, while reversed/equal same-day clocks stay invalid', async () => {
  const client = fakeClient();
  const overnight = event({ id: 'overnight', startDate: '2026-10-30', endDate: '2026-10-31', start: '23:00', end: '01:00', recurrence: 'none' });
  await saveActivity(client, owner, 'home', overnight);
  await mutateActivities(client, owner, 'home', [{ event: { ...overnight, id: 'atomic-overnight' } }]);
  assert.equal(client.state.updates.length, 2);
  for (const [endDate, end] of [['', '01:00'], ['2026-10-30', '01:00'], ['', '23:00']]) {
    for (const operation of ['save', 'atomic']) {
      const invalid = { ...overnight, id: `${operation}-${endDate}-${end}`, endDate, end };
      await assert.rejects(operation === 'save' ? saveActivity(client, owner, 'home', invalid)
        : mutateActivities(client, owner, 'home', [{ event: invalid }]), code('INVALID_ACTIVITY'));
    }
  }
  assert.equal(client.state.updates.length, 2);
});
