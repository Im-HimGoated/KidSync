const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../mobile/src/ui/AccountSettings.js'), 'utf8');
// Exercise the actual async handler, including its synchronous request guard.
const handler = source.match(/  (async function navigate\(name, callback\) \{[^]*?\n  \})\n  async function signOut/)[1];
function harness() {
  const state = { opening: '', failure: '' }, writes = [];
  const refs = { request: { current: false }, navigationRequest: { current: false }, mounted: { current: true } };
  const navigate = vm.runInNewContext(`(${handler})`, { ...refs,
    setOpening: value => { state.opening = value; writes.push(['opening', value]); },
    setNavigationFailure: value => { state.failure = value; writes.push(['failure', value]); }
  });
  return { state, writes, ...refs, navigate };
}
test('failed Settings handoffs retain the exact row to show retry feedback', async () => {
  for (const callback of [() => false, () => ({ error: 'blocked' }), () => { throw new Error('failed'); }, async () => { throw new Error('unavailable'); }]) {
    const h = harness();
    await h.navigate('web', callback);
    assert.deepEqual(h.state, { opening: '', failure: 'web' });
    assert.equal(h.navigationRequest.current, false);
  }
});
test('successful retry clears a failed row without closing the newly opened screen', async () => {
  const h = harness(); let destination = 'account';
  await h.navigate('preferences', () => false);
  assert.equal(h.state.failure, 'preferences');
  await h.navigate('preferences', async () => { destination = 'preferences'; return true; });
  assert.equal(destination, 'preferences');
  assert.deepEqual(h.state, { opening: '', failure: '' });
});
test('rapid taps cannot launch duplicate Settings handoffs while one is pending', async () => {
  const h = harness(); let finish, calls = 0;
  const first = h.navigate('web', () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  await h.navigate('web', () => { calls++; });
  await h.navigate('preferences', () => { calls++; });
  assert.equal(calls, 1);
  assert.equal(h.state.opening, 'web');
  finish(false); await first;
  assert.deepEqual(h.state, { opening: '', failure: 'web' });
});
test('closing Settings suppresses late navigation state updates after unmount', async () => {
  const h = harness(); let finish;
  const pending = h.navigate('web', () => new Promise(resolve => { finish = resolve; }));
  h.mounted.current = false;
  const before = h.writes.length;
  finish(false); await pending;
  assert.equal(h.writes.length, before);
  assert.equal(h.navigationRequest.current, false);
});
test('unavailable callbacks and active sign-out never launch navigation', async () => {
  const h = harness(); let calls = 0;
  await h.navigate('preferences', undefined);
  h.request.current = true;
  await h.navigate('web', () => { calls++; });
  assert.equal(calls, 0);
  assert.equal(h.writes.length, 0);
});
