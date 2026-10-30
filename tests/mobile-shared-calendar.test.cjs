const test = require('node:test');
const assert = require('node:assert/strict');
const backend = require('../shared/backend/mobile-shared-calendar');

const actor = { id: 'editor-1', email: 'Editor@Example.com' };
const calendar = { id: 'school', ownerId: 'owner-1', name: 'School', invitation: { id: 'invite-1' } };
const version = '2026-10-30T14:00:00.123456+00:00';
const nextVersion = '2026-10-30T14:00:00.123457+00:00';
const activity = extra => ({ id: 'event-1', title: 'Piano', startDate: '2026-10-30', start: '15:00', end: '16:00',
  child: '__family__', recurrence: 'none', future: { keep: [1, { value: true }] }, ...extra });
const member = extra => ({ id: 'invite-1', owner_id: 'owner-1', calendar_id: 'school', member_user_id: actor.id,
  member_email: 'editor@example.com', role: 'editor', status: 'active', ...extra });
const token = extra => ({ version: 1, userId: actor.id, ownerId: calendar.ownerId, calendarId: calendar.id, mirrored: false,
  changes: [{ id: 'event-1', before: activity(), after: null, index: 0, mirrorIndex: -1, mirrorBefore: null, mirrorAfter: null }], ...extra });
const result = (extra = {}) => {
  const role = extra.role || 'editor';
  return { ownerId: 'owner-1', calendarId: 'school', role, canWrite: ['owner', 'editor'].includes(role), updated_at: version,
    calendar: { id: 'school', ownerId: 'owner-1', name: 'School', role, updatedAt: version,
      data: { kids: [], activities: [activity()] } }, ...extra };
};
const ok = data => ({ data, error: null });
const failure = code => error => error.code === code;
const clone = value => JSON.parse(JSON.stringify(value));

function fakeClient({ rpc = [], reads = [], users = [] } = {}) {
  const requests = [], auths = [];
  return { requests, auths,
    auth: { async getUser() {
      auths.push(true); const next = users.length ? users.shift() : actor;
      return next?.error ? next : { data: { user: next }, error: null };
    } },
    async rpc(name, args) {
      requests.push({ rpc: name, args: clone(args) });
      assert.equal(name, backend.CHECKED_RPC, 'Never use the old blind RPC');
      assert.ok(rpc.length, 'Unexpected RPC');
      const value = rpc.shift(); return typeof value === 'function' ? value(args) : value;
    },
    from(table) {
      const request = { table, filters: [] };
      const query = { select(columns) { request.columns = columns; return query; },
        eq(key, value) { request.filters.push(['eq', key, value]); return query; },
        ilike(key, value) { request.filters.push(['ilike', key, value]); return query; },
        async maybeSingle() { requests.push(request); assert.ok(reads.length, 'Unexpected table read'); return reads.shift(); } };
      return query;
    }
  };
}

test('capability probe is read-only, captures actor identity and returns only the selected entry', async () => {
  const response = result({ schedule: { private: 'never return' }, ownerProfile: { private: true } });
  response.calendar.profile = { private: true }; response.calendar.data.settings = { private: true };
  const client = fakeClient({ rpc: [ok(response)] });
  const access = await backend.readSharedCalendar(client, actor, calendar);
  assert.deepEqual(client.requests[0].args, { calendar_owner_id: 'owner-1', shared_calendar_id: 'school', expected_updated_at: null,
    changes: [], undo_token: null, expected_actor_id: actor.id });
  assert.equal(access.shared, true); assert.equal(access.canWrite, true); assert.equal(access.updated_at, version);
  assert.deepEqual(access.calendar.data, { kids: [], activities: [activity()] });
  assert.equal(access.schedule, undefined); assert.equal(access.ownerProfile, undefined);
  assert.equal(access.calendar.profile, undefined); assert.equal(access.calendar.data.settings, undefined);
});

