const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { eventBounds, uniqueEvents, occupiedMinutes, buildModel } = require('../assets/dashboard-planning.js');
const now = new Date(2026, 9, 21, 16);
const event = (id, date = '2026-10-21', extra = {}) => ({ id, title: id, occurrenceDate: date, startDate: date, start: '17:00', end: '18:00', child: 'Maya', ...extra });
const ids = entries => entries.map(item => item.id);

test('Today separates finished and remaining plans using actual end time', () => {
  const input = [event('finished', undefined, { start: '14:00', end: '15:00' }), event('ongoing', undefined, { start: '15:00', end: '16:30' }), event('later'), event('cancelled', undefined, { status: 'cancelled' }), event('all-day', undefined, { allDay: true })];
  const before = JSON.stringify(input), model = buildModel(input, now);
  assert.deepEqual(ids(model.todayFinished), ['finished']);
  assert.deepEqual(ids(model.todayRemaining), ['all-day', 'ongoing', 'later']);
  assert.equal(model.todayEvents.length, 4);
  assert.equal(model.occupiedToday, 210);
  assert.equal(JSON.stringify(input), before);
});
test('important plans rank High before other deadlines while staying inside seven local dates', () => {
  const model = buildModel([event('deadline', '2026-10-22', { eventType: 'deadline' }), event('high', '2026-10-23', { importance: 'high' }), event('normal'), event('outside', '2026-10-28', { importance: 'high' }), event('cancelled', '2026-10-22', { importance: 'high', status: 'cancelled' })], now);
  assert.deepEqual(ids(model.priorities), ['high', 'deadline']);
});
test('urgent deadlines include all-day deadlines still due today and the 48-hour boundary', () => {
  const input = [event('today', undefined, { allDay: true, eventType: 'deadline' }), event('boundary', '2026-10-23', { start: '16:00', end: '17:00', eventType: 'deadline' }), event('too-late', '2026-10-23', { eventType: 'deadline' }), event('passed', undefined, { start: '15:00', end: '15:30', eventType: 'deadline' })];
  assert.deepEqual(ids(buildModel(input, now).urgent), ['today', 'boundary']);
});
test('preparation shows notes and items for upcoming or ongoing plans in the next 48 hours', () => {
  const input = [event('notes', undefined, { notes: 'Bring the form' }), event('items', '2026-10-22', { items: 'Water, shoes' }), event('blank', undefined, { items: ' ', notes: '' }), event('later', '2026-10-25', { notes: 'Later' }), event('done', undefined, { notes: 'Done', start: '14:00', end: '15:00' })];
  assert.deepEqual(ids(buildModel(input, now).prep), ['notes', 'items']);
});
test('responsible-person groups normalize case and whitespace but retain separate recurring occurrences', () => {
  const model = buildModel([event('same', undefined, { responsible: '  Alex ' }), event('same', '2026-10-22', { responsible: 'alex' }), event('unassigned'), event('holiday', undefined, { allDay: true, isBuiltInHoliday: true }), event('imported', undefined, { externalSource: 'google' })], now);
  assert.equal(model.handoffs.length, 1);
  assert.equal(model.handoffs[0].person, 'Alex');
  assert.equal(model.handoffs[0].events.length, 2);
  assert.deepEqual(ids(model.unassigned), ['unassigned']);
});
test('a multi-day trip appears once per section, remains active, and keeps its actual start/end', () => {
  const trip = event('trip', '2026-10-20', { startDate: '2026-10-20', endDate: '2026-10-24', eventType: 'trip', allDay: true, notes: 'Passports', responsible: 'Sam' });
  const model = buildModel([trip, { ...trip, occurrenceDate: '2026-10-21' }, { ...trip, occurrenceDate: '2026-10-22' }], now);
  assert.equal(model.todayRemaining.length, 1);
  assert.equal(model.prep.length, 1);
  assert.equal(model.handoffs[0].events.length, 1);
  assert.equal(model.special.length, 1);
  assert.deepEqual(eventBounds(trip), { start: new Date(2026, 9, 20).getTime(), end: new Date(2026, 9, 25).getTime() });
});
test('holidays alone do not invent family workload and expired/invalid entries are omitted', () => {
  const model = buildModel([event('holiday', '2026-10-31', { allDay: true, eventType: 'holiday', isBuiltInHoliday: true }), event('invalid', '2026-02-30'), event('cancelled', '2026-10-22', { status: 'cancelled' })], now);
  assert.equal(model.hasPlans, false);
  assert.equal(model.todayEvents.length, 0);
  assert.deepEqual(ids(model.special), ['holiday']);
  assert.equal(eventBounds(event('invalid-time', undefined, { start: '25:00' })), null);
});
test('the four-week outlook uses Monday boundaries and counts overlapping occupied time once', () => {
  const input = [event('one', '2026-10-20', { start: '09:00', end: '10:30' }), event('two', '2026-10-20', { start: '10:00', end: '11:00' }), event('next', '2026-10-26'), event('third', '2026-11-02'), event('fourth', '2026-11-09'), event('outside', '2026-11-16')];
  const model = buildModel(input, now);
  assert.deepEqual(model.weeks.map(week => week.count), [2, 1, 1, 1]);
  assert.deepEqual(model.weeks.map(week => week.minutes), [120, 60, 60, 60]);
  assert.equal(model.weeks[0].start.getDay(), 1);
  assert.equal(model.weeks[3].end.getDay(), 0);
});
test('occupied time ignores all-day plans, trips, invalid time ranges and cancellations', () => {
  assert.equal(occupiedMinutes([event('one'), event('two', undefined, { start: '17:30', end: '18:30' }), event('cancelled', undefined, { status: 'cancelled' }), event('all-day', undefined, { allDay: true }), event('trip', undefined, { eventType: 'trip' }), event('invalid', undefined, { end: '13:00' })]), 90);
});
test('deduplication keeps calendar imports distinct and never merges separate recurrence dates', () => {
  const first = event('1'), second = event('1', '2026-10-22'), imported = event('1', undefined, { externalSource: 'google' });
  assert.deepEqual(uniqueEvents([first, { ...first }, second, imported]), [first, second, imported]);
});

