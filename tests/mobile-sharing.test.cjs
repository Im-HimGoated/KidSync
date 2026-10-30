const test = require('node:test');
const assert = require('node:assert/strict');
const sharing = require('../shared/backend/mobile-sharing');

const owner = { id: 'owner-1', email: 'Owner@Example.com' };
const recipient = { id: 'recipient-1', email: 'Person@Example.com' };
const calendar = { id: 'school', name: 'School' };
const token = '12345678-1234-4234-8234-123456789abc';
const member = changes => ({
  id: 'member-1', owner_id: owner.id, owner_email: 'owner@example.com',
  calendar_id: calendar.id, calendar_name: calendar.name,
  member_email: 'person@example.com', member_user_id: null,
  role: 'viewer', status: 'pending', invitation_note: '', invite_token: token,
  created_at: '2026-10-22T12:00:00Z', ...changes
});
const ok = data => ({ data, error: null });

// Record the complete query, including mutation filters, before returning a
// queued server response. No live account or database is needed for these tests.
function fakeClient(...responses) {
  const requests = [];
  function response(request) {
    requests.push(request);
    assert.ok(responses.length, `Unexpected request: ${JSON.stringify(request)}`);
    return Promise.resolve(responses.shift());
  }
  return {
    requests,
    done() { assert.equal(responses.length, 0, 'Every expected server request must run'); },
    rpc(name, args) { return response({ rpc: name, args }); },
    from(table) {
      const request = { table, filters: [] };
      const builder = {
        select(columns) { request.operation ||= 'select'; request.columns = columns; return this; },
        insert(payload) { request.operation = 'insert'; request.payload = payload; return this; },
        update(payload) { request.operation = 'update'; request.payload = payload; return this; },
        delete() { request.operation = 'delete'; return this; },
        eq(column, value) { request.filters.push(['eq', column, value]); return this; },
        ilike(column, value) { request.filters.push(['ilike', column, value]); return this; },
        in(column, value) { request.filters.push(['in', column, value]); return this; },
        order(column, options) { request.order = [column, options]; return this; },
        single() { request.cardinality = 'single'; return this; },
        maybeSingle() { request.cardinality = 'maybeSingle'; return this; },
        then(resolve, reject) { return response(request).then(resolve, reject); }
      };
      return builder;
    }
  };
}

test('owner access lists are scoped to the captured account and selected calendar', async () => {
  const row = member(); const client = fakeClient(ok([row]));
  assert.deepEqual(await sharing.listCalendarMembers(client, owner, 'school'), [row]);
  assert.deepEqual(client.requests[0].filters, [['eq', 'owner_id', 'owner-1'], ['eq', 'calendar_id', 'school']]);
  assert.deepEqual(client.requests[0].order, ['created_at', { ascending: true }]);
  client.done();
  const wrongScope = fakeClient(ok([member({ calendar_id: 'private' })]));
  await assert.rejects(sharing.listCalendarMembers(wrongScope, owner, 'school'), /could not be confirmed/);
  await assert.rejects(sharing.listCalendarMembers(fakeClient(), null, 'school'), /Sign in/);
  await assert.rejects(sharing.listCalendarMembers(fakeClient(), owner, ''), /Select a calendar/);
});

test('recipient mailbox matches the current email exactly, including LIKE pattern characters', async () => {
  const user = { id: 'reader', email: ' A_B%Tag@Example.com ' };
  const row = member({ member_email: 'a_b%tag@EXAMPLE.COM' });
  const client = fakeClient(ok([row]));
  assert.deepEqual(await sharing.listCalendarInvitations(client, user), [row]);
  assert.deepEqual(client.requests[0].filters, [
    ['ilike', 'member_email', 'a\\_b\\%tag@example.com'], ['in', 'status', ['pending', 'active']]
  ]);
  const wrongAccount = fakeClient(ok([member({ member_email: 'someone-else@example.com' })]));
  await assert.rejects(sharing.listCalendarInvitations(wrongAccount, recipient), /could not be confirmed/);
  await assert.rejects(sharing.listCalendarInvitations(fakeClient(ok(null)), recipient), /could not be loaded/);
});

