const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.match(family, /verifies access before every change/);
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
