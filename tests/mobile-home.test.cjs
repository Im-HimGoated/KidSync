const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { upcomingOccurrences, searchOccurrences, pinnedOccurrences, packingItems, packingKey, dayBrief,
  eventIsStillRelevant, needsHandoff, buildHomeModel } = require('../mobile/src/home/model');

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

test('home productivity helpers search 90 days, show tomorrow, and keep one next occurrence per pin', () => {
  const extended = [...events,
    { id: 'camp', title: 'Winter camp', child: 'a', location: 'Community Center', startDate: '2026-12-15', start: '09:00', end: '12:00' }];
  const model = buildHomeModel(extended, kids, now);
  assert.deepEqual(model.tomorrow.map(item => item.event.id), ['piano']);
  assert.deepEqual(searchOccurrences(model.upcoming, 'community winter').map(item => item.event.id), ['camp']);
  assert.deepEqual(searchOccurrences(model.upcoming, 'mark dad', kids).map(item => item.event.id), ['piano']);
  const pins = pinnedOccurrences(model.upcoming, ['weekly', 'camp', 'weekly']);
  assert.deepEqual(pins.map(item => item.event.id), ['weekly', 'camp']);
});

test('packing and daily brief helpers stay occurrence-scoped without changing events', () => {
  const source = { id: 'game', title: 'Game', items: 'Cleats, Water; cleats\n- Jersey', startDate: '2026-10-30' };
  assert.deepEqual(packingItems(source.items), ['Cleats', 'Water', 'Jersey']);
  assert.equal(packingKey({ event: source, dateKey: '2026-11-06' }), 'game:2026-11-06');
  assert.equal(packingKey({ event: { ...source, eventType: 'trip', startDate: '2026-11-10' }, dateKey: '2026-11-12' }), 'game:2026-11-10');
  const message = dayBrief([{ event: source }], { dateLabel: 'Friday, Oct 30', calendarLabel: 'Family',
    timeFor: () => '4:00 PM – 5:00 PM', peopleFor: () => 'Andrew', includeNotes: true, bring: 'Bring', notes: 'Notes' });
  assert.match(message, /Friday, Oct 30/); assert.match(message, /4:00 PM – 5:00 PM — Game/); assert.match(message, /Bring: Cleats/);
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
  assert.match(screen, /function openCurrentDate\(date, time = null\)/);
  assert.match(screen, /selectCurrentOwnerCalendar\(\);\s*onOpenDate\?\.\(date, time\)/);
  assert.match(screen, /calendarTools\.daySegment\(item\.event, date\)\?\.start/);
  assert.match(screen, /openCurrentDate\(item\.dateKey, focusTimeFor\(item\)\)/);
  assert.match(screen, /selectCurrentOwnerCalendar\(\);\s*onOpenCalendar\?\.\(\)/);
  assert.match(screen, /selectCurrentOwnerCalendar\(\);\s*onOpenFamily\?\.\(\)/);
  assert.match(screen, /Quick planning tools/);
  assert.match(screen, /Share\.share/);
  assert.match(screen, /personalTools\.scopeFor\(\{ accountId: personalAccountId/);
  assert.match(screen, /Pins and packing progress stay on this device/);
});
