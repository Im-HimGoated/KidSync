// Uses the existing Supabase schema and the caller's current session.user.
// RLS remains the authority; explicit filters also keep each request scoped to
// the captured account/calendar when native screens change while awaiting I/O.
const MEMBER_TABLE = 'calendar_members';
const COMMENT_TABLE = 'calendar_comments';
const MEMBER_COLUMNS = 'id,owner_id,owner_email,calendar_id,calendar_name,member_email,member_user_id,invite_token,role,invitation_note,status,created_at';
const COMMENT_COLUMNS = 'id,owner_id,calendar_id,author_user_id,author_email,body,created_at';
const CALENDAR_ROLES = Object.freeze(['viewer', 'commenter', 'editor']);
const MEMBER_STATUSES = ['pending', 'active', 'declined', 'banned'];
const INVITE_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredText(value, message) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}

function normalizeEmail(value) {
  const email = requiredText(value, 'A valid email address is required.').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email address is required.');
  return email;
}

function accountScope(user) {
  return {
    id: requiredText(user?.id, 'Sign in before sharing a calendar.'),
    email: normalizeEmail(user?.email)
  };
}

function roleValue(role) {
  if (!CALENDAR_ROLES.includes(role)) throw new Error('Choose viewer, commenter, or editor access.');
  return role;
}

function calendarScope(user, calendar) {
  return {
    id: requiredText(typeof calendar === 'string' ? calendar : calendar?.id, 'Select a calendar first.'),
    ownerId: calendar?.ownerId || calendar?.owner_id || user.id
  };
}

// ILIKE supports existing mixed-case email rows. Escape pattern characters so
// addresses containing _ or % never select another recipient's invitation.
function emailPattern(email) { return email.replace(/[\\%_]/g, '\\$&'); }

function checkedMember(member, { id, ownerId, calendarId, email } = {}) {
  if (!member || !member.id || !member.owner_id || !member.calendar_id
    || (id && member.id !== id)
    || (ownerId && member.owner_id !== ownerId)
    || (calendarId && member.calendar_id !== calendarId)
    || (email && normalizeEmail(member.member_email) !== email)) {
    throw new Error('Calendar access could not be confirmed. Refresh and try again.');
  }
  roleValue(member.role);
  if (!MEMBER_STATUSES.includes(member.status)) throw new Error('Calendar access status is unavailable.');
  return member;
}

function protectOwner(member, user) {
  if (member.member_user_id === user.id || normalizeEmail(member.member_email) === user.email) {
    throw new Error('The calendar owner cannot invite themselves or change their own access.');
  }
}

function confirmedInvitation(member, user, calendarId, recipient, role, note) {
  checkedMember(member, { ownerId: user.id, calendarId, email: recipient });
  if (member.role !== role || member.status !== 'pending' || member.invitation_note !== note
    || !INVITE_TOKEN_PATTERN.test(member.invite_token || '')) {
    throw new Error('The invitation could not be confirmed. Refresh before trying again.');
  }
  return member;
}

async function resultOf(request) {
  const result = await request;
  if (result?.error) throw result.error;
  if (!result) throw new Error('The server did not confirm this request.');
  return result.data;
}

async function ownedMember(client, user, calendarId, memberId) {
  const id = requiredText(memberId, 'Select a calendar member first.');
  const member = await resultOf(client.from(MEMBER_TABLE).select(MEMBER_COLUMNS)
    .eq('id', id).eq('owner_id', user.id).eq('calendar_id', calendarId).maybeSingle());
  checkedMember(member, { id, ownerId: user.id, calendarId });
  protectOwner(member, user);
  return member;
}

async function recipientInvitation(client, user, invitationId) {
  const id = requiredText(invitationId, 'Select an invitation first.');
  const member = await resultOf(client.from(MEMBER_TABLE).select(MEMBER_COLUMNS)
    .eq('id', id).ilike('member_email', emailPattern(user.email)).maybeSingle());
  return checkedMember(member, { id, email: user.email });
}

async function listCalendarMembers(client, account, calendarId) {
  const user = accountScope(account);
  const id = requiredText(calendarId, 'Select a calendar first.');
  const members = await resultOf(client.from(MEMBER_TABLE).select(MEMBER_COLUMNS)
    .eq('owner_id', user.id).eq('calendar_id', id).order('created_at', { ascending: true }));
  if (!Array.isArray(members)) throw new Error('Calendar members could not be loaded.');
  return members.map(member => checkedMember(member, { ownerId: user.id, calendarId: id }));
}

