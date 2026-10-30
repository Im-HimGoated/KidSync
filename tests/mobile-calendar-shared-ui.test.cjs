const test = require('node:test');
const assert = require('node:assert/strict');
const { calendarAccess, checkedSharedResult, createCalendarActions } = require('../mobile/src/calendar/model');

const scope = { kind: 'shared', actorId: 'editor', ownerId: 'owner', calendarId: 'home' };
const event = { id: 1, title: 'School', startDate: '2026-10-30', start: '08:00', end: '09:00', recurrence: 'none' };
const selected = { id: 'home', ownerId: 'owner', name: 'Shared home', role: 'editor', data: { kids: [], activities: [event] } };
const result = extra => ({ shared: true, ownerId: 'owner', calendarId: 'home', role: 'editor', canWrite: true,
  updated_at: '2026-10-30T12:00:00Z', calendar: selected, ...extra });
const adapter = extra => ({ scope, saveActivity: async () => result(), deleteActivity: async () => result(),
  mutateActivities: async () => result(), restoreActivities: async () => result(), ...extra });
const context = extra => ({ userId: 'editor', client: {}, calendar: selected, sharedAccess: result(),
  sharedActivityActions: adapter(), onSharedSchedule: () => {}, ...extra });

test('owned calendar permissions remain unchanged and require the owner callback', () => {
  assert.deepEqual(calendarAccess({ userId: 'owner', client: {}, calendar: { id: 'home' }, onSchedule: () => {} }),
    { shared: false, canWrite: true, setupRequired: false });
  assert.equal(calendarAccess({ userId: 'owner', client: {}, onSchedule: () => {}, readOnly: true }).canWrite, false);
  assert.equal(calendarAccess({ userId: 'owner', client: {} }).canWrite, false);
});

test('shared writes require a verified editor probe and matching complete adapter scope', () => {
  assert.deepEqual(calendarAccess(context()), { shared: true, canWrite: true, setupRequired: false });
  for (const patch of [{ role: 'viewer' }, { role: 'commenter' }, { canWrite: false }, { setupRequired: true }]) {
    assert.equal(calendarAccess(context({ sharedAccess: result(patch) })).canWrite, false);
  }
  for (const role of ['viewer', 'commenter', undefined]) assert.equal(calendarAccess(context({ calendar: { ...selected, role } })).canWrite, false);
  for (const patch of [{ actorId: 'another-user' }, { ownerId: 'another-owner' }, { calendarId: 'other' }, { kind: 'owner' }]) {
    assert.equal(calendarAccess(context({ sharedActivityActions: adapter({ scope: { ...scope, ...patch } }) })).canWrite, false);
  }
  assert.equal(calendarAccess(context({ sharedAccess: result({ calendar: { ...selected, ownerId: 'other' } }) })).canWrite, false);
  assert.equal(calendarAccess(context({ sharedActivityActions: adapter({ mutateActivities: undefined }) })).canWrite, false);
  assert.equal(calendarAccess(context({ onSharedSchedule: undefined, onSchedule: () => {} })).canWrite, false);
  assert.equal(calendarAccess(context({ readOnly: true })).canWrite, false);
});

test('missing checked RPC exposes setup status without granting editor controls', () => {
  const access = calendarAccess(context({ sharedAccess: result({ setupRequired: true, canWrite: false }) }));
  assert.equal(access.setupRequired, true); assert.equal(access.canWrite, false);
  const unrelated = calendarAccess(context({ sharedAccess: result({ ownerId: 'other', setupRequired: true }) }));
  assert.equal(unrelated.setupRequired, false); assert.equal(unrelated.canWrite, false);
});

test('shared result validation rejects owner snapshots, pending rows and other calendar scopes', () => {
  assert.equal(checkedSharedResult(result(), scope).calendar, selected);
  for (const row of [result({ shared: false }), result({ pending: true }), result({ schedule: {} }), result({ ownerId: 'other' }),
    result({ calendarId: 'other' }), result({ calendar: { ...selected, ownerId: 'other' } }),
    result({ calendar: { ...selected, data: { kids: [], activities: null } } })]) {
    assert.throws(() => checkedSharedResult(row, scope), { code: 'FORBIDDEN' });
  }
});

test('shared controller publishes selected-only results and never invokes a short owner queue adapter', async () => {
  const published = [], calls = [];
  const actions = createCalendarActions({ client: {}, userId: 'editor', sharedScope: scope,
    activityActions: adapter({ save: () => { throw Error('Owner queue must not run'); }, saveActivity: async (...args) => { calls.push(args); return result(); } }),
    onSchedule: value => published.push(value) });
  await actions.save('home', event);
  assert.deepEqual(calls[0].slice(1), ['editor', 'home', event, { original: null }]);
  assert.equal(published.length, 1); assert.equal(published[0].shared, true);
  assert.equal(Object.hasOwn(published[0], 'schedule'), false);
});

test('missing or mismatched shared methods fail closed before any owner backend fallback', async () => {
  let queueCalls = 0, writes = 0;
  const actions = createCalendarActions({ userId: 'editor', client: {}, sharedScope: scope,
    activityActions: { scope, save: async () => { queueCalls++; return {}; } } });
  await assert.rejects(actions.save('home', event), { code: 'SETUP_REQUIRED' });
  assert.equal(queueCalls, 0);
  const wrong = createCalendarActions({ userId: 'editor', client: {}, sharedScope: scope,
    activityActions: adapter({ saveActivity: async () => { writes++; return result(); } }) });
  await assert.rejects(wrong.save('another-calendar', event), { code: 'FORBIDDEN' });
  await assert.rejects(wrong.create('Unowned calendar'), { code: 'FORBIDDEN' });
  assert.equal(writes, 0);
});

test('pending or unscoped successful adapter responses cannot reach the shared callback', async () => {
  for (const row of [result({ pending: true }), { schedule: { activities: [event] } }, result({ ownerId: 'other' })]) {
    const published = [];
    const actions = createCalendarActions({ userId: 'editor', client: {}, sharedScope: scope,
      activityActions: adapter({ saveActivity: async () => row }), onSchedule: value => published.push(value) });
    await assert.rejects(actions.save('home', event), { code: 'FORBIDDEN' }); assert.deepEqual(published, []);
  }
});

test('account/calendar changes suppress a delayed shared result', async () => {
  let release, current = true; const published = [];
  const actions = createCalendarActions({ userId: 'editor', client: {}, sharedScope: scope, isCurrent: () => current,
    activityActions: adapter({ saveActivity: () => new Promise(resolve => { release = resolve; }) }), onSchedule: value => published.push(value) });
  const task = actions.save('home', event); current = false; release(result());
  await assert.rejects(task, { code: 'STALE_SCOPE' }); assert.deepEqual(published, []);
});
