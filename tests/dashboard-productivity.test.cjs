const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { normalize, searchPlans, pinnedPlans, dayBrief } = require('../assets/dashboard-productivity.js');
const { buildModel } = require('../assets/dashboard-planning.js');
const event = (id, date, extra = {}) => ({ id, title: 'Soccer', child: 'Maya', startDate: date, occurrenceDate: date, start: '17:00', end: '18:00', ...extra });
test('search matches every word across names, places and preparation without modifying plans', () => {
  const entries = [event('a', '2026-10-21', { location: 'North Field', responsible: 'Alex', items: 'Blue jersey', notes: 'Arrive early' }), event('b', '2026-10-22', { child: 'Theo' })];
  const before = JSON.stringify(entries);
  assert.deepEqual(searchPlans(entries, 'maya FIELD jersey').map(item => item.id), ['a']);
  assert.deepEqual(searchPlans(entries, 'alex early').map(item => item.id), ['a']);
  assert.equal(searchPlans(entries, 'Theo').length, 1);
  assert.equal(searchPlans(entries, 'missing').length, 0);
  assert.equal(searchPlans(entries, '  ').length, 0);
  assert.equal(JSON.stringify(entries), before);
});
test('search supports accented and Chinese text and ignores cancellations', () => {
  const entries = [event('a', '2026-10-21', { title: 'Café 游泳', child: 'José' }), event('b', '2026-10-21', { title: 'Café 游泳', status: 'cancelled' })];
  assert.equal(normalize('José'), 'jose');
  assert.deepEqual(searchPlans(entries, 'cafe 游泳 jose').map(item => item.id), ['a']);
});
test('pins display the next occurrence once per favorite and retain favorite order', () => {
  const events = [event('a', '2026-10-21'), event('b', '2026-10-22'), event('a', '2026-10-28')];
  assert.deepEqual(pinnedPlans(events, ['b', 'a', 'a', 'deleted']).map(item => [item.id, item.occurrenceDate]), [['b', '2026-10-22'], ['a', '2026-10-21']]);
  assert.equal(pinnedPlans([event('a', '2026-10-21', { status: 'cancelled' })], ['a']).length, 0);
});
test('tomorrow uses the next local calendar date across month and year boundaries', () => {
  for (const [now, nextDate] of [[new Date(2026, 11, 31, 16), '2027-01-01'], [new Date(2026, 9, 31, 16), '2026-11-01']]) {
    const model = buildModel([event('next', nextDate), event('cancelled', nextDate, { status: 'cancelled' })], now);
    assert.deepEqual(model.tomorrowEvents.map(item => item.id), ['next']);
    assert.deepEqual(model.upcoming.map(item => item.id), ['next']);
  }
});
test('searchable upcoming events include later plans and exclude finished occurrences', () => {
  const model = buildModel([event('done', '2026-10-21', { start: '13:00', end: '14:00' }), event('later', '2026-12-01'), event('now', '2026-10-21')], new Date(2026, 9, 21, 16));
  assert.deepEqual(model.upcoming.map(item => item.id), ['now', 'later']);
});
const options = { dateLabel: 'Wednesday, October 21', calendarLabel: 'Family', timeFor: item => `${item.start}–${item.end}`, childFor: item => item.child, bring: 'Bring', notes: 'Notes', empty: 'Nothing scheduled.' };
test('daily briefs include times and handoff details while notes and items are opt-in', () => {
  const item = event('a', '2026-10-21', { location: 'North field', responsible: 'Alex', notes: 'Arrive early', items: 'Water, cleats' });
  const brief = dayBrief([item], options);
  assert.match(brief, /Wednesday, October 21\n\nFamily/);
  assert.match(brief, /17:00–18:00 — Soccer/);
  assert.match(brief, /Maya · North field · Alex/);
  assert.doesNotMatch(brief, /Arrive early|Water/);
  const full = dayBrief([item], { ...options, includeNotes: true });
  assert.match(full, /Bring: Water, cleats/); assert.match(full, /Notes: Arrive early/);
});
test('daily brief handles empty days and excludes cancelled plans', () => {
  assert.match(dayBrief([], options), /Nothing scheduled\./);
  assert.doesNotMatch(dayBrief([event('a', '2026-10-21', { status: 'cancelled' })], options), /Soccer/);
});
test('English and Chinese cover the same productivity controls and feedback', () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../assets/dashboard-productivity.js'), 'utf8');
  const start = source.indexOf('  const words = '), end = source.indexOf('  const text = ', start);
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end) + '\nthis.words = words;', context);
  assert.deepEqual(Object.keys(context.words.en).sort(), Object.keys(context.words.zh).sort());
  assert(Object.values(context.words.zh).every(value => typeof value === 'string' && value.length));
});
