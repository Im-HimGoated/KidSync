// Native owner writes use the existing web snapshot. No creation or sample-data
// fallback happens while saving activities: calendar creation is an explicit API.
const { SCHEDULE_TABLE, readSchedule } = require('./schedules');
const { PALETTES } = require('../family-profiles');
const profileLinks = require('../family-profile-links');

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
    || (!activity.allDay && (!time.test(activity.start) || !time.test(activity.end)
      || (!(activity.endDate > activity.startDate) && activity.end <= activity.start)))) {
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
  return mutateActivities(client, userId, calendarId, [{ original, event: null }]);
}

function onlyExclusionsChanged(before, after) {
  if (!before || !after || !Array.isArray(after.excludedDates) || !after.excludedDates.every(validDate)) return false;
  const { excludedDates: _before, ...beforeRest } = before;
  const { excludedDates: _after, ...afterRest } = after;
  return equal(beforeRest, afterRest);
}

// A small set of related event changes is committed together. Recurrence edits
// use this for the original series exclusion and its detached one-off event.
async function mutateActivities(client, userId, calendarId, input) {
  if (!userId) fail('FORBIDDEN', 'Sign in to manage your calendar.');
  if (!Array.isArray(input) || !input.length || input.length > 20) fail('INVALID_ACTIVITY', 'Use valid activity changes.');
  const seen = new Set();
  const changes = input.map(change => {
    if (!record(change)) fail('INVALID_ACTIVITY', 'Use valid activity changes.');
    const before = change.original == null ? null : jsonCopy(change.original);
    const patch = change.event == null ? null : jsonCopy(change.event);
    const id = before?.id ?? patch?.id;
    if (!validId(id) || (before !== null && !record(before)) || (patch !== null && !record(patch))
      || (before === null && patch === null) || (before && patch && before.id !== patch.id) || seen.has(id)) {
      fail('INVALID_ACTIVITY', 'Use distinct original activities.');
    }
    if (before?.externalSource || before?.isBuiltInHoliday || patch?.externalSource || patch?.isBuiltInHoliday) {
      fail('FORBIDDEN', 'This activity is managed by its source.');
    }
    seen.add(id);
    if (!before && patch) validateActivity(patch);
    return { id, before, patch };
  });
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'This calendar is no longer available.');
  const selected = locateCalendar(row.schedule, calendarId);
  // Verify every original before building a snapshot or sending any PATCH.
  for (const { id, before } of changes) {
    const index = findActivity(selected.activities, id);
    if ((before && (index < 0 || !equal(selected.activities[index], before))) || (!before && index >= 0)) {
      fail('CONFLICT', 'This activity changed. Refresh and try again.');
    }
  }
  let snapshot = row.schedule;
  const receipt = [];
  const mirrored = row.schedule.activeCalendarId === calendarId && Array.isArray(row.schedule.activities);
  for (const { id, before, patch } of changes) {
    const after = patch === null ? null : { ...(before || {}), ...patch };
    // Removing an occurrence should also work for an otherwise unchanged legacy
    // series whose old clocks are missing; new/edited activities remain strict.
    if (after && !onlyExclusionsChanged(before, after)) validateActivity(after);
    const current = locateCalendar(snapshot, calendarId);
    const index = findActivity(current.activities, id);
    const mirrorIndex = mirrored ? findActivity(snapshot.activities, id) : -1;
    const mirrorBefore = mirrorIndex < 0 ? null : snapshot.activities[mirrorIndex];
    const activities = changedActivities(current.activities, id, after);
    snapshot = replaceActivities(snapshot, calendarId, current, activities, id, after, patch);
    const mirrorAfterIndex = mirrored ? findActivity(snapshot.activities, id) : -1;
    receipt.push({ id, before, after, index, mirrorIndex, mirrorBefore,
      mirrorAfter: mirrorAfterIndex < 0 ? null : snapshot.activities[mirrorAfterIndex] });
  }
  const result = await compareAndSet(client, userId, row, snapshot);
  return { ...result, undoToken: jsonCopy({ version: 1, userId, calendarId, mirrored, changes: receipt }) };
}

function replaceExact(activities, id, value, originalIndex) {
  const index = findActivity(activities, id);
  if (value === null) return changedActivities(activities, id, null);
  if (index >= 0) return activities.map((event, offset) => offset === index ? value : event);
  const next = [...activities];
  next.splice(Math.max(0, Math.min(next.length, originalIndex < 0 ? next.length : originalIndex)), 0, value);
  return next;
}

function expectedActivity(activities, id, expected) {
  const index = findActivity(activities, id);
  if (expected === null ? index >= 0 : index < 0 || !equal(activities[index], expected)) {
    fail('CONFLICT', 'This activity changed. Refresh before undoing.');
  }
}

