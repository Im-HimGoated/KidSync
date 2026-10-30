// Explicit, authenticated import into a NEW calendar. Never upsert an old snapshot.
const { readSchedule, SCHEDULE_TABLE } = require('./schedules');
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function validateTrial(trial) {
  if (!record(trial) || !/^[a-zA-Z0-9-]{1,80}$/.test(trial.id || '') || !Array.isArray(trial.events) || trial.events.length > 100
    || typeof trial.profile?.calendarName !== 'string' || !trial.profile.calendarName.trim() || trial.profile.calendarName.length > 60) fail('INVALID_TRIAL');
  for (const [field, max] of [['name', 50], ['description', 160]]) {
    if (trial.profile[field] != null && (typeof trial.profile[field] !== 'string' || trial.profile[field].length > max)) fail('INVALID_TRIAL');
  }
  if (trial.profile.icon != null && !['👤', '😊', '👩', '👨', '🧑‍🏫', '⭐'].includes(trial.profile.icon)) fail('INVALID_TRIAL');
  const ids = new Set();
  for (const event of trial.events) {
    if (!record(event)) fail('INVALID_TRIAL');
    const date = typeof event.startDate === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.startDate);
    const parsed = date && new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]));
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!record(event) || typeof event.id !== 'string' || !event.id || event.id.length > 100 || ids.has(event.id) || typeof event.title !== 'string' || !event.title.trim() || event.title.length > 100
      || !date || parsed.getFullYear() !== Number(date[1]) || parsed.getMonth() !== Number(date[2]) - 1 || parsed.getDate() !== Number(date[3])
      || (!event.allDay && (!time.test(event.start) || !time.test(event.end) || event.end <= event.start))) fail('INVALID_TRIAL');
    if (event.allDay != null && typeof event.allDay !== 'boolean') fail('INVALID_TRIAL');
    for (const [field, max] of [['child', 50], ['location', 160], ['responsible', 80], ['items', 300]]) {
      if (event[field] != null && (typeof event[field] !== 'string' || event[field].length > max)) fail('INVALID_TRIAL');
    }
    if (event.reminderMinutes != null && ![0, 10, 30].includes(event.reminderMinutes)) fail('INVALID_TRIAL');
    if (event.importance != null && !['high', 'normal', 'low'].includes(event.importance)) fail('INVALID_TRIAL');
    ids.add(event.id);
  }
}
function mergeTrial(snapshot, trial) {
  validateTrial(trial);
  if (!record(snapshot)) fail('INVALID_SNAPSHOT');
  const calendarId = `native-trial-${trial.id}`;
  const data = JSON.parse(JSON.stringify(snapshot));
  const modern = owns(data, 'calendars') || owns(data, 'calendarData');
  if (modern && (!Array.isArray(data.calendars) || !record(data.calendarData))) fail('INVALID_SNAPSHOT');
  if (!modern && owns(data, 'activities') && !Array.isArray(data.activities)) fail('INVALID_SNAPSHOT');
  if (!modern) {
    const legacy = Array.isArray(data.activities);
    data.calendars = legacy ? [{ id: 'family', name: 'Family' }] : [];
    data.calendarData = legacy ? { family: JSON.parse(JSON.stringify(snapshot)) } : {};
    data.activeCalendarId = legacy ? 'family' : calendarId;
    if (!owns(data, 'version')) data.version = 2;
  }
  const existing = data.calendars.find(item => item?.id === calendarId);
  if (existing || owns(data.calendarData, calendarId)) {
    if (existing?.nativeTrialId !== trial.id || !owns(data.calendarData, calendarId)) fail('CONFLICT');
    return { schedule: snapshot, calendarId, alreadySaved: true };
  }
  const people = [...new Set(trial.events.map(event => typeof event.child === 'string' ? event.child.trim() : '').filter(name => name && name !== '__family__'))];
  const kids = people.map((name, index) => ({ id: `${calendarId}-child-${index}`, name, palette: ['blue', 'green', 'gold'][index % 3], avatar: '👤', grade: '', school: '' }));
  const activities = trial.events.map(event => ({ id: event.id, title: event.title, startDate: event.startDate,
    start: event.allDay ? '' : event.start, end: event.allDay ? '' : event.end, allDay: event.allDay === true, child: event.child || '__family__',
    location: event.location || '', responsible: event.responsible || '', items: event.items || '',
    recurrence: 'none', eventType: 'activity', importance: event.importance || 'normal', reminderMinutes: event.reminderMinutes ?? null, status: 'confirmed', icon: '📖', color: 'default', style: 'child', attendees: [] }));
  const profile = { name: trial.profile.name || '', calendarName: trial.profile.calendarName.trim(), description: trial.profile.description || '', icon: trial.profile.icon || '👤' };
  const calendar = { kids, activities, presets: [], history: [], audit: [], settings: { defaultView: 'today' }, view: 'today', nativeTrialProfile: profile };
  data.calendars.push({ id: calendarId, name: trial.profile.calendarName.trim(), nativeTrialId: trial.id });
  data.calendarData[calendarId] = calendar;
  if (data.activeCalendarId === calendarId) Object.assign(data, calendar);
  if (!record(data.profile)) data.profile = { name: trial.profile.name || '', icon: trial.profile.icon || '👤', description: trial.profile.description || '', image: '' };
  return { schedule: data, calendarId, alreadySaved: false };
}
async function requireUser(client, userId) {
  if (!userId || typeof client?.auth?.getUser !== 'function') fail('FORBIDDEN');
  const { data, error } = await client.auth.getUser();
  if (error || data?.user?.id !== userId) fail('FORBIDDEN');
}
async function claimNativeTrial(client, userId, trial) {
  validateTrial(trial);
  if ((trial.claimedBy && trial.claimedBy !== userId) || (trial.claimOwner && trial.claimOwner !== userId)) fail('FORBIDDEN');
  await requireUser(client, userId);
  const row = await readSchedule(client, userId);
  const merged = mergeTrial(row ? row.schedule : {}, trial);
  if (merged.alreadySaved) return { ...row, calendarId: merged.calendarId };
  // Account switching between the read and write must not target the old owner.
  await requireUser(client, userId);
  let query;
  if (row) {
    const previous = Date.parse(row.updated_at);
    if (!Number.isFinite(previous)) fail('CONFLICT');
    query = client.from(SCHEDULE_TABLE).update({ schedule: merged.schedule, updated_at: new Date(Math.max(Date.now(), previous + 1)).toISOString() })
      .eq('user_id', userId).eq('updated_at', row.updated_at);
  } else {
    query = client.from(SCHEDULE_TABLE).insert({ user_id: userId, schedule: merged.schedule, updated_at: new Date().toISOString() });
  }
  const { data, error } = await query.select('schedule, updated_at').maybeSingle();
  // A conditional update matching zero rows is a 406/PGRST116 in SDK versions
  // that request a single object, rather than a successful null response.
  if (error?.code === '23505' || error?.code === 'PGRST116') fail('CONFLICT');
  if (error) throw error;
  if (!data) fail('CONFLICT');
  return { ...data, calendarId: merged.calendarId };
}
module.exports = { validateTrial, mergeTrial, claimNativeTrial };
