const { normalizeAppearance, DEFAULT_APPEARANCE } = require('./theme');
const queues = new WeakMap();
function scopeFor(accountId) {
  if (accountId == null) return 'guest';
  if (typeof accountId !== 'string' || !accountId.trim() || accountId.length > 200) throw new Error('INVALID_ACCOUNT_SCOPE');
  return `account:${encodeURIComponent(accountId)}`;
}
function keyFor(accountId) { return `kidssync:mobile:appearance:v1:${scopeFor(accountId)}`; }
function decode(raw) {
  if (raw == null) return { ...DEFAULT_APPEARANCE };
  let value; try { value = JSON.parse(raw); } catch { throw new Error('INVALID_APPEARANCE'); }
  if (!value || value.version !== 1 || typeof value.settings !== 'object' || Array.isArray(value.settings) || !value.settings) throw new Error('INVALID_APPEARANCE');
  return normalizeAppearance(value.settings);
}
function createAppearanceStore(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('INVALID_STORAGE');
  let queue = queues.get(storage);
  if (!queue) { queue = { tail: Promise.resolve() }; queues.set(storage, queue); }
  const enqueue = work => { const next = queue.tail.catch(() => {}).then(work); queue.tail = next; return next; };
  return {
    read: accountId => enqueue(async () => decode(await storage.getItem(keyFor(accountId)))),
    // Merge against the latest stored scope so simultaneous mode/accent changes
    // or multiple provider instances cannot drop the other selection.
    save: (accountId, patch) => enqueue(async () => {
      const key = keyFor(accountId), current = decode(await storage.getItem(key));
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('INVALID_APPEARANCE');
      const next = normalizeAppearance({ ...current, ...patch });
      await storage.setItem(key, JSON.stringify({ version: 1, settings: next }));
      return next;
    }),
    reset: accountId => enqueue(async () => {
      const settings = { ...DEFAULT_APPEARANCE };
      await storage.setItem(keyFor(accountId), JSON.stringify({ version: 1, settings }));
      return settings;
    }),
  };
}
module.exports = { scopeFor, keyFor, decode, createAppearanceStore };
