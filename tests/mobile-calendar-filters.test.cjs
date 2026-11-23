const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const holidays = require('../mobile/src/calendar/holidays');
const planning = require('../mobile/src/calendar/planning');
const calendar = require('../mobile/src/lib/calendar');
const model = require('../mobile/src/calendar/model');
const screen = fs.readFileSync(require.resolve('../mobile/src/calendar/CalendarScreen.js'), 'utf8');

test('native Activities, Trips and Important agree with the actual website filter', () => {
  const source = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const filter = source.match(/function activityMatchesEventFilter\(activity\) \{[^]*?\n    \}/)[0];
  const importance = source.match(/function eventImportance\(activity\) \{[^]*?\n    \}/)[0];
  const events = [
    {}, { eventType: 'activity' }, { eventType: 'trip' }, { eventType: 'birthday' },
    { eventType: 'deadline' }, { eventType: 'holiday' }, { eventType: 'custom' },
  ].flatMap(event => [undefined, 'low', 'normal', 'high', 'unknown'].map(importance => ({ ...event, importance })));
  for (const category of ['all', 'activity', 'trip', 'important']) {
    const context = { state: { eventFilter: category } };
    vm.runInNewContext(`${importance}\n${filter}`, context);
    for (const event of events) assert.equal(holidays.matchesCategory(event, category), context.activityMatchesEventFilter(event), JSON.stringify({ category, event }));
  }
  assert.equal(holidays.matchesCategory({ eventType: 'trip', importance: 'normal' }, 'special'), false);
  assert.equal(holidays.matchesCategory({ eventType: 'trip', importance: 'high' }, 'important'), true);
});

test('Holidays only retains generated/custom holidays and excludes trips and unrelated important plans', () => {
  const day = calendar.parseDateKey('2026-11-26');
  const source = [...holidays.builtInHolidays(2026),
    { id: 'trip', eventType: 'trip', startDate: '2026-11-26', importance: 'high' },
    { id: 'custom', eventType: 'holiday', startDate: '2026-11-26', title: 'School holiday' },
    { id: 'deadline', eventType: 'deadline', startDate: '2026-11-26' }];
  const filtered = model.filterActivities(source.filter(event => holidays.matchesCategory(event, 'holidays')), [], { person: 'Casey', query: '' });
  assert.deepEqual(calendar.eventsForDate(filtered, day).map(event => event.id), ['builtin-holiday-2026-11-26', 'custom']);
  assert.equal(holidays.matchesCategory({ isBuiltInHoliday: true }, 'activity'), false);
  for (const invalid of [null, undefined, [], 'holiday']) assert.equal(holidays.matchesCategory(invalid, 'holidays'), false);
  assert.deepEqual(holidays.categoryOptions().map(option => option.value), ['all', 'activity', 'trip', 'important', 'holidays']);
  assert.deepEqual(holidays.categoryOptions('zh').map(option => option.value), holidays.categoryOptions().map(option => option.value));
});

function applyView(value, people = ['all', 'Casey']) {
  const apply = screen.match(/  function applySavedView\(value\) \{[^]*?\n  \}/)[0];
  const state = {}, monthReturnView = { current: 'week' };
  const set = key => value => { state[key] = value; };
  const context = { planning, calendar, filters: people.map(value => ({ value })), monthReturnView,
    setDate: value => { state.date = calendar.dateKey(value); }, setQuery: set('query'), setPerson: set('person'),
    setCategory: set('category'), setHideWeekends: set('hideWeekends'), setFiltersOpen: set('filtersOpen'),
    setView: set('view'), setFullMonthOpen: set('fullMonthOpen'), closeSheet: () => { state.closed = true; } };
  vm.runInNewContext(apply, context);
  context.applySavedView(value);
  return { ...state, monthReturnView: monthReturnView.current };
}

test('opening a saved view restores every filter, including holidays-only and hidden weekends', () => {
  const selected = { view: 'week', date: '2026-11-26', person: 'Casey', query: 'school', category: 'holidays', hideWeekends: true };
  assert.deepEqual(applyView(selected), { ...selected, filtersOpen: true, fullMonthOpen: false, closed: true, monthReturnView: 'week' });
  assert.deepEqual(applyView({ ...selected, view: 'month', query: '', person: 'Removed child', category: 'all', hideWeekends: false }),
    { ...selected, view: 'month', query: '', person: 'all', category: 'all', hideWeekends: false,
      filtersOpen: false, fullMonthOpen: true, closed: true, monthReturnView: 'agenda' });
  assert.equal(applyView({ ...selected, query: '', person: 'all', category: 'all' }).filtersOpen, true);
  const legacy = applyView({ view: 'agenda', date: '2026-11-26', person: 'all', query: '' });
  assert.equal(legacy.category, 'all'); assert.equal(legacy.hideWeekends, false); assert.equal(legacy.filtersOpen, false);
  assert.match(screen, /selectedView=\{\{ view, date: calendar.dateKey\(date\), query, person, category, hideWeekends \}\}/);
  assert.match(screen, /onApplyView=\{applySavedView\}/);
});

test('clearing filters removes weekend restrictions and find-result navigation clears all stale filters', () => {
  const reset = screen.match(/function resetFilters\(\) \{[^]*? \}/)[0];
  const state = {};
  vm.runInNewContext(`${reset}; resetFilters();`, Object.fromEntries(['Person', 'Query', 'Category', 'HideWeekends', 'FiltersOpen'].map(key => [`set${key}`, value => { state[key] = value; }])));
  assert.deepEqual(state, { Person: 'all', Query: '', Category: 'all', HideWeekends: false, FiltersOpen: false });
  assert.match(screen, /onShowDate=\{value => \{[^]*?setView\('agenda'\); resetFilters\(\); closeSheet\(\); \}\}/);
});