test('missing checked RPC preserves safe selected reads but never enables editing', async () => {
  const snapshot = { profile: { private: true }, calendars: [{ id: 'school', name: 'School' }, { id: 'private', name: 'Private' }],
    calendarData: { school: { kids: [], activities: [activity()] }, private: { activities: [{ id: 'secret' }] } } };
  const client = fakeClient({ rpc: [{ error: { code: 'PGRST202' } }], reads: [ok(member()), ok({ schedule: snapshot, updated_at: version })] });
  const access = await backend.readSharedCalendar(client, actor, calendar);
  assert.equal(access.canWrite, false); assert.equal(access.setupRequired, true); assert.equal(access.role, 'editor');
  assert.deepEqual(access.calendar.data.activities, [activity()]); assert.equal(access.schedule, undefined);
  assert.equal(client.requests.filter(request => request.rpc).length, 1);
  assert.ok(client.requests[1].filters.some(item => item[1] === 'id' && item[2] === 'invite-1'));
});

test('missing deployment cannot fall back to a blind mutation or a table write', async () => {
  const client = fakeClient({ rpc: [{ error: { code: '42883' } }] });
  await assert.rejects(backend.saveSharedActivity(client, actor, calendar, activity({ id: 'new' })), failure('SETUP_REQUIRED'));
  assert.equal(client.requests.length, 1); assert.deepEqual(client.requests[0].args.changes, []);
});

test('viewer/commenter may read capability but cannot reach a mutating RPC', async () => {
  for (const role of ['viewer', 'commenter']) {
    const client = fakeClient({ rpc: [ok(result({ role, calendar: { ...result().calendar, role } }))] });
    await assert.rejects(backend.saveSharedActivity(client, actor, calendar, activity(), { original: activity() }), failure('FORBIDDEN'));
    assert.equal(client.requests.length, 1); assert.equal(client.auths.length, 1);
  }
});

test('shared event create/edit/delete preserve IDs, raw originals and unknown fields', async () => {
  const original = activity(), edited = { ...activity(), title: 'Changed' }, created = activity({ id: 'new' });
  for (const [kind, input] of [['create', created], ['edit', edited], ['delete', null]]) {
    const before = clone(original), response = result({ updated_at: nextVersion, undoToken: token() });
    const client = fakeClient({ rpc: [ok(result()), ok(response)] });
    const row = kind === 'delete' ? await backend.deleteSharedActivity(client, actor, calendar, original.id, { original })
      : await backend.saveSharedActivity(client, actor, calendar, input, { original: kind === 'edit' ? original : null });
    assert.equal(client.requests.length, 2); assert.equal(client.auths.length, 2);
    assert.equal(client.requests[1].args.expected_updated_at, version, 'Keep microsecond precision');
    assert.deepEqual(client.requests[1].args.changes, [{ original: kind === 'create' ? null : original, event: input }]);
    assert.deepEqual(original, before); assert.equal(row.shared, true); assert.deepEqual(row.undoToken, token());
  }
});

test('one-occurrence split is sent as one related mutation, never independent writes', async () => {
  const original = activity({ recurrence: 'weekly', repeatDays: [5] });
  const changes = [{ original, event: { ...original, excludedDates: ['2026-11-06'] } },
    { original: null, event: { ...activity(), id: 'detached', startDate: '2026-11-06' } }];
  const before = clone(changes), client = fakeClient({ rpc: [ok(result()), ok(result({ updated_at: nextVersion }))] });
  await backend.mutateSharedActivities(client, actor, calendar, changes);
  assert.equal(client.requests.length, 2); assert.deepEqual(client.requests[1].args.changes, changes); assert.deepEqual(changes, before);
});

test('revocation and concurrent changes map domain errors without retrying or publishing success', async () => {
  for (const [serverCode, expected] of [['42501', 'FORBIDDEN'], ['40001', 'CONFLICT'], ['P0002', 'NO_CALENDAR'], ['22023', 'INVALID_ACTIVITY']]) {
    const client = fakeClient({ rpc: [ok(result()), { error: { code: serverCode } }] });
    await assert.rejects(backend.saveSharedActivity(client, actor, calendar, activity(), { original: activity() }), failure(expected));
    assert.equal(client.requests.length, 2);
  }
});

