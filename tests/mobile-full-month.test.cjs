const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'mobile/src/calendar/CalendarScreen.js'), 'utf8');
const views = fs.readFileSync(path.join(root, 'mobile/src/calendar/CalendarViews.js'), 'utf8');
const trial = fs.readFileSync(path.join(root, 'mobile/src/screens/TrialCalendarScreen.js'), 'utf8');

test('Month opens a dedicated full-calendar page and preserves the other calendar views', () => {
  assert.match(screen, /if \(value === 'month'\) \{ openFullMonth\(\); return; \}/);
  assert.match(screen, /showingFullMonth \? <FullMonthPage/);
  assert.match(screen, /onBack=\{closeFullMonth\}/);
  assert.match(screen, /onDate=\{selectDate\} onOpenDay=\{openMonthDay\}/);
  assert.match(screen, /onEvent=\{showEvent\}/);
  assert.match(screen, /function openMonthDay\(value\) \{[^}]*openDay\(value\)/);
  assert.match(screen, /if \(value\.view === 'month'\).*setFullMonthOpen\(true\)/s);
});

test('the full-calendar page renders month weeks and a selected-day agenda', () => {
  assert.match(views, /export function FullMonthPage/);
  assert.match(views, /fullDays\.slice\(35\)\.some/);
  assert.match(views, /fullDays\.slice\(0, 35\)/);
  assert.match(views, /calendar\.eventsForDate\(events, day\)/);
  assert.match(views, /items\.slice\(0, maxItems\)/);
  assert.match(views, /items\.length - maxItems/);
  assert.match(views, /numberOfLines=\{1\} ellipsizeMode="tail"/);
  assert.match(views, /backgroundColor: palette\.soft, borderLeftColor: palette\.line/);
  assert.match(views, /cellHeight = Math\.max\(64, Math\.min\(72, cellWidth \* 1\.25\)\)/);
  assert.match(views, /maxItems = 2/);
  assert.match(views, /selectedEvents = model\.sortAgenda\(calendar\.eventsForDate\(events, selected\), selected\)/);
  assert.match(views, /onPress=\{\(\) => onDate\?\.\(day\)\}/);
  assert.match(views, /onPress=\{\(\) => onOpenDay\(selected\)\}/);
  assert.match(views, /onPress=\{\(\) => onEvent\?\.\(event, selected\)\}/);
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

test('guest month selection stays in Month and exposes the selected-day agenda', () => {
  assert.match(trial, /view === 'month' \? <MonthGrid[^>]*onDate=\{selectDate\}/);
  assert.match(trial, /view === 'month' && <View style=\{styles\.monthAgendaHead\}>/);
  assert.match(trial, /onPress=\{\(\) => openDay\(selected\)\}/);
  assert.match(trial, /view === 'month' && visibleHasEvents && !events\.length/);
  assert.match(trial, /viewDay: 'View day'/);
  assert.match(trial, /viewDay: '查看当天'/);
});
