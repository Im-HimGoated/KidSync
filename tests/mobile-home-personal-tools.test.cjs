const test = require('node:test');
const assert = require('node:assert/strict');
const tools = require('../mobile/src/home/personal-tools');

function memoryStorage() {
  const values = new Map();
  return { values, async getItem(key) { return values.has(key) ? values.get(key) : null; }, async setItem(key, value) { values.set(key, value); } };
}

const scope = (accountId, ownerId = accountId, calendarId = 'family') => tools.scopeFor({ accountId, ownerId, calendarId });

test('personal Home tools are isolated by account, owner, and calendar', async () => {
  const storage = memoryStorage(), store = tools.createStore(storage);
  const a = scope('account-a', 'owner-a', 'school'), b = scope('account-b', 'owner-a', 'school');
  const c = scope('account-a', 'owner-b', 'school'), d = scope('account-a', 'owner-a', 'sports');
  await store.setFavorite(a, 'event-1', true);
  await store.setPacked(a, 'event-1:2026-11-03', 'Water', true);
  assert.deepEqual(await store.read(a), { favorites: ['event-1'], packed: { 'event-1:2026-11-03': ['Water'] } });
  for (const other of [b, c, d]) assert.deepEqual(await store.read(other), { favorites: [], packed: {} });
  assert.equal(new Set([a, b, c, d].map(tools.keyFor)).size, 4);
  assert.equal(storage.values.size, 1);
});

test('personal Home updates merge serialized changes and remove empty packing records', async () => {
  const store = tools.createStore(memoryStorage()), target = scope('account-a');
  await Promise.all([store.setFavorite(target, 'one', true), store.setFavorite(target, 'two', true)]);
  await store.setPacked(target, 'one:2026-11-03', 'Shoes', true);
  await store.setPacked(target, 'one:2026-11-03', 'Water', true);
  await store.setPacked(target, 'one:2026-11-03', 'Shoes', false);
  assert.deepEqual(await store.read(target), { favorites: ['two', 'one'], packed: { 'one:2026-11-03': ['Water'] } });
  await store.setPacked(target, 'one:2026-11-03', 'Water', false);
  assert.deepEqual((await store.read(target)).packed, {});
});

test('invalid scope and malformed stored state fail closed', async () => {
  assert.equal(scope('', 'owner', 'calendar'), null);
  assert.throws(() => tools.keyFor({ accountId: 'account', ownerId: '', calendarId: 'calendar' }), /INVALID_HOME_TOOLS_SCOPE/);
  const storage = memoryStorage(), target = scope('account-a');
  storage.values.set(tools.keyFor(target), '{not-json');
  await assert.rejects(tools.createStore(storage).read(target), /INVALID_HOME_TOOLS/);
});
