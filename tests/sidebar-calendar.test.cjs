const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

// Exercise the actual inline calendar functions without a browser or dependencies.
const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const functionNames = [
  'getMonday', 'addDays', 'dateKey', 'nthWeekdayOfMonth', 'lastWeekdayOfMonth',
  'builtInHolidayActivities', 'parseDateKey', 'dateSerial', 'activitySpanDays', 'activityStartsOn', 'activityOccursOn', 'activitySpanPosition',
  'eventImportance', 'eventImportanceLabel', 'activityMatchesSearch', 'activityMatchesEventFilter', 'occurrencesOnDate',
  'monthOccurrences', 'formatFullDate', 'escapeHtml', 'isSameDate',
  'activityStatus', 'renderMiniCalendar', 'activateCalendarView', 'navigateMiniCalendar'
];
const functions = functionNames.map(name => {
  const start = html.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, `Missing calendar function: ${name}`);
  const end = html.indexOf('\n    }', start) + '\n    }'.length;
  return html.slice(start, end);
}).join('\n');

class Element {
  constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.handlers = {}; }
  set innerHTML(value) { this.children = []; this.html = value; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { this.children.push(child); }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  get classList() { return { add: name => { this.className += ` ${name}`; } }; }
}

function setup() {
  const elements = Object.fromEntries(['miniCalendarTitle', 'miniCalendarWeekdays', 'miniCalendarGrid', 'miniCalendarLegend'].map(id => [id, new Element()]));
  const state = { activities: [], visibleKids: new Set(['Andrew', 'Mark']), eventFilter: 'all', searchQuery: '' };
  const persisted = [];
  const labels = {
    'miniCalendar.eventOne': '1 event', 'miniCalendar.eventCount': '{count} events',
    'miniCalendar.eventLegend': 'Dots mark dates with events',
    'miniCalendar.filteredLegend': 'Showing {filter} · dots mark matching dates',
    'miniCalendar.searchLegend': 'Dots mark dates matching your filters',
    'sidebar.holidays': 'Holidays', 'sidebar.specialDays': 'Special days', 'filters.activities': 'Activities', 'filters.trips': 'Trips',
    'holiday.stPatricks': "St. Patrick's Day"
  };
  const context = vm.createContext({
    state, Date, Set, currentLanguage: 'en', FAMILY_CHILD: '__family__',
    kids: { Andrew: {}, Mark: {} },
    selectedDate: new Date(2026, 2, 17), miniCalendarMonth: new Date(2026, 2, 1),
    currentMonthStart: new Date(2026, 2, 1), currentWeekStart: new Date(2026, 2, 16), currentView: 'month',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(key => ({ key })),
    document: { getElementById: id => elements[id], createElement: () => new Element() },
    t: (key, values = {}) => (labels[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]),
    activityTitle: activity => activity.title, activityStatusLabel: activity => activity.status || 'confirmed',
    displayChild: activity => activity.child, scheduleSmartCalendarFocus: () => {},
    persistScheduleData: (key, value) => persisted.push({ key, value })
  });
  vm.runInContext(functions, context);
  context.renderAll = () => context.renderMiniCalendar();
  const add = (id, eventType, date, child = 'Andrew', extra = {}) => state.activities.push({
    id, title: id, eventType, child, startDate: date, recurrence: 'none', status: 'confirmed', ...extra
  });
  add('Soccer', 'activity', '2026-03-17');
  add('Family holiday', 'holiday', '2026-03-17', '__family__');
  add('Birthday', 'birthday', '2026-03-18', 'Mark');
  add('Music', 'activity', '2026-03-19', 'Mark');
  add('Family trip', 'trip', '2026-03-21', '__family__', { endDate: '2026-03-23', allDay: true });
  add('Cancelled holiday', 'holiday', '2026-03-20', '__family__', { status: 'cancelled' });
  add('April activity', 'activity', '2026-04-03');
  add('April holiday', 'holiday', '2026-04-04', '__family__');
  const day = date => elements.miniCalendarGrid.children.find(button => button.dataset.date === date);
  const count = date => Number.parseInt(day(date).title, 10);
  return { context, state, elements, persisted, day, count };
}

