/* Device-local onboarding choices. No calendar or account data is written remotely. */
const DEFAULTS = Object.freeze({ people: 'family', view: 'today', week: 'monday', hours: 'daytime', reminders: 'none' });
const OPTIONS = Object.freeze({ people: ['myself', 'children', 'family'], view: ['today', 'week', 'month'], week: ['monday', 'sunday'], hours: ['morning', 'afternoon', 'evening', 'daytime'], reminders: ['none', 'start', '10', '30'] });
const PENDING_KEY = 'kidssync:mobile:onboarding:v1:pending';
const DRAFT_KEY = 'kidssync:mobile:onboarding:v1:draft';
function normalizePreferences(value) {
  return Object.fromEntries(Object.entries(OPTIONS).map(([key, options]) => [key, options.includes(value?.[key]) ? value[key] : DEFAULTS[key]]));
}
function keyForUser(userId) {
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 200) throw new Error('A signed-in account is required');
  return `kidssync:mobile:onboarding:v1:user:${encodeURIComponent(userId)}`;
}
function decode(value) {
  try {
    const data = JSON.parse(value);
    return data?.version === 1 && data.completed === true && data.preferences && typeof data.preferences === 'object'
      ? normalizePreferences(data.preferences) : null;
  } catch { return null; }
}
function normalizeDraft(value) {
  const step = Number.isInteger(value?.step) && value.step >= 0 && value.step < 5 ? value.step : 0;
  const key = Object.keys(OPTIONS)[step];
  return { answers: normalizePreferences(value?.answers), step, review: value?.review === true,
    editing: value?.editing === true, choice: OPTIONS[key].includes(value?.choice) ? value.choice : null };
}
function createPreferenceStore(storage) {
  let writes = Promise.resolve();
  // Serialize draft writes so fast taps cannot let an older step replace the latest one.
  const enqueue = work => { const next = writes.catch(() => {}).then(work); writes = next; return next; };
  const encode = preferences => JSON.stringify({ version: 1, completed: true, preferences: normalizePreferences(preferences) });
  return {
    async readDraft() {
      await writes.catch(() => {});
      try {
        const data = JSON.parse(await storage.getItem(DRAFT_KEY));
        return data?.version === 1 && data.completed === false ? normalizeDraft(data) : null;
      } catch { return null; }
    },
    saveDraft(draft) {
      const raw = JSON.stringify({ version: 1, completed: false, ...normalizeDraft(draft) });
      return enqueue(() => storage.setItem(DRAFT_KEY, raw));
    },
    async readPending() { return decode(await storage.getItem(PENDING_KEY)); },
    async savePending(preferences) {
      await enqueue(async () => {
        await storage.setItem(PENDING_KEY, encode(preferences));
        try { await storage.removeItem(DRAFT_KEY); } catch { /* Reviewed choices are already durable. */ }
      });
    },
    async readForUser(userId) { return decode(await storage.getItem(keyForUser(userId))); },
    async saveForUser(userId, preferences) { await storage.setItem(keyForUser(userId), encode(preferences)); },
    async adoptPending(userId, expected) {
      const raw = await storage.getItem(PENDING_KEY), preferences = decode(raw);
      if (!preferences || JSON.stringify(preferences) !== JSON.stringify(normalizePreferences(expected))) throw new Error('Setup choices changed; please review them again');
      await storage.setItem(keyForUser(userId), encode(preferences));
      // Never consume another setup completed while this write was in flight.
      try { if (await storage.getItem(PENDING_KEY) === raw) await storage.removeItem(PENDING_KEY); }
      catch { /* The account write succeeded; pending cleanup can be retried on the next explicit setup. */ }
      return preferences;
    }
  };
}
module.exports = { DEFAULTS, OPTIONS, normalizePreferences, keyForUser, decode, createPreferenceStore, normalizeDraft, PENDING_KEY, DRAFT_KEY };