function browserFixture(entries, language = 'en') {
  const nodes = new Map(), created = [], queries = [], calls = [];
  function node() {
    const children = new Map();
    return { hidden: false, dataset: {}, handlers: {}, textContent: '', innerHTML: '', open: false,
      append(child) { created.push(child); }, querySelectorAll() { return []; }, contains() { return false; }, setAttribute() {}, addEventListener(type, fn) { this.handlers[type] = fn; },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); } };
  }
  function get(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  class FrozenDate extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } static now() { return now.getTime(); } }
  let scope = 'family';
  const context = vm.createContext({ Date: FrozenDate, currentLanguage: language, document: { getElementById: get, createElement: node },
    scheduleStorageKey: () => scope, escapeHtml: escape, activityTitle: item => item.title, activityCompactTitle: item => item.title,
    displayChild: item => item.child, displayIcon: () => '★', formatFullDate: date => date.toDateString(), formatShortDate: date => `${date.getMonth() + 1}/${date.getDate()}`,
    eventTimeText: item => item.allDay ? 'All day' : `${item.start}–${item.end}`, formatRelativeTime: () => 'in 2 days', findConflictPairs: () => [],
    occurrencesOnDate: (date, options) => { queries.push({ date, options }); return entries.filter(item => item.occurrenceDate === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); },
    showEventDetails: activity => calls.push(activity), window: {}, showCalendarPage() {}, setSidebarActive() {}, activateCalendarView() {}
  });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/dashboard-planning.js'), 'utf8'), context);
  return { created, queries, calls, get, context, setScope: value => { scope = value; } };
}
test('dashboard queries all family members regardless of calendar filters and escapes event content', () => {
  const fixture = browserFixture([event('x', undefined, { title: '<img src=x onerror=alert(1)>', items: '<script>secret</script>', responsible: '<b>Alex</b>', importance: 'high' })]);
  assert(fixture.queries.length >= 90);
  assert(fixture.queries.every(({ options }) => options.ignoreChildren && options.ignoreFilter && options.ignoreSearch));
  const bodies = fixture.created.filter(node => node.dataset.dashboardSection).map(node => node.querySelector('[data-plan-body]').innerHTML).join('');
  assert(bodies.includes('&lt;img')); assert(bodies.includes('&lt;script&gt;')); assert(bodies.includes('&lt;b&gt;Alex'));
  assert(!bodies.includes('<img')); assert(!bodies.includes('<script>'));
  const page = fixture.get('dashboardPage');
  const button = { dataset: { dashboardEvent: '0' }, hasAttribute: () => true };
  page.handlers.click({ target: { closest: () => button } });
  assert.equal(fixture.calls.length, 1);
  fixture.setScope('other-calendar');
  page.handlers.click({ target: { closest: () => button } });
  assert.equal(fixture.calls.length, 1, 'A stale dashboard event must not open after switching calendars');
});
test('empty dashboard shows Today and special dates while hiding empty advanced panels', () => {
  const fixture = browserFixture([]);
  const panels = fixture.created.filter(node => node.dataset.dashboardSection);
  assert.equal(panels.length, 7);
  assert.deepEqual(panels.filter(node => !node.hidden).map(node => node.dataset.dashboardSection), ['today', 'special']);
  assert.match(panels[0].querySelector('[data-plan-body]').innerHTML, /Nothing is scheduled for today/);
});
test('all new sections render with Chinese headings and descriptions', () => {
  const fixture = browserFixture([event('high', undefined, { importance: 'high', notes: 'Water' })], 'zh');
  const panels = fixture.created.filter(node => node.dataset.dashboardSection);
  assert.equal(panels.find(node => node.dataset.dashboardSection === 'today').querySelector('h2').textContent, '今天的安排');
  for (const panel of panels) assert(panel.querySelector('[data-plan-hint]').textContent.length > 0);
});
