// Online-only shared event operations. The checked server RPC is required for
// every mutation; the older whole-array RPC is intentionally never called.
const schedules = require('./schedules');

const CHECKED_RPC = 'mutate_shared_calendar_activities_checked';
const ROLES = ['viewer', 'commenter', 'editor', 'owner'];
const DISPLAY_FIELDS = ['location', 'responsible', 'items', 'notes', 'icon', 'start', 'end'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const validId = value => typeof value === 'string' && !!value.trim() && value.length <= 300
  || typeof value === 'number' && Number.isFinite(value);

class SharedCalendarError extends Error {
  constructor(code, message) { super(message); this.name = 'SharedCalendarError'; this.code = code; }
}
const fail = (code, message) => { throw new SharedCalendarError(code, message); };
function copy(value) {
  const seen = new Set();
  function check(item) {
    if (item === null || ['string', 'boolean'].includes(typeof item) || typeof item === 'number' && Number.isFinite(item)) return;
    if ((!record(item) && !Array.isArray(item)) || seen.has(item)) fail('INVALID_ACTIVITY', 'Use valid activity details.');
    seen.add(item);
    if (Array.isArray(item)) for (let index = 0; index < item.length; index++) {
      if (!own(item, index)) fail('INVALID_ACTIVITY', 'Use valid activity details.');
      check(item[index]);
    }
    else Object.keys(item).forEach(key => check(item[key]));
    seen.delete(item);
  }
  check(value); return JSON.parse(JSON.stringify(value));
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 300) fail('INVALID_SCOPE', label);
  return value.trim();
}
function email(value) { return text(value, 'Sign in to view this shared calendar.').toLowerCase(); }
function scopeFor(account, calendar) {
  return { actorId: text(account?.id, 'Sign in to view this shared calendar.'), email: email(account?.email),
    ownerId: text(calendar?.ownerId || calendar?.owner_id, 'Choose a shared calendar.'),
    calendarId: text(calendar?.id || calendar?.calendar_id, 'Choose a shared calendar.'),
    invitationId: calendar?.invitation?.id || calendar?.invitationId || '' };
}
const current = options => { if (options?.isCurrent && !options.isCurrent()) fail('STALE_SCOPE', 'This calendar is no longer open.'); };
async function requireAccount(client, scope, options) {
  current(options);
  if (typeof client?.auth?.getUser !== 'function') fail('FORBIDDEN', 'Sign in to view this shared calendar.');
  const result = await client.auth.getUser();
  current(options);
  if (result?.error) throw result.error;
  const user = result?.data?.user;
  if (user?.id !== scope.actorId || typeof user.email !== 'string' || user.email.trim().toLowerCase() !== scope.email) {
    fail('FORBIDDEN', 'Sign in with the invited account.');
  }
  return user;
}
function serverError(error) {
  if (['PGRST202', 'PGRST203', '42883'].includes(String(error?.code))) {
    return new SharedCalendarError('SETUP_REQUIRED', 'Shared event editing needs a server update.');
  }
  if (['42501', 'PGRST301', 'PGRST302', '401', '403'].includes(String(error?.code || error?.status))) {
    return new SharedCalendarError('FORBIDDEN', 'Your calendar access changed. Refresh before continuing.');
  }
  if (String(error?.code) === '40001') return new SharedCalendarError('CONFLICT', 'This calendar changed. Refresh before saving.');
  if (String(error?.code) === 'P0002') return new SharedCalendarError('NO_CALENDAR', 'This shared calendar is no longer available.');
  if (['22023', '22007', '22008', '22P02', '23505'].includes(String(error?.code))) {
    return new SharedCalendarError('INVALID_ACTIVITY', 'Check the activity details.');
  }
  return error;
}
function selectedResult(value, scope) {
  const entry = value?.calendar;
  if (!record(value) || value.ownerId !== scope.ownerId || value.calendarId !== scope.calendarId
    || !ROLES.includes(value.role) || value.role === 'owner' && scope.actorId !== scope.ownerId
    || typeof value.canWrite !== 'boolean' || value.canWrite !== ['editor', 'owner'].includes(value.role)
    || typeof value.updated_at !== 'string' || !Number.isFinite(Date.parse(value.updated_at))
    || !record(entry) || entry.id !== scope.calendarId || entry.ownerId !== scope.ownerId || entry.role !== value.role
    || !record(entry.data) || !Array.isArray(entry.data.kids) || !Array.isArray(entry.data.activities)) {
    fail('INVALID_RESPONSE', 'The shared calendar could not be confirmed. Refresh before continuing.');
  }
  // Construct the public return shape rather than passing through a whole row or
  // accidental server extras such as another calendar or the owner's profile.
  return { shared: true, ownerId: scope.ownerId, calendarId: scope.calendarId, role: value.role,
    canWrite: value.canWrite, setupRequired: false, updated_at: value.updated_at,
    calendar: { id: scope.calendarId, ownerId: scope.ownerId, name: typeof entry.name === 'string' ? entry.name : 'Family',
      role: value.role, updatedAt: value.updated_at, data: copy({ kids: entry.data.kids, activities: entry.data.activities }) },
    ...(value.undoToken != null ? { undoToken: checkedUndo(value.undoToken, scope) } : {}) };
}
function checkedUndo(value, scope) {
  const token = copy(value);
  if (!record(token) || token.version !== 1 || token.userId !== scope.actorId
    || token.ownerId !== scope.ownerId || token.calendarId !== scope.calendarId
    || !Array.isArray(token.changes) || !token.changes.length || token.changes.length > 20) {
    fail('CONFLICT', 'This change cannot be undone in this calendar.');
  }
  return token;
}
async function checkedCall(client, scope, { changes = [], expected = null, undo = null }, options) {
  current(options);
  if (typeof client?.rpc !== 'function') fail('SETUP_REQUIRED', 'Shared event editing needs a server update.');
  const result = await client.rpc(CHECKED_RPC, { calendar_owner_id: scope.ownerId,
    shared_calendar_id: scope.calendarId, expected_updated_at: expected, changes,
    undo_token: undo, expected_actor_id: scope.actorId });
  current(options);
  if (result?.error) throw serverError(result.error);
  if (!result?.data) fail('INVALID_RESPONSE', 'The server did not confirm the shared calendar.');
  const selected = selectedResult(result.data, scope);
  if ((changes.length || undo) && (!selected.canWrite || selected.updated_at === expected)) {
    fail('INVALID_RESPONSE', 'The server did not confirm the shared calendar change.');
  }
  return selected;
}
async function readableFallback(client, account, calendar, scope, options) {
  let role = 'owner';
  if (scope.actorId !== scope.ownerId) {
    const pattern = scope.email.replace(/[\\%_]/g, '\\$&');
    let query = client.from('calendar_members').select('id,owner_id,calendar_id,member_user_id,member_email,status,role')
      .eq('owner_id', scope.ownerId).eq('calendar_id', scope.calendarId).eq('member_user_id', scope.actorId)
      .ilike('member_email', pattern).eq('status', 'active');
    if (scope.invitationId) query = query.eq('id', scope.invitationId);
    const response = await query.maybeSingle(); current(options);
    if (response.error) throw serverError(response.error);
    const member = response.data;
    if (!member?.id || member.owner_id !== scope.ownerId || member.calendar_id !== scope.calendarId
      || member.member_user_id !== scope.actorId || member.member_email?.toLowerCase() !== scope.email
      || member.status !== 'active' || !['viewer', 'commenter', 'editor'].includes(member.role)) {
      fail('FORBIDDEN', 'Your calendar access changed. Refresh before continuing.');
    }
    role = member.role;
  }
  const row = await schedules.readSchedule(client, scope.ownerId); current(options);
  const snapshot = row?.schedule;
  if (!record(snapshot)) fail('NO_CALENDAR', 'This shared calendar is no longer available.');
  let selected, name = calendar.name || 'Family';
  if (own(snapshot, 'calendarData')) {
    const metadata = Array.isArray(snapshot.calendars) ? snapshot.calendars.filter(item => item?.id === scope.calendarId) : [];
    if (!record(snapshot.calendarData) || !own(snapshot.calendarData, scope.calendarId)
      || !record(snapshot.calendarData[scope.calendarId]) || metadata.length !== 1) {
      fail('NO_CALENDAR', 'This shared calendar is no longer available.');
    }
    selected = snapshot.calendarData[scope.calendarId]; name = metadata[0].name || name;
  } else {
    if (own(snapshot, 'calendars') ? !Array.isArray(snapshot.calendars) || snapshot.calendars.length !== 1
      || snapshot.calendars[0]?.id !== scope.calendarId : scope.calendarId !== 'family') {
      fail('NO_CALENDAR', 'This shared calendar is no longer available.');
    }
    selected = snapshot;
  }
  if (selected.activities != null && !Array.isArray(selected.activities)) fail('NO_CALENDAR', 'This shared calendar cannot be read safely.');
  const entry = { id: scope.calendarId, ownerId: scope.ownerId, role, name, updatedAt: row.updated_at,
    data: { kids: Array.isArray(selected.kids) ? selected.kids : [], activities: selected.activities || [] } };
  return { shared: true, ownerId: scope.ownerId, calendarId: scope.calendarId, role: entry.role,
    canWrite: false, setupRequired: true, updated_at: entry.updatedAt,
    calendar: { id: entry.id, ownerId: entry.ownerId, role: entry.role, name: entry.name || calendar.name || 'Family',
      updatedAt: entry.updatedAt, data: copy({ kids: entry.data?.kids || [], activities: entry.data?.activities || [] }) } };
}

