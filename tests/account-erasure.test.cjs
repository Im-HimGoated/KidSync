const test = require('node:test');
const assert = require('node:assert/strict');
const erasure = require('../mobile/src/lib/account-erasure');
const planning = require('../mobile/src/calendar/planning');
const appearance = require('../mobile/src/ui/appearance-store');
const preferences = require('../mobile/src/lib/preferences');
const home = require('../mobile/src/home/personal-tools');
const sync = require('../mobile/src/lib/schedule-sync');
const trial = require('../mobile/src/lib/native-trial');
const reminders = require('../mobile/src/lib/local-reminders');
function memory(entries = []) {
  const values = new Map(entries);
  return { values, getAllKeys: async () => [...values.keys()], getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); },
    multiRemove: async keys => { for (const key of keys) values.delete(key); } };
}
const options = { cancelReminders: async () => {} };
test('erasure removes only exact account keys, preserving other users, guest state, language and auth', async () => {
  const id = 'account:a', encoded = encodeURIComponent(id);
  const owned = [`kidssync:mobile:schedule:v1:${encoded}`, `kidssync:mobile:onboarding:v1:user:${encoded}`,
    `kidssync:mobile:onboarding:v1:user:${encoded}:draft`, `kidssync:mobile:appearance:v1:account:${encoded}`,
    `kidssync:mobile:reminders:v1:${encoded}`, `kidssync:mobile:weekly-brief:v1:${encoded}`,
    `kidssync:mobile:planning:v1:${encoded}:owner:cal`, `kidssync:mobile:home-tools:v1:${encoded}:owner:cal`,
    `kidssync:mobile:poll:v1:${JSON.stringify([id, 'owner', 'cal'])}`];
  const keep = ['sb-project-auth-token', 'kidssync:mobile:language:v1', 'kidssync:mobile:onboarding:v1:pending',
    'kidssync:mobile:appearance:v1:guest', `kidssync:mobile:schedule:v1:${encoded}suffix`,
    'kidssync:mobile:planning:v1:another:owner:cal', `kidssync:mobile:poll:v1:${JSON.stringify(['another', id, 'cal'])}`];
  const storage = memory([...owned, ...keep].map(key => [key, 'retained'])); let cancelled;
  await erasure.forgetAccount(storage, id, { cancelReminders: async userId => { cancelled = userId; } });
  assert.equal(cancelled, id); assert.deepEqual([...storage.values.keys()], keep);
});
test('late planning writes settle before key removal and old forms cannot recreate their account', async () => {
  const storage = memory(); const store = planning.createPlanningStore(storage, { userId: 'a', calendarId: 'home' });
  let entered, finish;
  const writing = new Promise(resolve => { entered = resolve; }); const originalSet = storage.setItem;
  storage.setItem = async (key, value) => { entered(); await new Promise(resolve => { finish = resolve; }); await originalSet(key, value); };
  const save = store.saveNote('2026-11-24', 'Private note'); await writing;
  const clearing = erasure.forgetAccount(storage, 'a', options);
  assert.equal(erasure.isErased(storage, 'a'), true);
  assert.throws(() => store.saveNote('2026-11-24', 'Late edit'), { code: 'ACCOUNT_DELETED' });
  finish(); await save; await clearing;
  assert.equal(storage.values.has(store.key), false);
  assert.throws(() => planning.createPlanningStore(storage, { userId: 'a', calendarId: 'home' }), { code: 'ACCOUNT_DELETED' });
});
test('existing appearance, onboarding, home and preview writers are invalidated after confirmed deletion', async () => {
  const storage = memory();
  const looks = appearance.createAppearanceStore(storage), setup = preferences.createPreferenceStore(storage), tools = home.createStore(storage);
  await looks.save('a', { mode: 'dark' }); await setup.saveForUser('a', preferences.DEFAULTS);
  const scope = { accountId: 'a', ownerId: 'a', calendarId: 'home' }; await tools.setFavorite(scope, 'plan', true);
  const preview = trial.createTrialStore(storage); await preview.start(); await preview.reserveClaim('a');
  await erasure.forgetAccount(storage, 'a', options);
  await assert.rejects(looks.save('a', { mode: 'light' }), { code: 'ACCOUNT_DELETED' });
  await assert.rejects(setup.saveForUser('a', preferences.DEFAULTS), { code: 'ACCOUNT_DELETED' });
  await assert.rejects(tools.setFavorite(scope, 'other', true), { code: 'ACCOUNT_DELETED' });
  await assert.rejects(preview.markClaimed('a', 'home'), { code: 'ACCOUNT_DELETED' });
  assert.deepEqual(await storage.getAllKeys(), []);
  await looks.save('b', { mode: 'light' }); assert.equal((await looks.read('b')).mode, 'light');
});
test('unclaimed guest previews and previews belonging to another account are retained', async () => {
  for (const claim of [{}, { claimOwner: 'b' }, { claimedBy: 'b' }]) {
    const storage = memory([['kidssync:mobile:trial:v1', JSON.stringify({ id: 'preview', ...claim })],
      ['kidssync:mobile:trial-clock:v1', JSON.stringify({ id: 'preview', elapsedMs: 12 })]]);
    await erasure.forgetAccount(storage, 'a', options); assert.equal(storage.values.size, 2);
  }
});
test('a reminder cancellation failure still clears stored account data and remains retryable', async () => {
  const storage = memory([['kidssync:mobile:schedule:v1:a', 'private']]);
  await assert.rejects(erasure.forgetAccount(storage, 'a', { cancelReminders: async () => { throw Error('OS unavailable'); } }), { code: 'LOCAL_CLEANUP_FAILED' });
  assert.equal(storage.values.size, 0);
  await erasure.forgetAccount(storage, 'a', options);
});
test('storage deletion failures are visible and retry never touches another account', async () => {
  const storage = memory([['kidssync:mobile:schedule:v1:a', 'private'], ['kidssync:mobile:schedule:v1:b', 'other']]);
  const remove = storage.multiRemove; storage.multiRemove = async () => { throw Error('disk unavailable'); };
  await assert.rejects(erasure.forgetAccount(storage, 'a', options));
  storage.multiRemove = remove; await erasure.forgetAccount(storage, 'a', options);
  assert.deepEqual([...storage.values], [['kidssync:mobile:schedule:v1:b', 'other']]);
});
test('a network read completing after deletion cannot recreate the owner schedule cache', async () => {
  const storage = memory(); let finishRead;
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'a' } } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise(resolve => { finishRead = resolve; }) }) }) }) };
  const store = sync.createScheduleSync({ client, storage, userId: 'a' }); await store.load();
  const reading = store.refresh();
  while (!finishRead) await new Promise(resolve => setImmediate(resolve));
  await erasure.forgetAccount(storage, 'a', options);
  finishRead({ data: { schedule: { activities: [] }, updated_at: '2026-11-24T00:00:00Z' } }); await reading;
  assert.equal(storage.values.has(sync.keyForUser('a')), false);
});
test('erased reminder users cannot be re-enabled or rescheduled by a retained controller', async () => {
  const storage = memory(); const notices = [];
  const sdk = { getPermissionsAsync: async () => ({ granted: true }), requestPermissionsAsync: async () => { throw Error('must not request'); },
    getAllScheduledNotificationsAsync: async () => notices, scheduleNotificationAsync: async () => { throw Error('must not schedule'); },
    cancelScheduledNotificationAsync: async () => {} };
  const service = reminders.createLocalReminderService({ storage, notifications: sdk, platform: 'ios' });
  await service.configure('a', { enabled: true, userInitiated: true });
  await erasure.forgetAccount(storage, 'a', { cancelReminders: service.cancelForUser });
  await assert.rejects(service.configure('a', { enabled: true, userInitiated: true }), { code: 'ACCOUNT_DELETED' });
  const result = await service.synchronize({ userId: 'a', calendars: [] });
  assert.equal(result.scheduled, 0); assert.equal((await service.readPreference('a')).enabled, false);
});
