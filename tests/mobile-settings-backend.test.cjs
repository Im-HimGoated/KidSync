const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../shared/backend/mobile-settings');

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const hasCode = code => error => error.code === code;
const snapshot = () => ({
  version: 2, activeCalendarId: 'home', calendars: [{ id: 'home', name: 'Home' }, { id: 'work', name: 'Work' }],
  calendarData: {
    home: { settings: { defaultView: 'week', defaultEventDuration: 30, showWeekends: true, notifications: true, future: { keep: [1] } },
      activities: [{ id: 'keep' }], kids: [{ name: 'Casey' }], view: 'month', future: ['selected'] },
    work: { settings: { defaultView: 'four', defaultEventDuration: 60 }, activities: [], view: 'four' }
  },
  settings: { defaultView: 'week', showWeekends: true, rootOnly: { keep: true }, notifications: false },
  view: 'month', activities: [{ id: 'mirror-only' }], future: { preserve: true }
});
const row = schedule => ({ schedule, updated_at: '2026-11-23T10:00:00.123456+00:00' });
function clientFor(schedule = snapshot(), options = {}) {
  const state = { row: row(clone(schedule)), reads: 0, auths: 0, updates: [], queries: 0 };
  return {
    state,
    auth: { async getUser() {
      state.auths += 1;
      const user = options.users ? options.users[state.auths - 1] : 'owner';
      options.afterAuth?.(state);
      return { data: { user: user ? { id: user } : null }, error: options.authError };
    } },
    from(table) {
      assert.equal(table, 'family_schedules');
      state.queries += 1;
      let operation = 'read', payload; const filters = {};
      const query = {
        select(columns) { assert.equal(columns, 'schedule, updated_at'); return query; },
        eq(key, value) { filters[key] = value; return query; },
        update(value) { operation = 'update'; payload = clone(value); return query; },
        async maybeSingle() {
          assert.equal(filters.user_id, 'owner');
          if (operation === 'read') {
            state.reads += 1; options.beforeRead?.(state);
            return { data: options.missing ? null : clone(state.row), error: options.readError };
          }
          assert.deepEqual(Object.keys(filters).sort(), ['updated_at', 'user_id']);
          state.updates.push({ payload, filters }); options.beforeUpdate?.(state);
          if (options.updateError) return { data: null, error: options.updateError };
          if (filters.updated_at !== state.row.updated_at) return { data: null, error: null };
          state.row = { schedule: payload.schedule, updated_at: payload.updated_at };
          return { data: clone(state.row), error: null };
        }
      };
      return query;
    }
  };
}
const save = (client, changes, original = settings.readDisplaySettings(client.state.row.schedule.calendarData.home), extra = {}) =>
  settings.saveCalendarSettings(client, 'owner', 'home', { original, changes, ...extra });

test('display helpers preserve raw baselines and merge supported cloud effects without changing local onboarding choices', () => {
  const local = { view: 'day', week: 'sunday', hours: 'evening', reminders: '10', people: 'children' };
  const data = { settings: { defaultView: 'four', defaultEventDuration: 90, showWeekends: false,
    notifications: true, use24Hour: true, focusFirstEvent: true, calendarZoom: 1.5 } };
  assert.deepEqual(settings.readDisplaySettings(data), { defaultView: 'four', defaultEventDuration: 90, showWeekends: false });
  assert.deepEqual(settings.mergeDisplayPreferences(local, data), { ...local, view: 'four', defaultEventDuration: 90, showWeekends: false });
  assert.deepEqual(settings.mergeDisplayPreferences(local, { settings: { defaultView: 'future', defaultEventDuration: '60', showWeekends: 0 } }), local);
  assert.deepEqual(settings.mergeDisplayPreferences(local, { settings: { defaultView: 'today' } }), { ...local, view: 'day' });
  assert.deepEqual(settings.readDisplaySettings({ settings: { defaultView: null, showWeekends: 'future' } }), { defaultView: null, showWeekends: 'future' });
  assert.deepEqual(settings.readDisplaySettings({}), {});
  assert.deepEqual(settings.mergeDisplayPreferences(null, null), {});
});

