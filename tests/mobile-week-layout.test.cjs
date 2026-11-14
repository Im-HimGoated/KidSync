const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
