// Native handoff requests use the existing family-coordination schema. RLS and
// RPC checks remain authoritative; these guards keep stale screens scoped too.
const PICKUP_TABLE = 'calendar_pickups';
const PICKUP_COLUMNS = 'id,owner_id,calendar_id,event_id,occurrence_date,assignee_email,status,assigned_by,responded_at,updated_at';
const PICKUP_STATUSES = Object.freeze(['pending', 'accepted', 'declined', 'cancelled']);

function requiredText(value, message) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}

function normalizeEmail(value) {
  const email = requiredText(value, 'Choose a valid family member email.').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Choose a valid family member email.');
  return email;
}

function validDate(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function accountScope(account) {
  return { id: requiredText(account?.id, 'Sign in before coordinating pickups.'), email: normalizeEmail(account?.email) };
}

function calendarScope(account, calendar) {
  return {
    ownerId: requiredText(calendar?.ownerId || calendar?.owner_id || account.id, 'Choose a calendar first.'),
    calendarId: requiredText(calendar?.id || calendar?.calendar_id, 'Choose a calendar first.')
  };
}

function checkedPickup(row, scope = {}) {
  if (!row?.id || !row.owner_id || !row.calendar_id || !row.event_id || !validDate(row.occurrence_date)
    || !PICKUP_STATUSES.includes(row.status)
    || (scope.ownerId && row.owner_id !== scope.ownerId)
    || (scope.calendarId && row.calendar_id !== scope.calendarId)
    || (scope.id && row.id !== scope.id)
    || (scope.eventId && String(row.event_id) !== String(scope.eventId))
    || (scope.date && row.occurrence_date !== scope.date)) {
    throw new Error('Pickup responsibility could not be confirmed. Refresh and try again.');
  }
  normalizeEmail(row.assignee_email);
  return row;
}

async function resultOf(request) {
  const result = await request;
  if (result?.error) throw result.error;
  if (!result) throw new Error('The server did not confirm this request.');
  return result.data;
}

async function listCalendarPickups(client, account, calendar, { startDate, endDate } = {}) {
  const user = accountScope(account), scope = calendarScope(user, calendar);
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) throw new Error('Choose a valid pickup date range.');
  const rows = await resultOf(client.from(PICKUP_TABLE).select(PICKUP_COLUMNS)
    .eq('owner_id', scope.ownerId).eq('calendar_id', scope.calendarId)
    .gte('occurrence_date', startDate).lte('occurrence_date', endDate)
    .order('occurrence_date', { ascending: true }));
  if (!Array.isArray(rows)) throw new Error('Pickup responsibilities could not be loaded.');
  return rows.map(row => checkedPickup(row, scope));
}

async function assignCalendarPickup(client, account, calendar, { eventId, date, email } = {}) {
  const user = accountScope(account), scope = calendarScope(user, calendar);
  const event = requiredText(String(eventId ?? ''), 'Choose a saved event first.');
  if (!validDate(date)) throw new Error('Choose a valid pickup date.');
  const assignee = normalizeEmail(email);
  await resultOf(client.rpc('assign_calendar_pickup', {
    p_owner: scope.ownerId, p_calendar: scope.calendarId, p_event: event, p_day: date, p_email: assignee
  }));
  const saved = await resultOf(client.from(PICKUP_TABLE).select(PICKUP_COLUMNS)
    .eq('owner_id', scope.ownerId).eq('calendar_id', scope.calendarId)
    .eq('event_id', event).eq('occurrence_date', date).maybeSingle());
  checkedPickup(saved, { ...scope, eventId: event, date });
  if (normalizeEmail(saved.assignee_email) !== assignee || saved.status !== 'pending') {
    throw new Error('Pickup responsibility could not be confirmed. Refresh and try again.');
  }
  return saved;
}

async function respondCalendarPickup(client, account, pickup, status) {
  const user = accountScope(account);
  if (!['accepted', 'declined'].includes(status)) throw new Error('Choose Accept or Decline.');
  const row = checkedPickup(pickup);
  if (normalizeEmail(row.assignee_email) !== user.email) throw new Error('Only the assigned recipient can answer this pickup request.');
  requiredText(row.updated_at, 'Refresh this pickup request before answering.');
  await resultOf(client.rpc('respond_calendar_pickup', { p_id: row.id, p_status: status, p_version: row.updated_at }));
  const saved = await resultOf(client.from(PICKUP_TABLE).select(PICKUP_COLUMNS).eq('id', row.id).maybeSingle());
  checkedPickup(saved, { id: row.id, ownerId: row.owner_id, calendarId: row.calendar_id });
  if (normalizeEmail(saved.assignee_email) !== user.email || saved.status !== status) {
    throw new Error('Your pickup response could not be confirmed. Refresh and try again.');
  }
  return saved;
}

module.exports = {
  PICKUP_TABLE, PICKUP_STATUSES, validDate, listCalendarPickups, assignCalendarPickup, respondCalendarPickup
};
