// SDK-independent local notification planner/controller. Inject expo-notifications
// only after the toolchain owner installs the matching SDK package. No push token,
// remote notification service, automatic permission prompt, or backend write.
const calendar = require('./calendar');
const timeMinutes = require('../calendar/model').timeMinutes;
const KIND = 'kidssync-local-reminder-v1';
const PREFIX = 'kidssync-local-v1:';
const CHANNEL = 'kidssync-family-reminders';
const MAX_PENDING = 48, HORIZON_DAYS = 14;
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const preferenceKey = userId => { if (!validId(userId)) fail('ACCOUNT_REQUIRED'); return `kidssync:mobile:reminders:v1:${encodeURIComponent(userId)}`; };
const identifierFor = (userId, calendarId, eventId, date) => PREFIX + [userId, calendarId, String(eventId), date].map(encodeURIComponent).join(':');
const managed = notice => typeof notice?.identifier === 'string' && notice.identifier.startsWith(PREFIX) && notice.content?.data?.kind === KIND;

function buildReminderPlan({ userId, calendars, now = new Date(), language = 'en', showTitles = false, allDayHour = 9, limit = MAX_PENDING } = {}) {
  if (!validId(userId) || !Array.isArray(calendars) || !(now instanceof Date) || !Number.isFinite(now.getTime())) fail('INVALID_INPUT');
  const zh = language === 'zh', plans = [], seen = new Set();
  let skipped = 0;
  for (const entry of calendars) {
    if (entry?.ownerId && entry.ownerId !== userId) continue;
    if (!validId(entry?.id) || !Array.isArray(entry.data?.activities)) fail('INVALID_SNAPSHOT');
    const events = entry.data.activities;
    for (const event of events) {
      if (!event || !['string', 'number'].includes(typeof event.id) || !validId(String(event.id ?? '')) || event.status === 'cancelled' || event.isBuiltInHoliday) { skipped++; continue; }
      const lead = event.reminderMinutes;
      if (![0, 10, 30].includes(lead)) continue;
      const minutes = event.allDay ? (Number.isInteger(allDayHour) && allDayHour >= 0 && allDayHour <= 23 ? allDayHour * 60 : null) : timeMinutes(event.start);
      if (minutes === null) { skipped++; continue; }
      // Do not issue a daily notice for every continuation of a multi-day trip.
      const anchor = { ...event, endDate: '' };
      for (let day = 0; day < HORIZON_DAYS; day++) {
        const date = calendar.addDays(now, day);
        if (!calendar.eventsForDate([anchor], date).length) continue;
        const key = calendar.dateKey(date), hour = Math.floor(minutes / 60), minute = minutes % 60;
        date.setHours(hour, minute, 0, 0);
        if (calendar.dateKey(date) !== key || date.getHours() !== hour || date.getMinutes() !== minute) { skipped++; continue; } // DST gap
        const at = date.getTime() - lead * 60000;
        if (at <= now.getTime()) continue;
        const identifier = identifierFor(userId, entry.id, event.id, key);
        if (seen.has(identifier)) continue;
        seen.add(identifier);
        const content = { title: 'KidsSync', body: showTitles === true && typeof event.title === 'string' ? event.title.trim().slice(0, 100) : zh ? '你有一项即将开始的家庭活动。' : 'You have an upcoming family activity.',
          sound: false, data: { kind: KIND, userId, calendarId: entry.id, eventId: String(event.id), date: key } };
        const fingerprint = JSON.stringify([at, content.title, content.body, language]);
        content.data.fingerprint = fingerprint;
        plans.push({ identifier, at, content });
      }
    }
  }
  plans.sort((a, b) => a.at - b.at || a.identifier.localeCompare(b.identifier));
  const cap = Math.max(0, Math.min(MAX_PENDING, Number.isInteger(limit) ? limit : MAX_PENDING));
  return { plans: plans.slice(0, cap), trimmed: Math.max(0, plans.length - cap), skipped };
}

function notificationTarget(notice, currentUserId) {
  const data = notice?.notification?.request?.content?.data || notice?.request?.content?.data || notice?.content?.data;
  if (!validId(currentUserId) || data?.kind !== KIND || data.userId !== currentUserId || !validId(data.calendarId) || !validId(data.eventId)
    || !Number.isFinite(calendar.parseDateKey(data.date).getTime())) return null;
  return { calendarId: data.calendarId, eventId: data.eventId, date: data.date };
}

