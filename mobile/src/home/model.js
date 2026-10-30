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
  for (let offset = 0; offset < Math.max(1, Math.min(31, Number(days) || 14)); offset += 1) {
    const date = calendar.addDays(start, offset);
    calendar.eventsForDate(source, date).forEach(event => {
      result.push({ event, date: new Date(date), dateKey: calendar.dateKey(date),
        key: occurrenceKey(event, source.indexOf(event), date) });
    });
  }
  return result;
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
  const all = upcomingOccurrences(events, date, 14);
  const nextWeek = all.filter(item => item.date < calendar.addDays(date, 7) && !isCancelled(item.event));
  const todayKey = calendar.dateKey(date);
  const today = nextWeek.filter(item => item.dateKey === todayKey);
  const upcoming = all.filter(item => !isCancelled(item.event) && eventIsStillRelevant(item, now));
  const handoffs = nextWeek.filter(item => needsHandoff(item.event, kids));
  const profiles = Array.isArray(kids) ? kids.filter(kid => kid && kid.name) : [];
  const workload = profiles.map(kid => ({ ...kid, count: nextWeek.filter(item =>
    calendar.kidsForEvent(item.event, profiles).some(person => String(person.id ?? person.name) === String(kid.id ?? kid.name))).length }));
  return {
    today,
    nextUp: upcoming.slice(0, 4),
    handoffs: handoffs.slice(0, 3),
    handoffCount: handoffs.length,
    sevenDayCount: nextWeek.length,
    daysPlanned: new Set(nextWeek.map(item => item.dateKey)).size,
    workload,
  };
}

module.exports = { upcomingOccurrences, eventIsStillRelevant, needsHandoff, buildHomeModel };
