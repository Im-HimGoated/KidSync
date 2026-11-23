const calendar = require('../lib/calendar');

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && !!value.trim() && value.length <= 300
  || typeof value === 'number' && Number.isFinite(value);
const textId = value => typeof value === 'string' && !!value.trim() && value.length <= 300;
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
function pickupDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = calendar.parseDateKey(value);
  return Number.isFinite(day.getTime()) && day.getFullYear() >= 1 && calendar.dateKey(day) === value ? day : null;
}

/**
 * Return only a current saved plan for this exact pickup day. Pickup records can
 * outlive a cancelled, moved or excluded occurrence, so their status alone does
 * not establish that a recipient still has a plan to confirm.
 * The caller owns pickup status, recipient and account/calendar access checks.
 */
function resolvePickupEvent(events, pickup) {
  if (!Array.isArray(events) || !record(pickup) || !validId(pickup.event_id)) return null;
  const day = pickupDay(pickup.occurrence_date);
  if (!day) return null;
  const matches = events.filter(event => record(event) && validId(event.id) && String(event.id) === String(pickup.event_id));
  if (matches.length !== 1) return null;
  const event = matches[0];
  if (event.status === 'cancelled' || event.isBuiltInHoliday || event.eventType === 'holiday' || event.externalSource) return null;
  try { return calendar.occurrencesForDate(event, day).length ? event : null; }
  catch { return null; }
}

/**
 * Check the current plan before answering an Inbox request. The backend response
 * must retain its existing pickup-version CAS: a plan edit after this preflight
 * advances the pickup version and invalidates the captured request.
 */
async function respondToCurrentPickup({ pickup, status, readCalendar, respond, isCurrent = () => true } = {}) {
  const current = () => {
    if (typeof isCurrent !== 'function' || !isCurrent()) fail('STALE_SCOPE', 'This pickup request is no longer open.');
  };
  current();
  if (!record(pickup) || pickup.status !== 'pending' || !['accepted', 'declined'].includes(status)
    || !textId(pickup.id) || !textId(pickup.owner_id) || !textId(pickup.calendar_id)
    || !validId(pickup.event_id) || !pickupDay(pickup.occurrence_date)
    || typeof pickup.updated_at !== 'string' || !Number.isFinite(Date.parse(pickup.updated_at))
    || typeof readCalendar !== 'function' || typeof respond !== 'function') {
    fail('PICKUP_UNAVAILABLE', 'Refresh this pickup request before answering.');
  }
  // Capture the exact version text before awaiting; a caller's later refresh
  // must not replace the baseline of an already-started response.
  const request = Object.freeze({ ...pickup });
  let selected;
  current();
  try { selected = await readCalendar(); }
  catch (error) { current(); throw error; }
  current();
  if (!record(selected) || selected.id !== request.calendar_id || selected.ownerId !== request.owner_id
    || !resolvePickupEvent(selected.data?.activities, request)) {
    fail('PICKUP_UNAVAILABLE', 'This plan is no longer available for pickup.');
  }
  current();
  let saved;
  try { saved = await respond(request, status); }
  catch (error) { current(); throw error; }
  current();
  return saved;
}

module.exports = { resolvePickupEvent, respondToCurrentPickup };
