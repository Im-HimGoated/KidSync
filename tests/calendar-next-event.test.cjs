const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert(start >= 0, `Missing calendar function: ${name}`);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}

// Friday at noon, in the same local time used by the calendar.
class CalendarDate extends Date {
  constructor(...args) { super(...(args.length ? args : [2027, 0, 8, 12, 0, 0])); }
  static now() { return new Date(2027, 0, 8, 12, 0, 0).getTime(); }
}

function event(id, date, extra = {}) {
  return { id, title: id, child: 'Sam', eventType: 'activity', startDate: date,
    start: '09:00', end: '10:00', recurrence: 'none', status: 'confirmed', ...extra };
}

function calendar(activities = []) {
  const state = { activities, visibleKids: new Set(['Sam']), searchQuery: '', eventFilter: 'all', showWeekends: true };
  const context = vm.createContext({
    Date: CalendarDate, state, selectedDate: new CalendarDate(2027, 0, 8), currentView: 'week',
    currentLanguage: 'en', translations: { en: {}, zh: {} }, FAMILY_CHILD: '__family__',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(key => ({ key })),
    t: key => key, displayChild: activity => activity.child,
    builtInHolidayActivities: () => []
  });
  const names = ['addDays', 'dateKey', 'parseDateKey', 'dateSerial', 'activitySpanDays', 'activityStartsOn',
    'activityOccursOn', 'activitySpanPosition', 'activityTitle', 'activityStatus', 'activityStatusLabel',
    'eventImportance', 'eventImportanceLabel', 'activityMatchesSearch', 'activityMatchesEventFilter',
    'occurrencesOnDate', 'occurrenceDateTime', 'nextCalendarOccurrence'];
  vm.runInContext(names.map(source).join('\n'), context);
  return { context, state, next: () => context.nextCalendarOccurrence() };
}

test('Next event begins at a browsed future date and chooses its earliest matching time', () => {
  const { context, next } = calendar([
    event('before selected date', '2027-01-12'),
    event('later time', '2027-01-13', { start: '15:00' }),
    event('first time', '2027-01-13', { start: '08:00' })
  ]);
  context.selectedDate = new CalendarDate(2027, 0, 13, 18);
  const result = next();
  assert.equal(result.activity.id, 'first time');
  assert.equal(result.activity.occurrenceDate, '2027-01-13');
  assert.equal(result.date.getHours(), 8);
  assert.equal(context.selectedDate.getHours(), 18, 'Finding the next event preserves the browsed date');
});

test('browsing the past finds upcoming events from now and retains today’s all-day events', () => {
  const { context, state, next } = calendar([
    event('yesterday', '2027-01-07'),
    event('already started', '2027-01-08', { start: '11:00' }),
    event('later today', '2027-01-08', { start: '13:00' }),
    event('tomorrow', '2027-01-09')
  ]);
  context.selectedDate = new CalendarDate(2027, 0, 1);
  assert.equal(next().activity.id, 'later today');
  state.activities.push(event('all day today', '2027-01-08', { allDay: true }));
  assert.equal(next().activity.id, 'all day today');
});

test('Next event respects search, child, type, cancellation, and occurrence filters together', () => {
  const { context, state, next } = calendar([
    event('Piano hidden child', '2027-01-09', { child: 'Alex' }),
    event('Piano wrong type', '2027-01-10', { eventType: 'trip' }),
    event('Soccer wrong search', '2027-01-11'),
    event('Piano cancelled', '2027-01-12', { status: 'cancelled' }),
    event('Piano excluded', '2027-01-13', { excludedDates: ['2027-01-13'] }),
    event('Piano matching', '2027-01-14'),
    event('Piano later', '2027-01-15')
  ]);
  state.searchQuery = 'piano';
  state.eventFilter = 'activity';
  assert.equal(next().activity.id, 'Piano matching');
  assert.equal(state.visibleKids.size, 1);
  assert.equal(state.eventFilter, 'activity');
  assert.equal(state.searchQuery, 'piano');
  state.searchQuery = '钢琴';
  context.currentLanguage = 'zh';
  state.activities.push(event('钢琴课', '2027-01-16'));
  assert.equal(next().activity.id, '钢琴课');
  state.searchQuery = 'missing plan';
  assert.equal(next(), null);
});

test('family events stay eligible while hidden children stay excluded', () => {
  const { next } = calendar([
    event('hidden child', '2027-01-09', { child: 'Alex' }),
    event('family plan', '2027-01-10', { child: '__family__' }),
    event('visible child', '2027-01-11')
  ]);
  assert.equal(next().activity.id, 'family plan');
});