test('sidebar markers/counts update from all events to holidays only and back', () => {
  const { context, state, count, day, elements } = setup();
  context.renderMiniCalendar();
  assert.equal(count('2026-03-17'), 3);
  assert.equal(count('2026-03-18'), 1);
  state.eventFilter = 'holidays';
  context.renderMiniCalendar();
  assert.equal(count('2026-03-17'), 2); // Built-in holiday plus family holiday, not soccer.
  assert.equal(count('2026-03-18'), 0);
  assert.equal(count('2026-03-19'), 0);
  assert.equal(count('2026-03-20'), 0); // Cancelled events do not mark a date.
  assert.ok(!day('2026-03-18').className.includes('has-events'));
  assert.match(elements.miniCalendarLegend.textContent, /Showing Holidays/);
  assert.ok(context.monthOccurrences().every(event => event.eventType === 'holiday'));
  state.eventFilter = 'all';
  context.renderMiniCalendar();
  assert.equal(count('2026-03-18'), 1);
  assert.equal(elements.miniCalendarLegend.textContent, 'Dots mark dates with events');
});

test('sidebar respects activity/special-day, child and search filters', () => {
  const { context, state, count, elements } = setup();
  state.eventFilter = 'activity';
  context.renderMiniCalendar();
  assert.equal(count('2026-03-17'), 1);
  assert.equal(count('2026-03-18'), 0);
  state.eventFilter = 'trip';
  context.renderMiniCalendar();
  assert.equal(count('2026-03-21'), 1);
  assert.equal(count('2026-03-22'), 1);
  assert.equal(count('2026-03-23'), 1);
  assert.equal(count('2026-03-24'), 0);
  assert.match(elements.miniCalendarLegend.textContent, /Showing Trips/);
  assert.ok(context.monthOccurrences().every(event => event.eventType === 'trip'));
  state.visibleKids.delete('Mark');
  context.renderMiniCalendar();
  assert.equal(count('2026-03-19'), 0);
  state.eventFilter = 'important';
  state.visibleKids.add('Mark');
  context.renderMiniCalendar();
  assert.equal(count('2026-03-17'), 2);
  assert.equal(count('2026-03-18'), 1);
  assert.equal(count('2026-03-19'), 0);
  state.eventFilter = 'holidays';
  state.searchQuery = 'Patrick';
  context.renderMiniCalendar();
  assert.equal(count('2026-03-17'), 1);
  assert.match(context.monthOccurrences()[0].title, /Patrick/);
  state.searchQuery = 'Soccer';
  context.renderMiniCalendar();
  assert.equal(count('2026-03-17'), 0); // Search must never widen the category filter.
  state.eventFilter = 'all';
  context.renderMiniCalendar();
  assert.equal(count('2026-03-17'), 1);
  assert.equal(elements.miniCalendarLegend.textContent, 'Dots mark dates matching your filters');
});

test('filtered date clicks and month navigation retain selection without overwriting the saved view', () => {
  const { context, state, count, day, persisted } = setup();
  state.eventFilter = 'holidays';
  context.renderMiniCalendar();
  day('2026-03-17').handlers.click();
  assert.equal(context.currentView, 'today');
  assert.equal(state.eventFilter, 'holidays');
  assert.equal(context.dateKey(context.selectedDate), '2026-03-17');
  assert.equal(persisted.length, 0);
  assert.ok(context.occurrencesOnDate(context.selectedDate).every(event => event.eventType === 'holiday'));
  context.navigateMiniCalendar(1);
  assert.equal(state.eventFilter, 'holidays');
  assert.equal(count('2026-04-03'), 0);
  assert.equal(count('2026-04-04'), 1);
  day('2026-04-04').handlers.click();
  assert.equal(context.dateKey(context.selectedDate), '2026-04-04');
  assert.equal(persisted.length, 0);
});

test('normal date navigation keeps the chosen view and counts only the active calendar data', () => {
  const { context, state, count, day, persisted } = setup();
  context.renderMiniCalendar();
  day('2026-03-19').handlers.click();
  assert.equal(context.currentView, 'month');
  assert.equal(persisted[0].value, 'month');
  state.activities = []; // Switching to a different empty calendar must remove old markers.
  context.renderMiniCalendar();
  assert.equal(count('2026-03-19'), 0);
  assert.equal(count('2026-03-17'), 1); // Built-in holiday is still available.
});
