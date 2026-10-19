const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { dailyLoad, withinDailyLimits, findSlots, slotAvailable } = require('../assets/smart-scheduling.js');
const { plannedLoad, workloadTarget } = require('../assets/smart-planner.js');
const { normalizePoll, voteTotals, preferredOptions } = require('../assets/family-polls.js');
const event = extra => ({ child: 'Alex', start: '10:00', end: '11:00', ...extra });
const option = extra => ({ id: 'one', date: '2027-05-04', start: '16:00', end: '17:00', votes: ['yes', 'maybe'], ...extra });
const poll = extra => ({ version: 1, id: 'poll-one', title: 'Picnic', people: ['Alex', 'Sam'], options: [option()], ...extra });
const rules = extra => ({ date: '2027-05-04', days: 1, earliest: 0, latest: 1439, duration: 30, before: 0, after: 0, notice: 0, people: ['Alex'], maxEvents: 0, maxMinutes: 0, ...extra });

test('Cal-style daily limits count each person separately and ignore adjacent days and cancelled events', () => {
  const events = [event(), event({ child: 'Sam' }), event({ status: 'cancelled' }), event({ dayOffset: 1 }), event({ isBuiltInHoliday: true })];
  assert.deepEqual(dailyLoad(events, 'Alex'), { count: 1, minutes: 60 });
  assert(withinDailyLimits(events, rules({ maxEvents: 2, maxMinutes: 90 }), 30));
  assert(!withinDailyLimits(events, rules({ maxEvents: 1 }), 30));
  assert(!withinDailyLimits(events, rules({ maxMinutes: 89 }), 30));
  assert(withinDailyLimits(events, rules({ people: ['Sam'], maxEvents: 2 }), 30));
  assert(withinDailyLimits(events, rules(), 300));
});

test('family and named attendee plans affect only the appropriate daily allowances', () => {
  const events = [event({ child: '__family__', attendees: ['Sam'] }), event({ child: 'Alex', attendees: ['all'] })];
  assert.deepEqual(dailyLoad(events, 'Sam'), { count: 1, minutes: 60 });
  assert.deepEqual(dailyLoad(events, 'Alex'), { count: 1, minutes: 60 });
  assert(!withinDailyLimits([...events, event({ child: '__family__' })], rules({ people: ['Alex', 'Sam'], maxEvents: 2 }), 30));
  assert.equal(dailyLoad([event({ allDay: true }), event({ eventType: 'trip' }), event({ start: 'bad' })], 'Alex').minutes, 0);
});

test('finder and fresh slot checks both enforce count and planned-time caps', () => {
  const now = new Date(2027, 4, 1), events = [event()];
  assert.equal(findSlots(rules({ maxMinutes: 60 }), () => events, now).length, 0);
  assert.equal(findSlots(rules({ maxEvents: 1 }), () => events, now).length, 0);
  const settings = rules({ maxMinutes: 90, maxEvents: 2 });
  const slots = findSlots(settings, () => events, now);
  assert(slots.length);
  assert(!slotAvailable(slots[0], settings, () => [...events, event({ start: '13:00', end: '13:30' })], now));
  assert(slotAvailable(slots[0], settings, () => events, now));
});

test('Sunsama-style day totals include shared plans but never double-assign another child’s legacy all attendee event', () => {
  const rows = plannedLoad([event({ attendees: ['all'] }), event({ child: '__family__', start: '12:00', end: '12:30' }), event({ child: '__family__', attendees: ['Sam'], start: '14:00', end: '14:45' })], ['Alex', 'Sam']);
  assert.deepEqual(rows, [{ person: 'Alex', minutes: 90, count: 2, untimed: 0 }, { person: 'Sam', minutes: 75, count: 2, untimed: 0 }]);
});

test('planned durations are summed honestly; untimed events stay separate and cancelled/holiday entries do not inflate totals', () => {
  const result = plannedLoad([event(), event({ start: '10:30', end: '11:30' }), event({ allDay: true }), event({ eventType: 'trip' }), event({ start: 'invalid' }), event({ status: 'cancelled' }), event({ isBuiltInHoliday: true })], ['Alex'])[0];
  assert.deepEqual(result, { person: 'Alex', minutes: 120, untimed: 3, count: 5 });
  assert.equal(plannedLoad([event({ child: 'Former child' })], ['__family__'])[0].minutes, 60);
  for (const target of [-1, 89, 10000, 'bad', null]) assert.equal(workloadTarget(target), 0);
  assert.equal(workloadTarget('180'), 180);
});

