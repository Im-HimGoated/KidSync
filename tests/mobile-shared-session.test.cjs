const test = require('node:test');
const assert = require('node:assert/strict');
const sharedSession = require('../mobile/src/lib/shared-calendar-session');

test('shared calendar state disappears synchronously when the signed-in account changes', () => {
  const accountA = sharedSession.attachActor({ ownerId: 'owner', calendarId: 'school' }, 'account-a');
  assert.equal(sharedSession.forActor(accountA, 'account-a'), accountA);
  assert.equal(sharedSession.forActor(accountA, 'account-b'), null);
  assert.equal(sharedSession.forActor(accountA, null), null);
});

test('a deferred result from the previous account cannot become visible', () => {
  const delayed = sharedSession.attachActor({ ownerId: 'owner', calendarId: 'school' }, 'account-a');
  const activeAccount = 'account-b';
  assert.equal(sharedSession.forActor(delayed, activeAccount), null);
});

test('confirmed permission loss is distinct from a recoverable network failure', () => {
  assert.equal(sharedSession.isRevoked({ code: 'FORBIDDEN' }), true);
  assert.equal(sharedSession.isRevoked({ code: 'NO_CALENDAR' }), true);
  assert.equal(sharedSession.isRevoked({ code: 'NETWORK_ERROR' }), false);
});
