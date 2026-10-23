const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createPreferenceStore, normalizePreferences, keyForUser, DEFAULTS, OPTIONS, PENDING_KEY, DRAFT_KEY } = require('../mobile/src/lib/preferences');
function storage() {
  const data = new Map();
  return { data, getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); }, removeItem: async key => { data.delete(key); } };
}
const selected = { people: 'children', view: 'week', week: 'sunday', hours: 'afternoon', reminders: '30' };
test('untrusted values normalize to safe defaults and do not retain private or arbitrary fields', () => {
  assert.deepEqual(normalizePreferences(null), DEFAULTS);
  assert.deepEqual(normalizePreferences({ ...selected, password: 'private', view: 'invalid' }), { ...selected, view: 'today' });
  assert.throws(() => keyForUser(''), /signed-in/);
  assert.throws(() => keyForUser(null), /signed-in/);
});
test('unfinished drafts survive restart without becoming account preferences', async () => {
  const device = storage();
  const first = createPreferenceStore(device);
  await first.saveDraft({ answers: selected, step: 3, choice: 'evening', review: false });
  const restarted = createPreferenceStore(device);
  assert.deepEqual(await restarted.readDraft(), { answers: selected, step: 3, choice: 'evening', review: false, editing: false });
  assert.equal(await restarted.readPending(), null);
  assert.equal(await restarted.readForUser('account-a'), null);
});
test('rapid draft writes preserve the most recent step and completed choices remove the draft', async () => {
  const device = storage(); const store = createPreferenceStore(device);
  await Promise.all([store.saveDraft({ step: 1 }), store.saveDraft({ step: 4, answers: selected, review: true })]);
  assert.equal((await store.readDraft()).step, 4);
  await store.savePending(selected);
  assert.equal(await store.readDraft(), null);
  assert.deepEqual(await createPreferenceStore(device).readPending(), selected);
});
test('reviewed preferences are adopted only into the account that signs in and survive restart', async () => {
  const device = storage(); const store = createPreferenceStore(device);
  await store.saveForUser('account-b', DEFAULTS);
  await store.savePending(selected);
  await store.adoptPending('account-a', selected);
  assert.deepEqual(await createPreferenceStore(device).readForUser('account-a'), selected);
  assert.deepEqual(await store.readForUser('account-b'), DEFAULTS);
  assert.equal(await store.readPending(), null);
  assert.equal(await store.readForUser('other'), null);
});
test('failed account writes keep the reviewed answers available for retry', async () => {
  const device = storage(); const store = createPreferenceStore(device);
  await store.savePending(selected);
  const realSet = device.setItem;
  device.setItem = async (key, value) => { if (key === keyForUser('account-a')) throw new Error('disk full'); return realSet(key, value); };
  await assert.rejects(store.adoptPending('account-a', selected), /disk full/);
  assert.deepEqual(await store.readPending(), selected);
  device.setItem = realSet;
  await store.adoptPending('account-a', selected);
  assert.deepEqual(await store.readForUser('account-a'), selected);
});
test('a changed pending review is never silently consumed by an old sign-in', async () => {
  const device = storage(); const store = createPreferenceStore(device);
  await store.savePending(DEFAULTS);
  await assert.rejects(store.adoptPending('account-a', selected), /review/);
  assert.equal(await store.readForUser('account-a'), null);
  assert.deepEqual(await store.readPending(), DEFAULTS);
});
test('pending cleanup failure preserves successful account storage', async () => {
  const device = storage(); const store = createPreferenceStore(device);
  await store.savePending(selected);
  device.removeItem = async () => { throw new Error('unavailable'); };
  assert.deepEqual(await store.adoptPending('account-a', selected), selected);
  assert.deepEqual(await store.readForUser('account-a'), selected);
});
test('corrupt or incomplete persisted data is not mistaken for completed preferences', async () => {
  const device = storage(); const store = createPreferenceStore(device);
  for (const raw of ['{bad', 'null', '{"version":2,"completed":true}', '{"version":1,"completed":false,"preferences":{}}']) {
    device.data.set(PENDING_KEY, raw);
    assert.equal(await store.readPending(), null);
  }
  device.data.set(DRAFT_KEY, JSON.stringify({ version: 1, completed: false, step: 100, answers: selected, choice: 'invalid' }));
  assert.equal((await store.readDraft()).step, 0);
  assert.equal((await store.readDraft()).choice, null);
});
test('all five guided questions and review labels have complete English and Chinese choices', () => {
  const screen = fs.readFileSync(require.resolve('../mobile/src/screens/OnboardingScreen.js'), 'utf8');
  const copy = vm.runInNewContext(`(${screen.match(/export const onboardingCopy = (\{[^]*?\n\});/)[1]})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  for (const language of ['en', 'zh']) {
    assert.equal(copy[language].questions.length, 5);
    assert.equal(copy[language].labels.length, 5);
    Object.entries(OPTIONS).forEach(([key, choices], i) => {
      assert.deepEqual(Array.from(copy[language].questions[i][2], option => option[0]), choices, key);
    });
  }
});