test('new invites use actual schema roles and return only server-confirmed invitations', async () => {
  const saved = member({ role: 'commenter', invitation_note: 'For school pickups' });
  const client = fakeClient(ok(null), ok(saved));
  assert.deepEqual(await sharing.inviteCalendarMember(client, owner, calendar, {
    email: ' Person@Example.com ', role: 'commenter', note: ' For school pickups '
  }), saved);
  assert.deepEqual(client.requests[0].filters, [
    ['eq', 'owner_id', owner.id], ['eq', 'calendar_id', calendar.id], ['ilike', 'member_email', 'person@example.com']
  ]);
  assert.deepEqual(client.requests[1].payload, {
    owner_id: owner.id, owner_email: 'owner@example.com', calendar_id: 'school', calendar_name: 'School',
    member_email: 'person@example.com', role: 'commenter', invitation_note: 'For school pickups', status: 'pending'
  });
  assert.equal(client.requests[1].cardinality, 'single');
  assert.equal(client.requests[1].payload.invite_token, undefined, 'Only the backend generates tokens');
  client.done();
  await assert.rejects(sharing.inviteCalendarMember(fakeClient(ok(null), ok(null)), owner, calendar, {
    email: recipient.email
  }), /could not be confirmed/);
  await assert.rejects(sharing.inviteCalendarMember(fakeClient(ok(null), ok(member({ invite_token: '' }))), owner, calendar, {
    email: recipient.email
  }), /could not be confirmed/);
});

test('reinvites reuse the existing invitation via the current owner RPC and verify saved state', async () => {
  const client = fakeClient(ok(member({ status: 'declined' })), ok(null), ok(member({ role: 'editor', invitation_note: 'Welcome back' })));
  const saved = await sharing.inviteCalendarMember(client, owner, calendar, { email: recipient.email, role: 'editor', note: 'Welcome back' });
  assert.equal(saved.invite_token, token);
  assert.deepEqual(client.requests[1], { rpc: 'update_calendar_member_share', args: {
    member_id: 'member-1', next_status: 'pending', next_role: 'editor', next_note: 'Welcome back'
  } });
  assert.ok(client.requests[2].filters.some(filter => filter[1] === 'owner_id' && filter[2] === owner.id));
  client.done();
});

test('self invitation, foreign ownership, unknown roles, invalid emails, and oversized notes stop before writes', async () => {
  const client = fakeClient();
  await assert.rejects(sharing.inviteCalendarMember(client, owner, calendar, { email: owner.email }), /cannot invite themselves/);
  await assert.rejects(sharing.inviteCalendarMember(client, owner, { ...calendar, ownerId: 'other' }, { email: recipient.email }), /Only the calendar owner/);
  await assert.rejects(sharing.inviteCalendarMember(client, owner, calendar, { email: recipient.email, role: 'owner' }), /viewer, commenter, or editor/);
  await assert.rejects(sharing.inviteCalendarMember(client, owner, calendar, { email: 'bad@' }), /valid email/);
  await assert.rejects(sharing.inviteCalendarMember(client, owner, calendar, { email: recipient.email, note: 'x'.repeat(501) }), /500 characters/);
  assert.equal(client.requests.length, 0);
  const selfBound = fakeClient(ok(member({ member_user_id: owner.id })));
  await assert.rejects(sharing.inviteCalendarMember(selfBound, owner, calendar, { email: recipient.email }), /own access/);
  assert.equal(selfBound.requests.length, 1);
});

test('role changes update only the role and cannot undo a concurrent ban', async () => {
  const client = fakeClient(ok(member({ status: 'active' })), ok(member({ role: 'editor', status: 'banned' })));
  const saved = await sharing.changeCalendarMemberRole(client, owner, 'school', 'member-1', 'editor');
  assert.equal(saved.status, 'banned');
  assert.deepEqual(client.requests[1].payload, { role: 'editor' });
  assert.deepEqual(client.requests[1].filters, [
    ['eq', 'id', 'member-1'], ['eq', 'owner_id', owner.id], ['eq', 'calendar_id', 'school']
  ]);
  client.done();
});

