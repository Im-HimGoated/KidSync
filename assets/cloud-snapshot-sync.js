(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KidsSyncCloudSnapshotSync = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const table = 'family_schedules';
  const mirrorKeys = ['kids', 'activities', 'presets', 'history', 'audit', 'settings', 'view'];
  const collections = new Set(['calendars', 'kids', 'activities', 'presets', 'history', 'audit']);
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const read = (value, key) => own(value, key) ? value[key] : undefined;

  function equal(left, right) {
    if (left === right) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((item, index) => equal(item, right[index]));
    }
    if (!record(left) || !record(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => own(right, key) && equal(left[key], right[key]));
  }

  function conflict() {
    throw Object.assign(new Error('The same calendar data changed on another device.'), { code: 'SYNC_CONFLICT' });
  }

  function entries(values) {
    if (values === undefined) return new Map();
    if (!Array.isArray(values)) return null;
    const result = new Map();
    for (const item of values) {
      if (!record(item) || !['string', 'number'].includes(typeof item.id) || item.id === '') return null;
      const key = String(item.id);
      if (result.has(key)) return null;
      result.set(key, item);
    }
    return result;
  }

  function merge(baseLocal, local, baseRemote, remote, key) {
    if (equal(baseLocal, local) || equal(local, remote)) return remote;
    if (local === undefined || (remote === undefined && baseRemote !== undefined)) {
      if (!equal(baseRemote, remote)) conflict();
      return local;
    }
    const values = [baseLocal, local, baseRemote, remote];
    if (record(local) && values.every(value => value === undefined || record(value))) {
      const result = { ...remote };
      for (const field of new Set([...Object.keys(baseLocal || {}), ...Object.keys(local)])) {
        const value = merge(read(baseLocal, field), read(local, field), read(baseRemote, field), read(remote, field), field);
        if (value === undefined) delete result[field];
        else Object.defineProperty(result, field, { value, enumerable: true, configurable: true, writable: true });
      }
      return result;
    }
    if (collections.has(key) && Array.isArray(local)) {
      const [oldLocal, newLocal, oldRemote, newRemote] = values.map(entries);
      if (oldLocal && newLocal && oldRemote && newRemote) {
        const result = [...new Set([...newLocal.keys(), ...newRemote.keys(), ...oldLocal.keys()])]
          .map(id => merge(oldLocal.get(id), newLocal.get(id), oldRemote.get(id), newRemote.get(id)))
          .filter(item => item !== undefined);
        if (key === 'history' || key === 'audit') {
          const field = key === 'history' ? 'savedAt' : 'at';
          result.sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));
          return result.slice(0, key === 'history' ? 20 : 100);
        }
        return result;
      }
    }
    if (!equal(baseRemote, remote)) conflict();
    return local;
  }

  function modern(snapshot) {
    return Array.isArray(snapshot?.calendars) && record(snapshot?.calendarData);
  }

  function comparable(snapshot, local) {
    if (!record(snapshot)) conflict();
    if (modern(snapshot) || !modern(local)) return snapshot;
    if (own(snapshot, 'calendars') || own(snapshot, 'calendarData')) conflict();
    const family = local.calendars.find(item => item?.id === 'family');
    if (!family) conflict();
    const data = Object.fromEntries(mirrorKeys.filter(key => own(snapshot, key)).map(key => [key, snapshot[key]]));
    return { ...snapshot, calendars: [family], activeCalendarId: 'family', calendarData: { family: data } };
  }

  function withoutMirrors(snapshot) {
    return Object.fromEntries(Object.entries(snapshot).filter(([key]) => !mirrorKeys.includes(key)));
  }

  function mergeSchedule({ baseLocal, baseRemote, local, remote }) {
    if (![baseLocal, baseRemote, local, remote].every(record)) conflict();
    if (!modern(local)) {
      if ([baseLocal, baseRemote, remote].some(modern)) conflict();
      return merge(baseLocal, local, baseRemote, remote);
    }
    const all = [baseLocal, local, baseRemote, remote].map(item => withoutMirrors(comparable(item, local)));
    const schedule = merge(...all);
    const active = schedule.calendars?.find(item => item?.id === schedule.activeCalendarId) || schedule.calendars?.[0];
    if (!active || !own(schedule.calendarData, active.id) || !record(schedule.calendarData[active.id])) conflict();
    const data = schedule.calendarData[active.id];
    return { ...schedule, activeCalendarId: active.id,
      ...Object.fromEntries(mirrorKeys.filter(key => own(data, key)).map(key => [key, data[key]])) };
  }

  async function writeSchedule({ client, userId, local, baseline, isCurrent = () => true }) {
    const assertCurrent = () => {
      if (!isCurrent()) throw Object.assign(new Error('The signed-in account changed.'), { code: 'STALE_SCOPE' });
    };
    if (!userId || !record(local)) conflict();
    for (let attempt = 0; attempt < 3; attempt++) {
      assertCurrent();
      const { data: row, error: readError } = await client.from(table)
        .select('schedule, updated_at').eq('user_id', userId).maybeSingle();
      assertCurrent();
      if (readError) throw readError;
      if (!row && baseline) conflict();
      if (row && !baseline) {
        if (equal(local, row.schedule)) return row;
        conflict();
      }
      const schedule = row ? mergeSchedule({ baseLocal: baseline.local, baseRemote: baseline.remote, local, remote: row.schedule }) : local;
      if (row && equal(schedule, row.schedule)) return row;
      const previousTime = row ? Date.parse(row.updated_at) : 0;
      if (!Number.isFinite(previousTime)) conflict();
      const updated_at = new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
      const write = row ? client.from(table).update({ schedule, updated_at }).eq('user_id', userId).eq('updated_at', row.updated_at)
        : client.from(table).insert({ user_id: userId, schedule, updated_at });
      const { data, error } = await write.select('schedule, updated_at').maybeSingle();
      assertCurrent();
      if (error && !['23505', 'PGRST116'].includes(String(error.code))) throw error;
      if (!error && data) return data;
    }
    conflict();
  }

  return { equal, mergeSchedule, writeSchedule };
});
