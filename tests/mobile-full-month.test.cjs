const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'mobile/src/calendar/CalendarScreen.js'), 'utf8');
const views = fs.readFileSync(path.join(root, 'mobile/src/calendar/CalendarViews.js'), 'utf8');

test('Month opens a dedicated full-calendar page and preserves the other calendar views', () => {
  assert.match(screen, /if \(value === 'month'\) \{ openFullMonth\(\); return; \}/);
  assert.match(screen, /showingFullMonth \? <FullMonthPage/);
  assert.match(screen, /onBack=\{closeFullMonth\}/);
  assert.match(screen, /onDate=\{openMonthDay\}/);
  assert.match(screen, /onEvent=\{showEvent\}/);
  assert.match(screen, /function openMonthDay\(value\) \{[^}]*openDay\(value\)/);
  assert.match(screen, /if \(value\.view === 'month'\).*setFullMonthOpen\(true\)/s);
});

test('the full-calendar page renders every needed month week with readable event labels', () => {
  assert.match(views, /export function FullMonthPage/);
  assert.match(views, /fullDays\.slice\(35\)\.some/);
  assert.match(views, /fullDays\.slice\(0, 35\)/);
  assert.match(views, /calendar\.eventsForDate\(events, day\)/);
  assert.match(views, /items\.slice\(0, maxItems\)/);
  assert.match(views, /items\.length - maxItems/);
  assert.match(views, /numberOfLines=\{1\} ellipsizeMode="tail"/);
  assert.match(views, /backgroundColor: palette\.soft, borderLeftColor: palette\.line/);
  assert.match(views, /cellHeight = Math\.max\(76, Math\.min\(96, cellWidth \* 1\.55\)\)/);
});

test('the full-calendar page is bilingual, accessible, and keeps editing permission-aware', () => {
  for (const copy of ['Full calendar', '完整月历', 'Back to calendar', '返回日历', 'Previous month', '上个月', 'Next month', '下个月']) {
    assert.ok(views.includes(copy), copy);
  }
  assert.match(views, /accessibilityLabel=\{t\.back\}/);
  assert.match(views, /accessibilityLabel=\{t\.previousMonth\}/);
  assert.match(views, /accessibilityLabel=\{t\.nextMonth\}/);
  assert.match(views, /accessibilityLabel=\{t\.add\}/);
  assert.match(views, /\{canWrite \? <Pressable/);
  assert.match(views, /onPress=\{\(\) => onEvent\?\.\(event, day\)\}/);
});