async function readSharedCalendar(client, account, calendar, options = {}) {
  const scope = scopeFor(account, calendar);
  const user = await requireAccount(client, scope, options);
  try { return await checkedCall(client, scope, {}, options); }
  catch (error) {
    if (error?.code !== 'SETUP_REQUIRED') throw error;
    return readableFallback(client, user, calendar, scope, options);
  }
}
function changeList(input) {
  const changes = copy(input);
  if (!Array.isArray(changes) || !changes.length || changes.length > 20) fail('INVALID_ACTIVITY', 'Use valid activity changes.');
  const ids = new Set();
  for (const change of changes) {
    if (!record(change) || !own(change, 'original') || !own(change, 'event')
      || change.original !== null && !record(change.original) || change.event !== null && !record(change.event)
      || change.original === null && change.event === null) fail('INVALID_ACTIVITY', 'Use valid original activities.');
    const id = change.original?.id ?? change.event?.id;
    if (!validId(id) || ids.has(id) || change.original && change.event && change.original.id !== change.event.id) {
      fail('INVALID_ACTIVITY', 'Use distinct original activities.');
    }
    if (change.event && DISPLAY_FIELDS.some(key => own(change.event, key)
      && change.event[key] !== null && typeof change.event[key] !== 'string')) {
      fail('INVALID_ACTIVITY', 'Use text for activity details.');
    }
    ids.add(id);
  }
  return changes;
}
async function mutateSharedActivities(client, account, calendar, changes, options = {}) {
  const scope = scopeFor(account, calendar), input = changeList(changes);
  await requireAccount(client, scope, options);
  // Probe the checked RPC directly. A missing deployment never falls back to a
  // blind write or treats the readable legacy fallback as editing capability.
  const access = await checkedCall(client, scope, {}, options);
  if (!access.canWrite) fail('FORBIDDEN', 'Editor access is required to change this calendar.');
  await requireAccount(client, scope, options);
  return checkedCall(client, scope, { changes: input, expected: access.updated_at }, options);
}
function saveSharedActivity(client, account, calendar, event, { original = null, ...options } = {}) {
  return mutateSharedActivities(client, account, calendar, [{ original, event }], options);
}
function deleteSharedActivity(client, account, calendar, eventId, { original, ...options } = {}) {
  if (!record(original) || original.id !== eventId) return Promise.reject(new SharedCalendarError('CONFLICT', 'Refresh the activity before deleting it.'));
  return mutateSharedActivities(client, account, calendar, [{ original, event: null }], options);
}
async function restoreSharedActivities(client, account, calendar, token, options = {}) {
  const scope = scopeFor(account, calendar), undo = checkedUndo(token, scope);
  await requireAccount(client, scope, options);
  const access = await checkedCall(client, scope, {}, options);
  if (!access.canWrite) fail('FORBIDDEN', 'Editor access is required to undo this change.');
  await requireAccount(client, scope, options);
  return checkedCall(client, scope, { expected: access.updated_at, undo }, options);
}
function createSharedCalendarAdapter({ client, account, calendar, isCurrent = () => true } = {}) {
  const captured = scopeFor(account, calendar), options = { isCurrent };
  const boundAccount = Object.freeze({ id: captured.actorId, email: captured.email });
  const boundCalendar = Object.freeze({ id: captured.calendarId, ownerId: captured.ownerId,
    name: typeof calendar.name === 'string' ? calendar.name : 'Family', invitationId: captured.invitationId });
  const scope = Object.freeze({ kind: 'shared', actorId: captured.actorId, ownerId: captured.ownerId, calendarId: captured.calendarId });
  function check(argsClient, actorId, calendarId) {
    current(options);
    if (argsClient !== client || actorId !== captured.actorId || calendarId !== captured.calendarId) fail('STALE_SCOPE', 'This shared calendar is no longer open.');
  }
  return Object.freeze({ scope,
    saveActivity(argsClient, actorId, calendarId, event, args = {}) { check(argsClient, actorId, calendarId); return saveSharedActivity(client, boundAccount, boundCalendar, event, { ...args, ...options }); },
    deleteActivity(argsClient, actorId, calendarId, eventId, args = {}) { check(argsClient, actorId, calendarId); return deleteSharedActivity(client, boundAccount, boundCalendar, eventId, { ...args, ...options }); },
    mutateActivities(argsClient, actorId, calendarId, changes) { check(argsClient, actorId, calendarId); return mutateSharedActivities(client, boundAccount, boundCalendar, changes, options); },
    restoreActivities(argsClient, actorId, calendarId, token) { check(argsClient, actorId, calendarId); return restoreSharedActivities(client, boundAccount, boundCalendar, token, options); },
    createCalendar() { fail('FORBIDDEN', 'Only the calendar owner can create calendars.'); }
  });
}

module.exports = { CHECKED_RPC, SharedCalendarError, readSharedCalendar, saveSharedActivity, deleteSharedActivity,
  mutateSharedActivities, restoreSharedActivities, createSharedCalendarAdapter };