async function listCalendarInvitations(client, account) {
  const user = accountScope(account);
  const invitations = await resultOf(client.from(MEMBER_TABLE).select(MEMBER_COLUMNS)
    .ilike('member_email', emailPattern(user.email)).in('status', ['pending', 'active'])
    .order('created_at', { ascending: false }));
  if (!Array.isArray(invitations)) throw new Error('Calendar invitations could not be loaded.');
  return invitations.map(member => {
    checkedMember(member, { email: user.email });
    if (!['pending', 'active'].includes(member.status)) throw new Error('This invitation is unavailable.');
    return member;
  });
}

async function inviteCalendarMember(client, account, calendar, { email, role = 'viewer', note = '' } = {}) {
  const user = accountScope(account);
  const scope = calendarScope(user, calendar);
  if (scope.ownerId !== user.id) throw new Error('Only the calendar owner can invite people.');
  const recipient = normalizeEmail(email);
  if (recipient === user.email) throw new Error('The calendar owner cannot invite themselves.');
  roleValue(role);
  if (typeof note !== 'string' || Array.from(note.trim()).length > 500) throw new Error('Invitation notes must be 500 characters or fewer.');
  const existing = await resultOf(client.from(MEMBER_TABLE).select(MEMBER_COLUMNS)
    .eq('owner_id', user.id).eq('calendar_id', scope.id)
    .ilike('member_email', emailPattern(recipient)).maybeSingle());
  if (existing) {
    checkedMember(existing, { ownerId: user.id, calendarId: scope.id, email: recipient });
    protectOwner(existing, user);
    await resultOf(client.rpc('update_calendar_member_share', {
      member_id: existing.id, next_status: 'pending', next_role: role, next_note: note.trim()
    }));
    const saved = await ownedMember(client, user, scope.id, existing.id);
    return confirmedInvitation(saved, user, scope.id, recipient, role, note.trim());
  }
  const saved = await resultOf(client.from(MEMBER_TABLE).insert({
    owner_id: user.id, owner_email: user.email, calendar_id: scope.id,
    calendar_name: typeof calendar?.name === 'string' && calendar.name.trim() ? calendar.name.trim() : 'Family',
    member_email: recipient, role, invitation_note: note.trim(), status: 'pending'
  }).select(MEMBER_COLUMNS).single());
  return confirmedInvitation(saved, user, scope.id, recipient, role, note.trim());
}

async function changeCalendarMemberRole(client, account, calendarId, memberId, role) {
  const user = accountScope(account);
  const id = requiredText(calendarId, 'Select a calendar first.');
  roleValue(role);
  const member = await ownedMember(client, user, id, memberId);
  // Updating only role avoids restoring a stale status after a concurrent ban.
  const saved = await resultOf(client.from(MEMBER_TABLE).update({ role })
    .eq('id', member.id).eq('owner_id', user.id).eq('calendar_id', id)
    .select(MEMBER_COLUMNS).single());
  checkedMember(saved, { id: member.id, ownerId: user.id, calendarId: id });
  if (saved.role !== role) throw new Error('The new calendar role could not be confirmed.');
  return saved;
}

async function revokeCalendarMember(client, account, calendarId, memberId) {
  const user = accountScope(account);
  const id = requiredText(calendarId, 'Select a calendar first.');
  const member = await ownedMember(client, user, id, memberId);
  const removed = await resultOf(client.from(MEMBER_TABLE).delete()
    .eq('id', member.id).eq('owner_id', user.id).eq('calendar_id', id)
    .select(MEMBER_COLUMNS).maybeSingle());
  checkedMember(removed, { id: member.id, ownerId: user.id, calendarId: id });
  return removed;
}

async function respondCalendarInvitation(client, account, invitationId, status) {
  const user = accountScope(account);
  if (!['active', 'declined'].includes(status)) throw new Error('Choose Accept or Decline.');
  const invitation = await recipientInvitation(client, user, invitationId);
  if (invitation.status === 'banned') throw new Error('This invitation is no longer available.');
  await resultOf(client.rpc('respond_calendar_invitation', { invitation_id: invitation.id, next_status: status }));
  const saved = await recipientInvitation(client, user, invitation.id);
  if (saved.status !== status || saved.member_user_id !== user.id) {
    throw new Error('Your invitation response could not be confirmed. Refresh before trying again.');
  }
  return saved;
}

