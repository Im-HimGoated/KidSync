const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWeeklyBrief, createWeeklyBriefStore, hasSeenWeek } = require('../mobile/src/home/weekly-brief');
const { dateKey } = require('../mobile/src/lib/calendar');

const local = (day, hour = 12) => new Date(2026, 10, day, hour);

test('weekly reminder resets at the selected local week start', () => {
  assert.equal(hasSeenWeek('2026-11-07', local(8), 0), false);
  assert.equal(hasSeenWeek('2026-11-07', local(8), 1), true);
  assert.equal(hasSeenWeek('2026-11-08', local(9), 0), true);
  assert.equal(hasSeenWeek('2026-11-08', local(9), 1), false);
  assert.equal(hasSeenWeek('2026-11-09', local(11), 1), true);
  assert.equal(hasSeenWeek('2026-11-09', local(11), 0), true);
  assert.equal(hasSeenWeek('invalid', local(11), 0), false);
});

test('the seven-day preview includes recurrence and ongoing plans, with overflow per day', () => {
  const plans = [
    { id: 'finished', startDate: '2026-11-01', start: '08:00', end: '09:00' },
    { id: 'trip', startDate: '2026-10-31', endDate: '2026-11-02', start: '09:00', end: '09:00' },
    { id: 'all-day', startDate: '2026-11-01', allDay: true },
    { id: 'cancelled', startDate: '2026-11-01', allDay: true, status: 'cancelled' },
    { id: 'weekly', startDate: '2026-10-31', start: '15:00', end: '16:00', recurrence: 'weekly' },
    { id: 'outside', startDate: '2026-11-08', allDay: true },
    ...Array.from({ length: 5 }, (_, index) => ({ id: `practice-${index}`, startDate: '2026-11-07', start: '17:00', end: '18:00' }))
  ];
  const brief = buildWeeklyBrief(plans, local(1));
  assert.equal(dateKey(brief.end), '2026-11-07');
  assert.deepEqual(brief.days.map(day => day.dateKey), ['2026-11-01', '2026-11-02', '2026-11-07']);
  assert.deepEqual(brief.days[0].plans.map(item => item.event.id), ['all-day', 'trip']);
  assert.equal(brief.days[0].plans[1].segment.continuesAfter, true);
  assert.equal(brief.days[1].plans[0].segment.continuesBefore, true);
  assert.equal(brief.days[2].plans[0].event.id, 'weekly');
  assert.equal(brief.days[2].plans.length, 4);
  assert.equal(brief.days[2].more, 2);
  assert.deepEqual(buildWeeklyBrief([], local(1)).days, []);
});

test('seeing the reminder is saved across app restarts and stays scoped to the account', async () => {
  const saved = new Map();
  const storage = { getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => saved.set(key, value) };
  const firstOpen = createWeeklyBriefStore(storage);
  assert.equal(await firstOpen.read('account-a'), null);
  await firstOpen.markShown('account-a', local(6));
  const afterRestart = createWeeklyBriefStore(storage);
  assert.equal(await afterRestart.read('account-a'), '2026-11-06');
  assert.equal(await afterRestart.read('account-b'), null);
  assert.equal(hasSeenWeek(await afterRestart.read('account-a'), local(7), 1), true);
  assert.equal(hasSeenWeek(await afterRestart.read('account-a'), local(9), 1), false);
});

test('a pending storage read cannot replay the reminder, and failed writes are scoped to this run', async () => {
  let resolveRead, attempts = 0;
  const storage = {
    getItem: () => new Promise(resolve => { resolveRead = resolve; }),
    async setItem() { attempts += 1; throw new Error('Device storage unavailable'); }
  };
  const store = createWeeklyBriefStore(storage);
  const read = store.read('account');
  await store.markShown('account', local(8));
  resolveRead(null);
  assert.equal(await read, '2026-11-08');
  assert.equal(await store.read('account'), '2026-11-08');
  await store.markShown('account', local(8));
  assert.equal(attempts, 1);
});
