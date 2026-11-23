const test = require('node:test');
const assert = require('node:assert/strict');
const { startForegroundRefresh } = require('../mobile/src/family/foreground-refresh');

const settle = () => new Promise(resolve => setImmediate(resolve));
function clock() {
  const state = { tick: null, cleared: false };
  return { state, setInterval(callback, delay) { assert.equal(delay, 15000); state.tick = callback; return 42; },
    clearInterval(timer) { assert.equal(timer, 42); state.cleared = true; } };
}

test('quiet refresh waits for an eligible foreground screen and can resume after forms close', async () => {
  const timers = clock(); let eligible = false, calls = 0;
  const stop = startForegroundRefresh({ timers, canRefresh: () => eligible, refresh: async () => { calls++; } });
  timers.state.tick(); await settle(); assert.equal(calls, 0);
  eligible = true; timers.state.tick(); await settle(); assert.equal(calls, 1);
  eligible = false; timers.state.tick(); await settle(); assert.equal(calls, 1);
  eligible = true; timers.state.tick(); await settle(); assert.equal(calls, 2);
  stop(); assert.equal(timers.state.cleared, true);
});

test('slow collaboration reads never overlap and a later tick catches up', async () => {
  const timers = clock(); let calls = 0, finish;
  const stop = startForegroundRefresh({ timers, canRefresh: () => true,
    refresh: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  timers.state.tick(); timers.state.tick(); timers.state.tick(); assert.equal(calls, 1);
  finish(); await settle(); timers.state.tick(); assert.equal(calls, 2);
  finish(); await settle(); stop();
});

test('a failed read does not poison future catch-up attempts', async () => {
  const timers = clock(); let calls = 0;
  const stop = startForegroundRefresh({ timers, canRefresh: () => true,
    refresh: async () => { if (++calls === 1) throw new Error('offline'); } });
  timers.state.tick(); await settle(); timers.state.tick(); await settle();
  assert.equal(calls, 2); stop();
});

test('cleanup stops late timer callbacks even with an old in-flight read', async () => {
  const timers = clock(); let calls = 0, finish;
  const stop = startForegroundRefresh({ timers, canRefresh: () => true,
    refresh: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  timers.state.tick(); stop(); finish(); await settle();
  timers.state.tick(); await settle(); assert.equal(calls, 1); assert.equal(timers.state.cleared, true);
});
