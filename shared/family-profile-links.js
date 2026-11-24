(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KidsSyncFamilyProfileLinks = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

  function equal(first, second) {
    if (first === second) return true;
    if (Array.isArray(first) || Array.isArray(second)) return Array.isArray(first) && Array.isArray(second)
      && first.length === second.length && first.every((value, index) => equal(value, second[index]));
    if (!record(first) || !record(second)) return false;
    const keys = Object.keys(first);
    return keys.length === Object.keys(second).length
      && keys.every(key => own(second, key) && equal(first[key], second[key]));
  }

  /**
   * Keep plans when profiles change. Names take precedence over ID aliases;
   * unchanged ID references stay unchanged. Callers own validation and writes.
   */
  function remapProfileActivities(activities, originalProfiles, profiles) {
    if (!Array.isArray(activities) || !Array.isArray(originalProfiles) || !Array.isArray(profiles)) return activities;
    const updatedById = new Map(profiles.map(kid => [String(kid.id), kid.name]));
    const names = new Map(), ids = new Map();
    for (const kid of originalProfiles) {
      if (typeof kid?.name !== 'string') continue;
      const updated = kid.id == null ? (profiles.some(next => next.name === kid.name) ? kid.name : null)
        : updatedById.get(String(kid.id)) ?? null;
      names.set(kid.name, updated);
      if (kid.id != null && updated !== kid.name) ids.set(String(kid.id), updated);
    }
    const updateReference = reference => {
      if (reference === 'all' || reference === '__family__') return reference;
      if (names.has(reference)) return names.get(reference);
      return (typeof reference === 'string' || typeof reference === 'number') && ids.has(String(reference))
        ? ids.get(String(reference)) : reference;
    };
    const updateReferences = references => {
      const updated = references.map(updateReference);
      if (equal(updated, references)) return references;
      return [...new Set(updated.filter((value, index) => value != null || references[index] == null))];
    };
    return activities.map(activity => {
      if (!record(activity)) return activity;
      const next = { ...activity };
      for (const field of ['child', 'childId']) {
        if (!own(activity, field)) continue;
        const child = Array.isArray(activity[field]) ? updateReferences(activity[field]) : updateReference(activity[field]);
        if (!equal(child, activity[field])) next[field] = child == null || Array.isArray(child) && !child.length ? '__family__' : child;
      }
      if (Array.isArray(activity.attendees)) {
        const attendees = updateReferences(activity.attendees);
        if (!equal(attendees, activity.attendees)) next.attendees = attendees.length ? attendees : ['all'];
      }
      return next;
    });
  }

  return { remapProfileActivities };
});
