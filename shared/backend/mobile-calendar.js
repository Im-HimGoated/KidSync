// Native owner writes use the existing web snapshot. No creation or sample-data
// fallback happens while saving activities: calendar creation is an explicit API.
const { SCHEDULE_TABLE, readSchedule } = require('./schedules');

class MobileCalendarError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MobileCalendarError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new MobileCalendarError(code, message); };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const validId = value => (typeof value === 'string' && value.trim().length > 0 && value.length <= 300)
  || (typeof value === 'number' && Number.isFinite(value));

function jsonCopy(value) {
  const ancestors = new Set();
  function check(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if ((!Array.isArray(item) && !record(item)) || ancestors.has(item)) {
      fail('INVALID_ACTIVITY', 'Use valid activity details.');
    }
    ancestors.add(item);
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index += 1) {
        if (!own(item, index)) fail('INVALID_ACTIVITY', 'Use valid activity details.');
        check(item[index]);
      }
    } else Object.keys(item).forEach(key => check(item[key]));
    ancestors.delete(item);
  }
  check(value);
  return JSON.parse(JSON.stringify(value));
}

function equal(first, second) {
  if (first === second) return true;
  if (Array.isArray(first) || Array.isArray(second)) {
    return Array.isArray(first) && Array.isArray(second) && first.length === second.length
      && first.every((value, index) => equal(value, second[index]));
  }
  if (!record(first) || !record(second)) return false;
  const keys = Object.keys(first);
  return keys.length === Object.keys(second).length
    && keys.every(key => own(second, key) && equal(first[key], second[key]));
}

function validDate(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateActivity(activity) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!record(activity) || !validId(activity.id) || typeof activity.title !== 'string' || !activity.title.trim()
    || !validDate(activity.startDate)
    || (activity.endDate != null && activity.endDate !== ''
      && (!validDate(activity.endDate) || activity.endDate < activity.startDate))
    || (activity.allDay != null && typeof activity.allDay !== 'boolean')
    || (!activity.allDay && (!time.test(activity.start) || !time.test(activity.end) || activity.end <= activity.start))) {
    fail('INVALID_ACTIVITY', 'Check the activity title, date, and times.');
  }
}

function permissionError(error) {
  return error && ['42501', 'PGRST301', 'PGRST302', '401', '403'].includes(String(error.code || error.status));
}

async function requireOwner(client, userId) {
  if (typeof userId !== 'string' || !userId.trim() || typeof client?.auth?.getUser !== 'function') {
    fail('FORBIDDEN', 'Sign in to manage your calendar.');
  }
  const { data, error } = await client.auth.getUser();
  if (error || data?.user?.id !== userId) fail('FORBIDDEN', 'Sign in to manage your own calendar.');
}

async function loadOwnerRow(client, userId) {
  await requireOwner(client, userId);
  try { return await readSchedule(client, userId); }
  catch (error) {
    if (permissionError(error)) fail('FORBIDDEN', 'You do not have permission to manage this calendar.');
    throw error;
  }
}

function locateCalendar(snapshot, calendarId) {
  if (typeof calendarId !== 'string' || !calendarId.trim() || !record(snapshot)) {
    fail('NO_CALENDAR', 'Choose an existing calendar.');
  }
  if (own(snapshot, 'calendars') || own(snapshot, 'calendarData')) {
    if (!Array.isArray(snapshot.calendars) || !record(snapshot.calendarData)
      || snapshot.calendars.filter(item => record(item) && item.id === calendarId).length !== 1
      || !own(snapshot.calendarData, calendarId) || !record(snapshot.calendarData[calendarId])) {
      fail('NO_CALENDAR', 'This calendar is no longer available.');
    }
    const data = snapshot.calendarData[calendarId];
    if (data.activities != null && !Array.isArray(data.activities)) {
      fail('NO_CALENDAR', 'This calendar cannot be safely updated.');
    }
    return { activities: data.activities || [], modern: true, data };
  }
  // The read adapter exposes pre-v2 owner snapshots under this exact ID.
  if (calendarId !== 'family' || !Array.isArray(snapshot.activities)) {
    fail('NO_CALENDAR', 'Choose an existing calendar.');
  }
  return { activities: snapshot.activities, modern: false, data: snapshot };
}

