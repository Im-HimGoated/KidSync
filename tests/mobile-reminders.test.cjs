const test = require('node:test');
const assert = require('node:assert/strict');
const { KIND, MAX_PENDING, buildReminderPlan, createLocalReminderService, preferenceKey, notificationTarget } = require('../mobile/src/lib/local-reminders');
const now = () => new Date(2026, 9, 30, 8, 0);
const event = extra => ({ id: 'soccer', title: 'Soccer at private address', startDate: '2026-10-30', start: '15:00', end: '16:00', reminderMinutes: 10, recurrence: 'none', ...extra });
const calendars = events => [{ id: 'family', data: { activities: events || [event()] } }];
const plan = input => buildReminderPlan({ userId: 'owner', calendars: calendars(), now: now(), ...input });
function fixture(platform = 'ios') {
  const records = new Map(), saved = new Map(), calls = { prompts: 0, schedule: 0, cancel: [], channel: [] };
  let permission = { granted: true, ios: { status: 2 }, canAskAgain: true };
  const sdk = {
    IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4, DENIED: 1 }, SchedulableTriggerInputTypes: { DATE: 'date' }, AndroidImportance: { DEFAULT: 3 },
    async getPermissionsAsync() { return permission; }, async requestPermissionsAsync() { calls.prompts++; return permission; },
    async setNotificationChannelAsync(id, value) { calls.channel.push([id, value]); },
    async getAllScheduledNotificationsAsync() { return [...records.values()]; },
    async scheduleNotificationAsync(value) { calls.schedule++; records.set(value.identifier, value); return value.identifier; },
    async cancelScheduledNotificationAsync(id) { calls.cancel.push(id); records.delete(id); },
  };
  const storage = { getItem: async key => saved.get(key) || null, setItem: async (key, value) => saved.set(key, value) };
  const service = createLocalReminderService({ notifications: sdk, storage, platform, now: () => now().getTime() });
  return { records, saved, calls, sdk, storage, service, permission: value => { permission = value; } };
}
test('local reminder planner respects lead times, skips past/cancelled/unset plans, and hides titles by default', () => {
  const result = plan({ calendars: calendars([event(), event({ id: 'past', start: '07:00' }), event({ id: 'cancelled', status: 'cancelled' }), event({ id: 'no-reminder', reminderMinutes: null }), event({ id: 'untimed', start: '' })]) });
  assert.equal(result.plans.length, 1);
  assert.equal(new Date(result.plans[0].at).getHours(), 14); assert.equal(new Date(result.plans[0].at).getMinutes(), 50);
  assert(!JSON.stringify(result.plans).includes('private address'));
  assert.equal(plan({ showTitles: true }).plans[0].content.body, 'Soccer at private address');
  assert.match(plan({ language: 'zh' }).plans[0].content.body, /家庭活动/);
});
test('recurrence, exceptions, all-day hour, multi-day starts and pending capacity are bounded without mutating events', () => {
  const events = [event({ recurrence: 'daily', excludedDates: ['2026-10-31'] }), event({ id: 'trip', endDate: '2026-11-03', allDay: true })], before = JSON.stringify(events);
  const result = plan({ calendars: calendars(events) });
  assert.equal(result.plans.filter(item => item.content.data.eventId === 'soccer').length, 13);
  assert.equal(result.plans.filter(item => item.content.data.eventId === 'trip').length, 1);
  assert.equal(new Date(result.plans.find(item => item.content.data.eventId === 'trip').at).getHours(), 8);
  assert.equal(JSON.stringify(events), before);
  const many = plan({ calendars: calendars(Array.from({ length: 80 }, (_, i) => event({ id: String(i) }))) });
  assert.equal(many.plans.length, MAX_PENDING); assert.equal(many.trimmed, 80 - MAX_PENDING);
  assert.equal(plan({ limit: -1 }).plans.length, 0);
});
test('DST gaps never roll a reminder into a different activity time', () => {
  const previous = process.env.TZ; process.env.TZ = 'America/Los_Angeles';
  try {
    const result = buildReminderPlan({ userId: 'owner', calendars: calendars([event({ startDate: '2027-03-14', start: '02:30' })]), now: new Date(2027, 2, 13, 8) });
    assert.equal(result.plans.length, 0); assert(result.skipped > 0);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('notification taps route only to validated calendar IDs belonging to the current account', () => {
  const notice = plan().plans[0];
  assert.deepEqual(notificationTarget(notice, 'owner'), { calendarId: 'family', eventId: 'soccer', date: '2026-10-30' });
  assert.deepEqual(notificationTarget({ notification: { request: notice } }, 'owner'), { calendarId: 'family', eventId: 'soccer', date: '2026-10-30' });
  assert.equal(notificationTarget(notice, 'other'), null);
  assert.equal(notificationTarget({ content: { data: { ...notice.content.data, date: '2026-02-30' } } }, 'owner'), null);
});
test('startup is opt-out and synchronize never requests permissions', async () => {
  const f = fixture(); assert.equal((await f.service.synchronize({ userId: 'owner', calendars: calendars() })).status, 'disabled');
  assert.equal(f.calls.prompts, 0); assert.equal(f.calls.schedule, 0);
  await assert.rejects(f.service.configure('owner', { enabled: true }), { code: 'USER_ACTION_REQUIRED' });
  await assert.rejects(f.service.configure('owner', { userInitiated: true }), { code: 'INVALID_INPUT' });
});
test('explicit opt-in handles denied/provisional permission correctly and prepares the Android channel first', async () => {
  const f = fixture(); f.permission({ granted: false, ios: { status: 1 }, canAskAgain: false });
  assert.equal((await f.service.configure('owner', { enabled: true, userInitiated: true })).status, 'permission-denied'); assert.equal(f.calls.prompts, 0);
  f.permission({ granted: false, ios: { status: 3 } }); assert.equal((await f.service.configure('owner', { enabled: true, userInitiated: true })).status, 'enabled');
  const android = fixture('android'); await android.service.configure('owner', { enabled: true, userInitiated: true });
  assert.equal(android.calls.channel.length, 1); assert.equal(android.calls.prompts, 0);
  const result = await android.service.synchronize({ userId: 'owner', calendars: calendars() }); assert.equal(result.scheduled, 1);
  assert.equal([...android.records.values()][0].trigger.channelId, 'kidssync-family-reminders');
});
test('confirmed create/edit/delete and idempotent resync replace only managed reminders', async () => {
  const f = fixture(); f.records.set('unrelated', { identifier: 'unrelated', content: { title: 'Do not touch' } });
  await f.service.configure('owner', { enabled: true, userInitiated: true });
  await f.service.synchronize({ userId: 'owner', calendars: calendars() });
  await f.service.synchronize({ userId: 'owner', calendars: calendars() }); assert.equal(f.calls.schedule, 1);
  await f.service.synchronize({ userId: 'owner', calendars: calendars([event({ start: '17:00' })]) }); assert.equal(f.calls.schedule, 2); assert.equal(f.records.size, 2);
  await f.service.synchronize({ userId: 'owner', calendars: calendars([]) }); assert.equal(f.records.size, 1); assert(f.records.has('unrelated'));
});
test('account switches, logout, revoked permission and opt-out cancel stale notices without exposing another account', async () => {
  const f = fixture(); await f.service.configure('owner', { enabled: true, userInitiated: true });
  await f.service.synchronize({ userId: 'owner', calendars: calendars() });
  await f.service.synchronize({ userId: 'other', calendars: [] }); assert.equal(f.records.size, 0);
  await f.service.synchronize({ userId: 'owner', calendars: calendars() });
  f.permission({ granted: false, ios: { status: 1 }, canAskAgain: false });
  assert.equal((await f.service.synchronize({ userId: 'owner', calendars: calendars() })).status, 'permission-denied'); assert.equal(f.records.size, 0);
  f.permission({ granted: true, ios: { status: 2 } }); await f.service.synchronize({ userId: 'owner', calendars: calendars() });
  await f.service.configure('owner', { enabled: false, userInitiated: true }); assert.equal(f.records.size, 0);
  assert.equal((await f.service.synchronize({ userId: null })).status, 'signed-out');
});
test('stale scopes, corrupt preferences and native failures are not reported as successful delivery', async () => {
  const f = fixture(); await f.service.configure('owner', { enabled: true, userInitiated: true });
  assert.equal((await f.service.synchronize({ userId: 'owner', calendars: calendars(), isCurrent: () => false })).status, 'stale'); assert.equal(f.calls.schedule, 0);
  f.saved.set(preferenceKey('owner'), 'bad'); await assert.rejects(f.service.synchronize({ userId: 'owner', calendars: calendars() }), { code: 'INVALID_PREFERENCE' });
  await f.service.configure('owner', { enabled: true, userInitiated: true });
  f.sdk.scheduleNotificationAsync = async () => { throw new Error('native failure'); };
  await assert.rejects(f.service.synchronize({ userId: 'owner', calendars: calendars() }), /native failure/);
  assert.equal(f.calls.prompts, 0);
  assert.equal((await createLocalReminderService({ platform: 'web' }).synchronize()).status, 'unsupported');
});
test('parallel synchronizations are serialized and account preferences stay separate', async () => {
  const f = fixture(); await f.service.configure('owner', { enabled: true, userInitiated: true });
  await Promise.all([f.service.synchronize({ userId: 'owner', calendars: calendars() }), f.service.synchronize({ userId: 'owner', calendars: calendars() })]);
  assert.equal(f.calls.schedule, 1); assert.equal((await f.service.readPreference('other')).enabled, false);
  const current = [...f.records.values()][0]; assert.equal(current.content.data.kind, KIND);
});
test('incomplete loaded snapshots cannot erase previously scheduled reminders', async () => {
  const f = fixture(); await f.service.configure('owner', { enabled: true, userInitiated: true });
  await f.service.synchronize({ userId: 'owner', calendars: calendars() });
  await assert.rejects(f.service.synchronize({ userId: 'owner', calendars: [{ id: 'family', data: {} }] }), { code: 'INVALID_SNAPSHOT' });
  assert.equal(f.records.size, 1); assert.equal(f.calls.cancel.length, 0);
});
