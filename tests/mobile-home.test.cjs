const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { upcomingOccurrences, eventIsStillRelevant, needsHandoff, buildHomeModel } = require('../mobile/src/home/model');

const now = new Date(2026, 9, 30, 15, 0);
const kids = [{ id: 'a', name: 'Andrew', palette: 'blue' }, { id: 'm', name: 'Mark', palette: 'green' }];
const events = [
  { id: 'past', title: 'School', child: 'a', startDate: '2026-10-30', start: '08:00', end: '09:00', responsible: 'Mom' },
  { id: 'soccer', title: 'Soccer', child: 'a', startDate: '2026-10-30', start: '16:00', end: '17:00' },
  { id: 'dinner', title: 'Dinner', child: '__family__', startDate: '2026-10-30', start: '18:00', end: '19:00' },
  { id: 'piano', title: 'Piano', child: 'm', startDate: '2026-10-31', start: '10:00', end: '11:00', responsible: 'Dad' },
  { id: 'weekly', title: 'Kumon', child: 'm', startDate: '2026-10-29', start: '15:30', end: '16:00', recurrence: 'weekly' },
  { id: 'holiday', title: 'Holiday', child: 'a', startDate: '2026-11-01', allDay: true, isBuiltInHoliday: true },
];

test('home model expands recurrence and keeps only future-relevant plans in Next up', () => {
  const model = buildHomeModel(events, kids, now);
  assert.equal(model.today.length, 3);
  assert.deepEqual(model.nextUp.slice(0, 3).map(item => item.event.id), ['soccer', 'dinner', 'piano']);
  assert.ok(model.nextUp.every(item => item.event.id !== 'past'));
  assert.equal(upcomingOccurrences(events, new Date(2026, 9, 30), 8).filter(item => item.event.id === 'weekly').length, 1);
});

test('handoff attention is limited to child-specific timed plans without an assigned adult', () => {
  assert.equal(needsHandoff(events[1], kids), true);
  assert.equal(needsHandoff(events[2], kids), false);
  assert.equal(needsHandoff(events[3], kids), false);
  assert.equal(needsHandoff(events[5], kids), false);
  const model = buildHomeModel(events, kids, now);
  assert.deepEqual(model.handoffs.map(item => item.event.id), ['soccer', 'weekly']);
  assert.equal(model.handoffCount, 2);
});

test('home metrics count schedule days and per-child workload without mutating source data', () => {
  const before = JSON.stringify(events), model = buildHomeModel(events, kids, now);
  assert.equal(model.sevenDayCount, 6);
  assert.equal(model.daysPlanned, 4);
  assert.deepEqual(model.workload.map(item => [item.name, item.count]), [['Andrew', 4], ['Mark', 3]]);
  assert.equal(JSON.stringify(events), before);
  assert.equal(eventIsStillRelevant({ dateKey: '2026-10-30', event: events[0] }, now), false);
});

test('signed-in phone shell exposes focused home, calendar, and family navigation', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../mobile/src/App.js'), 'utf8');
  const screen = fs.readFileSync(path.resolve(__dirname, '../mobile/src/screens/HomeScreen.js'), 'utf8');
  assert.match(app, /<HomeScreen/);
  assert.match(app, /<FamilyScreen/);
  assert.match(app, /<BottomNavigation/);
  assert.match(app, /familyPendingCount/);
  assert.match(app, /onOpenFamily=\{\(\) => setWorkspaceView\('family'\)\}/);
  assert.match(app, /bottomIndicator/);
  assert.match(app, /useScheduleSync\(\{ client: supabase, userId: session\?\.user\.id \}\)/);
  assert.match(app, /<SyncStatus/);
  assert.match(app, /activityActions=\{ownerActivityActions\}/);
  assert.match(app, /if \(!row\?\.pending\) await ownerSync\.acceptConfirmed\(row\)/);
  assert.doesNotMatch(app, /watchSchedule\(/);
  assert.match(app, /<AccountSettings/);
  assert.match(screen, /Family Handoff Center/);
  assert.match(screen, /todayLabel/);
  assert.match(screen, /workloadAvatar/);
  assert.match(screen, /Coordinate pickups/);
  assert.match(screen, /onOpenDate\?\.\(item\.dateKey\)/);
});