function findActivity(activities, eventId) {
  const matches = activities.map((item, index) => record(item) && item.id === eventId ? index : -1).filter(index => index >= 0);
  if (matches.length > 1) fail('CONFLICT', 'Refresh this calendar before making changes.');
  return matches.length ? matches[0] : -1;
}

function changedActivities(activities, eventId, nextActivity) {
  const index = findActivity(activities, eventId);
  if (nextActivity === null) return activities.filter((_item, itemIndex) => itemIndex !== index);
  if (index < 0) return [...activities, nextActivity];
  return activities.map((item, itemIndex) => itemIndex === index ? nextActivity : item);
}

function replaceActivities(snapshot, calendarId, selected, activities, eventId, nextActivity, patch) {
  if (!selected.modern) return { ...snapshot, activities };
  const next = { ...snapshot, calendarData: {
    ...snapshot.calendarData, [calendarId]: { ...selected.data, activities }
  } };
  // Active-calendar root fields are compatibility mirrors. Modify only the
  // intended event, retaining unrelated/mismatched legacy contents verbatim.
  if (snapshot.activeCalendarId === calendarId && Array.isArray(snapshot.activities)) {
    const mirrorIndex = findActivity(snapshot.activities, eventId);
    const mirrorActivity = nextActivity === null ? null
      : mirrorIndex >= 0 ? { ...snapshot.activities[mirrorIndex], ...patch } : nextActivity;
    next.activities = changedActivities(snapshot.activities, eventId, mirrorActivity);
  }
  return next;
}

function nextVersion(previous) {
  const time = typeof previous === 'string' ? Date.parse(previous) : NaN;
  if (!Number.isFinite(time)) fail('CONFLICT', 'Refresh this calendar before making changes.');
  return new Date(Math.max(Date.now(), time + 1)).toISOString();
}

async function compareAndSet(client, userId, row, schedule) {
  const updatedAt = nextVersion(row.updated_at);
  const { data, error } = await client.from(SCHEDULE_TABLE)
    .update({ schedule, updated_at: updatedAt })
    .eq('user_id', userId).eq('updated_at', row.updated_at)
    .select('schedule, updated_at').maybeSingle();
  if (permissionError(error)) fail('FORBIDDEN', 'You do not have permission to manage this calendar.');
  if (error) throw error;
  if (!data) fail('CONFLICT', 'This calendar changed. Refresh and try again.');
  return data;
}

// The known web owner/shared-editor writers also set updated_at on every write.
// Timestamp-only CAS keeps PATCH URLs bounded for large account snapshots. The
// existing schema has no server-enforced revision: an external writer that
// reuses the identical timestamp between our read/PATCH cannot be distinguished.
// A server revision or atomic RPC is required to eliminate that final race.

async function saveActivity(client, userId, calendarId, event, { original } = {}) {
  if (!userId) fail('FORBIDDEN', 'Sign in to manage your calendar.');
  const patch = jsonCopy(event);
  if (!record(patch) || !validId(patch.id)) fail('INVALID_ACTIVITY', 'Use a valid activity.');
  const before = original == null ? null : jsonCopy(original);
  if (before && (!record(before) || before.id !== patch.id)) fail('INVALID_ACTIVITY', 'Use the original activity.');
  if (!before) validateActivity(patch);
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'Create a calendar before adding activities.');
  const selected = locateCalendar(row.schedule, calendarId);
  const index = findActivity(selected.activities, patch.id);
  if ((before && (index < 0 || !equal(selected.activities[index], before))) || (!before && index >= 0)) {
    fail('CONFLICT', 'This activity changed. Refresh and try again.');
  }
  const activity = index < 0 ? patch : { ...selected.activities[index], ...patch };
  validateActivity(activity);
  const activities = changedActivities(selected.activities, patch.id, activity);
  const snapshot = replaceActivities(row.schedule, calendarId, selected, activities, patch.id, activity, patch);
  return compareAndSet(client, userId, row, snapshot);
}

