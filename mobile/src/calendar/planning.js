const web = require('../../../assets/calendar-planning');
const calendar = require('../lib/calendar');
const model = require('./model');
const validDate = value => typeof value === 'string' && Number.isFinite(calendar.parseDateKey(value).getTime());
const text = value => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function dayEvents(events, date) {
  if (!validDate(date)) throw new Error('INVALID_DATE');
  return calendar.eventsForDate(Array.isArray(events) ? events : [], calendar.parseDateKey(date))
    .filter(event => event.status !== 'cancelled');
}
function segments(events, date) {
  return dayEvents(events, date).map(event => {
    const segment = calendar.daySegment(event, date);
    return { ...event, start: segment ? clock(segment.start) : '', end: segment ? clock(segment.end) : '' };
  });
}
function openTime(events, { date, start = '08:00', end = '20:00', duration = 30, now = new Date() } = {}) {
  if (!validDate(date) || ![15, 30, 45, 60, 90, 120].includes(duration)) throw new Error('INVALID_WINDOW');
  let from = web.clock(start); const to = web.clock(end);
  if (from === null || to === null || to <= from) throw new Error('INVALID_WINDOW');
  if (date === calendar.dateKey(now)) from = Math.max(from, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 5) * 5);
  if (date < calendar.dateKey(now) || from >= to) return [];
  const nearby = [-1, 0, 1].flatMap(offset => segments(events, calendar.dateKey(calendar.addDays(calendar.parseDateKey(date), offset)))
    .map(event => ({ ...event, dayOffset: offset })));
  return web.openGaps(nearby, from, to, duration).map(gap => ({
    start: clock(gap.start), end: clock(gap.end), minutes: gap.end - gap.start,
    draft: { startDate: date, endDate: '', start: clock(gap.start), end: clock(Math.min(gap.start + duration, 1439)) }
  })).filter(gap => web.clock(gap.draft.end) - web.clock(gap.draft.start) >= duration);
}
function compareDay(events, date) {
  const entries = dayEvents(events, date);
  return { events: entries, count: entries.length, minutes: web.occupied(segments(events, date)) };
}
function findEvents(events, from, through, query) {
  const entries = web.collect(from, through, date => dayEvents(events, calendar.dateKey(date)));
  if (!entries) throw new Error('INVALID_RANGE');
  return web.search(entries, text(query));
}
function weekAgenda(events, date, { language = 'en', firstDay = 1, kids = [], includeDetails = false } = {}) {
  if (!validDate(date)) throw new Error('INVALID_DATE');
  const start = model.startOfDisplayWeek(calendar.parseDateKey(date), firstDay);
  const dates = Array.from({ length: 7 }, (_, i) => calendar.dateKey(calendar.addDays(start, i)));
  const entries = web.collect(dates[0], dates[6], day => dayEvents(events, calendar.dateKey(day)));
  const zh = language === 'zh';
  return web.weekText(entries, dates, {
    title: zh ? '每周安排' : 'Weekly agenda', details: includeDetails,
    date: value => calendar.parseDateKey(value).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    empty: zh ? '暂无安排。' : 'Nothing scheduled.',
    time: event => event.allDay ? zh ? '全天' : 'All day' : [calendar.formatTime(event.start, language), calendar.formatTime(event.end, language)].filter(Boolean).join('–'),
    person: event => !event.child || event.child === '__family__' ? zh ? '全家' : 'Family' : calendar.kidsForEvent(event, kids).map(kid => text(kid.name)).join(', ') || text(event.child)
  });
}
function normalizeView(value) {
  if (!value || !['agenda', 'week', 'month'].includes(value.view) || !validDate(value.date)
    || typeof value.query !== 'string' || value.query.length > 120 || typeof value.person !== 'string' || value.person.length > 100) throw new Error('INVALID_VIEW');
  return { view: value.view, date: value.date, query: value.query, person: value.person };
}
const locks = new WeakMap();
function createPlanningStore(storage, { userId, ownerId = userId, calendarId } = {}) {
  if (![userId, ownerId, calendarId].every(value => typeof value === 'string' && value.trim() && value.length <= 300)) throw new Error('INVALID_SCOPE');
  const key = `kidssync:mobile:planning:v1:${[userId, ownerId, calendarId].map(encodeURIComponent).join(':')}`;
  if (!locks.has(storage)) locks.set(storage, new Map());
  const queues = locks.get(storage);
  async function read() {
    const raw = await storage.getItem(key);
    if (raw == null) return { version: 1, notes: {}, views: [] };
    try {
      const value = JSON.parse(raw);
      if (value?.version !== 1 || !value.notes || typeof value.notes !== 'object' || Array.isArray(value.notes)
        || Object.keys(value.notes).length > 730 || !Array.isArray(value.views) || value.views.length > 8) throw new Error();
      for (const [date, note] of Object.entries(value.notes)) if (!validDate(date) || typeof note !== 'string' || note.length > 2000) throw new Error();
      const names = new Set();
      for (const view of value.views) {
        if (typeof view.name !== 'string' || !view.name.trim() || view.name.length > 40 || names.has(view.name)) throw new Error();
        names.add(view.name); normalizeView(view);
      }
      return { version: 1, notes: { ...value.notes }, views: value.views.map(item => ({ name: item.name, ...normalizeView(item) })) };
    } catch { throw new Error('INVALID_STORED_PLANNING'); }
  }
  function change(update) {
    const pending = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      const next = update(await read());
      await storage.setItem(key, JSON.stringify(next));
      return next;
    });
    queues.set(key, pending); return pending;
  }
  return { key, read,
    saveNote(date, note) {
      if (!validDate(date) || typeof note !== 'string' || note.length > 2000) return Promise.reject(new Error('INVALID_NOTE'));
      return change(value => {
        if (note.trim()) value.notes[date] = note; else delete value.notes[date];
        if (Object.keys(value.notes).length > 730) throw new Error('NOTE_LIMIT');
        return value;
      });
    },
    saveView(name, selected) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) return Promise.reject(new Error('INVALID_NAME'));
      const view = normalizeView(selected); name = name.trim();
      return change(value => {
        const rest = value.views.filter(item => item.name !== name);
        if (rest.length >= 8) throw new Error('VIEW_LIMIT');
        return { ...value, views: [...rest, { name, ...view }] };
      });
    },
    removeView(name) { return change(value => ({ ...value, views: value.views.filter(item => item.name !== name) })); }
  };
}
module.exports = { dayEvents, openTime, compareDay, findEvents, weekAgenda, normalizeView, createPlanningStore };
