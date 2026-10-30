const { parseDateKey } = require('./calendar');

const FAMILY_CHILD = '__family__';
const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const text = value => typeof value === 'string' ? value.trim() : '';
const validDate = value => Number.isFinite(parseDateKey(value).getTime());
const field = (existing, form, key, fallback = '') => own(form, key) ? form[key] : (existing?.[key] ?? fallback);

function normalizeTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text(value));
  return match && Number(match[1]) < 24 && Number(match[2]) < 60
    ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function valuesFor(existing, form = {}) {
  const startDate = text(own(form, 'date') ? form.date : field(existing, form, 'startDate'));
  const recurrence = text(field(existing, form, 'recurrence', existing?.day ? 'weekly' : 'none'));
  const rawDays = field(existing, form, 'repeatDays', null);
  return {
    title: text(field(existing, form, 'title')),
    startDate,
    endDate: text(field(existing, form, 'endDate')),
    eventType: text(field(existing, form, 'eventType', 'activity')),
    allDay: Boolean(field(existing, form, 'allDay', false)),
    start: text(field(existing, form, 'start')),
    end: text(field(existing, form, 'end')),
    child: field(existing, form, 'child', FAMILY_CHILD) || FAMILY_CHILD,
    location: text(field(existing, form, 'location')),
    notes: text(field(existing, form, 'notes')),
    recurrence,
    repeatInterval: recurrence === 'none' ? 1 : Number(field(existing, form, 'repeatInterval', 1)),
    repeatUntil: recurrence === 'none' ? '' : text(field(existing, form, 'repeatUntil')),
    repeatDays: recurrence !== 'weekly' ? [] : rawDays == null
      ? (validDate(startDate) ? [parseDateKey(startDate).getDay()] : [])
      : Array.isArray(rawDays) ? rawDays.map(Number) : null
  };
}

function profileFor(child, kids) {
  return (Array.isArray(kids) ? kids : []).find(kid => kid && kid.name
    && (kid.name === child || (kid.id != null && String(kid.id) === String(child))));
}

/** Return stable field -> translation-key errors; never mutate the form/event. */
function validateEventForm(existing, form = {}, kids = []) {
  const values = valuesFor(existing, form);
  const errors = {};
  if (existing?.externalSource || existing?.isBuiltInHoliday) errors.event = 'eventReadOnly';
  if (!values.title) errors.title = 'titleRequired';
  if (!values.startDate) errors.date = 'dateRequired';
  else if (!validDate(values.startDate)) errors.date = 'dateInvalid';
  if (values.endDate && !validDate(values.endDate)) errors.endDate = 'endDateInvalid';
  else if (values.endDate && validDate(values.startDate) && values.endDate < values.startDate) errors.endDate = 'endDateBeforeStart';
  else if (values.eventType === 'trip' && !values.endDate) errors.endDate = 'endDateRequired';
  if (!values.allDay) {
    if (!values.start) errors.start = 'startTimeRequired';
    else if (!normalizeTime(values.start)) errors.start = 'startTimeInvalid';
    if (!values.end) errors.end = 'endTimeRequired';
    else if (!normalizeTime(values.end)) errors.end = 'endTimeInvalid';
    else if (!errors.start && normalizeTime(values.end) <= normalizeTime(values.start)
      && !(validDate(values.startDate) && validDate(values.endDate) && values.endDate > values.startDate)) errors.end = 'endAfterStart';
  }
  // The website stores a child's display name. IDs from a native picker map to
  // that name. Preserve an existing orphan reference when changing other fields.
  if (values.child !== FAMILY_CHILD && !profileFor(values.child, kids)
      && !(existing && values.child === existing.child)) errors.child = 'childInvalid';
  if (!RECURRENCES.includes(values.recurrence)) errors.recurrence = 'recurrenceInvalid';
  if (values.recurrence !== 'none') {
    if (!Number.isInteger(values.repeatInterval) || values.repeatInterval < 1 || values.repeatInterval > 12) errors.repeatInterval = 'repeatIntervalInvalid';
    if (values.repeatUntil && !validDate(values.repeatUntil)) errors.repeatUntil = 'repeatUntilInvalid';
    else if (values.repeatUntil && validDate(values.startDate) && values.repeatUntil < values.startDate) errors.repeatUntil = 'repeatUntilBeforeStart';
    if (values.recurrence === 'weekly' && (!Array.isArray(values.repeatDays) || !values.repeatDays.length
        || values.repeatDays.some(day => !Number.isInteger(day) || day < 0 || day > 6))) errors.repeatDays = 'repeatDaysRequired';
  }
  return errors;
}

function newEventId() {
  return globalThis.crypto?.randomUUID?.() || `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a web-compatible activity, retaining every unknown field on an edit. */
function buildEvent(existing, form = {}, kids = []) {
  const errors = validateEventForm(existing, form, kids);
  if (Object.keys(errors).length) return { event: null, error: Object.values(errors)[0], errors };
  const values = valuesFor(existing, form);
  const profile = profileFor(values.child, kids);
  const event = {
    eventType: 'activity', importance: 'normal', icon: '📖', style: 'child', color: 'default',
    attendees: [], status: 'confirmed', travelMinutes: 0, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
    responsible: '', items: '', ...existing, ...values,
    id: existing?.id ?? form.id ?? newEventId(),
    child: profile?.name || values.child,
    start: normalizeTime(values.start), end: normalizeTime(values.end),
    repeatDays: [...new Set(values.repeatDays)].sort((a, b) => a - b)
  };
  if (event.endDate && !own(form, 'eventType') && !existing?.eventType) event.eventType = 'trip';
  // An explicit new date replaces the obsolete legacy weekday anchor, while
  // preserving recurrence and exclusions for the complete series.
  if (own(event, 'day')) delete event.day;
  if (Array.isArray(existing?.excludedDates)) event.excludedDates = [...existing.excludedDates];
  return { event, error: null, errors: {} };
}

module.exports = { FAMILY_CHILD, validateEventForm, buildEvent };
