const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const layout = require('../mobile/src/calendar/week-layout');
const views = fs.readFileSync(path.resolve(__dirname, '../mobile/src/calendar/CalendarViews.js'), 'utf8');

test('phone week geometry keeps readable day columns and scrolls the full week', () => {
  const phone = layout.weekGeometry(350);
  assert.equal(phone.gutterWidth, 48);
  assert.ok(phone.dayWidth >= 100);
  assert.ok(phone.visibleDays >= 3 && phone.visibleDays < 4);
  assert.equal(phone.daysWidth, phone.dayWidth * 7);

  const narrowPhone = layout.weekGeometry(286);
  assert.ok(narrowPhone.visibleDays >= 3 && narrowPhone.visibleDays < 3.1);
  assert.equal(layout.weekOffset(0, narrowPhone.dayWidth, 238), 0);
  assert.equal(layout.weekOffset(6, narrowPhone.dayWidth, 238), narrowPhone.daysWidth - 238);
  assert.equal(layout.weekOffset(4, 100, 300, 5), 200);
  assert.equal(layout.weekOffset(0, 100, 300, 4), 0);

  const tablet = layout.weekGeometry(600);
  assert.ok(tablet.dayWidth <= 116);
  assert.ok(tablet.visibleDays >= 4);
});

test('opening at an early hour keeps a half-hour lead-in above the first event', () => {
  assert.equal(layout.initialScrollOffset(5, 64), 288);
  assert.equal(layout.initialScrollOffset(0, 64), 0);
  assert.equal(layout.initialScrollOffset(23, 64), 1440);
  assert.equal(layout.initialScrollOffset('invalid', 64), 480);
});

test('week grid snaps by day and exposes activity counts without instructional clutter', () => {
  assert.match(views, /snapToInterval: colWidth/);
  assert.match(views, /weekLayout\.initialScrollOffset\(startHour, HOUR_HEIGHT\)/);
  assert.match(views, /t\.activities\(dayEvents\[index\]\.length\)/);
  assert.match(views, /style=\{\[s\.dayCount/);
  assert.match(views, /blockTitle: \{ fontSize: 12, lineHeight: 16/);
  assert.match(views, /narrow=\{item\.lanes > 1\}/);
  assert.match(views, /numberOfLines=\{narrow \|\| time \|\| overlapCount \? 1 : 2\}/);
  assert.doesNotMatch(views, /<Text style=\{s\.overviewHint\}>/);
});

test('next-event jump ignores elapsed, cancelled and filtered-out timed plans', () => {
  const days = ['2026-11-23', '2026-11-24', '2026-11-25'];
  const columns = [
    { timed: [{ start: 8 * 60, event: {} }, { start: 11 * 60, event: { status: 'cancelled' } }, { start: 14 * 60, event: {} }] },
    { timed: [{ start: 9 * 60, event: {} }] },
    { timed: [{ start: 10 * 60, event: {} }] },
  ];
  assert.deepEqual(layout.nextTimedTarget(columns, days, days[0], days[0], 10 * 60),
    { index: 0, dateKey: days[0], start: 14 * 60 });
  assert.deepEqual(layout.nextTimedTarget(columns, days, days[1], days[0], 10 * 60),
    { index: 1, dateKey: days[1], start: 9 * 60 });
  assert.deepEqual(layout.nextTimedTarget([{ timed: [] }, columns[1], columns[2]], days, days[0], days[0], 10 * 60),
    { index: 1, dateKey: days[1], start: 9 * 60 });
  assert.equal(layout.nextTimedTarget(columns, days, days[0], '2026-11-26', 0), null);
  assert.equal(layout.nextTimedTarget(null, days, days[0], days[0], 0), null);
  assert.match(views, /onPress=\{jumpToNext\}/);
  assert.match(views, /weekLayout\.initialScrollOffset\(nextTarget\.start \/ 60, HOUR_HEIGHT\)/);
});

test('4-day next-event jumps retain the target hour after the selected date changes', () => {
  const initialStart = views.indexOf('  function scrollInitially()');
  const effectStart = views.indexOf('  useEffect(() => {', initialStart);
  const effectEnd = views.indexOf('  useEffect(() => {', effectStart + 1);
  const jumpStart = views.indexOf('  function jumpToNext()');
  const jumpEnd = views.indexOf('\n  return <View', jumpStart);
  assert.ok(initialStart >= 0 && effectStart > initialStart && effectEnd > effectStart && jumpEnd > jumpStart);
  const scrolls = [], frames = [];
  const context = vm.createContext({
    weekLayout: layout, HOUR_HEIGHT: 64, fourDays: true,
    dates: ['2026-11-23', '2026-11-24'], selectedKey: '2026-11-23',
    nextTarget: { index: 1, dateKey: '2026-11-24', start: 17 * 60 },
    startHour: 8, scrollKey: '2026-11-23:8',
    pendingJump: { current: null }, lastInitial: { current: '2026-11-23:8' }, verticalOffset: { current: 480 },
    vertical: { current: { scrollTo: options => scrolls.push(options.y) } },
    onDate(date) { context.selectedKey = date; context.scrollKey = `${date}:8`; },
    useEffect: callback => callback(),
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
  });
  vm.runInContext(views.slice(initialStart, effectStart) + views.slice(jumpStart, jumpEnd), context);
  context.jumpToNext();
  assert.equal(context.selectedKey, '2026-11-24');
  assert.deepEqual(scrolls, [], 'wait for the new date before scrolling');
  vm.runInContext(views.slice(effectStart, effectEnd), context); frames.shift()();
  assert.deepEqual(scrolls, [1056], 'the new date opens at the requested 5 PM event');
  context.scrollInitially();
  assert.deepEqual(scrolls, [1056], 'content-size changes must not reset the jump to 8 AM');
  assert.equal(context.pendingJump.current, null);
  context.selectedKey = '2026-11-25'; context.scrollKey = '2026-11-25:8';
  vm.runInContext(views.slice(effectStart, effectEnd), context); frames.shift()();
  assert.deepEqual(scrolls, [1056, 480], 'ordinary navigation still uses the opening hour');
});
