const calendar = require('../lib/calendar');
const model = require('./model');
const options = require('./event-options');
const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const frequencies = ['daily', 'weekly', 'monthly', 'yearly'];
const valid = value => Number.isFinite(calendar.parseDateKey(value).getTime());
const compact = value => value.replace(/-/g, '');
const text = value => typeof value === 'string' ? value : '';
const escape = value => text(value).replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/[;,]/g, '\\$&');
const unescape = value => text(value).replace(/\\([nN,;\\])/g, (_, character) => character.toLowerCase() === 'n' ? '\n' : character);
const clock = value => model.timeMinutes(value) !== null ? value.replace(':', '') + '00' : '';

function exportIcs(events, name) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KidsSync//Family Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escape(name)}`];
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  for (const event of events) {
    if (!valid(event?.startDate) || event.externalSource || event.isBuiltInHoliday) continue;
    const start = clock(event.start), end = clock(event.end);
    if (!event.allDay && (!start || !end)) continue;
    const first = compact(event.startDate);
    const endDate = valid(event.endDate) && event.endDate >= event.startDate ? event.endDate : event.startDate;
    const last = compact(endDate);
    lines.push('BEGIN:VEVENT', `UID:${escape(String(event.id))}@kidssync.local`, `DTSTAMP:${stamp}`, `SUMMARY:${escape(event.title)}`);
    lines.push(...(event.allDay ? [`DTSTART;VALUE=DATE:${first}`, `DTEND;VALUE=DATE:${compact(calendar.dateKey(calendar.addDays(calendar.parseDateKey(endDate), 1)))}`]
      : [`DTSTART:${first}T${start}`, `DTEND:${last}T${end}`]));
    lines.push(`STATUS:${(options.statuses.includes(event.status) ? event.status : 'confirmed').toUpperCase()}`,
      `PRIORITY:${({ high: 1, low: 9 })[event.importance] || 5}`, `X-KIDSYNC-EVENT-TYPE:${escape(event.eventType || 'activity')}`);
    if (event.location) lines.push(`LOCATION:${escape(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escape(event.notes)}`);
    if (frequencies.includes(event.recurrence)) {
      const rule = [`FREQ=${event.recurrence.toUpperCase()}`];
      if (Number(event.repeatInterval) > 1) rule.push(`INTERVAL=${Math.trunc(event.repeatInterval)}`);
      const days = Array.isArray(event.repeatDays) ? event.repeatDays.map(day => weekdays[day]).filter(Boolean) : [];
      if (event.recurrence === 'weekly' && days.length) rule.push(`BYDAY=${days.join(',')}`);
      if (valid(event.repeatUntil)) rule.push(`UNTIL=${compact(event.repeatUntil)}${event.allDay ? '' : 'T235959'}`);
      lines.push(`RRULE:${rule.join(';')}`);
      const excluded = Array.isArray(event.excludedDates) ? event.excludedDates.filter(valid) : [];
      if (excluded.length) lines.push(event.allDay
        ? `EXDATE;VALUE=DATE:${excluded.map(compact).join(',')}`
        : `EXDATE:${excluded.map(date => `${compact(date)}T${start}`).join(',')}`);
    }
    lines.push('END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR', ''].join('\r\n');
}

function readDate(value, zone) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value);
  if (!match) return null;
  let date = `${match[1]}-${match[2]}-${match[3]}`;
  let time = match[4] ? `${match[4]}:${match[5]}` : '';
  if (!valid(date) || (time && !clock(time))) return null;
  if (time && match[7]) {
    const local = new Date(`${date}T${time}:${match[6] || '00'}Z`);
    date = calendar.dateKey(local);
    time = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
  } else if (time && zone && zone !== Intl.DateTimeFormat().resolvedOptions().timeZone) {
    throw new Error('UNSUPPORTED_TIME_ZONE');
  }
  return { date, time };
}

