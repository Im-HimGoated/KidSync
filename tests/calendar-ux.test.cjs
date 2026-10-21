const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { parseDay, clock, preferencesFor, filterOccurrences, dayLoad, eventEnd, cursorStep, NavigationHistory } = require('../assets/calendar-ux.js');
const timed = (start, end, extra = {}) => ({ start, end, ...extra });

test('daily occupied time counts overlapping and adjacent intervals once without changing events', () => {
  const events = [timed('11:00', '12:00'), timed('09:00', '11:30'), timed('12:00', '12:30'), timed('15:00', '15:45')];
  const before = JSON.stringify(events);
  assert.deepEqual(dayLoad(events), { minutes: 255, untimed: 0 });
  assert.equal(JSON.stringify(events), before);
});
test('cancelled events never inflate daily load, and untimed plans stay separate', () => {
  assert.deepEqual(dayLoad([
    timed('09:00', '10:00', { status: 'cancelled' }), timed('10:00', '11:00'),
    timed('00:00', '23:59', { allDay: true }), { eventType: 'trip' }, { eventType: 'holiday' },
    timed('24:00', '25:00'), timed('12:00', '11:00')
  ]), { minutes: 60, untimed: 5 });
  assert.deepEqual(dayLoad([]), { minutes: 0, untimed: 0 });
});
test('display filtering preserves event data and rejects non-boolean stored preferences', () => {
  const events = Object.freeze([Object.freeze({ id: '1', status: 'cancelled' }), Object.freeze({ id: '2', status: 'confirmed' }), Object.freeze({ id: '3' })]);
  assert.equal(filterOccurrences(events, preferencesFor(null)), events);
  assert.deepEqual(filterOccurrences(events, { hideCancelled: true }).map(event => event.id), ['2', '3']);
  assert.deepEqual(preferencesFor({ dimFinished: 'true', hideCancelled: 1 }), { dimFinished: false, hideCancelled: false });
  assert.deepEqual(preferencesFor({ dimFinished: true, hideCancelled: true }), { dimFinished: true, hideCancelled: true });
  assert.equal(events.length, 3);
});
test('finished styling uses each recurrence date and the exclusive end of all-day and trip plans', () => {
  assert.equal(eventEnd({ startDate: '2026-10-01', occurrenceDate: '2026-10-21', end: '14:30' }), new Date(2026, 9, 21, 14, 30).getTime());
  assert.equal(eventEnd({ occurrenceDate: '2026-10-21', allDay: true }), new Date(2026, 9, 22).getTime());
  assert.equal(eventEnd({ startDate: '2026-10-21', endDate: '2026-10-24', eventType: 'trip' }), new Date(2026, 9, 25).getTime());
  assert.equal(eventEnd({ startDate: '2026-11-01', eventType: 'holiday' }), new Date(2026, 10, 2).getTime());
  assert.equal(eventEnd({ occurrenceDate: '2026-02-30', end: '12:00' }), null);
  assert.equal(eventEnd({ occurrenceDate: '2026-10-21', end: '24:00' }), null);
  assert.equal(parseDay('2026-02-29'), null);
  assert.equal(clock('9:00'), null);
});
test('recent navigation traverses dates and views, branches after Back, and resets across calendars', () => {
  const history = new NavigationHistory();
  const first = { date: '2026-10-21', view: 'week' };
  history.record('family', first); first.date = '2026-01-01';
  history.record('family', { date: '2026-10-28', view: 'week' });
  history.record('family', { date: '2026-10-28', view: 'today' });
  assert.deepEqual(history.move(-1), { date: '2026-10-28', view: 'week' });
  assert.deepEqual(history.move(-1), { date: '2026-10-21', view: 'week' });
  assert.equal(history.move(-1), null);
  const next = history.move(1); next.date = '2026-01-01';
  assert.equal(history.items[history.index].date, '2026-10-28');
  history.record('family', { date: '2026-11-02', view: 'month' });
  assert.equal(history.move(1), null);
  assert.equal(history.items.length, 3);
  history.record('work', { date: '2026-10-21', view: 'four' });
  assert.equal(history.items.length, 1);
  assert.equal(history.move(-1), null);
  history.record('work', { date: '2026-10-32', view: 'today' });
  assert.equal(history.items.length, 1);
});
test('navigation skips duplicate rerenders and limits history to twenty visits', () => {
  const history = new NavigationHistory();
  for (let n = 1; n <= 28; n++) {
    const frame = { date: `2026-10-${String(n).padStart(2, '0')}`, view: 'week' };
    history.record('family', frame); history.record('family', frame);
  }
  assert.equal(history.items.length, 20);
  assert.equal(history.items[0].date, '2026-10-09');
  assert.equal(history.index, 19);
});
test('keyboard slots move by fifteen minutes or one hour and stay inside visible days and hours', () => {
  const days = ['2026-10-21', '2026-10-22'];
  const start = Object.freeze({ date: days[0], minute: 540 });
  assert.deepEqual(cursorStep(start, days, 'ArrowDown'), { date: days[0], minute: 555 });
  assert.deepEqual(cursorStep(start, days, 'PageDown'), { date: days[0], minute: 600 });
  assert.deepEqual(cursorStep(start, days, 'ArrowRight'), { date: days[1], minute: 540 });
  assert.deepEqual(cursorStep(start, days, 'ArrowLeft'), start);
  assert.deepEqual(cursorStep(start, days, 'Home', 480, 1080), { date: days[0], minute: 480 });
  assert.deepEqual(cursorStep(start, days, 'End', 480, 1080), { date: days[0], minute: 1065 });
  assert.deepEqual(cursorStep({ date: days[1], minute: 1425 }, days, 'ArrowDown'), { date: days[1], minute: 1425 });
  assert.deepEqual(cursorStep({ date: 'missing', minute: NaN }, days, 'Home'), { date: days[0], minute: 0 });
  assert.equal(cursorStep(start, [], 'ArrowDown'), null);
});