test('changed authenticated identity stops before a mutation and server receives expected actor', async () => {
  const client = fakeClient({ users: [actor, { id: 'other', email: actor.email }], rpc: [ok(result())] });
  await assert.rejects(backend.saveSharedActivity(client, actor, calendar, activity()), failure('FORBIDDEN'));
  assert.equal(client.requests.length, 1); assert.equal(client.requests[0].args.expected_actor_id, actor.id);
  const wrongEmail = fakeClient({ users: [{ ...actor, email: 'different@example.com' }] });
  await assert.rejects(backend.readSharedCalendar(wrongEmail, actor, calendar), failure('FORBIDDEN')); assert.equal(wrongEmail.requests.length, 0);
});

test('scoped Undo requires current editor access and sends the raw receipt with the latest revision', async () => {
  const receipt = token(), client = fakeClient({ rpc: [ok(result()), ok(result({ updated_at: nextVersion }))] });
  const row = await backend.restoreSharedActivities(client, actor, calendar, receipt);
  assert.equal(row.shared, true); assert.deepEqual(client.requests[1].args.undo_token, receipt);
  assert.deepEqual(client.requests[1].args.changes, []); assert.equal(client.requests[1].args.expected_updated_at, version);
  for (const wrong of [token({ ownerId: 'other' }), token({ calendarId: 'private' }), token({ userId: 'other' })]) {
    const forbidden = fakeClient(); await assert.rejects(backend.restoreSharedActivities(forbidden, actor, calendar, wrong), failure('CONFLICT'));
    assert.equal(forbidden.requests.length, 0); assert.equal(forbidden.auths.length, 0);
  }
});

test('malformed, duplicate and non-JSON changes stop before auth or network', async () => {
  for (const changes of [[], [{ original: null }], [{ original: null, event: false }],
    [{ original: activity(), event: activity({ id: 'different' }) }],
    [{ original: null, event: activity() }, { original: null, event: activity() }],
    [{ original: null, event: activity({ future: undefined }) }]]) {
    const client = fakeClient(); await assert.rejects(backend.mutateSharedActivities(client, actor, calendar, changes), failure('INVALID_ACTIVITY'));
    assert.equal(client.requests.length, 0); assert.equal(client.auths.length, 0);
  }
});

test('adapter binds client, actor and calendar and never supplies owner calendar creation', async () => {
  let live = true;
  const client = fakeClient(), adapter = backend.createSharedCalendarAdapter({ client, account: actor, calendar, isCurrent: () => live });
  assert.deepEqual(adapter.scope, { kind: 'shared', actorId: actor.id, ownerId: 'owner-1', calendarId: 'school' });
  assert.equal(Object.isFrozen(adapter.scope), true);
  assert.throws(() => adapter.saveActivity({}, actor.id, calendar.id, activity()), failure('STALE_SCOPE'));
  assert.throws(() => adapter.deleteActivity(client, 'different', calendar.id, 'event-1', { original: activity() }), failure('STALE_SCOPE'));
  assert.throws(() => adapter.mutateActivities(client, actor.id, 'private', []), failure('STALE_SCOPE'));
  assert.throws(() => adapter.createCalendar(client, actor.id, { name: 'Wrong route' }), failure('FORBIDDEN'));
  live = false; assert.throws(() => adapter.restoreActivities(client, actor.id, calendar.id, token()), failure('STALE_SCOPE'));
  assert.equal(client.requests.length, 0);
});

test('known display fields reject non-text values, including unused all-day clocks, before network', async () => {
  for (const field of ['location', 'responsible', 'items', 'notes', 'icon', 'start', 'end']) {
    for (const value of [{ text: 'bad' }, ['bad'], 3, true]) {
      const client = fakeClient();
      await assert.rejects(backend.saveSharedActivity(client, actor, calendar,
        activity({ id: 'all-day', allDay: true, [field]: value })), failure('INVALID_ACTIVITY'));
      assert.equal(client.auths.length, 0); assert.equal(client.requests.length, 0);
    }
  }
});