function readIcs(source) {
  return [...source.replace(/\r?\n[ \t]/g, '').matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/gi)].map(([, body]) => {
    const properties = body.split(/\r?\n/).map(line => {
      const colon = line.indexOf(':');
      const [name, ...params] = line.slice(0, colon).split(';');
      return { name: name.toUpperCase(), params, value: colon >= 0 ? line.slice(colon + 1) : '' };
    });
    const prop = name => properties.find(item => item.name === name);
    const date = name => {
      const value = prop(name);
      return value && readDate(value.value, value.params.find(param => param.startsWith('TZID='))?.slice(5).replace(/^"|"$/g, ''));
    };
    const start = date('DTSTART'), end = date('DTEND'), title = unescape(prop('SUMMARY')?.value);
    const allDay = !!start && !start.time;
    if (!start || !title || (!allDay && !end?.time)) return null;
    const rule = Object.fromEntries(text(prop('RRULE')?.value).split(';').map(part => part.split('=')));
    const recurrence = text(rule.FREQ).toLowerCase() || 'none';
    if (!['none', ...frequencies].includes(recurrence) || Object.keys(rule).some(key => !['', 'FREQ', 'INTERVAL', 'UNTIL', 'BYDAY', 'WKST'].includes(key))
      || (rule.BYDAY && !rule.BYDAY.split(',').every(day => weekdays.includes(day)))) throw new Error('UNSUPPORTED_RECURRENCE');
    const exclusions = properties.filter(item => item.name === 'EXDATE').flatMap(item => item.value.split(','))
      .map(value => readDate(value)?.date).filter(Boolean);
    const last = end ? allDay ? calendar.dateKey(calendar.addDays(calendar.parseDateKey(end.date), -1)) : end.date : start.date;
    const eventType = prop('X-KIDSYNC-EVENT-TYPE')?.value;
    const status = text(prop('STATUS')?.value).toLowerCase(), priority = Number(prop('PRIORITY')?.value);
    return { title, startDate: start.date, endDate: last > start.date || eventType === 'trip' ? last : '',
      start: start.time, end: end?.time || '', allDay, recurrence, repeatInterval: Number(rule.INTERVAL) || 1,
      repeatUntil: readDate(rule.UNTIL || '')?.date || '', repeatDays: rule.BYDAY?.split(',').map(day => weekdays.indexOf(day)) ||
        (recurrence === 'weekly' ? [calendar.parseDateKey(start.date).getDay()] : []),
      excludedDates: exclusions, eventType: options.types.includes(eventType) ? eventType : 'activity',
      status: options.statuses.includes(status) ? status : 'confirmed', importance: priority > 0 && priority < 5 ? 'high' : priority > 5 ? 'low' : 'normal',
      notes: unescape(prop('DESCRIPTION')?.value), location: unescape(prop('LOCATION')?.value) };
  });
}

function readImport(source, kids = []) {
  if (typeof source !== 'string' || source.length > 2_000_000) throw new Error('INVALID_FILE');
  let raw;
  if (/^\s*BEGIN:VCALENDAR/i.test(source)) raw = readIcs(source);
  else { const backup = JSON.parse(source); raw = Array.isArray(backup) ? backup : backup?.activities; }
  if (!Array.isArray(raw) || !raw.length || raw.length > 300) throw new Error('INVALID_FILE');
  const events = [], names = new Set(kids.map(kid => kid.name));
  for (const event of raw) {
    if (!event?.title || event.externalSource || event.isBuiltInHoliday) continue;
    const { id, externalSource, isBuiltInHoliday, ...details } = event;
    const result = model.buildCalendarEvent(null, { ...details, child: names.has(event.child) ? event.child : '__family__',
      ...(Array.isArray(event.attendees) ? { attendees: event.attendees.filter(name => names.has(name) || name === 'all') } : {}) }, kids);
    if (result.event) events.push({ ...result.event,
      ...(Array.isArray(event.excludedDates) ? { excludedDates: [...new Set(event.excludedDates.filter(valid))] } : {}) });
  }
  if (!events.length) throw new Error('INVALID_FILE');
  return { events, skipped: raw.length - events.length };
}

function printHtml(name, agenda) {
  const html = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  return `<!doctype html><html><meta charset="utf-8"><style>body{font:15px system-ui;margin:32px}pre{white-space:pre-wrap;line-height:1.5;font:inherit}</style><h1>${html(name)}</h1><pre>${html(agenda)}</pre></html>`;
}

module.exports = { exportIcs, readImport, printHtml };
