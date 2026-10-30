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

function startsOn(activity, date, anchor) {
  if (Array.isArray(activity.excludedDates) && activity.excludedDates.includes(dateKey(date))) return false;
  if (!activity.startDate) return WEEKDAYS[date.getDay()] === String(activity.day || '').toLowerCase();
  if (!isDate(anchor)) return false;
  const difference = dateSerial(date) - dateSerial(anchor);
  if (difference < 0) return false;
  const until = parseDateKey(activity.repeatUntil);
  if (isDate(until) && dateSerial(date) > dateSerial(until)) return false;
  const interval = Math.max(1, Number(activity.repeatInterval) || 1);
  switch (activity.recurrence || 'none') {
    case 'daily': return difference % interval === 0;
    case 'weekly': {
      const repeatDays = Array.isArray(activity.repeatDays) && activity.repeatDays.length
        ? activity.repeatDays.map(Number) : [anchor.getDay()];
      return Math.floor(difference / 7) % interval === 0 && repeatDays.includes(date.getDay());
    }
    case 'monthly': {
      const months = (date.getFullYear() - anchor.getFullYear()) * 12 + date.getMonth() - anchor.getMonth();
      return months % interval === 0 && date.getDate() === anchor.getDate();
    }
    case 'yearly':
      return (date.getFullYear() - anchor.getFullYear()) % interval === 0
        && date.getMonth() === anchor.getMonth() && date.getDate() === anchor.getDate();
    default: return difference === 0;
  }
}

function occursOn(activity, date) {
  const start = parseDateKey(activity.startDate);
  const end = parseDateKey(activity.endDate);
  if (activity.startDate && (!isDate(start) || dateSerial(date) < dateSerial(start))) return false;
  const span = isDate(start) && isDate(end) ? Math.min(366, Math.max(0, dateSerial(end) - dateSerial(start))) : 0;
  // As on the website, exceptions and repeatUntil apply to a series start. A
  // multi-day occurrence continues through its inclusive end date.
  for (let offset = 0; offset <= span; offset += 1) {
    if (startsOn(activity, addDays(date, -offset), start)) return true;
  }
  return false;
}

function timeMinutes(value) {
  const match = typeof value === 'string' && /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return Infinity;
  return Number(match[1]) * 60 + Number(match[2]);
}

function eventsForDate(activities, date) {
  if (!Array.isArray(activities) || !isDate(date)) return [];
  return activities.filter(activity => activity && typeof activity === 'object' && occursOn(activity, date))
    .map((activity, index) => ({ activity, index }))
    .sort((first, second) => {
      const a = first.activity; const b = second.activity;
      const timeA = timeMinutes(a.start); const timeB = timeMinutes(b.start);
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

module.exports = { dateKey, parseDateKey, addDays, startOfWeek, monthDays, eventsForDate, kidsForEvent, formatTime };