function browserFixture({ failStorage = false } = {}) {
  const nodes = new Map(), stored = new Map(), listeners = new Map();
  let calendar = 'family', renders = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { dataset: {}, checked: false, textContent: '', classList: { toggle() {} },
      handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, setAttribute() {}, getAttribute() { return ''; },
      after() {}, before() {}, append() {}, querySelectorAll() { return []; } });
    return nodes.get(id);
  };
  const window = { addEventListener: (type, fn) => listeners.set(type, fn) };
  const document = { getElementById: node, querySelector: node, createElement: tag => node(`created-${nodes.size}-${tag}`), body: node('body') };
  const context = vm.createContext({ window, document, currentLanguage: 'en', scheduleStorageKey: key => `${calendar}:${key}`,
    localStorage: { getItem: key => stored.get(key) || null, setItem(key, value) { if (failStorage) throw Error('unavailable'); stored.set(key, value); } },
    renderAll: () => renders++, Date });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/calendar-ux.js'), 'utf8'), context);
  const api = window.KidsSyncCalendarUX;
  function set(id, checked) { const target = node(id); target.checked = checked; target.handlers.change({ currentTarget: target }); }
  return { api, stored, node, set, listeners, setCalendar: value => { calendar = value; }, renderCount: () => renders };
}
test('display choices persist independently per calendar and survive a new session', () => {
  const fixture = browserFixture();
  fixture.set('calendarHideCancelled', true);
  fixture.set('calendarDimFinished', true);
  assert.deepEqual(JSON.parse(fixture.stored.get('family:calendar-ux-v1')), { dimFinished: true, hideCancelled: true });
  assert.equal(fixture.api.filterOccurrences([{ status: 'cancelled' }]).length, 0);
  fixture.setCalendar('work');
  assert.equal(fixture.api.filterOccurrences([{ status: 'cancelled' }]).length, 1);
  fixture.setCalendar('family');
  assert.equal(fixture.api.filterOccurrences([{ status: 'cancelled' }]).length, 0);
  fixture.api.resetHiddenFilter();
  assert.deepEqual(JSON.parse(fixture.stored.get('family:calendar-ux-v1')), { dimFinished: true, hideCancelled: false });
  assert.equal(fixture.api.hasHiddenFilter(), false);
});
test('blocked device storage keeps display choices for the session and reports that accurately', () => {
  const fixture = browserFixture({ failStorage: true });
  fixture.set('calendarHideCancelled', true);
  assert.equal(fixture.api.filterOccurrences([{ status: 'cancelled' }]).length, 0);
  assert.match(fixture.node('calendarUXStatus').textContent, /session only/);
  assert.equal(fixture.stored.size, 0);
  assert.equal(fixture.renderCount(), 2);
});
test('cross-tab preference updates apply without rewriting stored events', () => {
  const fixture = browserFixture();
  fixture.api.filterOccurrences([]);
  fixture.listeners.get('storage')({ key: 'family:calendar-ux-v1', newValue: '{"hideCancelled":true}' });
  assert.equal(fixture.api.hasHiddenFilter(), true);
  fixture.listeners.get('storage')({ key: 'work:calendar-ux-v1', newValue: null });
  assert.equal(fixture.api.hasHiddenFilter(), true);
  fixture.listeners.get('storage')({ key: 'family:calendar-ux-v1', newValue: null });
  assert.equal(fixture.api.hasHiddenFilter(), false);
  const activity = Object.freeze({ occurrenceDate: '2026-10-21', end: '13:00' }), element = { dataset: {} };
  fixture.api.decorateEvent(element, activity);
  assert.equal(Number(element.dataset.calendarEnd), new Date(2026, 9, 21, 13).getTime());
  assert.equal(activity.end, '13:00');
});

