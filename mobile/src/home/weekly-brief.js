const calendar = require('../lib/calendar');
const { startOfDisplayWeek } = require('../calendar/model');
const { eventIsStillRelevant, upcomingOccurrences } = require('./model');

const DAYS = 7;
const PREVIEW_PER_DAY = 4;

function hasSeenWeek(lastShown, date, firstDay) {
  const shown = calendar.parseDateKey(lastShown);
  const start = startOfDisplayWeek(date, firstDay);
  return shown >= start && shown < calendar.addDays(start, DAYS);
}

function buildWeeklyBrief(events, now) {
  const today = calendar.dateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const days = new Map();
  for (const item of upcomingOccurrences(events, now, DAYS)) {
    const { event, date, dateKey } = item;
    if (event.status === 'cancelled') continue;
    const segment = calendar.daySegment(event, date);
    if (dateKey === today && (segment ? !event.allDay && segment.end <= nowMinutes : !eventIsStillRelevant(item, now))) continue;
    if (!days.has(dateKey)) days.set(dateKey, { date, dateKey, plans: [], more: 0 });
    const day = days.get(dateKey);
    if (day.plans.length < PREVIEW_PER_DAY) day.plans.push({ ...item, segment });
    else day.more += 1;
  }
  return { end: calendar.addDays(now, DAYS - 1), days: [...days.values()] };
}

const erasure = require('../lib/account-erasure');
function createWeeklyBriefStore(storage) {
  const shown = new Map();
  const key = userId => `kidssync:mobile:weekly-brief:v1:${encodeURIComponent(userId)}`;
  let writes = Promise.resolve();
  return {
    async read(userId) {
      if (shown.has(userId)) return shown.get(userId);
      let saved = null;
      try { saved = await storage.getItem(key(userId)); }
      catch { /* The brief is still available when device storage is unavailable. */ }
      return shown.get(userId) ?? saved;
    },
    markShown(userId, date) {
      erasure.registerQueue(storage, userId, shown, () => writes);
      const value = calendar.dateKey(date);
      if (!value || shown.get(userId) === value) return writes;
      shown.set(userId, value);
      writes = writes.then(() => { erasure.assertActive(storage, userId); return storage.setItem(key(userId), value); }).catch(() => {});
      return writes;
    }
  };
}

module.exports = { hasSeenWeek, buildWeeklyBrief, createWeeklyBriefStore };
