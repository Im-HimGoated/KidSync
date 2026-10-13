const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
function productionFunction(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, `Missing production function: ${name}`);
  const end = html.indexOf('\n    }', start) + '\n    }'.length;
  return html.slice(start, end);
}
const layoutFunctions = ['minutes', 'eventImportance', 'importanceRank', 'compareEventImportance', 'buildOverlapGroups', 'layoutOverlapGroup'].map(productionFunction).join('\n');
function setup(extra = {}) {
  const context = vm.createContext({ ...extra });
  vm.runInContext(layoutFunctions, context);
  return context;
}
function event(id, start, end, importance = 'normal') {
  return { id, title: id, start, end, importance };
}
function resultById(layout) {
  return Object.fromEntries(Array.from(layout.items, item => [item.activity.id, item]));
}
function assertNoCollisions(layout) {
  for (const first of layout.items) {
    assert.ok(first.lane >= 0 && first.lane < layout.laneCount);
    assert.ok(first.laneSpan >= 1 && first.lane + first.laneSpan <= layout.laneCount);
    for (const second of layout.items) {
      if (first === second || first.start >= second.end || second.start >= first.end) continue;
      assert.ok(first.lane + first.laneSpan <= second.lane || second.lane + second.laneSpan <= first.lane,
        `${first.activity.id} collides with ${second.activity.id}`);
    }
  }
}

test('overlapping high, normal, low stay left-to-right by importance with consistent z-order', () => {
  const c = setup();
  const input = [event('low', '08:00', '12:00', 'low'), event('normal', '08:30', '11:00'), event('high', '09:00', '10:00', 'high')];
  const layout = c.layoutOverlapGroup(input);
  const items = resultById(layout);
  assert.equal(layout.laneCount, 3);
  assert.deepEqual(Array.from(layout.items, item => item.activity.id), ['high', 'normal', 'low']);
  assert.equal(items.high.lane, 0);
  assert.equal(items.normal.lane, 1);
  assert.equal(items.low.lane, 2);
  assert.ok(items.high.zIndex > items.normal.zIndex && items.normal.zIndex > items.low.zIndex);
  assert.ok(items.high.zIndex < 45, 'Cards remain below the current-time marker and pinned headers');
  assertNoCollisions(layout);
});

test('connected overlap chains form one group and pack without collisions', () => {
  const c = setup();
  const input = [event('third', '10:00', '12:00', 'low'), event('first', '08:00', '09:30', 'high'), event('bridge', '09:00', '10:30')];
  const groups = c.buildOverlapGroups(input);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 3);
  const layout = c.layoutOverlapGroup(groups[0]);
  const items = resultById(layout);
  assert.ok(items.first.lane < items.bridge.lane && items.bridge.lane < items.third.lane);
  assertNoCollisions(layout);
});

test('adjacent intervals are separate groups and can reuse a lane', () => {
  const c = setup();
  const first = event('before', '08:00', '09:00');
  const second = event('after', '09:00', '10:00');
  assert.equal(c.buildOverlapGroups([second, first]).length, 2);
  const layout = c.layoutOverlapGroup([second, first]);
  assert.equal(layout.laneCount, 1);
  assertNoCollisions(layout);
});

test('priority-first assignment reuses earlier free time rather than relying on chronological lane ends', () => {
  const c = setup();
  const input = [event('priority-later', '10:00', '11:00', 'high'), event('earlier', '08:00', '09:00'), event('bridge', '08:30', '10:30', 'low')];
  const layout = c.layoutOverlapGroup(input);
  const items = resultById(layout);
  assert.equal(items['priority-later'].lane, items.earlier.lane);
  assert.equal(layout.laneCount, 2);
  assertNoCollisions(layout);
});

test('same-start events have deterministic order independent of input order', () => {
  const c = setup();
  const input = [event('c', '09:00', '10:00'), event('a', '09:00', '11:00'), event('b', '09:00', '10:00')];
  const positions = values => Array.from(c.layoutOverlapGroup(values).items, item => [item.activity.id, item.lane, item.laneSpan]);
  assert.deepEqual(positions(input), positions([...input].reverse()));
  assert.deepEqual(positions(input).map(item => item[0]), ['a', 'b', 'c']);
});

test('cards expand into consecutive right lanes only when those time intervals are free', () => {
  const c = setup();
  const layout = c.layoutOverlapGroup([
    event('long', '08:00', '10:00'), event('early-a', '08:00', '09:00'), event('early-b', '08:00', '09:00'), event('later', '09:00', '10:00')
  ]);
  assert.equal(layout.laneCount, 3);
  assert.equal(resultById(layout).later.laneSpan, 2);
  assertNoCollisions(layout);
});

