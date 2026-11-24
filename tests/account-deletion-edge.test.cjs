const test = require('node:test');
const assert = require('node:assert/strict');
let createHandler;
test.before(async () => { ({ createDeleteAccountHandler: createHandler } = await import('../supabase/functions/delete-account/handler.mjs')); });
const actor = { id: 'actor-a', email: 'parent@example.com' };
function setup(patch = {}) {
  const calls = [], state = { actor, capability: { data: { available: true, version: 1 } }, ...patch };
  const handler = createHandler({ url: 'https://example.supabase.co', publishableKey: 'public', serviceRoleKey: 'server-only',
    createClient(_url, key, options) {
      calls.push(['client', key]);
      if (key === 'server-only') return { auth: { admin: { async deleteUser(id, soft) {
        calls.push(['delete', id, soft]); return state.removal || { data: { user: actor } };
      } } } };
      if (options.global) return { auth: { async getUser(jwt) {
        calls.push(['verify', jwt]); return state.verify ? state.verify(calls) : { data: { user: state.actor } };
      } }, async rpc(name) { calls.push(['capability', name]); return state.capability; } };
      return { auth: { async signInWithPassword(input) {
        calls.push(['reauth', { ...input }]); return state.reauth || { data: { user: actor } };
      }, async signOut(options) { calls.push(['signout', options.scope]); if (state.signoutFailure) throw Error('offline'); return {}; } } };
    } });
  const request = (body = { password: 'test-password', confirmationEmail: actor.email }, options = {}) => {
    const method = options.method || 'POST';
    return handler(new Request('https://example.test/delete-account', { method,
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json', ...options.headers },
      ...(method === 'POST' ? { body: options.raw ?? JSON.stringify(body) } : {}) }));
  };
  return { state, calls, request, handler };
}
test('only the live verified and password-reauthenticated actor can be hard deleted', async () => {
  const app = setup(); const response = await app.request();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(app.calls.filter(call => call[0] === 'delete'), [['delete', actor.id, false]]);
  assert.deepEqual(app.calls.filter(call => call[0] === 'reauth'), [['reauth', { email: actor.email, password: 'test-password' }]]);
  assert.equal(app.calls.filter(call => call[0] === 'verify').length, 2);
  assert.equal(app.calls.at(-1)[0], 'signout');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('readiness verifies a live account and migration without password or admin actions', async () => {
  const app = setup(); const response = await app.request(null, { method: 'GET' });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { available: true, version: 1 });
  assert.equal(app.calls.some(call => ['delete', 'reauth'].includes(call[0]) || call[1] === 'server-only'), false);
});
test('missing, revoked or deleted identities never instantiate an admin client', async () => {
  for (const patch of [{ actor: null }, { verify: () => ({ error: Error('expired') }) }]) {
    const app = setup(patch); const response = await app.request();
    assert.equal(response.status, 401); assert.equal(app.calls.some(call => call[1] === 'server-only'), false);
  }
  const app = setup(); const response = await app.request(undefined, { headers: { authorization: '' } });
  assert.equal(response.status, 401); assert.deepEqual(app.calls, []);
});
test('a missing or incomplete migration fails closed before reauthentication', async () => {
  for (const capability of [{ error: Error('missing function') }, { data: { available: false, version: 1 } }, { data: { available: true, version: 2 } }]) {
    const app = setup({ capability }); const response = await app.request();
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'NOT_CONFIGURED' });
    assert.equal(app.calls.some(call => call[0] === 'reauth'), false);
  }
});
test('client-supplied targets, wrong confirmation and malformed input cannot select another user', async () => {
  for (const body of [null, [], {}, { password: '' }, { password: 123, confirmationEmail: actor.email },
    { password: 'test-password', confirmationEmail: 'another@example.com' },
    { password: 'test-password', confirmationEmail: actor.email, userId: 'another-user' }]) {
    const app = setup(); const response = await app.request(body);
    assert.equal(response.status, 400); assert.equal(app.calls.some(call => call[0] === 'delete'), false);
  }
  for (const raw of ['{', ' '.repeat(9000)]) {
    const app = setup(); const response = await app.request(undefined, { raw }); assert.equal(response.status, 400);
  }
});
test('reauthentication failure or identity mismatch never reaches deletion', async () => {
  for (const reauth of [{ error: Error('wrong password') }, { data: { user: { id: 'another' } } }]) {
    const app = setup({ reauth }); const response = await app.request();
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), { code: 'REAUTH_FAILED' });
    assert.equal(app.calls.some(call => call[0] === 'delete'), false);
    assert.equal(app.calls.at(-1)[0], 'signout');
  }
});
test('a session revoked or email changed during reauthentication cannot delete', async () => {
  for (const second of [{ error: Error('revoked') }, { data: { user: { ...actor, email: 'changed@example.com' } } }]) {
    let verifies = 0;
    const app = setup({ verify: () => ++verifies === 1 ? { data: { user: actor } } : second });
    assert.equal((await app.request()).status, 401);
    assert.equal(app.calls.some(call => call[0] === 'delete'), false);
  }
});
test('MFA accounts require an already-verified second-factor session', async () => {
  const app = setup({ actor: { ...actor, factors: [{ status: 'verified' }] } });
  assert.equal((await app.request()).status, 403);
  assert.equal(app.calls.some(call => call[0] === 'reauth'), false);
  const strong = setup({ actor: { ...actor, factors: [{ status: 'verified' }] } });
  const payload = Buffer.from(JSON.stringify({ aal: 'aal2' })).toString('base64url');
  assert.equal((await strong.request(undefined, { headers: { authorization: `Bearer verified.${payload}.signature` } })).status, 200);
});
test('deletion failure is not reported as success and server details never reach the client', async () => {
  const app = setup({ removal: { error: Error('private database details') }, signoutFailure: true });
  const response = await app.request(); assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'DELETE_FAILED' });
});
test('native requests and the production website are supported without permissive CORS', async () => {
  const native = setup(); assert.equal((await native.request()).status, 200);
  const web = setup(); const response = await web.request(null, { method: 'OPTIONS', headers: { origin: 'https://kid-sync-delta.vercel.app' } });
  assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), 'https://kid-sync-delta.vercel.app');
  assert.deepEqual(web.calls, []);
  const other = setup(); assert.equal((await other.request(undefined, { headers: { origin: 'https://untrusted.test' } })).status, 403);
  assert.deepEqual(other.calls, []);
});