// Undo restores just the affected records in a fresh row. It never reinstates
// an old account snapshot or overwrites another person's subsequent event edit.
async function restoreActivities(client, userId, calendarId, input) {
  if (!userId) fail('FORBIDDEN', 'Sign in to manage your calendar.');
  const token = jsonCopy(input);
  if (!record(token) || token.version !== 1 || token.userId !== userId || token.calendarId !== calendarId
    || !Array.isArray(token.changes) || !token.changes.length || token.changes.length > 20) {
    fail('CONFLICT', 'This change cannot be undone in this calendar.');
  }
  const seen = new Set();
  for (const change of token.changes) {
    if (!record(change) || !validId(change.id) || seen.has(change.id)
      || !own(change, 'before') || !own(change, 'after') || (change.before === null && change.after === null)
      || !Number.isInteger(change.index) || !Number.isInteger(change.mirrorIndex)
      || (change.before !== null && (!record(change.before) || change.before.id !== change.id))
      || (change.after !== null && (!record(change.after) || change.after.id !== change.id))
      || !own(change, 'mirrorBefore') || !own(change, 'mirrorAfter')
      || (change.mirrorBefore !== null && (!record(change.mirrorBefore) || change.mirrorBefore.id !== change.id))
      || (change.mirrorAfter !== null && (!record(change.mirrorAfter) || change.mirrorAfter.id !== change.id))) {
      fail('CONFLICT', 'This change cannot be safely undone.');
    }
    seen.add(change.id);
  }
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'This calendar is no longer available.');
  const selected = locateCalendar(row.schedule, calendarId);
  const mirrored = selected.modern && row.schedule.activeCalendarId === calendarId && Array.isArray(row.schedule.activities);
  for (const change of token.changes) {
    expectedActivity(selected.activities, change.id, change.after);
    if (mirrored && token.mirrored) expectedActivity(row.schedule.activities, change.id, change.mirrorAfter);
    else if (mirrored) {
      const index = findActivity(row.schedule.activities, change.id), current = index < 0 ? null : row.schedule.activities[index];
      // The calendar may have become active since the change. Extra mirror-only
      // keys are retained, but known affected keys must still match the result.
      if (change.after === null ? current !== null : !current
        || !Object.keys(change.after).every(key => own(current, key) && equal(current[key], change.after[key]))) {
        fail('CONFLICT', 'This activity changed. Refresh before undoing.');
      }
    }
  }
  let activities = selected.activities;
  let mirrors = mirrored ? row.schedule.activities : null;
  // Positions were captured before each sequential change. Reverse that sequence
  // when restoring so multiple deletions retain their original relative order.
  for (const change of [...token.changes].reverse()) {
    activities = replaceExact(activities, change.id, change.before, change.index);
    if (mirrored) {
      let restored = change.mirrorBefore;
      if (!token.mirrored) {
        const index = findActivity(mirrors, change.id), current = index < 0 ? {} : mirrors[index];
        restored = change.before === null ? null : { ...current, ...change.before };
        if (restored && change.after) for (const key of Object.keys(change.after)) if (!own(change.before, key)) delete restored[key];
      }
      mirrors = replaceExact(mirrors, change.id, restored, token.mirrored ? change.mirrorIndex : change.index);
    }
  }
  const snapshot = selected.modern ? { ...row.schedule, calendarData: { ...row.schedule.calendarData,
    [calendarId]: { ...selected.data, activities } }, ...(mirrored ? { activities: mirrors } : {}) } : { ...row.schedule, activities };
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

async function saveFamilyProfiles(client, userId, calendarId, { original, profiles } = {}) {
  if (!Array.isArray(original) || !Array.isArray(profiles) || profiles.length > 50) {
    fail('INVALID_ACTIVITY', 'Use a valid list of family profiles.');
  }
  const kids = normalizeProfiles(profiles);
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'Choose an existing calendar.');
  const selected = locateCalendar(row.schedule, calendarId);
  const saved = selected.data.kids ?? [];
  if (!equal(saved, original)) fail('CONFLICT', 'Family profiles changed. Refresh and try again.');
  const updateActivities = activities => profileLinks.remapProfileActivities(activities, saved, kids);
  const activities = updateActivities(selected.activities);
  const schedule = selected.modern ? { ...row.schedule,
    calendarData: { ...row.schedule.calendarData, [calendarId]: { ...selected.data, kids, activities } },
    ...(row.schedule.activeCalendarId === calendarId ? { kids,
      ...(Array.isArray(row.schedule.activities) ? { activities: updateActivities(row.schedule.activities) } : {}) } : {}) } : { ...row.schedule, kids, activities };
  return compareAndSet(client, userId, row, schedule);
}