test('grouping retains duplicate IDs, handles empty input, and never mutates source objects or arrays', () => {
  const c = setup();
  const input = Object.freeze([
    Object.freeze(event('duplicate', '09:00', '10:00', 'low')),
    Object.freeze(event('duplicate', '09:30', '10:30', 'high')),
    Object.freeze(event('after', '11:00', '12:00'))
  ]);
  const before = JSON.stringify(input);
  const groups = c.buildOverlapGroups(input);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 2);
  groups.forEach(group => assertNoCollisions(c.layoutOverlapGroup(group)));
  assert.equal(JSON.stringify(input), before);
  assert.equal(c.buildOverlapGroups([]).length, 0);
  assert.equal(c.layoutOverlapGroup([]).laneCount, 0);
});

test('short imported events are packed against their minimum rendered footprint', () => {
  const c = setup();
  const groups = c.buildOverlapGroups([event('short', '08:00', '08:05'), event('next', '08:05', '08:20')]);
  assert.equal(groups.length, 1);
  const layout = c.layoutOverlapGroup(groups[0]);
  assert.equal(layout.laneCount, 2);
  assert.equal(resultById(layout).short.end, 8 * 60 + 15);
  assertNoCollisions(layout);
});

test('deterministic varied intervals never collide or reverse priority across an overlap', () => {
  const c = setup();
  let seed = 19;
  const random = limit => { seed = (seed * 48271) % 2147483647; return seed % limit; };
  const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  for (let batch = 0; batch < 50; batch++) {
    const input = Array.from({ length: 20 }, (_, index) => {
      const start = 7 * 60 + random(40) * 15;
      return event(`${batch}-${index}`, clock(start), clock(start + (1 + random(10)) * 15), ['low', 'normal', 'high'][random(3)]);
    });
    for (const group of c.buildOverlapGroups(input)) {
      const layout = c.layoutOverlapGroup(group);
      assertNoCollisions(layout);
      for (const first of layout.items) for (const second of layout.items) {
        if (first.start < second.end && second.start < first.end && c.importanceRank(first.activity) > c.importanceRank(second.activity)) assert.ok(first.lane < second.lane);
      }
    }
  }
});

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.handlers = {}; this.className = ''; this.style = { setProperty: (name, value) => { this.style[name] = value; } }; }
  set innerHTML(value) { this.html = value; this.children = []; this.onInnerHTML?.(); }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  get classList() { return { toggle: () => {} }; }
}

function renderHarness() {
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [2026, 9, 13, 9, 30])); }
    static now() { return new FrozenDate().getTime(); }
  }
  const days = ['monday', 'tuesday'].map(key => ({ key, theme: 'blue', weather: '' }));
  const timed = [event('low', '09:00', '10:00', 'low'), event('high', '09:00', '10:00', 'high'), event('normal', '09:00', '10:00')].map(activity => ({ ...activity, day: 'tuesday' }));
  const allDay = ['low', 'normal', 'high'].map(importance => ({ id: `all-${importance}`, title: `All ${importance}`, importance, allDay: true, day: 'tuesday' }));
  const activities = [...timed, ...allDay];
  const grid = new Element('div');
  const hooks = { draggable: [], bind: [], drop: [], now: 0 };
  const c = setup({
    Date: FrozenDate, grid, state: { showWeekends: true }, userSettings: { calendarZoom: 1 },
    scheduleStartMinutes: 0, scheduleEndMinutes: 1440, scheduleDurationMinutes: 1440,
    visibleActivities: () => activities, visibleWeekDays: () => days,
    findConflicts: () => new Set(['high']),
    document: { createElement: tag => new Element(tag) },
    calendarDateForDay: day => new FrozenDate(2026, 9, day.key === 'monday' ? 12 : 13),
    isSameDate: (first, second) => first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate(),
    t: (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => values[name]),
    escapeHtml: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])),
    localTimeZoneLabel: () => 'GMT-07', dayLabel: day => day.key, formatTimeLabel: value => String(value), formatShortDate: date => String(date.getDate()), formatFullDate: date => date.toDateString(),
    setupDropTarget: (element, date, allDay) => hooks.drop.push({ element, date, allDay }),
    setupDraggableEvent: (element, activity) => hooks.draggable.push({ element, activity }),
    bindCalendarEventActions: (element, activity, suppressDraggedClick) => hooks.bind.push({ element, activity, suppressDraggedClick }),
    eventColors: () => ({ soft: '#eef6ff', line: '#4c7892', ink: '#17223b' }),
    occurrenceKey: activity => activity.id, displayIcon: () => '★', activityCompactTitle: activity => activity.title, activityTitle: activity => activity.title, displayChild: () => 'Family',
    eventTimeText: activity => activity.allDay ? 'All day' : `${activity.start} - ${activity.end}`,
    eventCardMarkup: activity => `<span class="event-title">${activity.title}</span>`,
    updateCurrentTimeMarkers: () => hooks.now++, suppressEventClickUntil: 0,
    preferredNewEventChild: () => 'Family', openNewEventForDate: () => {}, openNewEventAtTime: () => {}
  });
  vm.runInContext(['eventImportanceLabel', 'eventImportanceBadge', 'isHolidayActivity', 'renderGrid'].map(productionFunction).join('\n'), c);
  return { c, grid, hooks, timed, activities, days };
}

