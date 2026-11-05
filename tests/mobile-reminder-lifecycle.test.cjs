const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createLocalReminderService, preferenceKey } = require('../mobile/src/lib/local-reminders');
const { createReminderLifecycle } = require('../mobile/src/lib/reminder-lifecycle');
const now = new Date(2026, 9, 30, 8).getTime();
const calendars = [{ id: 'family', data: { activities: [{ id: 'event', title: 'Private', startDate: '2026-10-30', start: '15:00', end: '16:00', reminderMinutes: 10 }] } }];
const owner = { userId: 'owner', ready: true, calendars };
function fixture() {
  const records = new Map(), storageData = new Map(), states = [], navigations = [];
  let permission = { granted: true, canAskAgain: true }, prompts = 0;
  const sdk = {
    getPermissionsAsync: async () => permission,
    requestPermissionsAsync: async () => { prompts++; return permission; },
    getAllScheduledNotificationsAsync: async () => [...records.values()],
    scheduleNotificationAsync: async value => { records.set(value.identifier, value); return value.identifier; },
    cancelScheduledNotificationAsync: async id => { records.delete(id); },
  };
  const storage = { getItem: async key => storageData.get(key) ?? null, setItem: async (key, value) => { storageData.set(key, value); } };
  const service = createLocalReminderService({ notifications: sdk, storage, platform: 'ios', now: () => now });
  const lifecycle = createReminderLifecycle({ service, onState: value => states.push(value), onNavigate: value => navigations.push(value) });
  return { records, storageData, states, navigations, sdk, storage, service, lifecycle, prompts: () => prompts, permission: value => { permission = value; } };
}
test('startup stays off; explicit enable schedules generic notices and never displays private titles', async () => {
  const f = fixture(); await f.lifecycle.update(owner);
  assert.equal(f.states.at(-1).status, 'disabled'); assert.equal(f.records.size, 0); assert.equal(f.prompts(), 0);
  await f.lifecycle.configure(true);
  assert.equal(f.states.at(-1).status, 'scheduled'); assert.equal(f.records.size, 1);
  const notice = [...f.records.values()][0]; assert(!notice.content.body.includes('Private'));
  assert.equal(f.lifecycle.presentation(notice).shouldShowBanner, true);
  f.storageData.set(preferenceKey('owner'), JSON.stringify({ version: 1, enabled: true, showTitles: true }));
  await f.lifecycle.refresh(); assert(![...f.records.values()][0].content.body.includes('Private'));
});
test('confirmed edit/delete and foreground refresh reconcile the OS schedule', async () => {
  const f = fixture(); await f.lifecycle.update(owner); await f.lifecycle.configure(true);
  const changed = structuredClone(calendars); changed[0].data.activities[0].start = '17:00';
  await f.lifecycle.update({ ...owner, calendars: changed });
  assert.equal([...f.records.values()][0].trigger.date.getHours(), 16);
  f.permission({ granted: false, canAskAgain: false }); await f.lifecycle.refresh();
  assert.equal(f.states.at(-1).status, 'permission-denied'); assert.equal(f.records.size, 0); assert.equal(f.prompts(), 0);
  f.permission({ granted: true }); await f.lifecycle.refresh(); assert.equal(f.records.size, 1);
  await f.lifecycle.update({ ...owner, calendars: [{ id: 'family', data: { activities: [] } }] });
  assert.equal(f.records.size, 0);
});
test('account switch cancels previous user notices even while the new account is loading', async () => {
  const f = fixture(); await f.lifecycle.update(owner); await f.lifecycle.configure(true);
  const old = [...f.records.values()][0];
  const update = f.lifecycle.update({ userId: 'other', ready: false });
  assert.equal(f.lifecycle.presentation(old).shouldShowBanner, false);
  await update; assert.equal(f.records.size, 0); assert.equal(f.states.at(-1).enabled, false);
  await f.lifecycle.update({ userId: null, ready: false }); assert.equal(f.states.at(-1).status, 'signed-out');
});
test('not-ready updates never treat an empty or optimistic calendar as confirmed deletion', async () => {
  const f = fixture(); await f.lifecycle.update(owner); await f.lifecycle.configure(true);
  await f.lifecycle.update({ userId: 'owner', ready: false, calendars: [] });
  assert.equal(f.states.at(-1).status, 'waiting'); assert.equal(f.records.size, 1);
  assert.equal(f.lifecycle.presentation([...f.records.values()][0]).shouldShowBanner, false);
});
test('cold taps wait for confirmed data, route once, and reject other accounts and missing events', async () => {
  const f = fixture(); await f.lifecycle.update(owner); await f.lifecycle.configure(true);
  const notice = [...f.records.values()][0];
  const cold = fixture(); await cold.lifecycle.receiveResponse({ notification: { request: notice } });
  assert.equal(cold.navigations.length, 0);
  await cold.lifecycle.update(owner); assert.deepEqual(cold.navigations, [{ calendarId: 'family', eventId: 'event', date: '2026-10-30' }]);
  await cold.lifecycle.refresh(); assert.equal(cold.navigations.length, 1);
  await cold.lifecycle.update({ ...owner, userId: 'other' }); await cold.lifecycle.receiveResponse({ notification: { request: notice } });
  assert.equal(cold.navigations.length, 1);
  await cold.lifecycle.update({ ...owner, calendars: [] }); await cold.lifecycle.receiveResponse(notice); assert.equal(cold.navigations.length, 1);
});
test('denial remains recoverable without automatic prompts and opt-out cancels even if persistence fails', async () => {
  const f = fixture(); await f.lifecycle.update(owner);
  f.permission({ granted: false, canAskAgain: false }); await f.lifecycle.configure(true);
  assert.equal(f.states.at(-1).status, 'permission-denied'); assert.equal(f.prompts(), 0);
  f.permission({ granted: true }); await f.lifecycle.configure(true); assert.equal(f.records.size, 1);
  f.storage.setItem = async () => { throw new Error('disk'); };
  await f.lifecycle.configure(false); assert.equal(f.records.size, 0); assert.equal(f.states.at(-1).status, 'error');
});
test('corrupt preferences and SDK failures fail closed instead of claiming successful scheduling', async () => {
  const f = fixture(); await f.lifecycle.update(owner); await f.lifecycle.configure(true);
  f.storageData.set(preferenceKey('owner'), 'invalid'); await f.lifecycle.refresh();
  assert.equal(f.states.at(-1).status, 'error'); assert.equal(f.records.size, 0);
  f.sdk.scheduleNotificationAsync = async () => { throw new Error('OS unavailable'); };
  await f.lifecycle.configure(true); assert.equal(f.states.at(-1).status, 'error');
});
test('late permission responses after account switch never schedule into the previous account', async () => {
  const f = fixture(); await f.lifecycle.update(owner);
  let release; f.sdk.getPermissionsAsync = () => new Promise(resolve => { release = resolve; });
  const action = f.lifecycle.configure(true);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const switched = f.lifecycle.update({ userId: 'other', ready: false });
  release({ granted: true }); await action; await switched;
  assert.equal(f.records.size, 0); assert.equal(f.states.at(-1).enabled, false);
  f.lifecycle.dispose(); assert.equal(f.lifecycle.presentation({}).shouldShowBanner, false);
});
test('reminder panel has complete EN/ZH copy and shell adapter never requests push tokens', () => {
  const panel = fs.readFileSync(require.resolve('../mobile/src/ui/ReminderSettings.js'), 'utf8');
  const copy = vm.runInNewContext(`(${panel.match(/export const reminderCopy = (\{[^]*?\n\});/)[1]})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  for (const language of ['en', 'zh']) for (const value of Object.values(copy[language])) assert(value.trim());
  assert.match(copy.en.detail, /confirmed calendars you own/);
  assert.match(copy.en.detail, /shared with you do not schedule reminders/);
  assert.match(copy.en.waiting, /calendar you own/);
  const hook = fs.readFileSync(require.resolve('../mobile/src/lib/use-local-reminders.js'), 'utf8');
  assert.match(hook, /addNotificationResponseReceivedListener/); assert.match(hook, /getLastNotificationResponseAsync/);
  assert.match(hook, /next === 'active'/); assert.match(hook, /snapshotKey/);
  assert(!hook.includes('getExpoPushToken')); assert(!hook.includes('getDevicePushToken'));
  const config = require('../mobile/app.json');
  assert(config.expo.plugins.some(plugin => plugin[0] === 'expo-notifications' && plugin[1].enableBackgroundRemoteNotifications === false));
});
test('reminder panel resolves semantic colors for every runtime mode and accent', () => {
  const source = fs.readFileSync(require.resolve('../mobile/src/ui/ReminderSettings.js'), 'utf8');
  const theme = require('../mobile/src/ui/theme');
  const styles = vm.runInNewContext(`(${source.slice(source.indexOf('function createStyles(colors)'))})`, { StyleSheet: { create: value => value } });
  assert.match(source, /useAppearance\(\)/); assert.match(source, /useThemeStyles\(createStyles\)/);
  assert(!source.includes('colors.white')); assert(!source.includes('u.body'));
  assert.match(source, /thumbColor=\{state.enabled \? colors.onPrimary : colors.surface\}/);
  for (const mode of ['light', 'dark']) for (const accent of theme.ACCENTS) {
    const { colors } = theme.createTheme({ mode, accent });
    const result = styles(colors);
    assert.equal(result.content.backgroundColor, colors.surface);
    assert.equal(result.label.color, colors.ink); assert.equal(result.body.color, colors.muted);
    assert.equal(result.error.color, colors.error); assert.equal(result.error.backgroundColor, colors.errorSoft);
    assert.notEqual(result.body.color, result.content.backgroundColor);
  }
});