test('hidden weekends restrict Week without excluding weekends in Day, Month, or four-day views', () => {
  const { context, state, next } = calendar([
    event('Saturday', '2027-01-09'), event('Sunday', '2027-01-10'), event('Monday', '2027-01-11')
  ]);
  context.selectedDate = new CalendarDate(2027, 0, 9);
  state.showWeekends = false;
  assert.equal(next().activity.id, 'Monday');
  for (const view of ['today', 'month', 'four']) {
    context.currentView = view;
    assert.equal(next().activity.id, 'Saturday', view);
  }
  context.currentView = 'week';
  state.showWeekends = true;
  assert.equal(next().activity.id, 'Saturday');
});

test('an empty or cancelled-only calendar has no next event', () => {
  const { state, next } = calendar();
  assert.equal(next(), null);
  state.activities.push(event('cancelled', '2027-01-09', { status: 'cancelled' }));
  assert.equal(next(), null);
});

test('the Day shortcut includes the date when its next matching event is on another day', () => {
  const { context } = calendar();
  context.currentView = 'today';
  context.formatShortDate = date => context.dateKey(date);
  context.minutes = () => 9 * 60;
  context.formatTimeLabel = () => '9:00 AM';
  context.displayIcon = () => '★';
  context.activityCompactTitle = activity => activity.title;
  vm.runInContext(source('isSameDate') + source('nextOccurrenceLabel'), context);
  assert.match(context.nextOccurrenceLabel({ activity: event('Tomorrow', '2027-01-09') }), /^2027-01-09 · /);
  assert.match(context.nextOccurrenceLabel({ activity: event('Today', '2027-01-08') }), /^9:00 AM/);
});

function jumpSetup({ visible = true, present = true, reduceMotion = false, renderOnOpen = false, occurrence = true } = {}) {
  const calls = [], classes = new Set(), timers = [];
  const key = 'target:2027-01-13';
  const target = {
    dataset: { occurrenceKey: key },
    getClientRects: () => visible ? [{}] : [],
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    scrollIntoView: options => calls.push(['scroll', options.behavior, options.block, options.inline]),
    focus: options => calls.push(['focus', options.preventScroll])
  };
  let elements = present ? [target] : [];
  const context = vm.createContext({
    Date: CalendarDate, userSettings: { reduceMotion },
    nextOverviewOccurrence: occurrence ? { activity: event('target', '2027-01-13', { occurrenceDate: '2027-01-13' }) } : null,
    document: { querySelectorAll: () => elements },
    openCalendarDay(date) {
      calls.push(['open', context.dateKey(date)]);
      if (renderOnOpen) { visible = true; elements = [target]; }
    },
    window: { setTimeout: (callback, delay) => timers.push({ callback, delay }) }
  });
  vm.runInContext(['parseDateKey', 'dateKey', 'occurrenceKey', 'jumpToNextEvent'].map(source).join('\n'), context);
  return { context, calls, classes, timers, target };
}

test('a visible next event receives focus and scrolls according to the motion preference', () => {
  for (const reduceMotion of [false, true]) {
    const { context, calls, classes, timers } = jumpSetup({ reduceMotion });
    context.jumpToNextEvent();
    assert.deepEqual(calls, [['scroll', reduceMotion ? 'auto' : 'smooth', 'center', 'center'], ['focus', true]]);
    assert(classes.has('next-focus'));
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 1600);
    timers[0].callback();
    assert(!classes.has('next-focus'));
  }
});

test('a next event hidden by month overflow or outside the current period opens its day before focusing', () => {
  for (const present of [false, true]) {
    const { context, calls, classes } = jumpSetup({ visible: false, present, renderOnOpen: true });
    context.jumpToNextEvent();
    assert.deepEqual(calls, [['open', '2027-01-13'], ['scroll', 'smooth', 'center', 'center'], ['focus', true]]);
    assert(classes.has('next-focus'));
  }
});

test('a jump without a next event or rendered target is harmless', () => {
  const absent = jumpSetup({ occurrence: false });
  absent.context.jumpToNextEvent();
  assert.deepEqual(absent.calls, []);
  const missing = jumpSetup({ visible: false });
  missing.context.jumpToNextEvent();
  assert.deepEqual(missing.calls, [['open', '2027-01-13']]);
  assert.equal(missing.timers.length, 0);
});
