const calendar = require('../lib/calendar');
const model = require('./model');
const options = require('./event-options');
const profileOptions = require('../../../shared/family-profiles');
const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const frequencies = ['daily', 'weekly', 'monthly', 'yearly'];
const valid = value => Number.isFinite(calendar.parseDateKey(value).getTime());
const compact = value => value.replace(/-/g, '');
const text = value => typeof value === 'string' ? value : '';
const escape = value => text(value).replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/[;,]/g, '\\$&');
const unescape = value => text(value).replace(/\\([nN,;\\])/g, (_, character) => character.toLowerCase() === 'n' ? '\n' : character);
const clock = value => model.timeMinutes(value) !== null ? value.replace(':', '') + '00' : '';

function foldLine(line) {
  let result = '', bytes = 0;
  for (const character of line) {
    const point = character.codePointAt(0);
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > 75) { result += '\r\n '; bytes = 1; }
    result += character; bytes += size;
  }
  return result;
}

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
  return [...lines, 'END:VCALENDAR', ''].map(foldLine).join('\r\n');
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
    const zone = property => property.params.find(param => param.startsWith('TZID='))?.slice(5).replace(/^"|"$/g, '');
    const date = name => {
      const value = prop(name);
      return value && readDate(value.value, zone(value));
    };
    const start = date('DTSTART'), end = date('DTEND'), title = unescape(prop('SUMMARY')?.value);
    const allDay = !!start && !start.time;
    if (!start || !title || (!allDay && !end?.time) || (end && (end.date < start.date || (allDay && end.date === start.date)))) return null;
    const rule = Object.fromEntries(text(prop('RRULE')?.value).split(';').map(part => part.split('=')));
    const recurrence = text(rule.FREQ).toLowerCase() || 'none';
    if (prop('RECURRENCE-ID') || prop('RDATE') || !['none', ...frequencies].includes(recurrence)
      || Object.keys(rule).some(key => !['', 'FREQ', 'INTERVAL', 'UNTIL', 'BYDAY', 'WKST'].includes(key))
      || (rule.BYDAY && (recurrence !== 'weekly' || !rule.BYDAY.split(',').every(day => weekdays.includes(day))))
      || (rule.UNTIL && !readDate(rule.UNTIL))
      || (rule.INTERVAL && (!/^\d+$/.test(rule.INTERVAL) || Number(rule.INTERVAL) < 1 || Number(rule.INTERVAL) > 12))
      || (rule.WKST && rule.WKST !== weekdays[calendar.parseDateKey(start.date).getDay()] && Number(rule.INTERVAL) > 1)) {
      throw new Error('UNSUPPORTED_RECURRENCE');
    }
    const exclusions = properties.filter(item => item.name === 'EXDATE').flatMap(item => item.value.split(',').map(value => {
      const excluded = readDate(value, zone(item));
      if (!excluded) throw new Error('UNSUPPORTED_RECURRENCE');
      return excluded.date;
    }));
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
  let raw, profiles = [];
  const names = new Map(kids.filter(kid => typeof kid?.name === 'string').map(kid => [kid.name.trim().toLowerCase(), kid.name]));
  const profileIds = new Map(kids.filter(kid => kid?.id != null && typeof kid.name === 'string').map(kid => [String(kid.id), kid.name]));
  if (/^\s*BEGIN:VCALENDAR/i.test(source)) raw = readIcs(source);
  else {
    const backup = JSON.parse(source);
    raw = Array.isArray(backup) ? backup : backup?.activities;
    if (Array.isArray(backup?.kids)) {
      for (const kid of backup.kids) {
        const name = text(kid?.name).trim();
        if (!name || name.length > 28 || ['all', '__family__'].includes(name.toLowerCase())) continue;
        if (kid.id != null) profileIds.set(String(kid.id), names.get(name.toLowerCase()) || name);
        if (names.has(name.toLowerCase())) continue;
        if (names.size >= 50) throw new Error('PROFILE_LIMIT');
        names.set(name.toLowerCase(), name);
        profiles.push({ id: globalThis.crypto?.randomUUID?.() || `kid-${Date.now()}-${Math.random().toString(36).slice(2)}`, name,
          palette: profileOptions.PALETTES.includes(kid.palette) ? kid.palette : 'blue',
          avatar: profileOptions.AVATARS.includes(kid.avatar) ? kid.avatar : profileOptions.AVATARS[0],
          grade: text(kid.grade).slice(0, 30), school: text(kid.school).slice(0, 60) });
      }
    }
  }
  if (!Array.isArray(raw) || !raw.length || raw.length > 300) throw new Error('INVALID_FILE');
  const events = [], allKids = [...kids, ...profiles];
  const person = name => (typeof name === 'string' ? names.get(name.trim().toLowerCase()) : null) || profileIds.get(String(name));
  let reassigned = 0;
  for (const event of raw) {
    if (!event?.title || event.externalSource || event.isBuiltInHoliday) continue;
    const { id, externalSource, isBuiltInHoliday, ...details } = event;
    const child = person(event.child) || '__family__';
    const result = model.buildCalendarEvent(null, { ...details, child,
      ...(Array.isArray(event.attendees) ? { attendees: event.attendees.map(name => name === 'all' ? name : person(name)).filter(Boolean) } : {}) }, allKids);
    if (result.event) {
      if (event.child && event.child !== '__family__' && child === '__family__') reassigned++;
      events.push({ ...details, ...result.event,
      ...(Array.isArray(event.excludedDates) ? { excludedDates: [...new Set(event.excludedDates.filter(valid))] } : {}) });
    }
  }
  if (!events.length) throw new Error('INVALID_FILE');
  return { events, profiles, originalKids: kids, reassigned, skipped: raw.length - events.length };
}

function printHtml(name, agenda) {
  const html = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  return `<!doctype html><html><meta charset="utf-8"><style>body{font:15px system-ui;margin:32px}pre{white-space:pre-wrap;line-height:1.5;font:inherit}</style><h1>${html(name)}</h1><pre>${html(agenda)}</pre></html>`;
}

module.exports = { exportIcs, readImport, printHtml };
