// A small bridge for calendar settings shared with the website. Device-specific
// onboarding, notification permission and local reminder opt-in remain separate.
const { SCHEDULE_TABLE, readSchedule } = require('./schedules');

const FIELDS = Object.freeze(['defaultView', 'defaultEventDuration', 'showWeekends']);
const VIEWS = Object.freeze(['today', 'week', 'four', 'month']);
const DURATIONS = Object.freeze([30, 45, 60, 90, 120]);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const fail = (code, message) => { const error = new Error(message); error.name = 'MobileSettingsError'; error.code = code; throw error; };
const permissionError = error => error && ['42501', 'PGRST301', 'PGRST302', '401', '403'].includes(String(error.code || error.status));

function copyJson(value) {
  const ancestors = new Set();
  function check(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean'
      || (typeof item === 'number' && Number.isFinite(item))) return;
    if ((!record(item) && !Array.isArray(item)) || ancestors.has(item)) fail('INVALID_SETTINGS', 'Use valid calendar settings.');
    ancestors.add(item);
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index += 1) {
        if (!own(item, index)) fail('INVALID_SETTINGS', 'Use valid calendar settings.');
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
  if (Array.isArray(first) || Array.isArray(second)) return Array.isArray(first) && Array.isArray(second)
    && first.length === second.length && first.every((value, index) => equal(value, second[index]));
  if (!record(first) || !record(second)) return false;
  const keys = Object.keys(first);
  return keys.length === Object.keys(second).length && keys.every(key => own(second, key) && equal(first[key], second[key]));
}

// `data` is one calendar's data, not the complete owner snapshot. Return raw
// values/presence so missing defaults and future values can be compared exactly.
function readDisplaySettings(data) {
  const settings = record(data?.settings) ? data.settings : {};
  return Object.fromEntries(FIELDS.filter(key => own(settings, key)).map(key => [key, settings[key]]));
}

function mergeDisplayPreferences(localPreferences, data) {
  const local = record(localPreferences) ? localPreferences : {};
  const settings = readDisplaySettings(data), result = { ...local };
  if (VIEWS.includes(settings.defaultView)) result.view = settings.defaultView === 'today' ? 'day' : settings.defaultView;
  if (DURATIONS.includes(settings.defaultEventDuration)) result.defaultEventDuration = settings.defaultEventDuration;
  if (typeof settings.showWeekends === 'boolean') result.showWeekends = settings.showWeekends;
  return result;
}

function locateCalendar(snapshot, calendarId, userId) {
  if (typeof calendarId !== 'string' || !calendarId.trim() || calendarId.length > 300
    || ['__proto__', 'prototype', 'constructor'].includes(calendarId) || !record(snapshot)) {
    fail('NO_CALENDAR', 'Choose an existing calendar.');
  }
  if (own(snapshot, 'calendars') || own(snapshot, 'calendarData')) {
    if (!Array.isArray(snapshot.calendars) || !record(snapshot.calendarData)) fail('NO_CALENDAR', 'This calendar cannot be safely updated.');
    const matches = snapshot.calendars.filter(item => record(item) && item.id === calendarId);
    if (matches.length !== 1 || !own(snapshot.calendarData, calendarId) || !record(snapshot.calendarData[calendarId])) {
      fail('NO_CALENDAR', 'This calendar is no longer available.');
    }
    if (matches[0].ownerId != null && matches[0].ownerId !== userId) fail('FORBIDDEN', 'Choose a calendar you own.');
    return { modern: true, data: snapshot.calendarData[calendarId] };
  }
  if (calendarId !== 'family' || !Array.isArray(snapshot.activities)) fail('NO_CALENDAR', 'Choose an existing calendar.');
  return { modern: false, data: snapshot };
}

function settingsIn(data) {
  if (own(data, 'settings') && data.settings != null && !record(data.settings)) fail('NO_CALENDAR', 'This calendar cannot be safely updated.');
  return data.settings || {};
}

function checkScope(isCurrent) {
  if (!isCurrent()) fail('STALE_SCOPE', 'This calendar is no longer open.');
}