test('role and revoke operations protect owner access and reject mismatched member rows', async () => {
  await assert.rejects(sharing.changeCalendarMemberRole(fakeClient(), owner, 'school', 'member-1', 'admin'), /viewer, commenter, or editor/);
  const self = fakeClient(ok(member({ member_email: owner.email })));
  await assert.rejects(sharing.changeCalendarMemberRole(self, owner, 'school', 'member-1', 'editor'), /own access/);
  assert.equal(self.requests.length, 1);
  await assert.rejects(sharing.revokeCalendarMember(fakeClient(ok(member({ owner_id: 'another-owner' }))), owner, 'school', 'member-1'), /could not be confirmed/);
  await assert.rejects(sharing.revokeCalendarMember(fakeClient(ok(member({ member_user_id: owner.id }))), owner, 'school', 'member-1'), /own access/);
});

test('revocation confirms a deleted row and never reports zero affected rows as success', async () => {
  const client = fakeClient(ok(member()), ok(member()));
  await sharing.revokeCalendarMember(client, owner, 'school', 'member-1');
  assert.equal(client.requests[1].operation, 'delete');
  assert.deepEqual(client.requests[1].filters, [
    ['eq', 'id', 'member-1'], ['eq', 'owner_id', owner.id], ['eq', 'calendar_id', 'school']
  ]);
  client.done();
  await assert.rejects(sharing.revokeCalendarMember(fakeClient(ok(member()), ok(null)), owner, 'school', 'member-1'), /could not be confirmed/);
});

test('invitation acceptance uses the existing binding RPC and confirms the current recipient', async () => {
  const active = member({ status: 'active', member_user_id: recipient.id });
  const client = fakeClient(ok(member()), ok(null), ok(active));
  assert.deepEqual(await sharing.respondCalendarInvitation(client, recipient, 'member-1', 'active'), active);
  assert.deepEqual(client.requests[1], { rpc: 'respond_calendar_invitation', args: { invitation_id: 'member-1', next_status: 'active' } });
  assert.ok(client.requests.filter(request => request.filters).every(request => request.filters.some(filter => filter[1] === 'member_email' && filter[2] === 'person@example.com')));
  assert.ok(client.requests.every(request => !request.payload), 'Recipient identity is bound by the server RPC only');
  client.done();
  await assert.rejects(sharing.respondCalendarInvitation(fakeClient(ok(member()), ok(null), ok(member({ status: 'active', member_user_id: 'wrong-person' }))), recipient, 'member-1', 'active'), /response could not be confirmed/);
});

test('wrong-account, banned, and invalid invitation responses never reach the mutation RPC', async () => {
  const wrong = fakeClient(ok(member({ member_email: 'wrong@example.com' })));
  await assert.rejects(sharing.respondCalendarInvitation(wrong, recipient, 'member-1', 'active'), /could not be confirmed/);
  assert.equal(wrong.requests.length, 1);
  const banned = fakeClient(ok(member({ status: 'banned' })));
  await assert.rejects(sharing.respondCalendarInvitation(banned, recipient, 'member-1', 'active'), /no longer available/);
  assert.equal(banned.requests.length, 1);
  await assert.rejects(sharing.respondCalendarInvitation(fakeClient(), recipient, 'member-1', 'banned'), /Accept or Decline/);
});

