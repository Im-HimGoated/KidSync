const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const familyPath = path.resolve(__dirname, '../mobile/src/screens/FamilyScreen.js');
const appPath = path.resolve(__dirname, '../mobile/src/App.js');
const family = fs.readFileSync(familyPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');

test('family collaboration is discoverable without crowding the mobile shell', () => {
  assert.match(app, /key: 'family'/);
  assert.match(app, /icon: UsersRound/);
  assert.match(app, /familyPendingCount/);
  assert.match(app, /<FamilyScreen/);
  assert.match(app, /workspaceView !== 'family'/);
  assert.match(family, /People, permissions and pickups in one place/);
  assert.match(family, /const inboxPending =/);
  assert.match(family, /tabBadge/);
});

test('family screen uses server-backed access, invitation, comment, and pickup helpers', () => {
  assert.match(family, /sharing\.listCalendarMembers/);
  assert.match(family, /sharing\.inviteCalendarMember/);
  assert.match(family, /sharing\.respondCalendarInvitation/);
  assert.match(family, /sharing\.changeCalendarMemberRole/);
  assert.match(family, /sharing\.revokeCalendarMember/);
  assert.match(family, /sharing\.readMemberCalendar/);
  assert.match(family, /sharing\.addCalendarComment/);
  assert.match(family, /coordination\.assignCalendarPickup/);
  assert.match(family, /coordination\.respondCalendarPickup/);
  assert.doesNotMatch(family, /family_schedules/);
  assert.doesNotMatch(family, /\.update\(\{\s*schedule/);
});

test('family permission choices and the native shared-calendar route are explicit', () => {
  assert.match(family, /value: 'viewer'/);
  assert.match(family, /value: 'commenter'/);
  assert.match(family, /value: 'editor'/);
  assert.match(family, /onOpenSharedCalendar/);
  assert.match(family, /View in Calendar/);
  assert.match(family, /supported, verified write connection/);
  assert.match(app, /sharedCalendar\.readSharedCalendar/);
  assert.match(app, /sharedCalendar\.createSharedCalendarAdapter/);
  assert.match(app, /sharedSession\.forActor\(sharedAccess, actorId\)/);
  assert.match(app, /accountScope\.current !== actorId/);
  assert.match(app, /sharedSession\.isRevoked\(failure\)/);
  assert.match(app, /setInterval\(catchUp, 5000\)/);
  assert.match(app, /sharedActivityActions=\{sharedSelected \? sharedActivityActions : null\}/);
  assert.match(app, /onSharedSchedule=\{acceptSharedSchedule\}/);
  assert.doesNotMatch(app.match(/const acceptSharedSchedule[^]*?\n  \}, \[[^]*?\]\);/)?.[0] || '', /ownerSync/);
});

test('invitation delivery is honest and pickup actions require a server response', () => {
  assert.match(family, /It does not send an email automatically/);
  assert.match(family, /不会自动发送电子邮件/);
  assert.match(family, /Share\.share/);
  assert.match(family, /pickupAccept: 'I can do it'/);
  assert.match(family, /pickupDecline: 'I cannot'/);
  assert.match(family, /await run\(`pickup-/);
});

test('Pickup priority matches Home while preserving active requests and optional manual assignments', () => {
  const helpers = family.slice(family.indexOf('const pickupKey ='), family.indexOf('function Badge('));
  const pickupPlans = vm.runInNewContext(`${helpers}\npickupPlans`, { homeModel: require('../mobile/src/home/model') });
  const scheduleDate = '2026-11-13';
  const nextWeek = '2026-11-20';
  const events = [
    { id: 'elapsed', title: 'Finished', child: 'Sam', startDate: scheduleDate, start: '08:00', end: '09:00' },
    { id: 'open', title: 'Practice', child: 'Sam', startDate: scheduleDate, start: '15:00', end: '16:00' },
    { id: 'family', title: 'Family plan', startDate: scheduleDate, start: '16:00', end: '17:00', recurrence: 'weekly' },
    { id: 'cancelled', title: 'Cancelled', child: 'Sam', startDate: scheduleDate, start: '17:00', end: '18:00', status: 'cancelled' },
    { id: 'holiday', title: 'Holiday', startDate: scheduleDate, allDay: true, isBuiltInHoliday: true },
  ];
  const pickups = [{ event_id: 'family', occurrence_date: scheduleDate, status: 'accepted' }];
  const next = pickupPlans(events, [{ name: 'Sam' }], pickups, new Date(2026, 10, 13, 14));
  assert.deepEqual(Array.from(next, item => [item.occurrence.event.id, item.occurrence.dateKey, item.needsAttention, item.pickup?.status]), [
    ['open', scheduleDate, true, undefined],
    ['family', scheduleDate, true, 'accepted'],
    ['family', nextWeek, false, undefined],
  ]);
});

test('pickup fetch errors do not render a misleading empty inbox or permit reassignment', () => {
  assert.match(family, /contexts\.some\(context => context\.pickupUnavailable\)/);
  assert.match(family, /!incomingPickupError && <EmptyState icon=\{Bell\} title=\{t.noRequests\}/);
  assert.match(family, /canAssignPickup = !!activePickupPlan && ownerPickupReady && !busy && !refreshing\s*&& !alreadyRequested/);
  assert.match(family, /setNotice\(status === 'accepted' \? t.responseAccepted : t.responseDeclined\)/);
});

test('inline Family failures stay visible while sheet failures stay in their sheet', () => {
  assert.match(family, /const sheetAtStart = sheet/);
  assert.match(family, /if \(sheetAtStart\) setSheetError\(t\.saveFailed\)/);
  assert.match(family, /else setError\(t\.saveFailed\)/);
});

test('Family tab requests wait for open sheets and in-flight work', () => {
  assert.match(family, /handledTabRequest = useRef\(0\)/);
  assert.match(family, /if \(sheet \|\| busy\) return/);
  assert.match(family, /handledTabRequest\.current = tabRequest\.id;\s*setTab\(tabRequest\.tab\)/);
  const effect = family.match(/useEffect\(\(\) => \{\s*if \(!tabRequest[^]*?\}, \[tabRequest, sheet, busy\]\);/)?.[0] || '';
  assert.doesNotMatch(effect, /setSheet\(/);
});

test('accepted invitations load on demand without an arbitrary invitation cap', () => {
  assert.match(family, /async function loadSharedContext\(invitation\)/);
  assert.match(family, /Promise\.allSettled\(active\.map\(loadSharedContext\)\)/);
  assert.doesNotMatch(family, /slice\(0, 12\)/);
  assert.match(family, /loadContext: \(\) => loadSharedContext\(invitation\)/);
  assert.match(family, /setError\(t\.sharedLoadFailed\)/);
  assert.match(family, /accountScope\.current !== actorScope/);
});

test('owners can reach calendar comments and the scoped family-profile editor', () => {
  assert.match(family, /openOwnerComments/);
  assert.match(family, /role: 'owner'/);
  assert.match(family, /\['owner', 'commenter', 'editor'\]\.includes\(role\)/);
  assert.match(family, /sharing\.listCalendarComments\(client, account, context\.calendar\)/);
  assert.match(family, /presentSheet\(\{ type: 'profiles', original: safeArray\(calendar\?\.data\?\.kids\)/);
  assert.match(family, /<FamilyProfiles original=\{sheet\.original\}/);
  assert.match(family, /await onSaveProfiles\(ownerCalendar\.id, changes\)/);
  assert.match(family, /calendarScope\.current === scope\) setSheet\(null\)/);
});

test('comment reads are scoped to the latest visible account and calendar sheet', () => {
  assert.match(family, /createLatestRequestGuard\(\)/);
  assert.match(family, /commentRequests\.current\.invalidate\(\)/);
  assert.match(family, /commentRequests\.current\.isCurrent\(token, scope\)/);
  assert.match(family, /accountScope\.current === actorScope/);
  assert.match(family, /onClose=\{dismissSheet\}/);
  assert.match(family, /commentsLoading \? <ActivityIndicator/);
  assert.match(family, /supported, verified write connection/);
});