async function requireOwner(client, userId, isCurrent) {
  checkScope(isCurrent);
  if (typeof userId !== 'string' || !userId.trim() || typeof client?.auth?.getUser !== 'function') {
    fail('FORBIDDEN', 'Sign in to manage your calendar.');
  }
  const { data, error } = await client.auth.getUser();
  checkScope(isCurrent);
  if (error || data?.user?.id !== userId) fail('FORBIDDEN', 'Sign in to manage your own calendar.');
}

async function saveCalendarSettings(client, userId, calendarId, request = {}) {
  if (!record(request) || !record(request.original) || !record(request.changes)
    || (request.isCurrent != null && typeof request.isCurrent !== 'function')) fail('INVALID_SETTINGS', 'Review your calendar settings.');
  const isCurrent = request.isCurrent || (() => true);
  const original = copyJson(request.original), changes = copyJson(request.changes), keys = Object.keys(changes);
  if (!keys.length || Object.keys(original).some(key => !FIELDS.includes(key)) || keys.some(key => !FIELDS.includes(key))
    || (own(changes, 'defaultView') && !VIEWS.includes(changes.defaultView))
    || (own(changes, 'defaultEventDuration') && !DURATIONS.includes(changes.defaultEventDuration))
    || (own(changes, 'showWeekends') && typeof changes.showWeekends !== 'boolean')) fail('INVALID_SETTINGS', 'Choose supported calendar settings.');
  await requireOwner(client, userId, isCurrent);
  checkScope(isCurrent);
  let row;
  try { row = await readSchedule(client, userId); }
  catch (error) {
    checkScope(isCurrent);
    if (permissionError(error)) fail('FORBIDDEN', 'You do not have permission to manage this calendar.');
    throw error;
  }
  checkScope(isCurrent);
  if (!row) fail('NO_CALENDAR', 'Choose an existing calendar.');
  const selected = locateCalendar(row.schedule, calendarId, userId), settings = settingsIn(selected.data);
  if (keys.some(key => own(settings, key) !== own(original, key) || (own(settings, key) && !equal(settings[key], original[key])))) {
    fail('CONFLICT', 'These settings changed. Refresh and review them again.');
  }
  let schedule;
  const patch = { settings: { ...settings, ...changes }, ...(own(changes, 'defaultView') ? { view: changes.defaultView } : {}) };
  if (selected.modern) {
    schedule = { ...row.schedule, calendarData: { ...row.schedule.calendarData, [calendarId]: { ...selected.data, ...patch } } };
    if (row.schedule.activeCalendarId === calendarId) {
      schedule.settings = { ...settingsIn(row.schedule), ...changes };
      if (own(changes, 'defaultView')) schedule.view = changes.defaultView;
    }
  } else schedule = { ...row.schedule, ...patch };
  const previous = typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : NaN;
  if (!Number.isFinite(previous)) fail('CONFLICT', 'Refresh this calendar before changing settings.');
  const nextTime = Math.max(Date.now(), previous + 1);
  if (!Number.isFinite(new Date(nextTime).getTime())) fail('CONFLICT', 'Refresh this calendar before changing settings.');
  const updatedAt = new Date(nextTime).toISOString();
  await requireOwner(client, userId, isCurrent);
  checkScope(isCurrent);
  const { data, error } = await client.from(SCHEDULE_TABLE).update({ schedule, updated_at: updatedAt })
    .eq('user_id', userId).eq('updated_at', row.updated_at).select('schedule, updated_at').maybeSingle();
  checkScope(isCurrent);
  if (permissionError(error)) fail('FORBIDDEN', 'You do not have permission to manage this calendar.');
  if (error) throw error;
  if (!data) fail('CONFLICT', 'This calendar changed. Refresh and try again.');
  return data;
}

// As with existing owner writers, CAS relies on each writer advancing
// updated_at. A server-enforced revision would be needed to detect a writer
// that deliberately reuses the exact timestamp between our read and update.
module.exports = { FIELDS, VIEWS, DURATIONS, readDisplaySettings, mergeDisplayPreferences, saveCalendarSettings };