test('poll persistence is bounded and validates real dates, time ranges, people, and answer values', () => {
  assert.equal(normalizePoll(null), null); assert.equal(normalizePoll(poll({ version: 2 })), null);
  assert.equal(normalizePoll(poll({ people: ['Alex', 'Alex'] })), null);
  assert.equal(normalizePoll(poll({ people: Array.from({ length: 9 }, (_, i) => String(i)) })), null);
  assert.equal(normalizePoll(poll({ title: '  ' })), null);
  const model = normalizePoll(poll({ options: [option({ votes: ['no', 'bogus'] }), option({ id: 'duplicate' }), option({ id: 'invalid', date: '2027-02-30' }), option({ id: 'wrong', end: '15:00' })] }));
  assert.equal(model.options.length, 1); assert.deepEqual(model.options[0].votes, ['no', 'pending']);
  assert.equal(normalizePoll(poll({ options: Array.from({ length: 10 }, (_, i) => option({ id: String(i), date: `2027-05-${String(i + 1).padStart(2, '0')}` })) })).options.length, 5);
});

test('votes remain distinct: not answered never means No and If needed can still make a viable time', () => {
  assert.deepEqual(voteTotals(option({ votes: ['yes', 'maybe'] })), { yes: 1, maybe: 1, no: 0, pending: 0, ready: true });
  assert.equal(voteTotals(option({ votes: ['yes', 'pending'] })).ready, false);
  assert.equal(voteTotals(option({ votes: ['yes', 'no'] })).ready, false);
  assert.equal(voteTotals(option({ votes: [] })).ready, false);
});

test('most-preferred badges consider only complete viable options, handle ties, and never book or mutate a poll', () => {
  const model = poll({ options: [option(), option({ id: 'two', votes: ['yes', 'yes'] }), option({ id: 'three', votes: ['yes', 'pending'] }), option({ id: 'four', votes: ['yes', 'no'] }), option({ id: 'five', votes: ['yes', 'yes'] })] });
  const before = JSON.stringify(model);
  assert.deepEqual(preferredOptions(model), ['two', 'five']);
  assert.equal(JSON.stringify(model), before);
  assert.deepEqual(preferredOptions(poll({ options: [option({ votes: ['pending', 'pending'] })] })), []);
});

test('stored poll options reject DST gaps and wall-clock intervals spanning a clock change', () => {
  const file = require.resolve('../assets/family-polls.js');
  const output = execFileSync(process.execPath, ['-e', `const {normalizePoll}=require(${JSON.stringify(file)}); const base=${JSON.stringify(poll())}; console.log(normalizePoll({...base,options:[{id:'gap',date:'2027-03-14',start:'02:30',end:'03:00'},{id:'fold',date:'2027-11-07',start:'01:30',end:'02:30'}]}).options.length);`], { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' });
  assert.equal(Number(output.trim()), 0);
});

test('poll UI is bilingual, uses existing review and draft guards, has no external writes, and is offline-ready', () => {
  const source = fs.readFileSync(require.resolve('../assets/family-polls.js'), 'utf8');
  const words = vm.runInNewContext(source.slice(source.indexOf('  const words ='), source.indexOf('  const tx =')) + '\nwords');
  assert.deepEqual(Object.keys(words.en).sort(), Object.keys(words.zh).sort());
  assert.match(source, /KidsSyncScheduler.reviewPlan\(/); assert.match(source, /KidsSyncScheduler.planIsFree\(plan\)/);
  assert.match(source, /scheduleStorageKey\('family-poll-v1'\)/); assert.match(source, /poll\.people\.map\(\(\) => 'pending'\)/);
  assert.doesNotMatch(source, /saveActivities\(|fetch\(|cloudClient\./);
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8'), sw = fs.readFileSync(require.resolve('../sw.js'), 'utf8');
  for (const asset of ['family-polls.js?v=2', 'family-polls.css?v=1']) { assert(html.includes(asset)); assert(sw.includes(asset)); }
  const css = fs.readFileSync(require.resolve('../assets/family-polls.css'), 'utf8');
  assert.match(css, /min-height: 44px/); assert.match(css, /@media \(max-width: 600px\)/);
});