test('fresh owner settings write preserves unrelated fields and root-only mirror values', async () => {
  const initial = snapshot(), client = clientFor(initial), baseline = settings.readDisplaySettings(initial.calendarData.home);
  client.state.row.schedule.calendarData.home.settings.future.webChange = true;
  client.state.row.schedule.calendarData.home.activities.push({ id: 'new-web-plan' });
  client.state.row.schedule.settings.rootOnly.newWebValue = 4;
  const latest = clone(client.state.row.schedule);
  const confirmed = await save(client, { defaultView: 'today', defaultEventDuration: 45 }, baseline);
  const expected = clone(latest);
  Object.assign(expected.calendarData.home.settings, { defaultView: 'today', defaultEventDuration: 45 });
  Object.assign(expected.settings, { defaultView: 'today', defaultEventDuration: 45 });
  expected.calendarData.home.view = 'today'; expected.view = 'today';
  assert.deepEqual(confirmed.schedule, expected);
  assert.deepEqual(initial, snapshot());
  assert.equal(client.state.auths, 2); assert.equal(client.state.reads, 1); assert.equal(client.state.updates.length, 1);
  assert.equal(client.state.updates[0].filters.updated_at, '2026-11-23T10:00:00.123456+00:00');
});

test('unrelated setting changes can merge while changing only the requested field', async () => {
  const client = clientFor(), baseline = settings.readDisplaySettings(client.state.row.schedule.calendarData.home);
  Object.assign(client.state.row.schedule.calendarData.home.settings, { defaultView: 'four', defaultEventDuration: 120 });
  const confirmed = await save(client, { showWeekends: false }, baseline);
  assert.equal(confirmed.schedule.calendarData.home.settings.defaultView, 'four');
  assert.equal(confirmed.schedule.calendarData.home.settings.defaultEventDuration, 120);
  assert.equal(confirmed.schedule.calendarData.home.settings.showWeekends, false);
  assert.equal(confirmed.schedule.calendarData.home.view, 'month');
  assert.equal(confirmed.schedule.view, 'month');
});

test('future raw field values survive unrelated changes and are compared exactly when replaced', async () => {
  const client = clientFor();
  client.state.row.schedule.calendarData.home.settings.defaultView = { futureMode: ['keep', 3] };
  const original = settings.readDisplaySettings(client.state.row.schedule.calendarData.home);
  const updated = await save(client, { showWeekends: false }, original);
  assert.deepEqual(updated.schedule.calendarData.home.settings.defaultView, { futureMode: ['keep', 3] });
  const replaced = await save(client, { defaultView: 'four' }, original);
  assert.equal(replaced.schedule.calendarData.home.settings.defaultView, 'four');
  const clientChanged = clientFor();
  clientChanged.state.row.schedule.calendarData.home.settings.defaultView = { futureMode: ['changed', 3] };
  await assert.rejects(save(clientChanged, { defaultView: 'four' }, original), hasCode('CONFLICT'));
});

test('same-field changes conflict and missing values are distinct from explicit defaults', async () => {
  const client = clientFor(), original = settings.readDisplaySettings(client.state.row.schedule.calendarData.home);
  client.state.row.schedule.calendarData.home.settings.defaultEventDuration = 60;
  await assert.rejects(save(client, { defaultEventDuration: 90 }, original), hasCode('CONFLICT'));
  assert.equal(client.state.updates.length, 0);
  for (const stored of [30, null, '30']) {
    const missing = clientFor(); missing.state.row.schedule.calendarData.home.settings.defaultEventDuration = stored;
    await assert.rejects(save(missing, { defaultEventDuration: 60 }, {}), hasCode('CONFLICT'));
    assert.equal(missing.state.updates.length, 0);
  }
  const absent = clientFor(); delete absent.state.row.schedule.calendarData.home.settings.defaultEventDuration;
  await assert.rejects(save(absent, { defaultEventDuration: 60 }, { defaultEventDuration: 30 }), hasCode('CONFLICT'));
  const added = await save(absent, { defaultEventDuration: 60 }, {});
  assert.equal(added.schedule.calendarData.home.settings.defaultEventDuration, 60);
});

