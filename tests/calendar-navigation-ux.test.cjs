const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}
const addDays = (date, offset) => { const result = new Date(date); result.setDate(result.getDate() + offset); return result; };
const getMonday = date => addDays(date, -((date.getDay() + 6) % 7));
const key = date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

function navigation() {
  const calls = [];
  const context = vm.createContext({
    selectedDate: new Date(2027, 0, 29), currentView: 'week', currentWeekStart: new Date(2027, 0, 25),
    currentMonthStart: new Date(2027, 0, 1), miniCalendarMonth: new Date(2027, 0, 1), addDays, getMonday,
    calendarPeriodStart: () => context.selectedDate,
    persistScheduleData: (...args) => calls.push(args), renderAll: () => calls.push('render'),
    scheduleSmartCalendarFocus: () => calls.push('focus-time'), showCalendarPage: () => calls.push('calendar'),
    todayHeading: { focus: () => calls.push('focus-heading') }
  });
  vm.runInContext(source('activateCalendarView') + source('openCalendarDay') + source('navigateCalendar'), context);
  return { context, calls };
}

test('switching Day, Week, and Month preserves the browsed date', () => {
  const { context, calls } = navigation();
  for (const view of ['today', 'month', 'week', 'four']) {
    context.activateCalendarView(view);
    assert.equal(key(context.selectedDate), '2027-1-29');
    assert.equal(context.currentView, view);
  }
  assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'view').length, 4);
});

test('date drilldown focuses the selected day without overwriting the saved view', () => {
  const { context, calls } = navigation();
  const date = new Date(2027, 4, 16);
  context.openCalendarDay(date);
  assert.equal(key(context.selectedDate), '2027-5-16');
  assert.equal(context.currentView, 'today');
  assert.equal(key(context.currentWeekStart), '2027-5-10');
  assert.equal(key(context.currentMonthStart), '2027-5-1');
  assert.equal(key(context.miniCalendarMonth), '2027-5-1');
  assert(calls.includes('focus-heading'));
  assert(!calls.some(Array.isArray), 'Date drilldown must not save a new preferred view');
  assert.notEqual(context.selectedDate, date, 'Navigation owns a copy of the date');
});

test('period arrows retain the weekday and clamp month dates without rolling over', () => {
  const { context } = navigation();
  context.navigateCalendar(1);
  assert.equal(key(context.selectedDate), '2027-2-5');
  assert.equal(context.selectedDate.getDay(), 5);
  assert.equal(key(context.currentWeekStart), '2027-2-1');
  context.selectedDate = new Date(2027, 0, 31);
  context.currentView = 'month';
  context.currentMonthStart = new Date(2027, 0, 1);
  context.navigateCalendar(1);
  assert.equal(key(context.selectedDate), '2027-2-28');
  assert.equal(key(context.currentMonthStart), '2027-2-1');
});

function element() {
  return { children: [], handlers: {}, attributes: {}, style: { setProperty() {} },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; }
  };
}

test('month date opens its agenda while its separate add action creates on that exact date', () => {
  const monthGrid = element(), calls = [];
  const context = vm.createContext({
    monthGrid, monthWeekdays: {}, currentMonthStart: new Date(2027, 1, 1), selectedDate: new Date(2027, 1, 14),
    currentLanguage: 'en', days: Array.from({ length: 7 }, (_, index) => ({ key: index })),
    dayLabel: day => String(day.key), addDays, occurrencesOnDate: () => [], findConflicts: () => new Set(), compareCalendarEntries: () => 0,
    isSameDate: (a, b) => key(a) === key(b), formatFullDate: key, escapeHtml: String,
    t: (label, args) => `${label}:${args?.date || ''}`, document: { createElement: element },
    preferredNewEventChild: () => 'Sam', openCalendarDay: date => calls.push(['open', key(date)]),
    openNewEventForDate: (date, child) => calls.push(['add', key(date), child])
  });
  vm.runInContext(source('renderMonth'), context);
  context.renderMonth();
  const cell = monthGrid.children[13]; // Sunday, February 14.
  assert(cell.className.includes('is-selected'));
  const [dateButton, addButton] = cell.children;
  dateButton.handlers.click();
  assert.deepEqual(calls, [['open', '2027-2-14']]);
  addButton.handlers.click();
  assert.deepEqual(calls[1], ['add', '2027-2-14', 'Sam']);
  assert.match(addButton.attributes['aria-label'], /2027-2-14/);
});

test('empty filtered views recognize hidden children and Clear filters restores the whole view', () => {
  const activities = [{ id: 'preserved' }], calls = [], shell = { classList: { toggle() {} } };
  const context = vm.createContext({
    state: { searchQuery: '', eventFilter: 'all', visibleKids: new Set(['Sam']), showWeekends: false, activities },
    kidProfiles: [{ name: 'Sam' }, { name: 'Alex' }], currentView: 'week', userSettings: { showWeekends: false },
    calendarInsightActivities: () => [], searchEmptyState: {}, scheduleSearch: { value: '' },
    conflictCursor: 2, travelCursor: 1, saveSettings: () => calls.push('save'),
    setSidebarActive: () => {}, renderAll: () => {}, scheduleSmartCalendarFocus: () => {},
    document: { getElementById: id => id === 'appShell' ? shell : id === 'plannerOptions' ? { open: false } : { focus() {} } }
  });
  vm.runInContext(source('renderSearchEmptyState') + source('resetScheduleFilters'), context);
  context.renderSearchEmptyState();
  assert.equal(context.searchEmptyState.hidden, false);
  context.resetScheduleFilters();
  assert.equal(context.state.visibleKids.size, 2);
  assert.equal(context.state.showWeekends, true);
  assert.equal(context.userSettings.showWeekends, true);
  assert.equal(context.state.activities, activities);
  assert.equal(context.conflictCursor, 0);
  assert(calls.includes('save'));
  context.renderSearchEmptyState();
  assert.equal(context.searchEmptyState.hidden, true);
});
