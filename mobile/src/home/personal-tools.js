const VERSION = 1;
const queues = new WeakMap();

function cleanId(value) {
  return typeof value === 'string' && value.trim() && value.length <= 300 ? value.trim() : null;
}

function scopeFor({ accountId, ownerId, calendarId } = {}) {
  const account = cleanId(accountId), owner = cleanId(ownerId), calendar = cleanId(calendarId);
  return account && owner && calendar ? { accountId: account, ownerId: owner, calendarId: calendar } : null;
}

function keyFor(scope) {
  const checked = scopeFor(scope);
  if (!checked) throw new Error('INVALID_HOME_TOOLS_SCOPE');
  return `kidssync:mobile:home-tools:v${VERSION}:${encodeURIComponent(checked.accountId)}:${encodeURIComponent(checked.ownerId)}:${encodeURIComponent(checked.calendarId)}`;
}

function normalize(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const favorites = [...new Set(Array.isArray(input.favorites)
    ? input.favorites.filter(id => typeof id === 'string' && id.trim() && id.length <= 200) : [])].slice(0, 500);
  const entries = input.packed && typeof input.packed === 'object' && !Array.isArray(input.packed)
    ? Object.entries(input.packed) : [];
  const packed = Object.fromEntries(entries.filter(([key, labels]) => typeof key === 'string' && key.length <= 300 && Array.isArray(labels))
    .slice(-300).map(([key, labels]) => [key, [...new Set(labels.filter(label => typeof label === 'string' && label.trim() && label.length <= 200))].slice(0, 30)]));
  return { favorites, packed };
}

function decode(raw) {
  if (raw == null) return normalize(null);
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('INVALID_HOME_TOOLS'); }
  if (!value || value.version !== VERSION || typeof value.state !== 'object') throw new Error('INVALID_HOME_TOOLS');
  return normalize(value.state);
}

function createStore(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('INVALID_STORAGE');
  let queue = queues.get(storage);
  if (!queue) { queue = { tail: Promise.resolve() }; queues.set(storage, queue); }
  const enqueue = work => {
    const next = queue.tail.catch(() => {}).then(work);
    queue.tail = next;
    return next;
  };
  async function update(scope, change) {
    const key = keyFor(scope);
    return enqueue(async () => {
      const current = decode(await storage.getItem(key));
      const next = normalize(change(current));
      await storage.setItem(key, JSON.stringify({ version: VERSION, state: next }));
      return next;
    });
  }
  return {
    read(scope) { const key = keyFor(scope); return enqueue(async () => decode(await storage.getItem(key))); },
    setFavorite(scope, eventId, enabled) {
      const id = cleanId(eventId);
      if (!id || id.length > 200) return Promise.reject(new Error('INVALID_EVENT'));
      return update(scope, current => ({ ...current,
        favorites: enabled ? [id, ...current.favorites.filter(value => value !== id)] : current.favorites.filter(value => value !== id) }));
    },
    setPacked(scope, packingKey, item, enabled) {
      const key = cleanId(packingKey), label = cleanId(item);
      if (!key || !label || label.length > 200) return Promise.reject(new Error('INVALID_PACKING_ITEM'));
      return update(scope, current => {
        const selected = new Set(current.packed[key] || []);
        if (enabled) selected.add(label); else selected.delete(label);
        const packed = { ...current.packed };
        delete packed[key];
        if (selected.size) packed[key] = [...selected];
        return { ...current, packed };
      });
    },
  };
}

module.exports = { VERSION, scopeFor, keyFor, normalize, decode, createStore };
