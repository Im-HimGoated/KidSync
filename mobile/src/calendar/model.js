const calendar = require('../lib/calendar');
const { buildEvent } = require('../lib/event-form');
const backend = require('../../../shared/backend/mobile-calendar');

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const validDate = value => value instanceof Date && Number.isFinite(value.getTime());
const validPeople = ['myself', 'children', 'family'];
const validImportance = ['high', 'normal', 'low'];
const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function reminderValue(value) {
  if (value == null || value === '' || value === 'none') return null;
  if (value === 'start' || value === 0 || value === '0') return 0;
  if (value === 10 || value === '10') return 10;
  if (value === 30 || value === '30') return 30;
  return undefined;
}

function normalizeDisplayPreferences(value = {}) {
  const preferences = value && typeof value === 'object' ? value : {};
  const reminder = own(preferences, 'defaultReminderMinutes')
    ? reminderValue(preferences.defaultReminderMinutes) : reminderValue(preferences.reminders);
  return {
    view: ['week', 'month'].includes(preferences.view) ? preferences.view : 'agenda',
    firstDay: preferences.week === 'sunday' || preferences.firstDay === 0 ? 0 : 1,
    initialHour: ({ morning: 6, afternoon: 12, evening: 18, daytime: 8 })[preferences.hours]
      ?? ([6, 12, 18, 8].includes(preferences.initialHour) ? preferences.initialHour : 8),
    defaultReminderMinutes: reminder === undefined ? null : reminder,
    people: validPeople.includes(preferences.people) ? preferences.people : 'family',
  };
}

