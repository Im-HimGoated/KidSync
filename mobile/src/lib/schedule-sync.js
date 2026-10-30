// Account-scoped owner-calendar cache and durable activity outbox. No UI, SDK,
// network-status dependency or credentials are stored here.
const schedules = require('../../../shared/backend/schedules');
const backend = require('../../../shared/backend/mobile-calendar');
const dates = require('./calendar');

const MAX_PENDING = 50;
const MAX_BYTES = 8 * 1024 * 1024;
const locks = new WeakMap();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const validId = value => (typeof value === 'string' && value.trim() && value.length <= 300)
  || (typeof value === 'number' && Number.isFinite(value));
function failure(code, message = code) { const error = new Error(message); error.code = code; return error; }
function copy(value) {
  const seen = new Set();
  function check(item) {
    if (item === null || ['string', 'boolean'].includes(typeof item)) return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (!record(item) && !Array.isArray(item) || seen.has(item)) throw failure('INVALID_DATA');
    if (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw failure('INVALID_DATA');
    seen.add(item); Object.values(item).forEach(check); seen.delete(item);
  }
  check(value); return JSON.parse(JSON.stringify(value));
}
function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((item, index) => equal(item, b[index]));
  if (!record(a) || !record(b)) return false;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => own(b, key) && equal(a[key], b[key]));
}
function keyForUser(userId) {
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 300) throw failure('AUTH_REQUIRED');
  return `kidssync:mobile:schedule:v1:${encodeURIComponent(userId)}`;
}
function validEvent(event) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!record(event) || !validId(event.id) || typeof event.title !== 'string' || !event.title.trim()
    || !Number.isFinite(dates.parseDateKey(event.startDate).getTime())
    || event.endDate && (!Number.isFinite(dates.parseDateKey(event.endDate).getTime()) || event.endDate < event.startDate)
    || event.allDay != null && typeof event.allDay !== 'boolean'
    || !event.allDay && (!time.test(event.start) || !time.test(event.end)
      || (!event.endDate || event.endDate === event.startDate) && event.end <= event.start)
    || event.externalSource || event.isBuiltInHoliday) throw failure('INVALID_ACTIVITY');
}
function calendarIn(row, calendarId) {
  if (!row || !record(row.schedule)) throw failure('NO_CALENDAR');
  const snapshot = row.schedule;
  if (own(snapshot, 'calendars') || own(snapshot, 'calendarData')) {
    if (!Array.isArray(snapshot.calendars) || !record(snapshot.calendarData)
      || snapshot.calendars.filter(item => item?.id === calendarId).length !== 1
      || !own(snapshot.calendarData, calendarId) || !record(snapshot.calendarData[calendarId])) throw failure('NO_CALENDAR');
    const data = snapshot.calendarData[calendarId];
    if (data.activities != null && !Array.isArray(data.activities)) throw failure('NO_CALENDAR');
    return { data, events: data.activities || [], modern: true };
  }
  if (calendarId !== 'family' || !Array.isArray(snapshot.activities)) throw failure('NO_CALENDAR');
  return { data: snapshot, events: snapshot.activities, modern: false };
}
function eventIn(row, calendarId, eventId) {
  const matches = calendarIn(row, calendarId).events.filter(item => item?.id === eventId);
  if (matches.length > 1) throw failure('CONFLICT');
  return matches[0] || null;
}
function apply(row, operation) {
  const result = copy(row), selected = calendarIn(result, operation.calendarId);
  const replace = events => {
    const index = events.findIndex(event => event?.id === operation.eventId);
    if (operation.kind === 'delete') return events.filter(event => event?.id !== operation.eventId);
    if (index < 0) return [...events, copy(operation.event)];
    return events.map((event, i) => i === index ? { ...event, ...copy(operation.event) } : event);
  };
  if (selected.modern) {
    result.schedule.calendarData[operation.calendarId].activities = replace(selected.events);
    if (result.schedule.activeCalendarId === operation.calendarId && Array.isArray(result.schedule.activities)) {
      result.schedule.activities = replace(result.schedule.activities);
    }
  } else result.schedule.activities = replace(selected.events);
  return result;
}
function project(state) {
  let row = copy(state.row);
  for (const operation of state.pending) {
    try { row = apply(row, operation); } catch { /* Deleted calendars stay absent; outbox retains the draft. */ }
  }
  return row;
}
function decode(raw, userId) {
  if (raw == null) return { schema: 1, userId, row: null, cachedAt: null, pending: [] };
  try {
    if (typeof raw !== 'string' || raw.length > MAX_BYTES) throw failure('CACHE_INVALID');
    const data = JSON.parse(raw);
    if (!record(data) || data.schema !== 1 || data.userId !== userId || !Array.isArray(data.pending)
      || data.pending.length > MAX_PENDING || data.row !== null && (!record(data.row) || !record(data.row.schedule)
        || typeof data.row.updated_at !== 'string')) throw failure('CACHE_INVALID');
    const ids = new Set();
    for (const operation of data.pending) {
      if (!record(operation) || typeof operation.id !== 'string' || ids.has(operation.id)
        || !['save', 'delete'].includes(operation.kind) || typeof operation.calendarId !== 'string'
        || !validId(operation.eventId) || !own(operation, 'original')
        || operation.original !== null && (!record(operation.original) || operation.original.id !== operation.eventId)
        || operation.kind === 'delete' && !operation.original
        || operation.kind === 'save' && operation.event?.id !== operation.eventId
        || operation.blocked != null && typeof operation.blocked !== 'string') throw failure('CACHE_INVALID');
      if (operation.kind === 'save') validEvent(operation.event);
      ids.add(operation.id);
    }
    return copy(data);
  } catch { throw failure('CACHE_INVALID', 'Saved calendar data could not be read. It has not been erased.'); }
}
function isOffline(error) {
  return error instanceof TypeError || ['NETWORK_ERROR', 'FETCH_ERROR'].includes(error?.code)
    || /network|fetch|offline|connection|timeout/i.test(`${error?.name || ''} ${error?.message || ''}`);
}

