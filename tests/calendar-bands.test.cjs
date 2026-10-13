const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  return html.slice(start, html.indexOf('\n    }', start) + '\n    }'.length);
}
function context(values, names) {
  const ctx = vm.createContext(values);
  names.forEach(name => vm.runInContext(source(name), ctx));
  return ctx;
}

function dropContext(activity) {
  const calls = [];
  const ctx = context({
    state: { activities: [activity] }, draggedOccurrence: { id: activity.id },
    rescheduleDraggedEvent: (...args) => calls.push(args)
  }, ['isHolidayActivity', 'calendarDropAllowed', 'rescheduleCalendarDrop']);
  return { ctx, calls };
}

test('a normal event cannot accidentally become a holiday through the holiday drop band', () => {
  const { ctx, calls } = dropContext({ id: 'normal', eventType: 'activity' });
  assert.equal(ctx.calendarDropAllowed({ dataset: { holidayDrop: 'true' } }), false);
  ctx.rescheduleCalendarDrop('2026-10-31', null, true, true);
  assert.equal(calls.length, 0);
});

test('moving a legacy timed holiday preserves its stored time and all-day flag', () => {
  const activity = { id: 'holiday', eventType: 'holiday', allDay: false, start: '09:00', end: '10:00', importance: 'high' };
  const before = JSON.stringify(activity);
  const { ctx, calls } = dropContext(activity);
  assert.equal(ctx.calendarDropAllowed({ dataset: { holidayDrop: 'true' } }), true);
  ctx.rescheduleCalendarDrop('2026-10-31', 900, false);
  ctx.rescheduleCalendarDrop('2026-11-01', null, true, true);
  assert.deepEqual(calls, [['2026-10-31', null, false], ['2026-11-01', null, false]]);
  assert.equal(JSON.stringify(activity), before);
});

test('all-day holidays remain all-day when moved into the hourly grid', () => {
  const { ctx, calls } = dropContext({ id: 'holiday', eventType: 'holiday', allDay: true });
  ctx.rescheduleCalendarDrop('2026-10-31', 900, false);
  assert.deepEqual(calls, [['2026-10-31', null, true]]);
});

test('ordinary events retain normal timed and all-day rescheduling behavior', () => {
  const { ctx, calls } = dropContext({ id: 'normal', eventType: 'activity', allDay: false });
  assert.equal(ctx.calendarDropAllowed({ dataset: {} }), true);
  ctx.rescheduleCalendarDrop('2026-10-31', 900, false);
  ctx.rescheduleCalendarDrop('2026-11-01', null, true);
  assert.deepEqual(calls, [['2026-10-31', 900, false], ['2026-11-01', null, true]]);
  ctx.draggedOccurrence = null;
  assert.equal(ctx.calendarDropAllowed({ dataset: {} }), false);
  ctx.rescheduleCalendarDrop('2026-11-01', null, true);
  assert.equal(calls.length, 2);
});

test('current-time focus finds the earliest remaining event despite importance-first list order', () => {
  const ctx = context({}, ['currentTimeCalendarItem']);
  const event = (start, end) => ({ dataset: { startMinute: String(start), endMinute: String(end) } });
  const laterHigh = event(1100, 1200), ended = event(800, 900), activeLow = event(850, 1000), upcoming = event(950, 1050);
  const items = [laterHigh, ended, upcoming, activeLow];
  assert.equal(ctx.currentTimeCalendarItem({ querySelectorAll: () => items }, 930), activeLow);
  assert.equal(ctx.currentTimeCalendarItem(null, 930), null);
  assert.equal(ctx.currentTimeCalendarItem({ querySelectorAll: () => items }, 1300), null);
});

test('pinned row heights update when a holiday band appears or disappears', () => {
  const values = {};
  const rows = { '.time-head': { offsetHeight: 76 }, '.holiday-head': { offsetHeight: 88 }, '.all-day-head': { offsetHeight: 50 } };
  const ctx = context({
    weekSchedule: { getClientRects: () => [{}], style: { setProperty: (key, value) => { values[key] = value; } } },
    grid: { querySelector: selector => rows[selector] }
  }, ['updateCalendarPinnedRows']);
  ctx.updateCalendarPinnedRows();
  assert.deepEqual(values, { '--week-header-height': '76px', '--week-holiday-height': '88px', '--week-all-day-height': '50px' });
  delete rows['.holiday-head'];
  ctx.updateCalendarPinnedRows();
  assert.equal(values['--week-holiday-height'], '0px');
  ctx.weekSchedule.getClientRects = () => [];
  rows['.all-day-head'].offsetHeight = 90;
  ctx.updateCalendarPinnedRows();
  assert.equal(values['--week-all-day-height'], '50px');
});

test('smart scrolling accounts for holiday and all-day bands above the timeline', () => {
  let target;
  const rows = { '.time-head': { offsetHeight: 76 }, '.holiday-head': { offsetHeight: 88 }, '.all-day-head': { offsetHeight: 50 }, '.time-column': { offsetHeight: 2880 } };
  const ctx = context({
    currentView: 'week', Date, scheduleStartMinutes: 0, scheduleDurationMinutes: 1440,
    userSettings: { calendarZoom: 1, reduceMotion: true },
    smartCalendarFocusTarget: () => ({ minute: 1000, activity: null }),
    window: { matchMedia: () => ({ matches: false }) },
    grid: { querySelector: selector => rows[selector] },
    weekSchedule: { clientHeight: 600, clientWidth: 1000, scrollHeight: 3200, scrollLeft: 0,
      getBoundingClientRect: () => ({ left: 0, right: 1000 }), scrollTo: value => { target = value; } }
  }, ['scrollWeekToSmartTime']);
  ctx.scrollWeekToSmartTime();
  assert.equal(target.top, 76 + 88 + 50 + 2000 - 144);
  assert.equal(target.behavior, 'auto');
});