test('shared reads expose only the selected calendar and keep event details intact', async () => {
  const selected = { kids: [{ name: 'Mia' }], activities: [{ id: 'one', notes: 'Bring boots', futureField: true }], settings: { private: true } };
  const snapshot = { profile: { private: true }, activities: [{ id: 'wrong' }], calendarData: {
    school: selected, private: { activities: [{ id: 'private' }] }
  } };
  const before = JSON.stringify(snapshot);
  const client = fakeClient(ok(member({ status: 'active', member_user_id: recipient.id })), ok({ schedule: snapshot, updated_at: 'latest' }));
  const shared = await sharing.readMemberCalendar(client, recipient, 'member-1');
  assert.deepEqual(shared.data, { kids: selected.kids, activities: selected.activities });
  assert.equal(shared.role, 'viewer');
  assert.equal(shared.ownerId, owner.id);
  assert.equal(shared.updatedAt, 'latest');
  assert.equal(shared.data.activities[0].futureField, true);
  assert.equal(shared.data.settings, undefined);
  assert.equal(shared.profile, undefined);
  assert.equal(shared.calendarData, undefined);
  assert.deepEqual(client.requests[1].filters, [['eq', 'user_id', owner.id]]);
  assert.equal(JSON.stringify(snapshot), before);
  client.done();
});

test('missing selected calendars never fall back to another calendar or the legacy root', async () => {
  const client = fakeClient(ok(member({ status: 'active', member_user_id: recipient.id })), ok({ schedule: {
    calendarData: { private: { activities: [{ id: 'private' }] } }, activities: [{ id: 'root-private' }]
  } }));
  await assert.rejects(sharing.readMemberCalendar(client, recipient, 'member-1'), /unavailable/);
  for (const snapshot of [
    { calendarData: null, activities: [{ id: 'private' }] },
    { calendars: [{ id: 'private' }, { id: 'school' }], activities: [{ id: 'private' }] },
    { calendars: [{ id: 'private' }], activities: [{ id: 'private' }] },
    { calendarData: {}, activities: [{ id: 'private' }] }
  ]) {
    const invalid = fakeClient(ok(member({ status: 'active', member_user_id: recipient.id })), ok({ schedule: snapshot }));
    await assert.rejects(sharing.readMemberCalendar(invalid, recipient, 'member-1'), /unavailable/);
  }
});

test('shared reads reject pending, revoked, or unbound access before reading owner data', async () => {
  for (const row of [member(), member({ status: 'banned' }), member({ status: 'active', member_user_id: 'other-user' })]) {
    const client = fakeClient(ok(row));
    await assert.rejects(sharing.readMemberCalendar(client, recipient, 'member-1'), /invitation/);
    assert.equal(client.requests.length, 1);
  }
});

test('legacy single-calendar rows expose only the same shared display fields', async () => {
  const client = fakeClient(ok(member({ status: 'active', member_user_id: recipient.id })), ok({ schedule: {
    kids: [], activities: [{ id: 'legacy' }], profile: { private: true }, audit: [{ secret: true }]
  } }));
  const shared = await sharing.readMemberCalendar(client, recipient, 'member-1');
  assert.deepEqual(shared.data, { kids: [], activities: [{ id: 'legacy' }] });
});

test('database failures and malformed responses surface without successful fallback data', async () => {
  const denied = new Error('permission denied');
  await assert.rejects(sharing.listCalendarMembers(fakeClient({ error: denied }), owner, 'school'), error => error === denied);
  await assert.rejects(sharing.inviteCalendarMember(fakeClient(ok(null), { error: denied }), owner, calendar, { email: recipient.email }), error => error === denied);
  await assert.rejects(sharing.respondCalendarInvitation(fakeClient(ok(member()), { error: denied }), recipient, 'member-1', 'active'), error => error === denied);
  await assert.rejects(sharing.readMemberCalendar(fakeClient(ok(member({ status: 'active', member_user_id: recipient.id })), { error: denied }), recipient, 'member-1'), error => error === denied);
  await assert.rejects(sharing.listCalendarMembers(fakeClient(undefined), owner, 'school'), /server did not confirm/);
});

test('device-share links use confirmed tokens and the existing web invitation route', () => {
  assert.equal(sharing.buildInvitationUrl('https://kid-sync-delta.vercel.app/?tracking=1#calendar', member()), `https://kid-sync-delta.vercel.app/?invite=${token}`);
  assert.throws(() => sharing.buildInvitationUrl('https://example.com', member({ status: 'banned' })), /Create the invitation online/);
  assert.throws(() => sharing.buildInvitationUrl('https://example.com', member({ invite_token: '' })), /Create the invitation online/);
  assert.throws(() => sharing.buildInvitationUrl('javascript:alert(1)', member()), /website URL/);
});

