const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeTrial, claimNativeTrial } = require('../shared/backend/claim-native-trial');
const clone = value => JSON.parse(JSON.stringify(value));
const preview = () => ({ id: 'abc-123', profile: { name: 'Alex', calendarName: 'Our plans', icon: '⭐', description: 'Parent' }, events: [
  { id: 'flight', title: 'Flight', startDate: '2026-10-23', start: '01:30', end: '02:30', child: 'Maya', location: 'Airport', responsible: 'Alex', items: 'Passport' }
] });
const original = () => ({ version: 2, activeCalendarId: 'old', calendars: [{ id: 'old', name: 'Existing', unknown: 1 }],
  calendarData: { old: { activities: [{ id: 'keep', title: 'Keep me' }], unknown: [1, 2] } },
  activities: [{ id: 'mirror' }], profile: { name: 'Existing profile', custom: true }, unknownRoot: { preserve: true } });
function client(initial = { schedule: original(), updated_at: '2026-10-23T00:00:00.123456+00:00' }, options = {}) {
  const state = { row: initial && clone(initial), reads: 0, writes: 0, auths: 0 };
  return { state, auth: { async getUser() { state.auths++; return { data: { user: { id: options.accountSwitch && state.auths > 1 ? 'other' : options.user || 'owner' } } }; } },
    from(table) {
      assert.equal(table, 'family_schedules'); let operation = 'read', payload, filters = {};
      const query = {
        select() { return query; }, eq(key, value) { filters[key] = value; return query; },
        update(value) { operation = 'update'; payload = value; return query; }, insert(value) { operation = 'insert'; payload = value; return query; },
        async maybeSingle() {
          if (operation === 'read') { state.reads++; assert.equal(filters.user_id, 'owner'); return { data: state.row && clone(state.row), error: options.readError }; }
          state.writes++;
          if (options.writeError) return { error: options.writeError };
          if (options.race) { state.row.schedule.unknownRoot.raced = true; state.row.updated_at = '2026-10-23T00:00:01Z'; }
          if (operation === 'update') { assert.equal(filters.user_id, 'owner'); if (filters.updated_at !== state.row.updated_at) return { data: null }; }
          else if (state.row || options.insertRace) return { error: { code: '23505' } };
          state.row = { schedule: clone(payload.schedule), updated_at: payload.updated_at }; return { data: clone(state.row) };
        }
      }; return query;
    }
  };
}
test('import adds a separate calendar and preserves existing plans, profile, active view and unknown fields', () => {
  const source = original(), before = clone(source), result = mergeTrial(source, preview());
  assert.deepEqual(source, before); assert.equal(result.schedule.calendars.length, 2);
  assert.deepEqual(result.schedule.calendarData.old, before.calendarData.old);
  assert.deepEqual(result.schedule.activities, before.activities); assert.deepEqual(result.schedule.profile, before.profile);
  assert.equal(result.schedule.activeCalendarId, 'old'); assert.deepEqual(result.schedule.unknownRoot, before.unknownRoot);
  assert.equal(result.schedule.calendarData[result.calendarId].activities[0].items, 'Passport');
  assert.equal(result.schedule.calendarData[result.calendarId].kids[0].name, 'Maya');
});
test('empty accounts receive the complete trial while legacy snapshots are preserved in a separate existing calendar', () => {
  const empty = mergeTrial({}, preview()); assert.equal(empty.schedule.activeCalendarId, empty.calendarId); assert.equal(empty.schedule.activities.length, 1);
  const legacy = { activities: [{ id: 'old' }], kids: [{ name: 'Keep' }], extra: 1 };
  const result = mergeTrial(legacy, preview()); assert.deepEqual(result.schedule.calendarData.family, legacy); assert.equal(result.schedule.activities[0].id, 'old');
});
test('idempotent retries never duplicate imports or overwrite a calendar with a colliding ID', () => {
  const first = mergeTrial(original(), preview()); const second = mergeTrial(first.schedule, preview());
  assert.equal(second.alreadySaved, true); assert.equal(second.schedule.calendars.length, 2);
  first.schedule.calendars[1].nativeTrialId = 'different'; assert.throws(() => mergeTrial(first.schedule, preview()), { code: 'CONFLICT' });
});
test('authenticated import checks the current user and never grants access to a different account', async () => {
  const sdk = client(undefined, { user: 'other' }); await assert.rejects(claimNativeTrial(sdk, 'owner', preview()), { code: 'FORBIDDEN' });
  assert.equal(sdk.state.reads, 0); assert.equal(sdk.state.writes, 0);
  const switched = client(undefined, { accountSwitch: true }); await assert.rejects(claimNativeTrial(switched, 'owner', preview()), { code: 'FORBIDDEN' }); assert.equal(switched.state.writes, 0);
  await assert.rejects(claimNativeTrial(client(), 'owner', { ...preview(), claimedBy: 'another-account' }), { code: 'FORBIDDEN' });
});
test('version-checked writes do not overwrite changes made while an import is in flight', async () => {
  const sdk = client(undefined, { race: true }); await assert.rejects(claimNativeTrial(sdk, 'owner', preview()), { code: 'CONFLICT' });
  assert.equal(sdk.state.row.schedule.unknownRoot.raced, true); assert.equal(sdk.state.row.schedule.calendars.length, 1); assert.equal(sdk.state.writes, 1);
  const zeroRows = client(undefined, { writeError: { code: 'PGRST116', details: 'The result contains 0 rows' } });
  await assert.rejects(claimNativeTrial(zeroRows, 'owner', preview()), { code: 'CONFLICT' });
  assert.equal(zeroRows.state.row.schedule.calendars.length, 1);
});
test('inserts never upsert over an account created concurrently and failed imports retain the source', async () => {
  const source = preview(), before = clone(source), sdk = client(null, { insertRace: true });
  await assert.rejects(claimNativeTrial(sdk, 'owner', source), { code: 'CONFLICT' }); assert.deepEqual(source, before);
  const failed = client(undefined, { writeError: new Error('offline') }); await assert.rejects(claimNativeTrial(failed, 'owner', source), /offline/); assert.deepEqual(source, before);
});
test('successful imports and retries preserve the exact saved activities', async () => {
  const sdk = client(); const first = await claimNativeTrial(sdk, 'owner', preview()); const second = await claimNativeTrial(sdk, 'owner', preview());
  assert.equal(first.calendarId, second.calendarId); assert.equal(sdk.state.writes, 1);
  assert.equal(second.schedule.calendarData[first.calendarId].activities[0].start, '01:30');
});
test('malformed calendars and invalid trial payloads fail closed without replacing user data', async () => {
  for (const value of [null, [], { calendars: [], calendarData: null }, { activities: 'bad' }]) assert.throws(() => mergeTrial(value, preview()), { code: 'INVALID_SNAPSHOT' });
  for (const events of [[null], [{ ...preview().events[0], startDate: '2026-02-30' }], [{ ...preview().events[0], start: '24:30' }]]) assert.throws(() => mergeTrial({}, { ...preview(), events }), { code: 'INVALID_TRIAL' });
  const sdk = client({ schedule: null, updated_at: '2026-10-23T00:00:00Z' }); await assert.rejects(claimNativeTrial(sdk, 'owner', preview()), { code: 'INVALID_SNAPSHOT' }); assert.equal(sdk.state.writes, 0);
});

