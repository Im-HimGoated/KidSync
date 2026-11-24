// A confirmed remote deletion invalidates old store instances synchronously.
// Their queued writes settle before any keys are removed, preventing late
// AsyncStorage completions from recreating erased account data.
const stores = new WeakMap();
const valid = value => typeof value === 'string' && !!value.trim() && value.length <= 300;
function failure(code) { const error = new Error(code); error.code = code; return error; }
function account(storage, userId) {
  if (!storage || !valid(userId)) throw failure('INVALID_ACCOUNT_SCOPE');
  let users = stores.get(storage);
  if (!users) { users = new Map(); stores.set(storage, users); }
  if (!users.has(userId)) users.set(userId, { erased: false, queues: new Map() });
  return users.get(userId);
}
function isErased(storage, userId) { return stores.get(storage)?.get(userId)?.erased === true; }
function assertActive(storage, userId) { if (account(storage, userId).erased) throw failure('ACCOUNT_DELETED'); }
function registerQueue(storage, userId, key, drain) {
  assertActive(storage, userId);
  account(storage, userId).queues.set(key, drain);
}
function ownsKey(key, userId) {
  const id = encodeURIComponent(userId);
  if ([`kidssync:mobile:schedule:v1:${id}`, `kidssync:mobile:onboarding:v1:user:${id}`,
    `kidssync:mobile:onboarding:v1:user:${id}:draft`, `kidssync:mobile:reminders:v1:${id}`,
    `kidssync:mobile:appearance:v1:account:${id}`, `kidssync:mobile:weekly-brief:v1:${id}`].includes(key)) return true;
  if (key.startsWith(`kidssync:mobile:planning:v1:${id}:`) || key.startsWith(`kidssync:mobile:home-tools:v1:${id}:`)) return true;
  if (key.startsWith('kidssync:mobile:poll:v1:')) {
    try { const scope = JSON.parse(key.slice('kidssync:mobile:poll:v1:'.length)); return Array.isArray(scope) && scope[0] === userId; }
    catch { return false; }
  }
  return false;
}
async function forgetAccount(storage, userId, { cancelReminders } = {}) {
  const state = account(storage, userId); state.erased = true;
  await Promise.allSettled([...state.queues.values()].map(drain => Promise.resolve().then(drain)));
  if (typeof cancelReminders !== 'function' || typeof storage.getAllKeys !== 'function') throw failure('LOCAL_CLEANUP_FAILED');
  let reminderFailure;
  try { await cancelReminders(userId); } catch (error) { reminderFailure = error; }
  const keys = (await storage.getAllKeys()).filter(key => ownsKey(key, userId));
  // A claimed preview belongs to this account. An unclaimed guest preview or
  // another account's preview must never be removed as a side effect.
  const trialKey = 'kidssync:mobile:trial:v1', clockKey = 'kidssync:mobile:trial-clock:v1';
  const raw = await storage.getItem(trialKey);
  let trial;
  try { trial = raw ? JSON.parse(raw) : null; } catch { /* Unknown guest data is retained. */ }
  if (trial?.claimedBy === userId || trial?.claimOwner === userId) {
    keys.push(trialKey);
    try { if (JSON.parse(await storage.getItem(clockKey))?.id === trial.id) keys.push(clockKey); } catch { /* Unrelated clocks stay intact. */ }
  }
  if (typeof storage.multiRemove === 'function') await storage.multiRemove(keys);
  else for (const key of keys) await storage.removeItem(key);
  if (reminderFailure) throw failure('LOCAL_CLEANUP_FAILED');
  return { cleared: keys.length };
}
module.exports = { assertActive, isErased, registerQueue, ownsKey, forgetAccount };