test('renderGrid preserves time geometry, action hooks, metadata, all-day priority, and compact day widths', () => {
  const { c, grid, hooks, timed } = renderHarness();
  c.renderGrid();
  const column = grid.children.find(element => element.className === 'day-column is-today');
  const cards = column.children.filter(element => element.className.split(' ').includes('event'));
  assert.equal(cards.length, 3);
  assert.equal(grid.style.gridTemplateColumns, '64px repeat(2, minmax(150px, 1fr))');
  assert.equal(grid.style['--week-day-count'], '2');
  for (const card of cards) {
    assert.equal(card.style.top, '37.5%');
    assert.equal(card.style.height, '120px');
    assert.ok(card.style.left.includes('calc(') && card.style.right.includes('calc('));
    assert.equal(card.dataset.importance, timed.find(activity => activity.id === card.dataset.occurrenceKey).importance);
    assert.equal(card.style['--overlap-count'], '3');
    assert.ok(Number(card.style['--event-z']) < 45);
    assert.ok(card.attributes['aria-label'].includes(`importance.${card.dataset.importance}`));
  }
  assert.ok(cards.find(card => card.dataset.occurrenceKey === 'high').className.includes('conflict'));
  const allDayCell = grid.children.find(element => element.className === 'all-day-cell is-today');
  assert.deepEqual(allDayCell.children.map(element => element.dataset.importance), ['high', 'normal', 'low']);
  assert.match(allDayCell.children[0].html, /class="[^"]*event-importance-badge[^"]*is-high"/);
  assert.ok(!allDayCell.children[1].html.includes('event-importance-badge'));
  assert.equal(hooks.draggable.length, 6);
  assert.equal(hooks.bind.length, 6);
  assert.ok(hooks.bind.every(hook => hook.suppressDraggedClick));
  assert.equal(hooks.drop.length, 4);
  assert.ok(column.handlers.click);
  assert.ok(grid.children.filter(element => element.className.startsWith('day-head')).every(element => element.handlers.keydown));
  assert.ok(column.children.some(element => element.dataset.currentTimeMarker === ''));
  assert.equal(hooks.now, 1);
});

test('renderGrid restores both scroll axes after grid clearing temporarily collapses the viewport', () => {
  const { c, grid } = renderHarness();
  const scroller = { scrollTop: 1136, scrollLeft: 144 };
  grid.closest = selector => { assert.equal(selector, '.schedule-shell'); return scroller; };
  let cleared = 0;
  grid.onInnerHTML = () => { cleared += 1; scroller.scrollTop = 0; scroller.scrollLeft = 0; };
  c.updateCurrentTimeMarkers = () => {
    assert.equal(scroller.scrollTop, 0, 'Restoration follows marker updates and complete grid rebuilding');
    assert.equal(scroller.scrollLeft, 0);
  };
  c.renderGrid();
  assert.equal(cleared, 1);
  assert.equal(scroller.scrollTop, 1136);
  assert.equal(scroller.scrollLeft, 144);
});

test('holiday classification includes built-ins and legacy timed holidays without reclassifying birthdays', () => {
  const { c } = renderHarness();
  assert.equal(c.isHolidayActivity({ isBuiltInHoliday: true }), true);
  assert.equal(c.isHolidayActivity({ eventType: 'holiday', allDay: false }), true);
  assert.equal(c.isHolidayActivity({ eventType: 'holiday', allDay: true }), true);
  assert.equal(c.isHolidayActivity({ eventType: 'birthday', allDay: true }), false);
  assert.equal(c.isHolidayActivity({ eventType: 'activity', allDay: true }), false);
  assert.equal(c.isHolidayActivity(null), false);
});