function productionFunction(name) {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const start = html.indexOf(`    function ${name}(`);
  assert(start >= 0);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}
test('calendar occurrence queries hide cancelled plans uniformly without changing stored events', () => {
  const activities = Object.freeze([Object.freeze({ id: 'cancelled', child: 'Family', status: 'cancelled' }), Object.freeze({ id: 'confirmed', child: 'Family' })]);
  const context = vm.createContext({ state: { activities, visibleKids: new Set() }, FAMILY_CHILD: 'Family',
    days: Array.from({ length: 7 }, () => ({ key: 'day' })), activityMatchesSearch: () => true,
    activityMatchesEventFilter: () => true, activityOccursOn: () => true, dateKey: () => '2026-10-21', activitySpanPosition: () => 'single',
    builtInHolidayActivities: () => [{ id: 'holiday', eventType: 'holiday' }],
    window: { KidsSyncCalendarUX: { filterOccurrences: events => filterOccurrences(events, { hideCancelled: true }) },
      KidsSyncExternal: { eventsOn: () => [{ id: 'imported-cancelled', status: 'cancelled' }, { id: 'imported' }] } }
  });
  vm.runInContext(productionFunction('occurrencesOnDate'), context);
  assert.deepEqual(Array.from(context.occurrencesOnDate(new Date(2026, 9, 21)), event => event.id), ['confirmed', 'holiday', 'imported']);
  assert.equal(activities.length, 2);
  assert.equal(activities[0].status, 'cancelled');
});
test('Clear filters clears the cancelled preference along with search, children and categories', () => {
  let resets = 0, renders = 0;
  const context = vm.createContext({ window: { KidsSyncCalendarUX: { resetHiddenFilter() { resets++; } } },
    state: { searchQuery: 'soccer', eventFilter: 'important', visibleKids: new Set(), showWeekends: true },
    kidProfiles: [{ name: 'Maya' }], currentView: 'week', scheduleSearch: { value: 'soccer', focus() {} },
    conflictCursor: 2, travelCursor: 3, setSidebarActive() {}, renderAll: () => renders++, scheduleSmartCalendarFocus() {},
    document: { getElementById: () => ({ open: false, focus() {} }) }, hiddenWorkspacePanels: new Set()
  });
  vm.runInContext(productionFunction('resetScheduleFilters'), context);
  context.resetScheduleFilters();
  assert.equal(resets, 1); assert.equal(renders, 1);
  assert.equal(context.state.searchQuery, ''); assert.equal(context.state.eventFilter, 'all');
  assert.deepEqual(Array.from(context.state.visibleKids), ['Maya']);
});