function startOfDisplayWeek(date, firstDay = 1) {
  if (!validDate(date)) return new Date(NaN);
  const start = calendar.addDays(date, -((date.getDay() - (firstDay === 0 ? 0 : 1) + 7) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

function displayMonthDays(date, firstDay = 1) {
  if (!validDate(date)) return [];
  const first = new Date(date);
  first.setDate(1);
  const start = startOfDisplayWeek(first, firstDay);
  return Array.from({ length: 42 }, (_, index) => calendar.addDays(start, index));
}

function movePeriod(date, mode, amount) {
  if (!validDate(date) || !Number.isFinite(Number(amount))) return new Date(NaN);
  const delta = Math.trunc(Number(amount));
  if (mode !== 'month') return calendar.addDays(date, delta * (mode === 'week' ? 7 : 1));
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + delta);
  const last = new Date(result);
  last.setMonth(last.getMonth() + 1, 0);
  result.setDate(Math.min(day, last.getDate()));
  return result;
}

function searchable(value) {
  return (Array.isArray(value) ? value.join(' ') : String(value ?? '')).normalize('NFKC').toLocaleLowerCase();
}

function filterActivities(events, kids = [], { person = 'all', query = '' } = {}) {
  const profiles = Array.isArray(kids) ? kids : [];
  const needle = searchable(query).trim();
  return (Array.isArray(events) ? events : []).filter(event => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
    const family = event.child == null || event.child === '' || event.child === '__family__';
    const matchedKids = calendar.kidsForEvent(event, profiles);
    const matchesPerson = person === 'all' || family || String(event.child) === String(person)
      || matchedKids.some(kid => kid.name === person || String(kid.id) === String(person));
    const haystack = [event.title, event.child, event.location, event.responsible, event.items, event.notes,
      ...matchedKids.map(kid => kid.name)].map(searchable).join(' ');
    return matchesPerson && (!needle || haystack.includes(needle));
  });
}

function timeMinutes(value) {
  const match = typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function importanceRank(event) {
  return event?.importance === 'high' ? 0 : event?.importance === 'low' ? 2 : 1;
}

/** Importance only breaks a same-time tie; it never moves an event in time. */
function sortAgenda(events, date) {
  return (Array.isArray(events) ? events : [])
    .filter(event => event && typeof event === 'object' && !Array.isArray(event))
    .map((event, index) => ({ event, index, start: (date ? calendar.daySegment(event, date)?.start : null) ?? timeMinutes(event.start) ?? Infinity }))
    .sort((a, b) => Number(Boolean(b.event.allDay)) - Number(Boolean(a.event.allDay))
      || (a.start === b.start ? 0 : a.start - b.start)
      || importanceRank(a.event) - importanceRank(b.event)
      || String(a.event.title || '').localeCompare(String(b.event.title || ''))
      || a.index - b.index)
    .map(item => item.event);
}

/**
 * The week grid is an overview. Full-size agenda cards remain the primary
 * accessible targets. Minimum-height blocks affect collision lanes, so two
 * consecutive short activities never paint over one another in the same lane.
 */
function layoutDay(events, options = {}) {
  const hourHeight = Number.isFinite(options.hourHeight) && options.hourHeight > 0 ? options.hourHeight : 60;
  const minHeight = Number.isFinite(options.minHeight) && options.minHeight > 0 ? options.minHeight : 30;
  const allDay = [], untimed = [], timed = [];
  (Array.isArray(events) ? events : []).forEach((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;
    if (event.allDay) { allDay.push(event); return; }
    const day = options.date ? calendar.daySegment(event, options.date) : null;
    const segments = day?.segments || [{ start: timeMinutes(event.start), end: timeMinutes(event.end) }];
    let placed = false;
    segments.forEach(segment => {
      const { start, end } = segment;
      if (start === null || end === null || end <= start) return;
      placed = true;
      const top = start / 60 * hourHeight;
      const height = Math.max((end - start) / 60 * hourHeight, minHeight);
      timed.push({ event, index, start, end, top, height, visualEnd: top + height,
        occurrenceStartDate: segment.occurrenceStartDate,
        continuesBefore: !!segment.continuesBefore, continuesAfter: !!segment.continuesAfter });
    });
    if (!placed) untimed.push(event);
  });
  timed.sort((a, b) => a.top - b.top || importanceRank(a.event) - importanceRank(b.event)
    || a.end - b.end || a.index - b.index);
  const groups = [];
  timed.forEach(item => {
    let group = groups[groups.length - 1];
    if (!group || item.top >= group.end) { group = { items: [], end: item.visualEnd }; groups.push(group); }
    group.items.push(item);
    group.end = Math.max(group.end, item.visualEnd);
  });
  groups.forEach(group => {
    const ends = [];
    group.items.forEach(item => {
      let lane = ends.findIndex(end => end <= item.top);
      if (lane === -1) lane = ends.length;
      ends[lane] = item.visualEnd;
      item.lane = lane;
    });
    group.items.forEach(item => { item.lanes = ends.length; });
  });
  return { timed, allDay, untimed, height: Math.max(hourHeight * 24, ...timed.map(item => item.visualEnd)) };
}

function initialEventForm(existing, date, preferences = {}) {
  const event = existing && typeof existing === 'object' ? existing : null;
  const selected = validDate(date) ? date : calendar.parseDateKey(date);
  const fallbackDate = calendar.dateKey(validDate(selected) ? selected : new Date());
  const startDate = event?.startDate || fallbackDate;
  const anchor = calendar.parseDateKey(startDate);
  const legacyDay = weekdayNames.indexOf(String(event?.day || '').toLowerCase());
  const repeatDays = Array.isArray(event?.repeatDays) && event.repeatDays.length ? [...event.repeatDays]
    : [legacyDay >= 0 ? legacyDay : validDate(anchor) ? anchor.getDay() : 1];
  const display = normalizeDisplayPreferences(preferences);
  const timeAtHour = hour => `${String(hour).padStart(2, '0')}:00`;
  return {
    date: startDate,
    endDate: event?.endDate || '',
    title: event?.title || '',
    child: event?.child || '__family__',
    allDay: Boolean(event?.allDay),
    start: event ? (typeof event.start === 'string' ? event.start : '') : timeAtHour(display.initialHour),
    end: event ? (typeof event.end === 'string' ? event.end : '') : timeAtHour(display.initialHour + 1),
    location: event?.location || '', responsible: event?.responsible || '', items: event?.items || '', notes: event?.notes || '',
    importance: validImportance.includes(event?.importance) ? event.importance : 'normal',
    reminderMinutes: event ? reminderValue(event.reminderMinutes) ?? null : display.defaultReminderMinutes,
    recurrence: event?.recurrence || (event?.day ? 'weekly' : 'none'),
    repeatInterval: String(event?.repeatInterval || 1),
    repeatDays,
    repeatUntil: event?.repeatUntil || '',
  };
}

/** Weekday selection order has no meaning when deciding whether a draft changed. */
function eventFormChanged(initial, current) {
  const comparable = value => Object.fromEntries(Object.keys(value || {}).sort().map(key => [key,
    key === 'repeatDays' && Array.isArray(value[key])
      ? [...new Set(value[key].map(Number))].sort((a, b) => a - b) : value[key],
  ]));
  return JSON.stringify(comparable(initial)) !== JSON.stringify(comparable(current));
}

/** Preserve all fields the mobile form does not edit, including future metadata. */
function buildCalendarEvent(existing, form = {}, kids = [], preferences = {}) {
  const input = form && typeof form === 'object' ? form : {};
  const base = buildEvent(existing, input, kids);
  const errors = { ...base.errors }, metadata = {};
  for (const [field, limit] of [['responsible', 60], ['items', 160]]) {
    if (!own(input, field)) continue;
    if (typeof input[field] !== 'string' || Array.from(input[field].trim()).length > limit) errors[field] = `${field}Invalid`;
    else metadata[field] = input[field].trim();
  }
  if (own(input, 'importance')) {
    if (!validImportance.includes(input.importance)) errors.importance = 'importanceInvalid';
    else metadata.importance = input.importance;
  }
  if (own(input, 'reminderMinutes')) {
    const value = reminderValue(input.reminderMinutes);
    if (value === undefined) errors.reminderMinutes = 'reminderInvalid';
    else metadata.reminderMinutes = value;
  } else if (!existing) metadata.reminderMinutes = normalizeDisplayPreferences(preferences).defaultReminderMinutes;
  if (Object.keys(errors).length) return { event: null, error: Object.values(errors)[0], errors };
  return { event: { ...base.event, ...metadata }, error: null, errors: {} };
}

function uiError(code, message) { const error = new Error(message); error.code = code; return error; }

function isRecurringActivity(event) {
  return ['daily', 'weekly', 'monthly', 'yearly'].includes(event?.recurrence)
    || (!event?.startDate && weekdayNames.includes(String(event?.day || '').toLowerCase()));
}

/** Materialize one explicitly selected series start for editing, keeping its raw ID. */
function occurrenceDraft(original, occurrenceStartDate) {
  if (!isRecurringActivity(original) || original.externalSource || original.isBuiltInHoliday
    || !calendar.occurrencesForDate(original, occurrenceStartDate).some(item => item.startDate === occurrenceStartDate)) {
    throw uiError('INVALID_OCCURRENCE', 'Choose an existing occurrence of an editable repeating activity.');
  }
  const occurrence = calendar.occurrencesForDate(original, occurrenceStartDate).find(item => item.startDate === occurrenceStartDate);
  const draft = { ...JSON.parse(JSON.stringify(original)), startDate: occurrence.startDate,
    endDate: original.endDate ? occurrence.endDate : '', recurrence: 'none', repeatInterval: 1,
    repeatDays: [], repeatUntil: '', excludedDates: [] };
  delete draft.day;
  delete draft.occurrenceDate;
  return draft;
}

/** A series exclusion and optional detached event are one atomic, reversible change. */
function planOccurrenceChange(original, occurrenceStartDate, options = {}) {
  const draft = occurrenceDraft(original, occurrenceStartDate);
  if (original.excludedDates != null && !Array.isArray(original.excludedDates)) {
    throw uiError('INVALID_OCCURRENCE', 'Refresh this repeating activity before making changes.');
  }
  const series = { ...original, excludedDates: [...new Set([...(original.excludedDates || []), occurrenceStartDate])] };
  const changes = [{ original, event: series }];
  if (!options.remove) {
    if (!options.event || typeof options.event !== 'object' || Array.isArray(options.event)) {
      throw uiError('INVALID_OCCURRENCE', 'Use valid details for this occurrence.');
    }
    const id = options.id ?? globalThis.crypto?.randomUUID?.()
      ?? `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    if (id === original.id || !((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id)))) {
      throw uiError('INVALID_OCCURRENCE', 'Use a new identifier for this occurrence.');
    }
    const detached = { ...draft, ...options.event, id, recurrence: 'none', repeatInterval: 1,
      repeatDays: [], repeatUntil: '', excludedDates: [] };
    delete detached.day;
    delete detached.occurrenceDate;
    changes.push({ original: null, event: detached });
  }
  return { changes, occurrenceStartDate };
}

/** Captures account scope without caching snapshots or creating example rows. */
function createCalendarActions({ client, userId, onSchedule, onSelectCalendar, isCurrent = () => true, activityActions = backend } = {}) {
  const writer = key => activityActions?.[key] || backend[key];
  let busy = false;
  function assertCurrent() { if (!isCurrent()) throw uiError('STALE_SCOPE', 'This account or calendar is no longer active.'); }
  async function run(operation, selectCreated = false) {
    assertCurrent();
    if (busy) throw uiError('BUSY', 'Please wait for the current calendar change.');
    busy = true;
    try {
      const row = await operation();
      assertCurrent();
      await onSchedule?.(row);
      if (selectCreated) { assertCurrent(); await onSelectCalendar?.(row.calendarId); }
      return row;
    } finally { busy = false; }
  }
  return {
    save(calendarId, event, original = null) {
      return run(() => typeof activityActions?.save === 'function'
        ? activityActions.save(calendarId, event, original)
        : writer('saveActivity')(client, userId, calendarId, event, { original }));
    },
    remove(calendarId, eventId, original) {
      return run(() => typeof activityActions?.remove === 'function'
        ? activityActions.remove(calendarId, eventId, original)
        : writer('deleteActivity')(client, userId, calendarId, eventId, { original }));
    },
    create(name) { return run(() => writer('createCalendar')(client, userId, { name }), true); },
    saveOccurrence(calendarId, original, occurrenceStartDate, event) {
      return run(() => writer('mutateActivities')(client, userId, calendarId,
        planOccurrenceChange(original, occurrenceStartDate, { event }).changes));
    },
    removeOccurrence(calendarId, original, occurrenceStartDate) {
      return run(() => writer('mutateActivities')(client, userId, calendarId,
        planOccurrenceChange(original, occurrenceStartDate, { remove: true }).changes));
    },
    restore(calendarId, undoToken) {
      return run(() => writer('restoreActivities')(client, userId, calendarId, undoToken));
    },
  };
}

module.exports = {
  normalizeDisplayPreferences, startOfDisplayWeek, displayMonthDays, movePeriod,
  filterActivities, timeMinutes, sortAgenda, layoutDay, initialEventForm, buildCalendarEvent, createCalendarActions,
  eventFormChanged,
  isRecurringActivity, occurrenceDraft, planOccurrenceChange,
};
