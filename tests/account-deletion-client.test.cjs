const test = require('node:test');
const assert = require('node:assert/strict');
const deletion = require('../mobile/src/lib/account-deletion');
function setup() {
  const state = { current: true, user: { id: 'a', email: 'parent@example.com' }, calls: [], response: { data: { deleted: true } } };
  const client = { auth: { getUser: async () => ({ data: { user: state.user } }) }, functions: { invoke: async (name, options) => {
    state.calls.push([name, options]); return state.response;
  } } };
  return { state, client, options: { password: 'password', confirmationEmail: 'parent@example.com', isCurrent: () => state.current } };
}
test('the client targets a named function without passing an arbitrary user ID', async () => {
  const { state, client, options } = setup();
  assert.deepEqual(await deletion.deleteAccount(client, 'a', { ...options, userId: 'victim' }), { deleted: true, userId: 'a' });
  assert.deepEqual(state.calls, [['delete-account', { method: 'POST', body: { password: 'password', confirmationEmail: 'parent@example.com' } }]]);
});
test('stale scope, mismatched account and changed email cannot dispatch deletion', async () => {
  for (const patch of [{ current: false }, { user: { id: 'b', email: 'parent@example.com' } }, { user: { id: 'a', email: 'new@example.com' } }]) {
    const { state, client, options } = setup(); Object.assign(state, patch);
    await assert.rejects(deletion.deleteAccount(client, 'a', options)); assert.deepEqual(state.calls, []);
  }
});
test('the readiness endpoint must confirm the expected deployed version', async () => {
  const { state, client, options } = setup(); state.response = { data: { available: true, version: 1 } };
  assert.equal(await deletion.availability(client, 'a', options), true);
  state.response.data.version = 2; await assert.rejects(deletion.availability(client, 'a', options), { code: 'NOT_CONFIGURED' });
});
test('a screen change after confirmed deletion does not disguise success or select a new cleanup target', async () => {
  const { state, client, options } = setup(); client.functions.invoke = async () => { state.current = false; state.user.id = 'b'; return { data: { deleted: true } }; };
  assert.deepEqual(await deletion.deleteAccount(client, 'a', options), { deleted: true, userId: 'a' });
});
test('function failures retain safe, specific codes and never claim deletion', async () => {
  for (const code of ['REAUTH_FAILED', 'AUTH_REQUIRED', 'NOT_CONFIGURED', 'DELETE_FAILED', 'ADDITIONAL_VERIFICATION_REQUIRED']) {
    const { state, client, options } = setup(); state.response = { error: { context: new Response(JSON.stringify({ code }), { status: 403 }) } };
    await assert.rejects(deletion.deleteAccount(client, 'a', options), { code });
  }
  const { state, client, options } = setup(); state.response = { data: {} };
  await assert.rejects(deletion.deleteAccount(client, 'a', options), { code: 'DELETE_FAILED' });
});
test('only exact confirmed deletion markers can offer cleanup recovery', async () => {
  const values = new Map(); const storage = { setItem: async (key, value) => values.set(key, value), getItem: async key => values.get(key),
    getAllKeys: async () => [...values.keys()], removeItem: async key => values.delete(key) };
  await deletion.rememberDeletedAccount(storage, 'a');
  values.set('kidssync:mobile:deletion:v1:b', JSON.stringify({ version: 1, confirmedDeleted: false, userId: 'b' }));
  values.set('kidssync:mobile:deletion:v1:c', JSON.stringify({ version: 1, confirmedDeleted: true, userId: 'another' }));
  assert.deepEqual(await deletion.pendingCleanup(storage), ['a']);
  await deletion.finishCleanup(storage, 'a'); assert.deepEqual(await deletion.pendingCleanup(storage), []);
});