async function readMemberCalendar(client, account, invitationId) {
  const user = accountScope(account);
  const invitation = await recipientInvitation(client, user, invitationId);
  if (invitation.status !== 'active') throw new Error('Accept this calendar invitation before opening it.');
  if (invitation.member_user_id !== user.id) throw new Error('Accept this invitation with the invited account first.');
  // Existing active-member RLS supports this read. Do not fall back to a bearer
  // preview if access was revoked or the authenticated read fails.
  const row = await resultOf(client.from('family_schedules').select('schedule, updated_at')
    .eq('user_id', invitation.owner_id).maybeSingle());
  if (!row?.schedule || typeof row.schedule !== 'object') throw new Error('This shared calendar is unavailable.');
  const snapshot = row.schedule;
  let shared;
  if (Object.prototype.hasOwnProperty.call(snapshot, 'calendarData')) {
    const calendars = snapshot.calendarData;
    if (!calendars || typeof calendars !== 'object' || Array.isArray(calendars)
      || !Object.prototype.hasOwnProperty.call(calendars, invitation.calendar_id)) {
      throw new Error('This shared calendar is unavailable.');
    }
    shared = calendars[invitation.calendar_id];
  } else {
    // Root-level fields are safe only for the old single-calendar format.
    if (Array.isArray(snapshot.calendars) && snapshot.calendars.length
      && (snapshot.calendars.length !== 1 || snapshot.calendars[0]?.id !== invitation.calendar_id)) {
      throw new Error('This shared calendar is unavailable.');
    }
    shared = snapshot;
  }
  if (!shared || typeof shared !== 'object' || Array.isArray(shared)) throw new Error('This shared calendar is unavailable.');
  // The existing RLS returns the owner's whole row. Expose only the selected
  // calendar's display data, never account settings/profile or other calendars.
  return {
    id: invitation.calendar_id, name: invitation.calendar_name || 'Family',
    ownerId: invitation.owner_id, ownerEmail: invitation.owner_email,
    role: invitation.role, invitation, updatedAt: row.updated_at,
    data: {
      kids: Array.isArray(shared.kids) ? shared.kids : [],
      activities: Array.isArray(shared.activities) ? shared.activities : []
    }
  };
}

function buildInvitationUrl(baseUrl, member) {
  if (!member || !['pending', 'active'].includes(member.status)
    || !INVITE_TOKEN_PATTERN.test(member.invite_token || '')) {
    throw new Error('Create the invitation online before sharing its link.');
  }
  const url = new URL(baseUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use the KidsSync website URL for invitation links.');
  url.search = '';
  url.hash = '';
  url.searchParams.set('invite', member.invite_token);
  return url.href;
}

function calendarCommentScope(account, calendar, options) {
  const user = accountScope(account);
  const scope = calendarScope(user, calendar);
  if (options?.eventId) throw new Error('This backend supports calendar comments, not event-specific comments.');
  return { user, scope };
}

async function listCalendarComments(client, account, calendar, options = {}) {
  const { scope } = calendarCommentScope(account, calendar, options);
  const comments = await resultOf(client.from(COMMENT_TABLE).select(COMMENT_COLUMNS)
    .eq('owner_id', scope.ownerId).eq('calendar_id', scope.id).order('created_at', { ascending: true }));
  if (!Array.isArray(comments)) throw new Error('Calendar comments could not be loaded.');
  if (comments.some(comment => comment.owner_id !== scope.ownerId || comment.calendar_id !== scope.id)) {
    throw new Error('Calendar comments could not be confirmed.');
  }
  return comments;
}

async function addCalendarComment(client, account, calendar, options = {}) {
  const { user, scope } = calendarCommentScope(account, calendar, options);
  const body = requiredText(options.body, 'Write a comment first.');
  if (Array.from(body).length > 1000) throw new Error('Comments must be 1000 characters or fewer.');
  if (scope.ownerId !== user.id) {
    const membership = await resultOf(client.from(MEMBER_TABLE).select(MEMBER_COLUMNS)
      .eq('owner_id', scope.ownerId).eq('calendar_id', scope.id)
      .ilike('member_email', emailPattern(user.email)).eq('status', 'active').maybeSingle());
    checkedMember(membership, { ownerId: scope.ownerId, calendarId: scope.id, email: user.email });
    if (membership.status !== 'active' || membership.member_user_id !== user.id
      || !['commenter', 'editor'].includes(membership.role)) throw new Error('Commenter or editor access is required.');
  }
  const saved = await resultOf(client.from(COMMENT_TABLE).insert({
    owner_id: scope.ownerId, calendar_id: scope.id, author_user_id: user.id, author_email: user.email, body
  }).select(COMMENT_COLUMNS).single());
  if (!saved?.id || saved.owner_id !== scope.ownerId || saved.calendar_id !== scope.id
    || saved.author_user_id !== user.id || normalizeEmail(saved.author_email) !== user.email || saved.body !== body) {
    throw new Error('Your comment could not be confirmed. Refresh before trying again.');
  }
  return saved;
}

module.exports = {
  MEMBER_TABLE, CALENDAR_ROLES, listCalendarMembers, listCalendarInvitations,
  inviteCalendarMember, changeCalendarMemberRole, revokeCalendarMember,
  respondCalendarInvitation, readMemberCalendar, buildInvitationUrl,
  listCalendarComments, addCalendarComment
};