test('inactive calendar writes preserve active root settings and view verbatim', async () => {
  const initial = snapshot(), client = clientFor(initial);
  const confirmed = await settings.saveCalendarSettings(client, 'owner', 'work', {
    original: settings.readDisplaySettings(initial.calendarData.work), changes: { defaultView: 'month', showWeekends: false }
  });
  assert.deepEqual(confirmed.schedule.settings, initial.settings);
  assert.equal(confirmed.schedule.view, initial.view);
  assert.deepEqual(confirmed.schedule.calendarData.home, initial.calendarData.home);
  assert.deepEqual(confirmed.schedule.calendarData.work.settings, { defaultView: 'month', defaultEventDuration: 60, showWeekends: false });
  assert.equal(confirmed.schedule.calendarData.work.view, 'month');
});

test('legacy owner calendar is updated without manufacturing modern calendar metadata', async () => {
  const initial = { activities: [], settings: { defaultView: 'four', notifications: true, future: [1] }, view: 'week', profile: { keep: true } };
  const client = clientFor(initial);
  const confirmed = await settings.saveCalendarSettings(client, 'owner', 'family', {
    original: settings.readDisplaySettings(initial), changes: { defaultView: 'month', defaultEventDuration: 120 }
  });
  assert.deepEqual(confirmed.schedule, { ...initial,
    settings: { ...initial.settings, defaultView: 'month', defaultEventDuration: 120 }, view: 'month' });
  assert.equal(confirmed.schedule.calendars, undefined);
});

test('timestamp CAS rejects an interleaved update and advances even a future timestamp', async () => {
  const raced = clientFor(snapshot(), { beforeUpdate(state) { state.row.updated_at = '2026-11-23T10:00:01Z'; state.row.schedule.future.raced = true; } });
  await assert.rejects(save(raced, { showWeekends: false }), hasCode('CONFLICT'));
  assert.equal(raced.state.row.schedule.future.raced, true);
  assert.equal(raced.state.row.schedule.calendarData.home.settings.showWeekends, true);
  const future = clientFor(); future.state.row.updated_at = '2099-01-01T00:00:00.123456+00:00';
  const confirmed = await save(future, { showWeekends: false });
  assert.equal(confirmed.updated_at, '2099-01-01T00:00:00.124Z');
  const invalid = clientFor(); invalid.state.row.updated_at = null;
  await assert.rejects(save(invalid, { showWeekends: false }), hasCode('CONFLICT'));
  assert.equal(invalid.state.updates.length, 0);
});

test('owner identity is checked before reading and again before updating', async () => {
  for (const users of [['other'], [null], ['owner', 'other'], ['owner', null]]) {
    const client = clientFor(snapshot(), { users });
    await assert.rejects(save(client, { showWeekends: false }), hasCode('FORBIDDEN'));
    assert.equal(client.state.reads, users[0] === 'owner' ? 1 : 0);
    assert.equal(client.state.updates.length, 0);
  }
  const client = clientFor(); delete client.auth;
  await assert.rejects(save(client, { showWeekends: false }), hasCode('FORBIDDEN'));
  assert.equal(client.state.reads, 0);
});

