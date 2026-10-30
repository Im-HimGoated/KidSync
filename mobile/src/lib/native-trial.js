// Guest-only, device-local calendar. Never import the auth SDK into this module.
const LIMIT_MS = 10 * 60 * 1000;
const TRIAL_KEY = 'kidssync:mobile:trial:v1';
const CLOCK_KEY = 'kidssync:mobile:trial-clock:v1';
const ICONS = ['👤', '😊', '👩', '👨', '🧑‍🏫', '⭐'];
const FIELDS = ['title', 'startDate', 'start', 'end', 'child', 'location', 'responsible', 'items'];
const limits = { title: 100, startDate: 10, start: 5, end: 5, child: 50, location: 160, responsible: 80, items: 300 };
const text = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function eventErrors(event) {
  const errors = {};
  if (!text(event?.title, 100)) errors.title = 'titleRequired';
  if (!validDate(event?.startDate)) errors.startDate = 'dateInvalid';
  if (!event?.allDay) {
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(event?.start || '')) errors.start = 'timeInvalid';
    if (!time.test(event?.end || '')) errors.end = 'timeInvalid';
    else if (!errors.start && event.end <= event.start) errors.end = 'endInvalid';
  }
  return errors;
}
function cleanEvent(value) {
  return { ...Object.fromEntries(FIELDS.map(field => [field, text(value?.[field], limits[field])])),
    allDay: value?.allDay === true, importance: ['high', 'normal', 'low'].includes(value?.importance) ? value.importance : 'normal',
    reminderMinutes: [0, 10, 30].includes(value?.reminderMinutes) ? value.reminderMinutes : null, recurrence: 'none', eventType: 'activity', status: 'confirmed' };
}
function defaultEvent(startDate, preferences = {}) {
  const hour = ({ morning: 6, afternoon: 12, evening: 18, daytime: 8 })[preferences.hours] ?? 8;
  const reminderMinutes = ({ start: 0, '10': 10, '30': 30 })[preferences.reminders] ?? null;
  return { ...cleanEvent({ startDate, start: `${String(hour).padStart(2, '0')}:00`, end: `${String(hour + 1).padStart(2, '0')}:00` }), reminderMinutes };
}
function normalizeProfile(value = {}) {
  return { name: text(value.name, 50), calendarName: text(value.calendarName, 60),
    icon: ICONS.includes(value.icon) ? value.icon : '👤', description: text(value.description, 160) };
}
function profileErrors(value, requireName = true) {
  return { ...(!text(value?.name, 50) && requireName ? { name: 'nameRequired' } : {}),
    ...(!text(value?.calendarName, 60) ? { calendarName: 'calendarRequired' } : {}) };
}
function remainingLabel(elapsedMs) {
  const seconds = Math.max(0, Math.ceil((LIMIT_MS - elapsedMs) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function decodeTrial(raw) {
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return fail('loadFailed'); }
  if (data?.version !== 1 || !/^[a-zA-Z0-9-]{1,80}$/.test(data.id || '')
    || !Array.isArray(data.events) || data.events.length > 100) return fail('loadFailed');
  const ids = new Set();
  const events = data.events.map(event => {
    if (typeof event?.id !== 'string' || !event.id || ids.has(event.id) || Object.keys(eventErrors(event)).length) return fail('loadFailed');
    ids.add(event.id);
    return { ...cleanEvent(event), id: event.id };
  });
  return { version: 1, id: data.id, events, profile: normalizeProfile(data.profile),
    draft: data.draft && typeof data.draft === 'object' ? { ...cleanEvent(data.draft), id: text(data.draft.id, 100) } : null,
    claimedBy: text(data.claimedBy, 200), claimOwner: text(data.claimOwner, 200), calendarId: text(data.calendarId, 100), clockExpired: data.clockExpired === true };
}
function createTrialStore(storage) {
  let queue = Promise.resolve();
  const failedClocks = new Set();
  const enqueue = work => { const next = queue.catch(() => {}).then(work); queue = next; return next; };
  async function read() {
    const data = decodeTrial(await storage.getItem(TRIAL_KEY));
    if (!data) return null;
    let clock;
    try { clock = JSON.parse(await storage.getItem(CLOCK_KEY)); } catch { /* Fail closed, retaining all plans. */ }
    const elapsedMs = clock?.id === data.id && Number.isFinite(clock.elapsedMs) && clock.elapsedMs >= 0
      ? Math.min(LIMIT_MS, clock.elapsedMs) : LIMIT_MS;
    return { ...data, elapsedMs: data.clockExpired || failedClocks.has(data.id) ? LIMIT_MS : elapsedMs };
  }
  async function mutate(work, editable = false) {
    const data = await read();
    if (!data) return fail('loadFailed');
    if (data.claimedBy || data.claimOwner) return fail('alreadyClaimed');
    if (editable && data.elapsedMs >= LIMIT_MS) return fail('expired');
    const next = work(data);
    const { elapsedMs, ...persisted } = next;
    await storage.setItem(TRIAL_KEY, JSON.stringify(persisted));
    return next;
  }
  return {
    load: () => enqueue(read),
    start: () => enqueue(async () => {
      const existing = await read();
      if (existing) return existing;
      const data = { version: 1, id: id(), events: [], profile: normalizeProfile(), draft: null, claimedBy: '', calendarId: '' };
      await storage.setItem(TRIAL_KEY, JSON.stringify(data));
      await storage.setItem(CLOCK_KEY, JSON.stringify({ id: data.id, elapsedMs: 0 }));
      return { ...data, elapsedMs: 0 };
    }),
    advance: delta => enqueue(async () => {
      const data = await read();
      if (!data || data.claimedBy) return data;
      const elapsedMs = Math.min(LIMIT_MS, data.elapsedMs + (Number.isFinite(delta) ? Math.max(0, delta) : 0));
      try { await storage.setItem(CLOCK_KEY, JSON.stringify({ id: data.id, elapsedMs })); }
      catch {
        failedClocks.add(data.id);
        // Fail closed in this process, and persist expiry through the other key
        // when clock-key-only failures still allow the plan backup to be written.
        const { elapsedMs: ignored, ...backup } = data;
        try { await storage.setItem(TRIAL_KEY, JSON.stringify({ ...backup, clockExpired: true })); } catch { /* Keep the existing plan backup. */ }
        return fail('clockFailed');
      }
      return { ...data, elapsedMs };
    }),
    saveDraft: draft => enqueue(() => mutate(data => ({ ...data, draft: draft ? { ...cleanEvent(draft), id: text(draft.id, 100) } : null }))),
    saveEvent: (input, editingId) => enqueue(() => mutate(data => {
      const event = cleanEvent(input);
      const errors = eventErrors(event);
      if (Object.keys(errors).length) return fail(Object.values(errors)[0]);
      if (editingId && !data.events.some(item => item.id === editingId)) return fail('eventMissing');
      if (!editingId && data.events.length >= 100) return fail('eventLimit');
      const saved = { ...event, id: editingId || id() };
      return { ...data, draft: null, events: editingId ? data.events.map(item => item.id === editingId ? saved : item) : [...data.events, saved] };
    }, true)),
    removeEvent: eventId => enqueue(() => mutate(data => ({ ...data, events: data.events.filter(item => item.id !== eventId), draft: data.draft?.id === eventId ? null : data.draft }), true)),
    saveProfile: (profile, requireName = true) => enqueue(() => mutate(data => {
      if (Object.keys(profileErrors(profile, requireName)).length) return fail('profileInvalid');
      return { ...data, profile: normalizeProfile(profile) };
    })),
    saveProfileDraft: profile => enqueue(() => mutate(data => ({ ...data, profile: normalizeProfile(profile) }))),
    reserveClaim: userId => enqueue(async () => {
      const data = await read();
      if (!data || typeof userId !== 'string' || !userId || (data.claimedBy && data.claimedBy !== userId)
        || (data.claimOwner && data.claimOwner !== userId)) return fail('alreadyClaimed');
      const next = { ...data, claimOwner: userId };
      const { elapsedMs, ...persisted } = next;
      await storage.setItem(TRIAL_KEY, JSON.stringify(persisted));
      return next;
    }),
    markClaimed: (userId, calendarId) => enqueue(async () => {
      const data = await read();
      if (!data || !userId || !calendarId || (data.claimedBy && data.claimedBy !== userId) || (data.claimOwner && data.claimOwner !== userId)) return fail('alreadyClaimed');
      const next = { ...data, claimedBy: userId, claimOwner: userId, calendarId };
      const { elapsedMs, ...persisted } = next;
      await storage.setItem(TRIAL_KEY, JSON.stringify(persisted));
      return next;
    })
  };
}
// Count only while the native app and calendar route are foregrounded.
function createForegroundClock(onElapsed, now = Date.now) {
  let last = null;
  const sample = () => {
    const current = now();
    if (last !== null) onElapsed(Math.min(5000, Math.max(0, current - last)));
    if (last !== null) last = current;
  };
  return { sample, setActive(active) { sample(); last = active ? now() : null; } };
}
module.exports = { LIMIT_MS, TRIAL_KEY, CLOCK_KEY, ICONS, dateKey, validDate, eventErrors, normalizeProfile,
  profileErrors, remainingLabel, decodeTrial, defaultEvent, createTrialStore, createForegroundClock };
