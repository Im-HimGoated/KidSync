// Date-only schedule values use the local calendar, never Date's UTC string parser.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const isDate = value => value instanceof Date && Number.isFinite(value.getTime());

function dateKey(date) {
  if (!isDate(date)) return '';
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(NaN);
  const [, year, month, day] = match.map(Number);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : new Date(NaN);
}

function addDays(date, amount) {
  if (!isDate(date) || !Number.isFinite(Number(amount))) return new Date(NaN);
  const result = new Date(date);
  result.setDate(result.getDate() + Math.trunc(Number(amount)));
  return result;
}

function startOfWeek(date) {
  if (!isDate(date)) return new Date(NaN);
  const result = addDays(date, -((date.getDay() + 6) % 7));
  result.setHours(0, 0, 0, 0);
  return result;
}

function monthDays(date) {
  if (!isDate(date)) return [];
  const first = new Date(date);
  first.setDate(1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function dateSerial(date) {
  // Measuring calendar dates via UTC avoids 23/25-hour daylight-saving days.
  const result = new Date(0);
  result.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  result.setUTCHours(0, 0, 0, 0);
  return result.getTime() / 86400000;
}

/** Resolve every series start covering a display day; never guess between overlaps. */
function occurrencesForDate(activity, value) {
  const date = typeof value === 'string' ? parseDateKey(value) : value;
  if (!activity || typeof activity !== 'object' || !isDate(date)) return [];
  const selectedKey = dateKey(date), excluded = new Set(Array.isArray(activity.excludedDates) ? activity.excludedDates : []);
  const start = parseDateKey(activity.startDate), end = parseDateKey(activity.endDate);
  if (!activity.startDate) return WEEKDAYS[date.getDay()] === String(activity.day || '').toLowerCase() && !excluded.has(selectedKey)
    ? [{ date: selectedKey, startDate: selectedKey, endDate: selectedKey, spanDays: 0, isStart: true, isEnd: true }] : [];
  if (!isDate(start) || dateSerial(date) < dateSerial(start)) return [];
  const anchor = dateSerial(start), selected = dateSerial(date);
  const spanDays = isDate(end) ? Math.max(0, dateSerial(end) - anchor) : 0;
  const until = parseDateKey(activity.repeatUntil);
  const low = Math.max(anchor, selected - spanDays), high = Math.min(selected, isDate(until) ? dateSerial(until) : selected);
  if (high < low) return [];
  const interval = Math.max(1, Math.trunc(Number(activity.repeatInterval)) || 1), candidates = [];
  const include = candidate => {
    if (!isDate(candidate)) return;
    const serial = dateSerial(candidate), key = dateKey(candidate);
    if (serial < low || serial > high || excluded.has(key)) return;
    // A timed interval ending exactly at midnight has no minutes on its final
    // date. All-day ranges retain their inclusive calendar-date end instead.
    if (spanDays > 0 && !activity.allDay && selected === serial + spanDays
      && timeMinutes(activity.end) === 0 && Number.isFinite(timeMinutes(activity.start))) return;
    const endKey = dateKey(addDays(candidate, spanDays));
    candidates.push({ date: selectedKey, startDate: key, endDate: endKey, spanDays,
      isStart: serial === selected, isEnd: serial + spanDays === selected });
  };
  switch (activity.recurrence || 'none') {
    case 'daily':
      for (let serial = anchor + Math.ceil((low - anchor) / interval) * interval; serial <= high; serial += interval) include(addDays(start, serial - anchor));
      break;
    case 'weekly': {
      const days = [...new Set(Array.isArray(activity.repeatDays) && activity.repeatDays.length ? activity.repeatDays.map(Number) : [start.getDay()])]
        .filter(day => Number.isInteger(day) && day >= 0 && day < 7);
      const period = interval * 7;
      for (let block = Math.floor((low - anchor) / period) * period; anchor + block <= high; block += period) {
        days.forEach(day => include(addDays(start, block + (day - start.getDay() + 7) % 7)));
      }
      break;
    }
    case 'monthly': {
      const first = addDays(start, low - anchor), last = addDays(start, high - anchor);
      const firstMonth = (first.getFullYear() - start.getFullYear()) * 12 + first.getMonth() - start.getMonth();
      const lastMonth = (last.getFullYear() - start.getFullYear()) * 12 + last.getMonth() - start.getMonth();
      for (let offset = Math.ceil(firstMonth / interval) * interval; offset <= lastMonth; offset += interval) {
        const candidate = new Date(start);
        candidate.setDate(1); candidate.setMonth(candidate.getMonth() + offset); candidate.setDate(start.getDate());
        if (candidate.getDate() === start.getDate() && (candidate.getFullYear() - start.getFullYear()) * 12 + candidate.getMonth() - start.getMonth() === offset) include(candidate);
      }
      break;
    }
    case 'yearly': {
      const firstYear = addDays(start, low - anchor).getFullYear() - start.getFullYear();
      const lastYear = addDays(start, high - anchor).getFullYear() - start.getFullYear();
      for (let offset = Math.ceil(firstYear / interval) * interval; offset <= lastYear; offset += interval) {
        const candidate = new Date(start); candidate.setFullYear(candidate.getFullYear() + offset);
        if (candidate.getMonth() === start.getMonth() && candidate.getDate() === start.getDate()) include(candidate);
      }
      break;
    }
    default: include(start);
  }
  return candidates.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Floating local wall-clock segments; do not reinterpret stored timezone metadata. */
function daySegment(activity, value, occurrenceStartDate) {
  let occurrences = occurrencesForDate(activity, value);
  if (occurrenceStartDate) occurrences = occurrences.filter(item => item.startDate === occurrenceStartDate);
  if (!occurrences.length) return null;
  const allDay = !!activity.allDay;
  const rawStart = timeMinutes(activity.start), rawEnd = timeMinutes(activity.end);
  if (!allDay && (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd))) return null;
  const segments = occurrences.map(item => ({ occurrenceStartDate: item.startDate, start: allDay || !item.isStart ? 0 : rawStart,
    end: allDay || !item.isEnd ? 1440 : rawEnd, continuesBefore: !item.isStart, continuesAfter: !item.isEnd }));
  if (segments.some(item => item.end <= item.start)) return null;
  return { start: segments.reduce((value, item) => Math.min(value, item.start), 1440), end: segments.reduce((value, item) => Math.max(value, item.end), 0), allDay,
    continuesBefore: segments.some(item => item.continuesBefore), continuesAfter: segments.some(item => item.continuesAfter), occurrences, segments };
}

function timeMinutes(value) {
  const match = typeof value === 'string' && /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return Infinity;
  return Number(match[1]) * 60 + Number(match[2]);
}

function eventsForDate(activities, date) {
  if (!Array.isArray(activities) || !isDate(date)) return [];
  return activities.filter(activity => activity && typeof activity === 'object' && occurrencesForDate(activity, date).length > 0)
    .map((activity, index) => ({ activity, index }))
    .sort((first, second) => {
      const a = first.activity; const b = second.activity;
      const timeA = daySegment(a, date)?.start ?? timeMinutes(a.start); const timeB = daySegment(b, date)?.start ?? timeMinutes(b.start);
      return Number(Boolean(b.allDay)) - Number(Boolean(a.allDay))
        || (timeA === timeB ? 0 : timeA - timeB)
        || String(a.title || '').localeCompare(String(b.title || ''))
        || first.index - second.index;
    }).map(item => item.activity);
}

function kidsForEvent(activity, kids) {
  const profiles = Array.isArray(kids) ? kids.filter(kid => kid && typeof kid === 'object' && (kid.id != null || kid.name)) : [];
  const child = activity?.child ?? activity?.childId;
  if (child === '__family__' || child == null || child === '') return profiles;
  const references = (Array.isArray(child) ? child : [child]).map(String);
  return profiles.filter(kid => (kid.id != null && references.includes(String(kid.id)))
    || (kid.name != null && references.includes(String(kid.name))));
}

function formatTime(value, language = 'en') {
  const minutes = timeMinutes(value);
  if (!Number.isFinite(minutes)) return '';
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, '0');
  return String(language).startsWith('zh') ? `${String(hour).padStart(2, '0')}:${minute}`
    : `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

module.exports = { dateKey, parseDateKey, addDays, startOfWeek, monthDays, eventsForDate, occurrencesForDate, daySegment, kidsForEvent, formatTime, dateSerial };