test('holiday band follows dates, precedes all-day/hour rows, and renders each holiday only once', () => {
  const { c, grid, hooks, activities } = renderHarness();
  const holidays = [
    { id: 'built-in', title: 'Zulu Day', isBuiltInHoliday: true, allDay: true, day: 'tuesday' },
    { ...event('legacy-timed', '01:00', '02:00', 'high'), title: 'Beta Day', eventType: 'holiday', allDay: false, day: 'tuesday' },
    { id: 'alpha', title: 'Alpha Day', eventType: 'holiday', importance: 'high', allDay: true, day: 'tuesday' },
    { id: 'gamma', title: 'Gamma Day', eventType: 'holiday', allDay: true, day: 'tuesday' },
    { id: 'low-holiday', title: 'Aardvark Day', eventType: 'holiday', importance: 'low', allDay: true, day: 'tuesday' }
  ].map(Object.freeze);
  const input = Object.freeze([...activities, ...holidays]);
  const before = JSON.stringify(input);
  c.visibleActivities = () => input;
  c.bindCalendarEventActions = (element, activity, suppressDraggedClick) => {
    element.setAttribute('aria-label', `Bound event ${activity.start || 'All day'}`);
    hooks.bind.push({ element, activity, suppressDraggedClick });
  };
  c.renderGrid();
  const holidayHeadIndex = grid.children.findIndex(element => element.className === 'holiday-head');
  const allDayHeadIndex = grid.children.findIndex(element => element.className === 'all-day-head');
  const timeColumnIndex = grid.children.findIndex(element => element.className === 'time-column');
  assert.equal(holidayHeadIndex, 3, 'One gutter and two date headers come first');
  assert.ok(holidayHeadIndex < allDayHeadIndex && allDayHeadIndex < timeColumnIndex);
  const cells = grid.children.filter(element => element.className.split(' ').includes('holiday-cell'));
  assert.equal(cells.length, 2, 'Empty date cells retain column alignment');
  assert.equal(cells[0].children.length, 0);
  assert.deepEqual(cells[1].children.map(element => element.dataset.occurrenceKey), ['alpha', 'legacy-timed', 'gamma', 'built-in', 'low-holiday']);
  assert.ok(cells.every(element => element.dataset.holidayDrop === 'true'));
  const cards = grid.children.flatMap(element => element.children).filter(element => element.dataset.occurrenceKey);
  for (const holiday of holidays) {
    const found = cards.filter(element => element.dataset.occurrenceKey === holiday.id);
    assert.equal(found.length, 1, holiday.id);
    assert.ok(found[0].className.split(' ').includes('holiday-event'));
    assert.ok(found[0].className.split(' ').includes('all-day-event'));
    assert.ok(found[0].attributes['aria-label'].includes('sidebar.holidays'));
    assert.ok(!found[0].attributes['aria-label'].includes('01:00'), 'The top band does not invent an hourly label');
  }
  const timelineCards = cards.filter(element => element.className.split(' ').includes('event'));
  assert.equal(timelineCards.length, 3, 'Existing non-holiday timed events are unchanged');
  const allDayCards = grid.children.filter(element => element.className.startsWith('all-day-cell')).flatMap(element => element.children);
  assert.equal(allDayCards.length, 3, 'Existing non-holiday all-day events are unchanged');
  assert.ok(!hooks.draggable.some(hook => hook.activity.id === 'built-in'));
  assert.ok(hooks.draggable.some(hook => hook.activity.id === 'legacy-timed'));
  assert.equal(hooks.bind.find(hook => hook.activity.id === 'legacy-timed').activity, holidays[1], 'Peek/details receive the original timed object');
  assert.equal(holidays[1].start, '01:00');
  assert.equal(holidays[1].allDay, false);
  assert.equal(JSON.stringify(input), before);
});

test('no holiday band is added to periods without visible holidays, including hidden weekdays', () => {
  const { c, grid, activities } = renderHarness();
  c.renderGrid();
  assert.ok(!grid.children.some(element => element.className === 'holiday-head'));
  c.visibleActivities = () => [...activities, { id: 'hidden-sunday', title: 'Sunday holiday', eventType: 'holiday', allDay: true, day: 'sunday' }];
  c.renderGrid();
  assert.ok(!grid.children.some(element => element.className === 'holiday-head'));
});

test('holiday band respects upstream filters instead of pulling hidden stored holidays', () => {
  const { c, grid, activities } = renderHarness();
  const first = { id: 'selected-holiday', title: 'Selected', eventType: 'holiday', allDay: true, day: 'tuesday' };
  const filteredOut = { id: 'filtered-holiday', title: 'Hidden', eventType: 'holiday', allDay: true, day: 'tuesday' };
  c.state.activities = [...activities, first, filteredOut];
  c.visibleActivities = () => [first];
  c.renderGrid();
  const cards = grid.children.flatMap(element => element.children).filter(element => element.dataset.occurrenceKey);
  assert.deepEqual(cards.map(element => element.dataset.occurrenceKey), ['selected-holiday']);
  c.visibleActivities = () => [];
  c.renderGrid();
  assert.ok(!grid.children.some(element => element.className === 'holiday-head'));
});