function createScheduleSync({ client, storage, userId, onChange = () => {}, isCurrent = () => true } = {}) {
  const key = keyForUser(userId);
  if (!storage?.getItem || !storage?.setItem) throw failure('STORAGE_ERROR');
  let deviceLocks = locks.get(storage);
  if (!deviceLocks) { deviceLocks = new Map(); locks.set(storage, deviceLocks); }
  if (!deviceLocks.has(key)) deviceLocks.set(key, { tail: Promise.resolve(), confirmedGeneration: 0 });
  const lock = deviceLocks.get(key);
  let state = { schema: 1, userId, row: null, cachedAt: null, pending: [] };
  let loaded = false, ready = false, stopped = false, status = 'CONNECTING', error = null, offline = false, syncing = null;
  function current() { return !stopped && isCurrent(); }
  function assertCurrent() { if (!current()) throw failure('STALE_SCOPE'); }
  function info() {
    return { userId, row: project(state), confirmedRow: copy(state.row), loaded, status,
      pendingCount: state.pending.length, pending: copy(state.pending), cachedAt: state.cachedAt, offline,
      conflicts: copy(state.pending.filter(item => item.blocked)), error };
  }
  function emit() { if (current()) onChange(info()); }
  async function readStored() {
    let raw;
    try { raw = await storage.getItem(key); } catch { throw failure('STORAGE_ERROR'); }
    return decode(raw, userId);
  }
  function exclusive(work) {
    const task = lock.tail.then(work); lock.tail = task.catch(() => {}); return task;
  }
  async function persist(change, allowStopped = false) {
    return exclusive(async () => {
      if (!allowStopped) assertCurrent();
      const before = await readStored();
      const next = change(copy(before));
      const raw = JSON.stringify(next);
      if (raw.length > MAX_BYTES) throw failure('STORAGE_FULL');
      try { await storage.setItem(key, raw); } catch { throw failure('STORAGE_ERROR'); }
      state = next; loaded = true;
      return next;
    });
  }
  function report(fault) {
    if (fault?.code === 'STALE_SCOPE') return;
    error = fault; offline = isOffline(fault);
    status = offline ? 'OFFLINE' : ['STORAGE_ERROR', 'CACHE_INVALID', 'STORAGE_FULL'].includes(fault?.code)
      ? 'STORAGE_ERROR' : ['AUTH_REQUIRED', 'FORBIDDEN'].includes(fault?.code) ? 'AUTH_REQUIRED'
        : 'ERROR';
    emit();
  }
  async function load() {
    try {
      await exclusive(async () => { assertCurrent(); state = await readStored(); ready = true; loaded = true; });
      assertCurrent();
      status = state.pending.some(item => item.blocked) ? 'CONFLICT' : state.pending.length ? 'PENDING' : state.row ? 'CACHED' : 'CONNECTING';
      error = null; emit(); return info();
    } catch (fault) { loaded = true; report(fault); throw fault; }
  }
  async function authenticated() {
    assertCurrent();
    const result = await client.auth.getUser();
    assertCurrent();
    if (result.error) { if (isOffline(result.error)) throw result.error; throw failure('AUTH_REQUIRED'); }
    if (result.data?.user?.id !== userId) throw failure('AUTH_REQUIRED');
  }
  function decision(row, operation) {
    const actual = eventIn(row, operation.calendarId, operation.eventId);
    if (operation.kind === 'delete') {
      if (!actual) return 'done';
      return equal(actual, operation.original) ? 'write' : 'conflict';
    }
    // A successful request may lose its response (or the local acknowledgement).
    // Exact desired state acknowledges that request without sending it twice.
    if (equal(actual, operation.event)) return 'done';
    return equal(actual, operation.original) ? 'write' : 'conflict';
  }
  async function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        if (!ready) await load();
        assertCurrent();
        // Keep an already-confirmed calendar calm during background polling.
        if (!state.pending.some(item => item.blocked) && (state.pending.length || status !== 'SUBSCRIBED')) status = 'SYNCING';
        error = null; emit();
        await authenticated();
        const readGeneration = lock.confirmedGeneration;
        const remote = await schedules.readSchedule(client, userId);
        assertCurrent();
        // An online create/import can be confirmed while this read is in flight.
        // That older response must not replace the newly confirmed cache.
        await persist(next => readGeneration === lock.confirmedGeneration
          ? { ...next, row: remote, cachedAt: Date.now() } : next);
        offline = false; emit();
        while (current()) {
          const operation = state.pending[0];
          if (!operation) { status = 'SUBSCRIBED'; error = null; emit(); return info(); }
          if (operation.blocked) { status = 'CONFLICT'; emit(); return info(); }
          let action;
          try { action = decision(state.row, operation); }
          catch (fault) { if (!['CONFLICT', 'NO_CALENDAR'].includes(fault.code)) throw fault; action = 'conflict'; }
          if (action === 'conflict') {
            await persist(next => ({ ...next, pending: next.pending.map(item => item.id === operation.id ? { ...item, blocked: 'CONFLICT' } : item) }));
            status = 'CONFLICT'; emit(); return info();
          }
          let row = state.row;
          const writeGeneration = lock.confirmedGeneration;
          if (action === 'write') {
            await authenticated();
            try {
              row = operation.kind === 'save'
                ? await backend.saveActivity(client, userId, operation.calendarId, operation.event, { original: operation.original })
                : await backend.deleteActivity(client, userId, operation.calendarId, operation.eventId, { original: operation.original });
            } catch (fault) {
              if (['CONFLICT', 'NO_CALENDAR'].includes(fault.code)) {
                await persist(next => ({ ...next, pending: next.pending.map(item => item.id === operation.id ? { ...item, blocked: 'CONFLICT' } : item) }), true);
                status = 'CONFLICT'; error = fault; emit(); return info();
              }
              throw fault;
            }
          }
          // Persist acknowledgement under the captured account even if sign-out
          // happened during this request. Never proceed with the next operation.
          await persist(next => {
            const acceptRow = writeGeneration === lock.confirmedGeneration;
            if (acceptRow) lock.confirmedGeneration += 1;
            return { ...next, row: acceptRow ? row : next.row, cachedAt: Date.now(),
              pending: next.pending.filter(item => item.id !== operation.id) };
          }, true);
          emit();
        }
        return info();
      } catch (fault) { report(fault); return info(); }
      finally { syncing = null; }
    })();
    return syncing;
  }
  async function enqueue(kind, calendarId, event, original) {
    assertCurrent();
    if (!ready) await load();
    if (typeof calendarId !== 'string' || !calendarId.trim()) throw failure('NO_CALENDAR');
    const eventId = kind === 'save' ? event?.id : event;
    if (!validId(eventId)) throw failure('INVALID_ACTIVITY');
    const before = original == null ? null : copy(original);
    if (kind === 'delete' && !before || before && before.id !== eventId) throw failure('INVALID_ACTIVITY');
    const desired = kind === 'save' ? { ...(before || {}), ...copy(event) } : null;
    if (desired?.allDay) { desired.start = ''; desired.end = ''; }
    if (desired) validEvent(desired);
    if (before?.externalSource || before?.isBuiltInHoliday) throw failure('FORBIDDEN');
    try {
      await persist(next => {
        if (next.pending.some(item => item.blocked)) throw failure('SYNC_CONFLICT');
        if (next.pending.length >= MAX_PENDING) throw failure('QUEUE_FULL');
        const metadata = schedules.calendarEntries(next.row?.schedule).find(item => item.id === calendarId);
        if (metadata?.ownerId && metadata.ownerId !== userId) throw failure('FORBIDDEN');
        const actual = eventIn(project(next), calendarId, eventId);
        if (!equal(actual, before)) throw failure('CONFLICT');
        const id = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        const operation = { id, kind, calendarId, eventId, original: before, ...(desired ? { event: desired } : {}), blocked: null };
        return { ...next, pending: [...next.pending, operation] };
      });
      error = null; status = offline ? 'OFFLINE' : 'PENDING'; emit();
      const row = { ...project(state), pending: true };
      // Enqueue resolves only after durable local storage; network work is separate.
      void sync();
      return row;
    } catch (fault) { if (['STORAGE_ERROR', 'STORAGE_FULL', 'CACHE_INVALID'].includes(fault.code)) report(fault); throw fault; }
  }
  async function acceptConfirmed(row) {
    assertCurrent();
    if (!ready) await load();
    if (!record(row) || !record(row.schedule) || typeof row.updated_at !== 'string') throw failure('INVALID_DATA');
    lock.confirmedGeneration += 1;
    await persist(next => ({ ...next, row: copy({ schedule: row.schedule, updated_at: row.updated_at }), cachedAt: Date.now() }));
    emit(); return info();
  }
  async function retry() {
    if (syncing) await syncing;
    if (!ready) await load();
    await persist(next => ({ ...next, pending: next.pending.map(item => ({ ...item, blocked: null })) }));
    return sync();
  }
  async function discardPending() {
    // Caller must obtain explicit confirmation. Discarding is local only; writes
    // already acknowledged remotely are never undone by deleting this queue.
    if (syncing) throw failure('BUSY');
    await persist(next => ({ ...next, pending: [] }));
    error = null; status = offline ? 'OFFLINE' : 'CACHED'; emit(); return info();
  }
  return { load, refresh: sync, retry, acceptConfirmed, discardPending, getState: info,
    saveActivity: (calendarId, event, { original = null } = {}) => enqueue('save', calendarId, event, original),
    deleteActivity: (calendarId, eventId, { original } = {}) => enqueue('delete', calendarId, eventId, original),
    stop() { stopped = true; } };
}

module.exports = { createScheduleSync, keyForUser, MAX_PENDING };