test('null display fields and historical numeric person references keep unknown metadata intact', async () => {
  const event = activity({ id: 'all-day', allDay: true, start: null, end: null, child: 7,
    location: null, responsible: null, items: null, notes: null, icon: null, future: { nested: { keep: [true, 3] } } });
  const client = fakeClient({ rpc: [ok(result()), ok(result({ updated_at: nextVersion }))] });
  await backend.saveSharedActivity(client, actor, calendar, event);
  assert.deepEqual(client.requests[1].args.changes[0].event, event);
});

test('late responses after a scope change are rejected rather than shown in another calendar', async () => {
  let live = true;
  const client = fakeClient({ rpc: [async () => { live = false; return ok(result()); }] });
  await assert.rejects(backend.readSharedCalendar(client, actor, calendar, { isCurrent: () => live }), failure('STALE_SCOPE'));
});

test('adapter captures real account/calendar inputs so later object mutation cannot retarget a write', async () => {
  const inputAccount = { ...actor }, inputCalendar = clone(calendar);
  const client = fakeClient({ rpc: [ok(result()), ok(result({ updated_at: nextVersion }))] });
  const adapter = backend.createSharedCalendarAdapter({ client, account: inputAccount, calendar: inputCalendar });
  inputAccount.id = 'other-account'; inputAccount.email = 'other@example.com';
  inputCalendar.ownerId = 'private-owner'; inputCalendar.id = 'private'; inputCalendar.invitation.id = 'other-invite';
  await adapter.saveActivity(client, actor.id, calendar.id, activity({ id: 'new' }));
  assert.ok(client.requests.every(request => request.args.calendar_owner_id === calendar.ownerId
    && request.args.shared_calendar_id === calendar.id && request.args.expected_actor_id === actor.id));
});

test('unconfirmed or wrong-scope server results cannot be accepted as a write', async () => {
  for (const response of [result({ ownerId: 'private-owner' }), result({ calendarId: 'private' }),
    result({ updated_at: version }), result({ updated_at: nextVersion, canWrite: false })]) {
    const client = fakeClient({ rpc: [ok(result()), ok(response)] });
    await assert.rejects(backend.saveSharedActivity(client, actor, calendar, activity()), failure('INVALID_RESPONSE'));
  }
});

test('missing-RPC fallback rejects revoked, wrong-account or ambiguous legacy access', async () => {
  for (const row of [member({ status: 'banned' }), member({ member_user_id: 'other' }), member({ member_email: 'other@example.com' })]) {
    const client = fakeClient({ rpc: [{ error: { code: 'PGRST202' } }], reads: [ok(row)] });
    await assert.rejects(backend.readSharedCalendar(client, actor, calendar), failure('FORBIDDEN'));
    assert.equal(client.requests.length, 2);
  }
  const client = fakeClient({ rpc: [{ error: { code: 'PGRST202' } }], reads: [ok(member()), ok({ schedule: { activities: [activity()], profile: { secret: true } }, updated_at: version })] });
  await assert.rejects(backend.readSharedCalendar(client, actor, calendar), failure('NO_CALENDAR'));
});

test('lost create response retries with the same ID and cannot create a duplicate', async () => {
  let saved = null, writes = 0;
  const event = activity({ id: 'stable-draft-id' });
  const client = fakeClient({ rpc: [ok(result()), async args => {
    writes++; saved = clone(args.changes[0].event); throw new TypeError('Network response lost');
  }, () => ok(result({ updated_at: nextVersion, calendar: { ...result().calendar, data: { kids: [], activities: [saved] } } })),
  args => { assert.equal(args.changes[0].event.id, saved.id); return { error: { code: '40001' } }; }] });
  await assert.rejects(backend.saveSharedActivity(client, actor, calendar, event), /Network response lost/);
  assert.equal(client.requests.length, 2, 'No automatic blind retry');
  await assert.rejects(backend.saveSharedActivity(client, actor, calendar, event), failure('CONFLICT'));
  assert.equal(writes, 1); assert.equal(saved.id, 'stable-draft-id');
});
