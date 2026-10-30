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

test('family permission choices and native editor limitation are explicit', () => {
  assert.match(family, /value: 'viewer'/);
  assert.match(family, /value: 'commenter'/);
  assert.match(family, /value: 'editor'/);
  assert.match(family, /Shared event editing is currently available on the web calendar/);
  assert.match(family, /原生编辑适配完成前/);
});

test('invitation delivery is honest and pickup actions require a server response', () => {
  assert.match(family, /It does not send an email automatically/);
  assert.match(family, /不会自动发送电子邮件/);
  assert.match(family, /Share\.share/);
  assert.match(family, /pickupAccept: 'I can do it'/);
  assert.match(family, /pickupDecline: 'I cannot'/);
  assert.match(family, /await run\(`pickup-/);
});