test('import rejects malformed optional data and stores only declared profile fields', async () => {
  for (const field of ['child', 'location', 'responsible', 'items']) {
    const bad = preview(); bad.events[0][field] = { unsafe: true };
    assert.throws(() => mergeTrial({}, bad), { code: 'INVALID_TRIAL' });
  }
  const bad = preview(); bad.events[0].location = 'x'.repeat(10000);
  assert.throws(() => mergeTrial({}, bad), { code: 'INVALID_TRIAL' });
  for (const patch of [{ name: {} }, { description: 'x'.repeat(161) }, { icon: 'invalid' }]) {
    assert.throws(() => mergeTrial({}, { ...preview(), profile: { ...preview().profile, ...patch } }), { code: 'INVALID_TRIAL' });
  }
  const source = preview(); source.profile.password = 'never-store';
  const merged = mergeTrial({}, source);
  assert.equal(Object.hasOwn(merged.schedule.calendarData[merged.calendarId].nativeTrialProfile, 'password'), false);
  const sdk = client();
  await assert.rejects(claimNativeTrial(sdk, 'owner', { ...preview(), claimOwner: 'another-account' }), { code: 'FORBIDDEN' });
  assert.equal(sdk.state.writes, 0);
});
test('all-day imports normalize unused clock fields instead of copying arbitrary values', () => {
  const input = preview(); input.events[0] = { ...input.events[0], allDay: true, start: { bad: true }, end: ['bad'] };
  const result = mergeTrial({}, input), event = result.schedule.calendarData[result.calendarId].activities[0];
  assert.equal(event.start, ''); assert.equal(event.end, ''); assert.equal(event.allDay, true);
});