function normalizeProfiles(profiles) {
  const names = new Set(), ids = new Set();
  return jsonCopy(profiles).map(profile => {
    if (!record(profile) || !validId(profile.id) || ids.has(profile.id) || typeof profile.name !== 'string'
      || !profile.name.trim() || ['__family__', 'all'].includes(profile.name.trim().toLowerCase()) || profile.name.trim().length > 28
      || names.has(profile.name.trim().toLowerCase()) || !PALETTES.includes(profile.palette)
      || typeof profile.avatar !== 'string' || profile.avatar.length > 16
      || typeof profile.grade !== 'string' || profile.grade.length > 30
      || typeof profile.school !== 'string' || profile.school.length > 60) {
      fail('INVALID_ACTIVITY', 'Check the family profile names and details.');
    }
    const name = profile.name.trim();
    names.add(name.toLowerCase()); ids.add(profile.id);
    return { ...profile, name, grade: profile.grade.trim(), school: profile.school.trim() };
  });
}

async function restoreCalendarSnapshot(client, userId, id, { versionId, collection, baseline } = {}) {
  if (!['history', 'presets'].includes(collection) || typeof versionId !== 'string' || !record(baseline)) {
    fail('INVALID_ACTIVITY', 'Choose a saved calendar version.');
  }
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'Choose an existing calendar.');
  const selected = locateCalendar(row.schedule, id);
  const { data, activities } = selected;
  if (!equal(data.kids ?? [], baseline.kids ?? []) || !equal(activities, baseline.activities ?? [])) {
    fail('CONFLICT', 'This calendar changed. Refresh and try again.');
  }
  const list = data[collection], version = Array.isArray(list) && list.find(item => item?.id === versionId);
  const restore = version?.snapshot;
  if (!record(restore) || !Array.isArray(restore.kids) || !Array.isArray(restore.activities)) {
    fail('INVALID_ACTIVITY', 'This saved calendar version is unavailable.');
  }
  if (baseline.snapshot && !equal(restore, baseline.snapshot)) fail('CONFLICT', 'The saved version changed. Refresh and try again.');
  const kids = jsonCopy(restore.kids), nextActivities = jsonCopy(restore.activities);
  const current = { kids: data.kids ?? [], activities, visibleKids: data.visibleKids ?? [] };
  const history = [{ id: calendarId(), label: `Before restore · ${String(version.label || version.name || '').slice(0, 100)}`,
    savedAt: new Date().toISOString(), snapshot: current }, ...(Array.isArray(data.history) ? data.history : [])].slice(0, 20);
  const patch = { kids, activities: nextActivities, history,
    ...(Array.isArray(restore.visibleKids) ? { visibleKids: restore.visibleKids } : {}) };
  const schedule = selected.modern ? { ...row.schedule,
    calendarData: { ...row.schedule.calendarData, [id]: { ...data, ...patch } },
    ...(row.schedule.activeCalendarId === id ? patch : {}) } : { ...row.schedule, ...patch };
  return compareAndSet(client, userId, row, schedule);
}

async function importActivities(client, userId, id, request) {
  const events = Array.isArray(request) ? request : request?.events;
  if (!Array.isArray(events) || !events.length || events.length > 300) fail('INVALID_ACTIVITY', 'Choose valid activities to import.');
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'Choose an existing calendar.');
  const selected = locateCalendar(row.schedule, id);
  const originalKids = request?.originalKids;
  const importedProfiles = request?.profiles ?? [];
  if (!Array.isArray(importedProfiles) || importedProfiles.length > 50) fail('INVALID_ACTIVITY', 'Choose valid family profiles.');
  let kids = selected.data.kids ?? [];
  if (importedProfiles.length) {
    const profiles = normalizeProfiles(importedProfiles);
    if (!Array.isArray(originalKids) || originalKids.length + profiles.length > 50) fail('INVALID_ACTIVITY', 'Review the family profiles before importing.');
    const expected = [...originalKids, ...profiles];
    if (!equal(kids, originalKids) && !equal(kids, expected)) fail('CONFLICT', 'Family profiles changed. Review the file again.');
    const names = expected.map(profile => String(profile?.name || '').trim().toLowerCase());
    const profileIds = expected.map(profile => profile?.id).filter(value => value != null);
    if (new Set(names).size !== names.length || new Set(profileIds).size !== profileIds.length) fail('CONFLICT', 'A family profile already uses that name.');
    kids = expected;
  }
  const ids = new Set(), additions = [];
  for (const event of jsonCopy(events)) {
    validateActivity(event);
    if (ids.has(event.id) || event.externalSource || event.isBuiltInHoliday) fail('INVALID_ACTIVITY', 'Use distinct calendar activities.');
    ids.add(event.id);
    const index = findActivity(selected.activities, event.id);
    if (index === -1) additions.push(event);
    else if (!equal(selected.activities[index], event)) fail('CONFLICT', 'An imported activity has changed.');
  }
  if (!additions.length && equal(kids, selected.data.kids ?? [])) return row;
  const activities = [...selected.activities, ...additions];
  const schedule = selected.modern ? { ...row.schedule,
    calendarData: { ...row.schedule.calendarData, [id]: { ...selected.data, activities, ...(importedProfiles.length ? { kids } : {}) } },
    ...(row.schedule.activeCalendarId === id ? {
      ...(Array.isArray(row.schedule.activities) ? { activities: [...row.schedule.activities, ...additions.filter(event => findActivity(row.schedule.activities, event.id) < 0)] } : {}),
      ...(importedProfiles.length ? { kids } : {}),
    } : {}),
  } : { ...row.schedule, activities, ...(importedProfiles.length ? { kids } : {}) };
  return compareAndSet(client, userId, row, schedule);
}