function createLocalReminderService({ notifications: sdk, storage, platform, now = Date.now } = {}) {
  let queue = Promise.resolve();
  const enqueue = work => { const next = queue.catch(() => {}).then(work); queue = next; return next; };
  const available = () => ['ios', 'android'].includes(platform) && sdk && ['getPermissionsAsync', 'requestPermissionsAsync', 'getAllScheduledNotificationsAsync', 'scheduleNotificationAsync', 'cancelScheduledNotificationAsync'].every(name => typeof sdk[name] === 'function');
  function authorized(permission) {
    const ios = sdk?.IosAuthorizationStatus;
    if (platform === 'ios' && permission?.ios?.status != null && ios) return [ios.AUTHORIZED, ios.PROVISIONAL, ios.EPHEMERAL].filter(value => value != null).includes(permission.ios.status);
    return permission?.granted === true || permission?.status === 'granted';
  }
  async function readPreference(userId) {
    const raw = await storage.getItem(preferenceKey(userId));
    if (!raw) return { enabled: false, showTitles: false };
    let value; try { value = JSON.parse(raw); } catch { fail('INVALID_PREFERENCE'); }
    if (value?.version !== 1 || typeof value.enabled !== 'boolean' || typeof value.showTitles !== 'boolean') fail('INVALID_PREFERENCE');
    return { enabled: value.enabled, showTitles: value.showTitles };
  }
  async function writePreference(userId, value) { await storage.setItem(preferenceKey(userId), JSON.stringify({ version: 1, ...value })); }
  async function channel() {
    if (platform === 'android') {
      if (typeof sdk.setNotificationChannelAsync !== 'function') fail('UNSUPPORTED');
      await sdk.setNotificationChannelAsync(CHANNEL, { name: 'KidsSync reminders', importance: sdk.AndroidImportance?.DEFAULT ?? 3, sound: null, enableVibrate: false });
    }
  }
  async function cancelWhere(predicate) {
    const notices = await sdk.getAllScheduledNotificationsAsync();
    for (const notice of notices) if (managed(notice) && predicate(notice.content.data)) await sdk.cancelScheduledNotificationAsync(notice.identifier);
  }
  return {
    available,
    readPreference,
    // Wire to an explained, explicit enable action only. Startup and sync never
    // request permission. Do not invoke this in tests against a real device.
    configure: (userId, { enabled, showTitles = false, userInitiated = false } = {}) => enqueue(async () => {
      preferenceKey(userId);
      if (userInitiated !== true) fail('USER_ACTION_REQUIRED');
      if (typeof enabled !== 'boolean' || typeof showTitles !== 'boolean') fail('INVALID_INPUT');
      if (!available()) return { status: 'unsupported' };
      if (enabled === true) {
        await channel();
        let permission = await sdk.getPermissionsAsync();
        if (!authorized(permission) && permission.canAskAgain !== false) permission = await sdk.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: false } });
        if (!authorized(permission)) return { status: 'permission-denied', canAskAgain: permission.canAskAgain !== false };
      }
      const value = { enabled: enabled === true, showTitles: showTitles === true };
      await writePreference(userId, value);
      if (!value.enabled) await cancelWhere(data => data.userId === userId);
      return { status: value.enabled ? 'enabled' : 'disabled', ...value };
    }),
    // Call after confirmed CRUD/import, fresh sync, foreground, timezone changes
    // and account changes. Supply a complete, successfully loaded calendar list.
    synchronize: ({ userId, calendars, language = 'en', isCurrent = () => true } = {}) => enqueue(async () => {
      if (!available()) return { status: 'unsupported', scheduled: 0 };
      if (!isCurrent()) return { status: 'stale', scheduled: 0 };
      if (!userId) { await cancelWhere(() => true); return { status: 'signed-out', scheduled: 0 }; }
      preferenceKey(userId);
      if (!Array.isArray(calendars)) fail('INVALID_INPUT');
      // Validate completeness before removing any previously scheduled notices.
      buildReminderPlan({ userId, calendars, now: new Date(now()), limit: 0 });
      await cancelWhere(data => data.userId !== userId);
      const preference = await readPreference(userId);
      if (!isCurrent()) return { status: 'stale', scheduled: 0 };
      if (!preference.enabled) { await cancelWhere(data => data.userId === userId); return { status: 'disabled', scheduled: 0 }; }
      const permission = await sdk.getPermissionsAsync();
      if (!isCurrent()) return { status: 'stale', scheduled: 0 };
      if (!authorized(permission)) { await cancelWhere(data => data.userId === userId); return { status: 'permission-denied', scheduled: 0 }; }
      const existing = await sdk.getAllScheduledNotificationsAsync();
      const otherCount = existing.filter(notice => !managed(notice)).length;
      const plan = buildReminderPlan({ userId, calendars, language, showTitles: preference.showTitles, now: new Date(now()), limit: MAX_PENDING - otherCount });
      const desired = new Map(plan.plans.map(item => [item.identifier, item]));
      for (const notice of existing) {
        if (!isCurrent()) return { status: 'stale', scheduled: 0 };
        if (managed(notice) && notice.content.data.userId === userId && !desired.has(notice.identifier)) await sdk.cancelScheduledNotificationAsync(notice.identifier);
      }
      const previous = new Map(existing.map(notice => [notice.identifier, notice]));
      let updated = 0;
      for (const item of plan.plans) {
        if (!isCurrent()) { await cancelWhere(data => data.userId === userId); return { status: 'stale', scheduled: 0 }; }
        if (previous.get(item.identifier)?.content?.data?.fingerprint === item.content.data.fingerprint) continue;
        await sdk.scheduleNotificationAsync({ identifier: item.identifier, content: item.content,
          trigger: { type: sdk.SchedulableTriggerInputTypes?.DATE || 'date', date: new Date(item.at), ...(platform === 'android' ? { channelId: CHANNEL } : {}) } });
        updated++;
      }
      if (!isCurrent()) { await cancelWhere(data => data.userId === userId); return { status: 'stale', scheduled: 0 }; }
      return { status: 'scheduled', scheduled: plan.plans.length, updated, trimmed: plan.trimmed, skipped: plan.skipped };
    }),
    cancelForUser: userId => enqueue(async () => { preferenceKey(userId); if (available()) await cancelWhere(data => data.userId === userId); }),
  };
}
module.exports = { KIND, PREFIX, CHANNEL, MAX_PENDING, HORIZON_DAYS, preferenceKey, identifierFor, buildReminderPlan, notificationTarget, createLocalReminderService };
