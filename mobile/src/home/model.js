const calendar = require('../lib/calendar');

const isDate = value => value instanceof Date && Number.isFinite(value.getTime());
const isCancelled = event => event?.status === 'cancelled';
const isFamily = event => !event?.child || event.child === '__family__';

function occurrenceKey(event, index, date) {
  return `${event?.id ?? `event-${index}`}:${calendar.dateKey(date)}`;
}

function upcomingOccurrences(events, start, days = 14) {
  if (!isDate(start)) return [];
  const source = Array.isArray(events) ? events : [];
  const result = [];
  for (let offset = 0; offset < Math.max(1, Math.min(90, Number(days) || 14)); offset += 1) {
    const date = calendar.addDays(start, offset);
    calendar.eventsForDate(source, date).forEach(event => {
      result.push({ event, date: new Date(date), dateKey: calendar.dateKey(date),
        key: occurrenceKey(event, source.indexOf(event), date) });
    });
  }
  return result;
}

const normalizedText = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

function searchOccurrences(occurrences, query, kids = []) {
  const tokens = normalizedText(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return (Array.isArray(occurrences) ? occurrences : []).filter(item => {
    const event = item?.event;
    if (!event || isCancelled(event)) return false;
    const people = calendar.kidsForEvent(event, Array.isArray(kids) ? kids : []).map(person => person.name).join(' ');
    const haystack = normalizedText([event.title, event.child, people, event.location, event.responsible,
      event.items, event.notes, event.eventType].filter(Boolean).join(' '));
    return tokens.every(token => haystack.includes(token));
  });
}

function pinnedOccurrences(occurrences, favorites) {
  const wanted = new Set(Array.isArray(favorites) ? favorites : []), seen = new Set(), result = [];
  for (const item of Array.isArray(occurrences) ? occurrences : []) {
    const id = item?.event?.id;
    if (!id || !wanted.has(id) || seen.has(id) || isCancelled(item.event)) continue;
    seen.add(id); result.push(item);
  }
  return result;
}

function packingItems(value) {
  const seen = new Set();
  return String(value || '').split(/[,;\n，；、]+/).map(item => item.trim().replace(/^[-*•]\s*/, ''))
    .filter(item => { const key = item.toLocaleLowerCase(); if (!item || seen.has(key)) return false; seen.add(key); return true; }).slice(0, 30);
}

function packingKey(occurrence) {
  const event = occurrence?.event || occurrence;
  if (!event?.id) return '';
  const date = event.eventType === 'trip' ? event.startDate : occurrence?.dateKey || event.occurrenceDate || event.startDate;
  return date ? `${event.id}:${date}` : '';
}

function dayBrief(occurrences, options = {}) {
  const rows = (Array.isArray(occurrences) ? occurrences : []).filter(item => !isCancelled(item?.event)).map(item => {
    const event = item.event;
    const details = [options.peopleFor?.(event), event.location, event.responsible].filter(Boolean).join(' · ');
    return [`${options.timeFor?.(event) || ''} — ${event.title || ''}`, details,
      options.includeNotes && event.items ? `${options.bring || 'Bring'}: ${event.items}` : '',
      options.includeNotes && event.notes ? `${options.notes || 'Notes'}: ${event.notes}` : ''].filter(Boolean).join('\n');
  });
  return [options.dateLabel, options.calendarLabel, rows.join('\n\n') || options.empty].filter(Boolean).join('\n\n');
}

function eventIsStillRelevant(occurrence, now) {
  if (occurrence.dateKey !== calendar.dateKey(now)) return true;
  if (occurrence.event.allDay) return true;
  const match = /^(\d{1,2}):(\d{2})$/.exec(occurrence.event.end || occurrence.event.start || '');
  if (!match) return true;
  return Number(match[1]) * 60 + Number(match[2]) >= now.getHours() * 60 + now.getMinutes();
}

function needsHandoff(event, kids) {
  if (!event || isCancelled(event) || event.allDay || isFamily(event) || event.isBuiltInHoliday) return false;
  if (String(event.responsible || '').trim()) return false;
  return calendar.kidsForEvent(event, kids).length > 0;
}

function buildHomeModel(events, kids, now = new Date()) {
  const date = isDate(now) ? new Date(now) : new Date();
  date.setHours(0, 0, 0, 0);
  const all = upcomingOccurrences(events, date, 90);
  const nextWeek = all.filter(item => item.date < calendar.addDays(date, 7) && !isCancelled(item.event));
  const todayKey = calendar.dateKey(date);
  const today = nextWeek.filter(item => item.dateKey === todayKey);
  const upcoming = all.filter(item => !isCancelled(item.event) && eventIsStillRelevant(item, now));
  const tomorrowKey = calendar.dateKey(calendar.addDays(date, 1));
  const handoffs = nextWeek.filter(item => needsHandoff(item.event, kids));
  const profiles = Array.isArray(kids) ? kids.filter(kid => kid && kid.name) : [];
  const workload = profiles.map(kid => ({ ...kid, count: nextWeek.filter(item =>
    calendar.kidsForEvent(item.event, profiles).some(person => String(person.id ?? person.name) === String(kid.id ?? kid.name))).length }));
  return {
    today,
    upcoming,
    tomorrow: upcoming.filter(item => item.dateKey === tomorrowKey),
    nextUp: upcoming.slice(0, 4),
    handoffs: handoffs.slice(0, 3),
    handoffCount: handoffs.length,
    sevenDayCount: nextWeek.length,
    daysPlanned: new Set(nextWeek.map(item => item.dateKey)).size,
    workload,
  };
}

module.exports = { upcomingOccurrences, searchOccurrences, pinnedOccurrences, packingItems, packingKey, dayBrief,
  eventIsStillRelevant, needsHandoff, buildHomeModel };