async function renameCalendar(client, userId, id, { originalName, name } = {}) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) fail('INVALID_ACTIVITY', 'Enter a calendar name.');
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'Choose an existing calendar.');
  const selected = locateCalendar(row.schedule, id);
  let schedule = row.schedule;
  if (!selected.modern) {
    schedule = { ...schedule, activeCalendarId: id, calendars: [{ id, name: 'Family' }], calendarData: { [id]: selected.data } };
  }
  const current = schedule.calendars.find(item => item.id === id);
  if (current.name !== originalName) fail('CONFLICT', 'The calendar name changed. Refresh and try again.');
  const calendars = schedule.calendars.map(item => item.id === id ? { ...item, name: name.trim() } : item);
  return compareAndSet(client, userId, row, { ...schedule, calendars });
}

async function deleteCalendar(client, userId, id, { name, data } = {}) {
  if (typeof name !== 'string' || !record(data)) fail('INVALID_ACTIVITY', 'Review the calendar before deleting it.');
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'Choose an existing calendar.');
  const selected = locateCalendar(row.schedule, id);
  const { calendars, calendarData } = row.schedule;
  if (!selected.modern || calendars.length < 2) fail('FORBIDDEN', 'Keep at least one owned calendar.');
  const current = calendars.find(item => item?.id === id);
  if (current.name !== name || !equal(selected.data, data)) fail('CONFLICT', 'The calendar changed. Refresh and try again.');
  const remaining = calendars.filter(item => item?.id !== id);
  const nextData = { ...calendarData };
  delete nextData[id];
  const replacement = remaining.find(item => typeof item?.id === 'string' && item.name && record(nextData[item.id]));
  if (!replacement) fail('FORBIDDEN', 'Keep at least one owned calendar.');
  const next = { ...row.schedule, calendarData: nextData, calendars: remaining };
  if (next.activeCalendarId === id) {
    next.activeCalendarId = replacement.id;
    const alternate = nextData[replacement.id];
    for (const key of ['kids', 'activities', 'history', 'presets', 'audit', 'settings', 'view']) {
      if (own(alternate, key)) next[key] = alternate[key];
      else delete next[key];
    }
  }
  return compareAndSet(client, userId, row, next);
}

async function saveCalendarPreset(client, userId, id, { name, presetId } = {}) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !validId(presetId)) fail('INVALID_ACTIVITY', 'Enter a preset name.');
  const row = await loadOwnerRow(client, userId);
  if (!row) fail('NO_CALENDAR', 'Choose an existing calendar.');
  const { data, activities, modern } = locateCalendar(row.schedule, id);
  const list = Array.isArray(data.presets) ? data.presets : [];
  if (list.some(item => item?.id === presetId)) return row;
  const presets = [{ id: presetId, name: name.trim(), savedAt: new Date().toISOString(),
    snapshot: { kids: data.kids ?? [], activities, visibleKids: data.visibleKids ?? [] } }, ...list].slice(0, 30);
  const schedule = modern ? { ...row.schedule, calendarData: { ...row.schedule.calendarData, [id]: { ...data, presets } },
    ...(row.schedule.activeCalendarId === id ? { presets } : {}) } : { ...row.schedule, presets };
  return compareAndSet(client, userId, row, schedule);
}

module.exports = { MobileCalendarError, saveActivity, deleteActivity, createCalendar, mutateActivities, restoreActivities,
  saveFamilyProfiles, restoreCalendarSnapshot, importActivities, renameCalendar, deleteCalendar, saveCalendarPreset };