test('scope changes after auth, read, or pre-update auth stop writes', async () => {
  for (const stage of ['start', 'firstAuth', 'read', 'secondAuth']) {
    let current = stage !== 'start';
    const client = clientFor(snapshot(), {
      afterAuth(state) { if ((stage === 'firstAuth' && state.auths === 1) || (stage === 'secondAuth' && state.auths === 2)) current = false; },
      beforeRead() { if (stage === 'read') current = false; }
    });
    await assert.rejects(save(client, { showWeekends: false }, undefined, { isCurrent: () => current }), hasCode('STALE_SCOPE'));
    assert.equal(client.state.updates.length, 0, stage);
  }
});

test('a scope change during update never returns a row to the former account UI', async () => {
  let current = true;
  const client = clientFor(snapshot(), { beforeUpdate() { current = false; } });
  await assert.rejects(save(client, { showWeekends: false }, undefined, { isCurrent: () => current }), hasCode('STALE_SCOPE'));
  assert.equal(client.state.updates.length, 1);
});

test('malformed, missing, duplicated or foreign calendar targets cannot write', async () => {
  const cases = [
    [{ ...snapshot(), calendars: {} }, 'home', 'NO_CALENDAR'],
    [{ ...snapshot(), calendarData: [] }, 'home', 'NO_CALENDAR'],
    [{ ...snapshot(), calendars: [{ id: 'home' }, { id: 'home' }] }, 'home', 'NO_CALENDAR'],
    [{ ...snapshot(), calendars: [{ id: 'home', ownerId: 'other' }] }, 'home', 'FORBIDDEN'],
    [{ ...snapshot(), calendarData: { home: null } }, 'home', 'NO_CALENDAR'],
    [snapshot(), 'missing', 'NO_CALENDAR'], [snapshot(), '__proto__', 'NO_CALENDAR'],
    [{ activities: [] }, 'other', 'NO_CALENDAR'], [{ settings: {} }, 'family', 'NO_CALENDAR'],
  ];
  for (const [initial, id, code] of cases) {
    const client = clientFor(initial);
    await assert.rejects(settings.saveCalendarSettings(client, 'owner', id, { original: {}, changes: { defaultView: 'week' } }), hasCode(code));
    assert.equal(client.state.updates.length, 0);
  }
  const missing = clientFor(snapshot(), { missing: true });
  await assert.rejects(save(missing, { showWeekends: false }), hasCode('NO_CALENDAR'));
});

test('unsupported keys/values and malformed settings containers are rejected without overwriting them', async () => {
  for (const changes of [{}, { notifications: true }, { use24Hour: true }, { defaultView: 'day' },
    { defaultEventDuration: '60' }, { defaultEventDuration: 15 }, { showWeekends: 0 }]) {
    const client = clientFor();
    await assert.rejects(save(client, changes), hasCode('INVALID_SETTINGS'));
    assert.equal(client.state.updates.length, 0);
  }
  for (const value of ['broken', [], 1]) {
    const client = clientFor(); client.state.row.schedule.calendarData.home.settings = value;
    await assert.rejects(save(client, { showWeekends: false }, {}), hasCode('NO_CALENDAR'));
  }
  const malformedMirror = clientFor(); malformedMirror.state.row.schedule.settings = [];
  await assert.rejects(save(malformedMirror, { showWeekends: false }), hasCode('NO_CALENDAR'));
  assert.equal(malformedMirror.state.updates.length, 0);
  const client = clientFor();
  await assert.rejects(save(client, { showWeekends: false }, { notifications: true }), hasCode('INVALID_SETTINGS'));
  await assert.rejects(save(client, { showWeekends: undefined }), hasCode('INVALID_SETTINGS'));
});

test('permission failures are surfaced and never create an owner row', async () => {
  for (const options of [{ authError: { code: '401' } }, { readError: { code: '42501' } }, { updateError: { code: '403' } }]) {
    const client = clientFor(snapshot(), options);
    await assert.rejects(save(client, { showWeekends: false }), hasCode('FORBIDDEN'));
    assert.equal(client.state.row.schedule.calendarData.home.settings.showWeekends, true);
  }
});