test('calendar comments are scoped to the selected owner/calendar', async () => {
  const comment = { id: 'comment-1', owner_id: owner.id, calendar_id: 'school', author_user_id: recipient.id, author_email: 'person@example.com', body: 'Hello' };
  const client = fakeClient(ok([comment]));
  assert.deepEqual(await sharing.listCalendarComments(client, recipient, { id: 'school', ownerId: owner.id }), [comment]);
  assert.deepEqual(client.requests[0].filters, [['eq', 'owner_id', owner.id], ['eq', 'calendar_id', 'school']]);
  assert.deepEqual(client.requests[0].order, ['created_at', { ascending: true }]);
  const wrong = fakeClient(ok([{ ...comment, calendar_id: 'other' }]));
  await assert.rejects(sharing.listCalendarComments(wrong, owner, calendar), /could not be confirmed/);
});

test('owner comments bind the author to the current account and require server confirmation', async () => {
  const comment = { id: 'comment-1', owner_id: owner.id, calendar_id: 'school', author_user_id: owner.id, author_email: 'owner@example.com', body: 'Pickup changed' };
  const client = fakeClient(ok(comment));
  assert.deepEqual(await sharing.addCalendarComment(client, owner, calendar, { body: ' Pickup changed ' }), comment);
  assert.deepEqual(client.requests[0].payload, {
    owner_id: owner.id, calendar_id: 'school', author_user_id: owner.id, author_email: 'owner@example.com', body: 'Pickup changed'
  });
  await assert.rejects(sharing.addCalendarComment(fakeClient(ok(null)), owner, calendar, { body: 'Hello' }), /could not be confirmed/);
});

test('only authenticated, active, bound commenters or editors may add shared comments', async () => {
  for (const role of ['commenter', 'editor']) {
    const membership = member({ status: 'active', role, member_user_id: recipient.id });
    const comment = { id: 'comment-1', owner_id: owner.id, calendar_id: 'school', author_user_id: recipient.id, author_email: 'person@example.com', body: 'Hello' };
    const client = fakeClient(ok(membership), ok(comment));
    await sharing.addCalendarComment(client, recipient, { id: 'school', ownerId: owner.id }, { body: 'Hello' });
    assert.deepEqual(client.requests[0].filters, [
      ['eq', 'owner_id', owner.id], ['eq', 'calendar_id', 'school'],
      ['ilike', 'member_email', 'person@example.com'], ['eq', 'status', 'active']
    ]);
    client.done();
  }
  for (const changes of [{ role: 'viewer' }, { role: 'editor', member_user_id: 'other-user' }, { role: 'commenter', status: 'banned' }]) {
    const client = fakeClient(ok(member({ status: 'active', member_user_id: recipient.id, ...changes })));
    await assert.rejects(sharing.addCalendarComment(client, recipient, { id: 'school', ownerId: owner.id, role: 'editor' }, { body: 'Hello' }), /access is required/);
    assert.equal(client.requests.length, 1, 'A role supplied by the screen cannot override actual membership');
  }
});

test('calendar comments reject unsupported event binding, empty text, and excessive body length', async () => {
  const client = fakeClient();
  await assert.rejects(sharing.listCalendarComments(client, owner, calendar, { eventId: 'event-1' }), /not event-specific/);
  await assert.rejects(sharing.addCalendarComment(client, owner, calendar, { eventId: 'event-1', body: 'Hello' }), /not event-specific/);
  await assert.rejects(sharing.addCalendarComment(client, owner, calendar, { body: '  ' }), /Write a comment/);
  await assert.rejects(sharing.addCalendarComment(client, owner, calendar, { body: 'x'.repeat(1001) }), /1000 characters/);
  assert.equal(client.requests.length, 0);
});