async function deleteActivity(client, userId, calendarId, eventId, { original } = {}) {
  if (!userId) fail('FORBIDDEN', 'Sign in to manage your calendar.');
  if (!validId(eventId)) fail('INVALID_ACTIVITY', 'Use a valid activity.');
  if (!record(original) || original.id !== eventId) fail('CONFLICT', 'Refresh this activity before deleting it.');
  const before = jsonCopy(original);
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'This calendar is no longer available.');
  const selected = locateCalendar(row.schedule, calendarId);
  const index = findActivity(selected.activities, eventId);
  if (index < 0 || !equal(selected.activities[index], before)) {
    fail('CONFLICT', 'This activity changed. Refresh and try again.');
  }
  const activities = changedActivities(selected.activities, eventId, null);
  const snapshot = replaceActivities(row.schedule, calendarId, selected, activities, eventId, null);
  return compareAndSet(client, userId, row, snapshot);
}

function calendarId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `calendar-${globalThis.crypto.randomUUID()}`;
  // IDs are identifiers, never authorization secrets. Two random components
  // avoid relying on a device clock for uniqueness on React Native runtimes.
  return `calendar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function addCalendar(snapshot, id, name) {
  if (!record(snapshot)) fail('NO_CALENDAR', 'This calendar cannot be safely updated.');
  const metadata = { id, name };
  const data = { kids: [], activities: [] };
  if (own(snapshot, 'calendars') || own(snapshot, 'calendarData')) {
    if (!Array.isArray(snapshot.calendars) || !record(snapshot.calendarData)) {
      fail('NO_CALENDAR', 'This calendar cannot be safely updated.');
    }
    if (snapshot.calendars.some(item => item?.id === id) || own(snapshot.calendarData, id)) {
      fail('CONFLICT', 'Try creating the calendar again.');
    }
    return { ...snapshot, calendars: [...snapshot.calendars, metadata],
      calendarData: { ...snapshot.calendarData, [id]: data } };
  }
  if (own(snapshot, 'activities') && !Array.isArray(snapshot.activities)) {
    fail('NO_CALENDAR', 'This calendar cannot be safely updated.');
  }
  const legacy = Array.isArray(snapshot.activities);
  return {
    ...(!own(snapshot, 'version') ? { version: 2 } : {}), ...snapshot,
    calendars: legacy ? [{ id: 'family', name: 'Family' }, metadata] : [metadata],
    activeCalendarId: own(snapshot, 'activeCalendarId') ? snapshot.activeCalendarId : (legacy ? 'family' : id),
    calendarData: legacy ? { family: { ...snapshot }, [id]: data } : { [id]: data },
    ...(!own(snapshot, 'kids') ? { kids: [] } : {}),
    ...(!own(snapshot, 'activities') ? { activities: [] } : {})
  };
}

async function createCalendar(client, userId, { name } = {}) {
  if (!userId) fail('FORBIDDEN', 'Sign in to manage your calendar.');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    fail('INVALID_ACTIVITY', 'Enter a calendar name of 100 characters or fewer.');
  }
  const row = await loadOwnerRow(client, userId);
  const id = calendarId();
  const schedule = addCalendar(row ? row.schedule : {}, id, name.trim());
  if (row) return { ...await compareAndSet(client, userId, row, schedule), calendarId: id };
  const { data, error } = await client.from(SCHEDULE_TABLE)
    .insert({ user_id: userId, schedule, updated_at: new Date().toISOString() })
    .select('schedule, updated_at').maybeSingle();
  if (String(error?.code) === '23505') fail('CONFLICT', 'Your calendar changed. Refresh and try again.');
  if (permissionError(error)) fail('FORBIDDEN', 'You do not have permission to create this calendar.');
  if (error) throw error;
  if (!data) fail('CONFLICT', 'Your calendar changed. Refresh and try again.');
  return { ...data, calendarId: id };
}

module.exports = { MobileCalendarError, saveActivity, deleteActivity, createCalendar };
