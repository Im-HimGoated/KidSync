const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// Run the real app shell and its navigation handlers, with auth/network/native
// boundaries replaced. Persistence and preview mutations use the real stores.
const mobile = path.resolve(__dirname, '../mobile');
function dependency(name) {
  const folder = fs.readdirSync(path.join(mobile, 'node_modules/.pnpm')).find(value => value.startsWith(name.replace('/', '+') + '@'));
  return require(path.join(mobile, 'node_modules/.pnpm', folder, 'node_modules', name));
}
const babel = dependency('@babel/core'), jsx = dependency('@babel/plugin-transform-react-jsx');
const commonjs = dependency('@babel/plugin-transform-modules-commonjs');
const React = require(path.join(mobile, 'node_modules/react'));
const preferences = require('../mobile/src/lib/preferences');
const nativeTrial = require('../mobile/src/lib/native-trial');
const calendarTools = require('../mobile/src/lib/calendar');
const values = new Map();
const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value), removeItem: async key => values.delete(key),
  getAllKeys: async () => [...values.keys()], multiRemove: async keys => { for (const key of keys) values.delete(key); } };
let host, authListener, currentSession, preview, trialStore, lastImport, websiteFails = false;
let sharedRead;
let deletionReply, cancelledReminderUsers = [];
let previousHost;
const appearance = { colors: {}, settings: {} };
const hooks = { ...React,
  useState(initial) {
    const owner = host, index = owner.cursor++;
    if (!owner.cells[index]) owner.cells[index] = { value: typeof initial === 'function' ? initial() : initial };
    return [owner.cells[index].value, value => { const cell = owner.cells[index]; cell.value = typeof value === 'function' ? value(cell.value) : value; }];
  },
  useRef(initial) { const index = host.cursor++; return host.cells[index] ||= { current: initial }; },
  useMemo(factory, deps) {
    const index = host.cursor++, previous = host.cells[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) host.cells[index] = { value: factory(), deps };
    return host.cells[index].value;
  },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  useEffect(effect, deps) {
    const owner = host, index = owner.cursor++, previous = owner.cells[index];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
      owner.effects.push(() => { previous?.cleanup?.(); owner.cells[index] = { deps, cleanup: effect() }; });
    }
  }
};
const ownerSync = { userId: null, loaded: true, row: { schedule: {} }, confirmedRow: { schedule: {} }, status: 'SUBSCRIBED',
  refresh: async () => {}, acceptConfirmed: async () => {}, saveActivity: async () => {}, deleteActivity: async () => {} };
const client = { auth: {
  onAuthStateChange(fn) { authListener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
  getSession: async () => ({ data: { session: currentSession } }), startAutoRefresh() {}, stopAutoRefresh() {},
  getUser: async () => ({ data: { user: currentSession?.user } }),
  async signInWithPassword() { currentSession = { user: { id: 'account-a', email: 'test@example.com' } }; authListener('SIGNED_IN', currentSession); return { data: { session: currentSession } }; },
  async signOut() { currentSession = null; authListener('SIGNED_OUT', null); return {}; }
}, functions: { invoke: async (_name, options) => options.method === 'GET'
  ? { data: { available: true, version: 1 } } : typeof deletionReply === 'function' ? deletionReply(options) : { data: { deleted: true } } } };
const realLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'react') return hooks;
  if (request === 'react-native') return { ActivityIndicator: 'Spinner', View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image', ScrollView: 'ScrollView',
    StyleSheet: { create: value => value }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Linking: { openURL: async () => { if (websiteFails) throw Error('unavailable'); } }, Platform: { OS: 'ios', select: value => value.ios || value.default } };
  if (request === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', SafeAreaProvider: 'SafeAreaProvider' };
  if (request === '@react-native-async-storage/async-storage') return storage;
  if (request === 'lucide-react-native') return new Proxy({}, { get: (_object, key) => key === '__esModule' ? false : String(key) });
  if (request === '../ui/AppearanceContext' && parent?.filename === path.join(mobile, 'src/screens/OnboardingScreen.js')) {
    return { useAppearance: () => appearance, useThemeStyles: createStyles => createStyles(appearance.colors) };
  }
  if (parent?.filename === path.join(mobile, 'src/ui/AccountSettings.js')) {
    if (request === './AppearanceContext') return { useAppearance: () => ({ ...appearance, settings: { mode: 'system', accent: 'forest' } }),
      useThemeStyles: createStyles => createStyles(appearance.colors) };
    if (request === '../calendar/ui') return { Button: 'Button', Sheet: 'Sheet', Field: 'Field' };
    if (request === './AppearanceSettings') return { default: 'AppearanceSettings', __esModule: true, appearanceCopy: { en: {} } };
    if (request === './ReminderSettings') return { default: 'ReminderSettings', __esModule: true, reminderCopy: { en: { title: 'Phone reminders', disabled: 'Off' } } };
    if (request === './CalendarDisplaySettings') return { default: 'CalendarDisplaySettings', __esModule: true,
      calendarDisplayCopy: { en: { title: 'Calendar display', noCalendar: 'Choose a calendar you own' } } };
  }
  if (parent?.filename === path.join(mobile, 'src/App.js')) {
    if (/\.(png|jpg)$/.test(request)) return 'bundled-image';
    if (request === './lib/supabase') return { supabase: client };
    if (request === './ui/AppearanceContext') return { AppearanceProvider: 'AppearanceProvider', useAppearance: () => appearance };
    if (request === './ui/use-device-language') return () => ['en', () => {}];
    if (request === './lib/use-schedule-sync') return () => { ownerSync.userId = currentSession?.user.id; return ownerSync; };
    if (request === './lib/use-local-reminders') return { __esModule: true, default: () => ({ state: { status: 'disabled' } }),
      cancelRemindersForAccount: async userId => { cancelledReminderUsers.push(userId); } };
    if (request.endsWith('/mobile-shared-calendar')) return {
      readSharedCalendar: (_client, _account, source) => sharedRead(source),
      createSharedCalendarAdapter: () => ({})
    };
    if (request === './lib/use-native-trial') return () => ({ data: preview, error: '',
      ...Object.fromEntries(['start', 'saveProfile', 'saveProfileDraft', 'reserveClaim', 'markClaimed'].map(key => [key, async (...args) => { preview = await trialStore[key](...args); return preview; }])) });
    if (request.endsWith('/claim-native-trial')) return { claimNativeTrial: async (_client, userId, data) => {
      lastImport = { userId, data }; return { calendarId: 'imported-calendar', schedule: {} };
    } };
    const names = { './screens/WelcomeScreen': 'WelcomeScreen', './screens/OnboardingScreen': 'OnboardingScreen',
      './screens/SignInScreen': 'SignInScreen', './screens/SignUpScreen': 'SignUpScreen', './screens/TrialCalendarScreen': 'TrialCalendarScreen',
      './screens/PersonalizeCalendarScreen': 'PersonalizeCalendarScreen', './screens/HomeScreen': 'HomeScreen',
      './screens/FamilyScreen': 'FamilyScreen', './calendar/CalendarScreen': 'CalendarScreen', './ui/AccountSettings': 'AccountSettings', './ui/SyncStatus': 'SyncStatus',
      './ui/PreviewDraftReview': 'PreviewDraftReview', './ui/WeeklyBrief': 'WeeklyBrief' };
    if (names[request]) return { __esModule: true, default: names[request], AccountDeletionReceipt: 'AccountDeletionReceipt', signInCopy: { en: { backToCreate: 'Back to create account' } }, signUpCopy: { en: {} }, trialCopy: { en: {} } };
  }
  return realLoad.apply(this, arguments);
};
function compileScreen(relativePath, exportCode = '') {
  const filename = path.join(mobile, relativePath);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
    plugins: [[jsx, { runtime: 'automatic' }], commonjs] });
  compiled._compile(code + exportCode, filename);
  return compiled.exports;
}
const { __Workspace: Workspace, __BottomNavigation: BottomNavigation } = compileScreen('src/App.js',
  '\nexports.__Workspace = Workspace; exports.__BottomNavigation = BottomNavigation;');
function find(element, type, predicate = () => true) {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type && predicate(element)) return element;
  const children = typeof element.props?.children === 'function' ? element.props.children(appearance) : element.props?.children;
  for (const child of [children].flat(Infinity)) { const result = find(child, type, predicate); if (result) return result; }
  return null;
}
async function mount(session = null, seed = () => {}) {
  for (const cell of previousHost?.cells || []) cell?.cleanup?.();
  values.clear(); currentSession = session; preview = null; lastImport = null; websiteFails = false;
  deletionReply = null; cancelledReminderUsers = []; seed(values);
  Object.assign(ownerSync, { loaded: true, row: { schedule: {} }, status: 'SUBSCRIBED' });
  ownerSync.refresh = async () => ({ pendingCount: 0 });
  ownerSync.acceptConfirmed = async () => {};
  sharedRead = async source => ({ ownerId: source.ownerId, calendarId: source.id, canWrite: false,
    calendar: { id: source.id, name: source.name, ownerId: source.ownerId, data: {} } });
  trialStore = nativeTrial.createTrialStore(storage);
  const state = { cells: [], cursor: 0, effects: [] };
  previousHost = state;
  const app = { tree: null, render() { host = state; state.cursor = 0; app.tree = Workspace(); for (const effect of state.effects.splice(0)) effect(); return app.tree; },
    screen(name) { return find(app.render(), name)?.props; },
    async settle() { for (let i = 0; i < 5; i++) { app.render(); await new Promise(resolve => setImmediate(resolve)); } } };
  await app.settle(); return app;
}
const answers = { people: 'children', view: 'week', week: 'sunday', hours: 'evening', reminders: '30' };
function deletionSettings(initial = {}) {
  const { default: AccountSettings, __Row: Row } = compileScreen('src/ui/AccountSettings.js', '\nexports.__Row = Row;');
  const state = { cells: [], cursor: 0, effects: [] };
  let props = { language: 'en', email: 'parent@example.com', onClose() {}, onCheckDeletion: async () => true,
    onDeleteAccount: async () => ({ deleted: true }), ...initial };
  const render = () => {
    host = state; state.cursor = 0;
    const tree = AccountSettings(props);
    for (const effect of state.effects.splice(0)) effect(); return tree;
  };
  return { render, props(patch) { props = { ...props, ...patch }; },
    row: title => find(render(), Row, node => node.props.title === title),
    button: label => find(render(), 'Button', node => node.props.children === label),
    field: () => find(render(), 'Field'),
    consent: () => find(render(), 'Pressable', node => node.props.accessibilityRole === 'checkbox'),
    back: () => find(render(), 'Pressable', node => find(node, 'Text')?.props.children === 'Back to settings'),
  };
}
test('account deletion stays unavailable until the deployed endpoint confirms readiness', async () => {
  const app = deletionSettings({ onCheckDeletion: async () => { throw Error('not deployed'); } });
  await app.row('Delete account').props.onPress();
  assert.equal(app.render().props.title, 'Delete your KidsSync account?');
  assert.equal(app.field(), null); assert.ok(app.button('Check again'));
  app.props({ onCheckDeletion: async () => true }); await app.button('Check again').props.onPress();
  assert.ok(app.field()); assert.equal(app.field().props.secureTextEntry, true);
  assert.equal(app.button('Delete account').props.disabled, true);
});
test('deletion requires both a password and explicit confirmation before dispatch', async () => {
  const received = []; const app = deletionSettings({ onDeleteAccount: async value => { received.push(value); return { deleted: true }; } });
  await app.row('Delete account').props.onPress();
  await app.button('Delete account').props.onPress(); assert.deepEqual(received, []);
  app.field().props.onChangeText('correct-password');
  assert.equal(app.button('Delete account').props.disabled, true);
  app.consent().props.onPress(); assert.equal(app.button('Delete account').props.disabled, false);
  await app.button('Delete account').props.onPress();
  assert.deepEqual(received, [{ password: 'correct-password', confirmationEmail: 'parent@example.com' }]);
  assert.equal(app.field().props.value, '', 'password must be cleared after the attempt');
});
test('pending deletion blocks duplicate taps and Back/Close, then surfaces retryable failure', async () => {
  let finish, calls = 0, closes = 0;
  const app = deletionSettings({ onClose: () => { closes++; }, onDeleteAccount: () => { calls++; return new Promise((_resolve, reject) => { finish = reject; }); } });
  await app.row('Delete account').props.onPress(); app.field().props.onChangeText('password'); app.consent().props.onPress();
  const handler = app.button('Delete account').props.onPress, pending = handler(); await handler();
  assert.equal(calls, 1); assert.equal(app.render().props.busy, true); assert.equal(app.field().props.editable, false);
  app.render().props.onClose(); app.back().props.onPress(); assert.equal(closes, 0);
  finish(Object.assign(new Error('wrong password'), { code: 'REAUTH_FAILED' })); await pending;
  assert.equal(app.render().props.busy, false); assert.equal(app.field().props.value, '');
  assert.ok(find(app.render(), 'Text', node => node.props.children === 'The password was not accepted. Try again.'));
});
test('a late readiness response cannot reopen a deletion form after Back', async () => {
  let finish;
  const app = deletionSettings({ onCheckDeletion: () => new Promise(resolve => { finish = resolve; }) });
  const checking = app.row('Delete account').props.onPress(); app.back().props.onPress(); finish(true); await checking;
  assert.equal(app.render().props.title, 'You & settings'); assert.equal(app.field(), null);
});
test('Chinese deletion copy, readiness and confirmation use the same guarded flow', async () => {
  let calls = 0;
  const app = deletionSettings({ language: 'zh', onDeleteAccount: async () => { calls++; return { deleted: true }; } });
  await app.row('删除账户').props.onPress(); assert.equal(app.render().props.title, '删除你的 KidsSync 账户？');
  assert.equal(app.field().props.label, '当前密码');
  app.field().props.onChangeText('password'); app.consent().props.onPress(); await app.button('删除账户').props.onPress();
  assert.equal(calls, 1); assert.equal(app.field().props.value, '');
});
test('privacy overview is readable without making an account deletion or network request', () => {
  const app = deletionSettings({ onCheckDeletion: () => { throw Error('must not run'); } });
  app.row('Privacy & your data').props.onPress(); assert.equal(app.render().props.title, 'Privacy & your data');
  assert.ok(find(app.render(), 'Text', node => typeof node.props.children === 'string' && node.props.children.includes('Supabase')));
});
test('early setup review keeps the selected answer and applies only confirmed edits', async () => {
  const { default: OnboardingScreen } = compileScreen('src/screens/OnboardingScreen.js');
  const state = { cells: [], cursor: 0, effects: [] };
  let saved;
  const props = { language: 'en', onDraftChange: async () => {}, onBack: () => {},
    onComplete: async value => { saved = value; } };
  const pressable = label => {
    host = state; state.cursor = 0;
    const tree = OnboardingScreen(props);
    for (const effect of state.effects.splice(0)) effect();
    return find(tree, 'Pressable', element => (element.props.accessibilityLabel ?? find(element, 'Text')?.props.children) === label)?.props;
  };
  assert.equal(pressable('The whole family · Default').accessibilityState.checked, true);
  pressable('My children').onPress();
  pressable('Review choices now').onPress();
  assert.ok(pressable('Edit Planning for. Current choice is My children.'));
  pressable('Edit Opening view. Current choice is Agenda.').onPress();
  pressable('Month').onPress();
  pressable('Cancel').onPress();
  pressable('Edit Opening view. Current choice is Agenda.').onPress();
  pressable('Day').onPress();
  pressable('Apply choice').onPress();
  await pressable('Save & continue').onPress();
  assert.deepEqual(saved, { ...preferences.DEFAULTS, people: 'children', view: 'day' });
});
test('restored sign-in offers the weekly brief only after the Home schedule is available', async () => {
  const app = await mount({ user: { id: 'account-a', email: 'test@example.com' } });
  Object.assign(ownerSync, { row: null, status: 'CONNECTING' });
  assert.equal(app.screen('WeeklyBrief').ready, false);
  ownerSync.status = 'OFFLINE';
  assert.equal(app.screen('WeeklyBrief').ready, false);
  ownerSync.row = { schedule: { calendars: [{ id: 'sports', name: 'Sports' }], calendarData: { sports: { activities: [] } } } };
  assert.equal(app.screen('WeeklyBrief').ready, false);
  ownerSync.row.schedule.calendarData.sports.activities = [{ id: 'practice', title: 'Practice' }];
  let brief = app.screen('WeeklyBrief');
  assert.equal(brief.userId, 'account-a');
  assert.equal(brief.calendar.id, 'sports');
  assert.equal(brief.ready, true);
  assert.equal(brief.cached, true);
  assert.equal(brief.active, true);
  app.screen('SyncStatus').onReviewOpenChange(true);
  assert.equal(app.screen('WeeklyBrief').active, false);
  app.screen('SyncStatus').onReviewOpenChange(false);
  assert.equal(app.screen('WeeklyBrief').active, true);
  brief.onOpenCalendar('2026-11-08');
  assert.equal(app.screen('CalendarScreen').focusDate, '2026-11-08');
  assert.equal(app.screen('WeeklyBrief').active, false);
  Object.assign(ownerSync, { row: null, status: 'SUBSCRIBED' });
  brief = app.screen('WeeklyBrief');
  assert.equal(brief.ready, false);
  assert.equal(brief.calendar, undefined);
});
test('Home sends scoped create, add, and detail requests to Calendar', async () => {
  const app = await mount({ user: { id: 'account-a', email: 'test@example.com' } });
  Object.assign(ownerSync, { row: null, status: 'CONNECTING' });
  assert.equal(app.screen('HomeScreen').onStartPlan, undefined);
  ownerSync.status = 'SUBSCRIBED';
  assert.equal(app.screen('HomeScreen').planAction, 'create');
  app.screen('HomeScreen').onStartPlan();
  assert.deepEqual(app.screen('CalendarScreen').actionRequest, {
    id: 1, type: 'create', ownerId: 'account-a', calendarId: null, date: undefined, eventId: undefined,
  });
  ownerSync.row = { schedule: { calendars: [{ id: 'family', name: 'Family' }], calendarData: {} } };
  assert.equal(app.screen('HomeScreen').planAction, 'new');
  app.screen('HomeScreen').onStartPlan();
  assert.equal(app.screen('CalendarScreen').actionRequest.calendarId, 'family');
  assert.equal(app.screen('CalendarScreen').actionRequest.type, 'new');
  app.screen('HomeScreen').onOpenDate('2026-11-13', null, 5);
  assert.equal(app.screen('CalendarScreen').focusDate, '2026-11-13');
  assert.deepEqual(app.screen('CalendarScreen').actionRequest, {
    id: 3, type: 'details', ownerId: 'account-a', calendarId: 'family', date: '2026-11-13', eventId: 5,
  });
  app.screen('HomeScreen').onOpenCalendar();
  assert.equal(app.screen('CalendarScreen').actionRequest, null);
});
test('primary entry reaches questions, preview returns to signup, and review choices survive', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onGetStarted();
  assert.ok(app.screen('OnboardingScreen')); assert.equal(preview, null);
  await app.screen('OnboardingScreen').onComplete(answers);
  assert.equal(app.screen('SignUpScreen').hasPreferences, true);
  await app.screen('SignUpScreen').onPreview();
  assert.deepEqual(app.screen('TrialCalendarScreen').preferences, answers);
  assert.equal(app.screen('TrialCalendarScreen').backLabel, 'Back to create account');
  app.screen('TrialCalendarScreen').onBack();
  assert.equal(app.screen('SignUpScreen').hasPreferences, true);
  await app.screen('SignUpScreen').onBack();
  assert.equal(app.screen('OnboardingScreen').initialDraft.review, true);
  assert.deepEqual(app.screen('OnboardingScreen').initialDraft.answers, answers);
});
test('direct preview does not require questions or an account and resumes the same plans', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onPreview();
  await trialStore.saveEvent({ title: 'Preview plan', startDate: '2026-11-03', start: '08:00', end: '09:00' });
  app.screen('TrialCalendarScreen').onBack(); await app.screen('WelcomeScreen').onPreview();
  assert.equal(app.screen('TrialCalendarScreen').data.events[0].title, 'Preview plan');
  assert.equal(currentSession, null);
});
test('leaving personalization after the guest preview expires returns to its entry screen', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onGetStarted();
  await app.screen('OnboardingScreen').onComplete(answers);
  await app.screen('SignUpScreen').onPreview();
  preview = await trialStore.advance(nativeTrial.LIMIT_MS);
  await app.settle();
  await app.screen('PersonalizeCalendarScreen').onBack({ calendarName: 'QA preview' });
  assert.equal(app.screen('SignUpScreen').hasPreferences, true);
  assert.equal((await trialStore.load()).profile.calendarName, 'QA preview');
});
test('sign-in offers preview import only when there is preview work to keep', async () => {
  const cases = [
    { action: 'start', args: [], importLabel: null, hasDraft: false },
    { action: 'saveDraft', args: [{ title: 'Unfinished pickup' }], importLabel: 'Make your calendar yours', hasDraft: true },
    { action: 'saveProfile', args: [{ calendarName: 'My preview' }, false], importLabel: 'Save preview to my account', hasDraft: false },
  ];
  for (const { action, args, importLabel, hasDraft } of cases) {
    const app = await mount(); await app.screen('WelcomeScreen').onPreview();
    preview = await trialStore[action](...args);
    app.screen('TrialCalendarScreen').onBack(); await app.screen('WelcomeScreen').onSignIn();
    app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
    await app.screen('SignInScreen').onSignIn(); await app.settle();
    assert.ok(app.screen('HomeScreen'));
    const tree = app.render();
    const importAction = find(tree, 'Pressable', element => ['Make your calendar yours', 'Save preview to my account'].includes(element.props.children?.props?.children));
    assert.equal(importAction?.props.children.props.children ?? null, importLabel);
    const review = find(tree, 'Pressable', element => element.props.children?.props?.children === 'Review unfinished preview plan');
    assert.equal(!!review, hasDraft);
  }
});
test('reviewed answers reach the authenticated calendar and remain editable through Account', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onGetStarted();
  await app.screen('OnboardingScreen').onComplete(answers); await app.screen('SignUpScreen').onSignIn();
  assert.equal(app.screen('SignInScreen').backLabel, 'Back to create account');
  app.screen('SignInScreen').onBack();
  assert.equal(app.screen('SignUpScreen').hasPreferences, true);
  await app.screen('SignUpScreen').onSignIn();
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  assert.deepEqual(app.screen('CalendarScreen').preferences, answers);
  app.screen('HomeScreen').onOpenDate('2026-01-30', '05:00');
  find(app.render(), BottomNavigation).props.onChange('account');
  app.screen('AccountSettings').onPreferences(); await app.settle();
  assert.equal(app.screen('OnboardingScreen').initialDraft.review, true);
  const updated = { ...answers, hours: 'morning' };
  await app.screen('OnboardingScreen').onComplete(updated); await app.settle();
  assert.deepEqual(app.screen('CalendarScreen').preferences, updated);
  assert.equal(app.screen('CalendarScreen').focusDate, '2026-01-30');
  assert.equal(app.screen('CalendarScreen').focusTime, '05:00');
  find(app.render(), BottomNavigation).props.onChange('home');
  find(app.render(), BottomNavigation).props.onChange('calendar');
  assert.equal(app.screen('CalendarScreen').focusDate, '2026-01-30');
  assert.equal(app.screen('CalendarScreen').focusTime, '05:00');
  find(app.render(), BottomNavigation).props.onChange('account');
  app.screen('AccountSettings').onPreferences(); await app.settle();
  app.screen('OnboardingScreen').onBack();
  assert.ok(app.screen('HomeScreen'));
  assert.equal(app.screen('CalendarScreen').focusTime, '05:00');
});
test('Account stays open when preferences cannot load and closes after a successful retry', async () => {
  const app = await mount({ user: { id: 'account-a', email: 'test@example.com' } });
  find(app.render(), BottomNavigation).props.onChange('account');
  const read = storage.getItem;
  storage.getItem = async key => {
    if (key === `${preferences.keyForUser('account-a')}:draft`) throw new Error('unavailable');
    return read(key);
  };
  try {
    assert.equal(await app.screen('AccountSettings').onPreferences(), false);
    assert.ok(app.screen('AccountSettings'));
    assert.equal(app.screen('OnboardingScreen'), undefined);
  } finally {
    storage.getItem = read;
  }
  assert.equal(await app.screen('AccountSettings').onPreferences(), true);
  assert.equal(app.screen('AccountSettings'), undefined);
  assert.ok(app.screen('OnboardingScreen'));
});
test('Account opens and leaves phone reminders through the same settings sheet', () => {
  const { default: AccountSettings, __Row: Row } = compileScreen('src/ui/AccountSettings.js', '\nexports.__Row = Row;');
  const state = { cells: [], cursor: 0, effects: [] };
  const reminders = { state: { status: 'disabled' } };
  let closes = 0;
  const openSheet = () => {
    host = state; state.cursor = 0;
    const tree = AccountSettings({ language: 'en', email: 'test@example.com', reminders, onClose: () => { closes += 1; } });
    for (const effect of state.effects.splice(0)) effect();
    return tree;
  };
  const account = openSheet();
  const reminderRow = find(account, Row, element => element.props.title === 'Phone reminders');
  assert.equal(account.type, 'Sheet');
  assert.ok(reminderRow);
  reminderRow.props.onPress();
  const phones = openSheet();
  assert.equal(phones.type, account.type);
  assert.equal(phones.props.title, 'Phone reminders');
  assert.equal(find(phones, 'ReminderSettings').props.reminders, reminders);
  reminders.state.status = 'configuring';
  assert.equal(openSheet().props.busy, true);
  reminders.state.status = 'disabled';
  find(openSheet(), 'Pressable', element => find(element, 'Text')?.props.children === 'Back to settings').props.onPress();
  assert.equal(openSheet().props.title, 'You & settings');
  assert.equal(closes, 0);
});
test('explicit preview import selects and opens the new real calendar without replacing existing plans', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onPreview();
  preview = await trialStore.saveDraft({ title: 'Still unfinished', startDate: '2026-11-03', start: '18:00', end: '19:00' });
  app.screen('TrialCalendarScreen').onPersonalize();
  await app.screen('PersonalizeCalendarScreen').onContinue('signin', { calendarName: 'My preview' });
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  assert.equal(lastImport, null, 'signing in alone must not import preview plans');
  const save = find(app.render(), 'Pressable', element => element.props.children?.props?.children === 'Save preview to my account');
  assert.ok(save); await save.props.onPress(); await app.settle();
  assert.equal(lastImport.userId, 'account-a'); assert.equal(preview.claimedBy, 'account-a');
  assert.equal(app.screen('CalendarScreen').calendarId, 'imported-calendar');
  assert.ok(find(app.render(), 'View', element => element.props.children?.type === 'CalendarScreen' && element.props.style[1] === false));
  find(app.render(), 'Pressable', element => element.props.children?.props?.children === 'Review unfinished preview plan').props.onPress();
  assert.equal(app.screen('PreviewDraftReview').draft.title, 'Still unfinished');
  currentSession = { user: { id: 'account-b', email: 'second@example.com' } }; authListener('SIGNED_IN', currentSession);
  await app.settle();
  assert.equal(app.screen('PreviewDraftReview'), undefined);
  assert.equal(find(app.render(), 'Pressable', element => element.props.children?.props?.children === 'Review unfinished preview plan'), null);
});

test('selected calendar cloud display defaults preserve local onboarding week, hours and reminders', async () => {
  const app = await mount({ user: { id: 'account-a', email: 'test@example.com' } });
  await app.screen('HomeScreen').onPreferences();
  await app.screen('OnboardingScreen').onComplete(answers); await app.settle();
  ownerSync.row = { schedule: { calendars: [{ id: 'home', name: 'Home' }, { id: 'work', name: 'Work' }],
    calendarData: {
      home: { activities: [], settings: { defaultView: 'four', defaultEventDuration: 45, showWeekends: false, notifications: true } },
      work: { activities: [], settings: { defaultView: 'today', defaultEventDuration: 90, showWeekends: true } },
    } } };
  app.screen('CalendarScreen').onSelectCalendar('home', { id: 'home' });
  assert.deepEqual(app.screen('CalendarScreen').preferences, { ...answers, view: 'four', defaultEventDuration: 45, showWeekends: false });
  app.screen('CalendarScreen').onSelectCalendar('work', { id: 'work' });
  assert.deepEqual(app.screen('CalendarScreen').preferences, { ...answers, view: 'day', defaultEventDuration: 90, showWeekends: true });
  find(app.render(), BottomNavigation).props.onChange('account');
  assert.equal(app.screen('AccountSettings').calendarDisplay.calendar.id, 'work');
  assert.equal(app.screen('AccountSettings').calendarDisplay.available, true);
  ownerSync.status = 'OFFLINE';
  assert.equal(app.screen('AccountSettings').calendarDisplay.available, false);
  ownerSync.status = 'SUBSCRIBED';
  await app.screen('FamilyScreen').onOpenSharedCalendar({ calendar: { id: 'shared', ownerId: 'other-owner', name: 'Shared' }, invitation: { id: 'invite' } });
  assert.equal(app.screen('AccountSettings').calendarDisplay.calendar, null);
  assert.equal(app.screen('AccountSettings').calendarDisplay.available, false);
});

test('Account display saves accept a confirmed row and reject calendar switches while refreshing', async () => {
  const backend = require('../shared/backend/mobile-settings'), originalSave = backend.saveCalendarSettings;
  const app = await mount({ user: { id: 'account-a', email: 'test@example.com' } });
  ownerSync.row = { schedule: { calendars: [{ id: 'home', name: 'Home' }, { id: 'work', name: 'Work' }],
    calendarData: { home: { activities: [] }, work: { activities: [] } } } };
  app.screen('CalendarScreen').onSelectCalendar('home', { id: 'home' });
  find(app.render(), BottomNavigation).props.onChange('account');
  let calls = 0, accepted = 0;
  const confirmed = { ...ownerSync.row, updated_at: '2026-11-23T12:00:00Z' };
  ownerSync.acceptConfirmed = async row => { assert.equal(row, confirmed); accepted++; };
  backend.saveCalendarSettings = async (_client, userId, id, request) => {
    calls++; assert.equal(userId, 'account-a'); assert.equal(id, 'home');
    assert.equal(request.isCurrent(), true); assert.deepEqual(request.changes, { showWeekends: false }); return confirmed;
  };
  try {
    assert.equal(await app.screen('AccountSettings').calendarDisplay.onSave({ original: {}, changes: { showWeekends: false } }), confirmed);
    assert.equal(calls, 1); assert.equal(accepted, 1);
    let finish;
    ownerSync.refresh = () => new Promise(resolve => { finish = resolve; });
    const pending = app.screen('AccountSettings').calendarDisplay.onSave({ original: {}, changes: { showWeekends: false } });
    app.screen('CalendarScreen').onSelectCalendar('work', { id: 'work' }); app.render();
    finish({ pendingCount: 0 });
    await assert.rejects(pending, { code: 'STALE_SCOPE' });
    assert.equal(calls, 1); assert.equal(accepted, 1);
  } finally { backend.saveCalendarSettings = originalSave; }
});

test('Account opens calendar display in the existing sheet and keeps it busy during saves', () => {
  const { default: AccountSettings, __Row: Row } = compileScreen('src/ui/AccountSettings.js', '\nexports.__Row = Row;');
  const state = { cells: [], cursor: 0, effects: [] };
  const calendarDisplay = { scope: 'account/home', calendar: { id: 'home', name: 'Home' }, available: true };
  const render = () => {
    host = state; state.cursor = 0;
    const tree = AccountSettings({ language: 'en', email: 'test@example.com', calendarDisplay });
    for (const effect of state.effects.splice(0)) effect(); return tree;
  };
  find(render(), Row, node => node.props.title === 'Calendar display').props.onPress();
  const panel = find(render(), 'CalendarDisplaySettings');
  assert.equal(render().type, 'Sheet'); assert.equal(render().props.title, 'Calendar display');
  assert.equal(panel.props.calendar, calendarDisplay.calendar);
  panel.props.onBusyChange(true); assert.equal(render().props.busy, true);
  panel.props.onBusyChange(false); assert.equal(render().props.busy, false);
});

test('Back and Close protect unsaved display choices while Keep editing retains the mounted draft', () => {
  const { default: AccountSettings, __Row: Row } = compileScreen('src/ui/AccountSettings.js', '\nexports.__Row = Row;');
  for (const destination of ['back', 'close']) {
    const state = { cells: [], cursor: 0, effects: [] }; let closes = 0;
    const calendarDisplay = { scope: 'account/home', calendar: { id: 'home', name: 'Home' }, available: true };
    const render = () => {
      host = state; state.cursor = 0;
      const tree = AccountSettings({ language: 'en', email: 'test@example.com', calendarDisplay, onClose: () => { closes++; } });
      for (const effect of state.effects.splice(0)) effect(); return tree;
    };
    find(render(), Row, node => node.props.title === 'Calendar display').props.onPress();
    const panel = find(render(), 'CalendarDisplaySettings');
    panel.props.onDirtyChange(true);
    const attemptLeave = () => {
      if (destination === 'close') render().props.onClose();
      else find(render(), 'Pressable', node => find(node, 'Text')?.props.children === 'Back to settings').props.onPress();
    };
    attemptLeave();
    assert.equal(closes, 0); assert.equal(render().props.title, 'Discard display changes?');
    const hidden = find(render(), 'View', node => node.props.accessibilityElementsHidden === true);
    assert.ok(hidden); assert.equal(find(hidden, 'CalendarDisplaySettings').key, panel.key);
    find(render(), 'Button', node => node.props.children === 'Keep editing').props.onPress();
    assert.equal(render().props.title, 'Calendar display');
    assert.equal(find(render(), 'CalendarDisplaySettings').key, panel.key);
    attemptLeave();
    find(render(), 'Button', node => node.props.children === 'Discard changes').props.onPress();
    if (destination === 'close') assert.equal(closes, 1);
    else { assert.equal(render().props.title, 'You & settings'); assert.equal(find(render(), 'CalendarDisplaySettings'), null); }
  }
});

test('clean display exits immediately and an in-flight save cannot leave Settings', () => {
  const { default: AccountSettings, __Row: Row } = compileScreen('src/ui/AccountSettings.js', '\nexports.__Row = Row;');
  const state = { cells: [], cursor: 0, effects: [] }; let closes = 0;
  const render = () => {
    host = state; state.cursor = 0;
    const tree = AccountSettings({ language: 'en', calendarDisplay: { scope: 'home', calendar: { id: 'home' } }, onClose: () => { closes++; } });
    for (const effect of state.effects.splice(0)) effect(); return tree;
  };
  find(render(), Row, node => node.props.title === 'Calendar display').props.onPress();
  find(render(), 'CalendarDisplaySettings').props.onBusyChange(true);
  render().props.onClose(); assert.equal(closes, 0);
  find(render(), 'CalendarDisplaySettings').props.onBusyChange(false);
  render().props.onClose(); assert.equal(closes, 1);
});
test('failed website handoff reports failure to the caller for visible retry feedback', async () => {
  const app = await mount(); websiteFails = true;
  assert.equal(await app.screen('WelcomeScreen').onOpenWebsite(), false);
  assert.match(app.screen('WelcomeScreen').error, /Could not open/);
  websiteFails = false; assert.equal(await app.screen('WelcomeScreen').onOpenWebsite(), true);
});
test('an import confirmation completing after an account switch cannot navigate the new account', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onPreview(); app.screen('TrialCalendarScreen').onPersonalize();
  await app.screen('PersonalizeCalendarScreen').onContinue('signin', { calendarName: 'My preview' });
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  let finish; ownerSync.acceptConfirmed = () => new Promise(resolve => { finish = resolve; });
  const pending = find(app.render(), 'Pressable', element => element.props.children?.props?.children === 'Save preview to my account').props.onPress();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof finish, 'function');
  currentSession = { user: { id: 'account-b', email: 'second@example.com' } }; authListener('SIGNED_IN', currentSession); await app.settle();
  finish(); await pending; await app.settle();
  assert.notEqual(app.screen('CalendarScreen').calendarId, 'imported-calendar');
  assert.equal(app.screen('CalendarScreen').calendarOwnerId, 'account-b');
  assert.ok(find(app.render(), 'View', element => element.props.children?.type === 'HomeScreen' && element.props.style[1] === false));
});
test('Home destinations leave a previously selected shared calendar and owner Share opens Family', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onSignIn();
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  const shared = { calendar: { id: 'shared', ownerId: 'other-owner', name: 'Shared plans' }, invitation: { id: 'invite' } };
  await app.screen('FamilyScreen').onOpenSharedCalendar(shared);
  assert.equal(app.screen('CalendarScreen').calendarOwnerId, 'other-owner');
  assert.equal(app.screen('CalendarScreen').onShareCalendar, undefined);
  app.screen('HomeScreen').onOpenDate('2026-11-04', '05:15');
  assert.equal(app.screen('CalendarScreen').calendarId, 'family');
  assert.equal(app.screen('CalendarScreen').calendarOwnerId, 'account-a');
  assert.equal(app.screen('CalendarScreen').calendars.some(item => item.ownerId === 'other-owner'), false);
  assert.equal(app.screen('CalendarScreen').focusDate, '2026-11-04');
  assert.equal(app.screen('CalendarScreen').focusTime, '05:15');
  const firstFocusRequest = app.screen('CalendarScreen').focusRequest;
  app.screen('HomeScreen').onOpenDate('2026-11-04');
  assert.ok(app.screen('CalendarScreen').focusRequest > firstFocusRequest);
  await app.screen('FamilyScreen').onOpenSharedCalendar(shared);
  app.screen('HomeScreen').onOpenCalendar();
  assert.equal(app.screen('CalendarScreen').calendarId, 'family');
  assert.equal(app.screen('CalendarScreen').focusDate, calendarTools.dateKey(new Date()));
  assert.equal(app.screen('CalendarScreen').focusTime, null);
  app.screen('CalendarScreen').onShareCalendar({ id: 'family' });
  assert.deepEqual(app.screen('FamilyScreen').tabRequest, { tab: 'people', id: 1 });
  assert.ok(find(app.render(), 'View', element => element.props.children?.type === 'FamilyScreen' && element.props.style[1] === false));
  app.screen('HomeScreen').onOpenPickups();
  assert.deepEqual(app.screen('FamilyScreen').tabRequest, { tab: 'pickups', id: 2 });
  app.screen('HomeScreen').onOpenPickups();
  assert.deepEqual(app.screen('FamilyScreen').tabRequest, { tab: 'pickups', id: 3 });
});

test('Home receives only pickup results for its signed-in calendar', async () => {
  const app = await mount({ user: { id: 'account-a', email: 'test@example.com' } });
  ownerSync.row = { schedule: { calendars: [{ id: 'family', name: 'Family' }, { id: 'sports', name: 'Sports' }], calendarData: {} } };
  const rows = [{ event_id: 'practice', occurrence_date: '2026-11-12', status: 'accepted' }];
  const receive = app.screen('FamilyScreen').onOwnerPickups;
  assert.equal(app.screen('HomeScreen').pickups, undefined);
  receive({ ownerId: 'account-b', calendarId: 'family', rows });
  assert.equal(app.screen('HomeScreen').pickups, undefined);
  receive({ ownerId: 'account-a', calendarId: 'family', rows });
  assert.deepEqual(app.screen('HomeScreen').pickups, rows);
  app.screen('HomeScreen').onSelectCalendar('sports');
  assert.equal(app.screen('HomeScreen').pickups, undefined);
  receive({ ownerId: 'account-a', calendarId: 'sports', rows: [] });
  assert.deepEqual(app.screen('HomeScreen').pickups, []);
  receive({ ownerId: 'account-a', calendarId: 'sports', rows: undefined });
  assert.equal(app.screen('HomeScreen').pickups, undefined);
});
test('a delayed shared open cannot replace an explicitly selected owner destination', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onSignIn();
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  let finish; const read = sharedRead; sharedRead = source => new Promise(resolve => { finish = async () => resolve(await read(source)); });
  const pending = app.screen('FamilyScreen').onOpenSharedCalendar({ calendar: { id: 'shared', ownerId: 'other-owner', name: 'Shared' }, invitation: { id: 'invite' } });
  app.screen('HomeScreen').onOpenDate('2026-11-04'); await finish();
  assert.equal(await pending, false); await app.settle();
  assert.equal(app.screen('CalendarScreen').calendarId, 'family');
  assert.equal(app.screen('CalendarScreen').focusDate, '2026-11-04');
});
test('an old shared revocation response cannot redirect or discard the owned calendar', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onSignIn();
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  await app.screen('FamilyScreen').onOpenSharedCalendar({ calendar: { id: 'shared', ownerId: 'other-owner', name: 'Shared' }, invitation: { id: 'invite' } });
  let fail; sharedRead = () => new Promise((_resolve, reject) => { fail = reject; });
  const pending = app.screen('CalendarScreen').onSharedRefresh();
  app.screen('CalendarScreen').onSelectCalendar('family', { id: 'family' });
  fail(Object.assign(Error('Revoked'), { code: 'FORBIDDEN' })); await assert.rejects(pending, { code: 'FORBIDDEN' }); await app.settle();
  assert.equal(app.screen('CalendarScreen').calendarId, 'family');
  assert.equal(app.screen('CalendarScreen').calendarOwnerId, 'account-a');
  assert.equal(app.screen('CalendarScreen').sharedAccess, null);
  assert.ok(find(app.render(), 'View', element => element.props.children?.type === 'CalendarScreen' && element.props.style[1] === false));
});
test('bottom tabs cancel a pending shared open, and Home tab releases selected shared context', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onSignIn();
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  const context = { calendar: { id: 'shared', ownerId: 'other-owner', name: 'Shared' }, invitation: { id: 'invite' } }, read = sharedRead;
  for (const tab of ['home', 'calendar']) {
    let finish; sharedRead = source => new Promise(resolve => { finish = async () => resolve(await read(source)); });
    const pending = app.screen('FamilyScreen').onOpenSharedCalendar(context);
    find(app.render(), BottomNavigation).props.onChange(tab); await finish(); assert.equal(await pending, false);
    assert.equal(find(app.render(), BottomNavigation).props.active, tab);
    assert.equal(app.screen('CalendarScreen').calendarOwnerId, 'account-a');
  }
  sharedRead = read; await app.screen('FamilyScreen').onOpenSharedCalendar(context);
  find(app.render(), BottomNavigation).props.onChange('home');
  assert.equal(app.screen('CalendarScreen').sharedAccess, null);
  assert.equal(app.screen('CalendarScreen').calendars.some(item => item.ownerId === 'other-owner'), false);
});
test('Family owner comments opens the real owned calendar with a fresh scope-bound request', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onSignIn();
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  assert.equal(app.screen('FamilyScreen').onOpenOwnerComments({ id: 'family', ownerId: 'other-owner' }), false);
  assert.equal(app.screen('FamilyScreen').onOpenOwnerComments({ id: 'family', ownerId: 'account-a' }), true);
  assert.deepEqual(app.screen('CalendarScreen').account, currentSession.user);
  const request = app.screen('CalendarScreen').commentsRequest;
  assert.deepEqual(request, { id: 1, ownerId: 'account-a', calendarId: 'family' });
  assert.ok(find(app.render(), 'View', element => element.props.children?.type === 'CalendarScreen' && element.props.style[1] === false));
  find(app.render(), BottomNavigation).props.onChange('home');
  assert.equal(app.screen('CalendarScreen').commentsRequest, null);
  app.screen('FamilyScreen').onOpenOwnerComments({ id: 'family' });
  assert.ok(app.screen('CalendarScreen').commentsRequest.id > request.id);
});
test.after(() => { for (const cell of previousHost?.cells || []) cell?.cleanup?.(); Module._load = realLoad; });

test('confirmed account deletion erases only that account and returns a signed-out receipt', async () => {
  const id = 'delete-success'; const app = await mount({ user: { id, email: 'test@example.com' } });
  values.set(`kidssync:mobile:schedule:v1:${id}`, 'private'); values.set('kidssync:mobile:schedule:v1:another', 'keep');
  values.set(preferences.PENDING_KEY, 'guest');
  find(app.render(), BottomNavigation).props.onChange('account');
  assert.equal(await app.screen('AccountSettings').onCheckDeletion(), true);
  assert.equal((await app.screen('AccountSettings').onDeleteAccount({ password: 'password', confirmationEmail: 'test@example.com' })).deleted, true);
  await app.settle();
  assert.equal(currentSession, null); assert.equal(values.has(`kidssync:mobile:schedule:v1:${id}`), false);
  assert.equal(values.get('kidssync:mobile:schedule:v1:another'), 'keep'); assert.equal(values.get(preferences.PENDING_KEY), 'guest');
  assert.deepEqual(cancelledReminderUsers, [id]); assert.equal(app.screen('AccountDeletionReceipt').needsCleanup, false);
  app.screen('AccountDeletionReceipt').onClose(); assert.ok(app.screen('WelcomeScreen'));
});

test('a rejected deletion preserves the account and local schedule', async () => {
  const id = 'delete-rejected'; const app = await mount({ user: { id, email: 'test@example.com' } });
  values.set(`kidssync:mobile:schedule:v1:${id}`, 'keep');
  deletionReply = async () => ({ error: { context: new Response(JSON.stringify({ code: 'REAUTH_FAILED' }), { status: 401 }) } });
  find(app.render(), BottomNavigation).props.onChange('account');
  await assert.rejects(app.screen('AccountSettings').onDeleteAccount({ password: 'wrong', confirmationEmail: 'test@example.com' }), { code: 'REAUTH_FAILED' });
  assert.equal(currentSession.user.id, id); assert.equal(values.get(`kidssync:mobile:schedule:v1:${id}`), 'keep');
  assert.equal(app.screen('AccountDeletionReceipt'), undefined); assert.deepEqual(cancelledReminderUsers, []);
});

test('a deletion response after switching accounts cannot sign out or clear the new account', async () => {
  const oldId = 'delete-switched-old', newId = 'delete-switched-new';
  const app = await mount({ user: { id: oldId, email: 'test@example.com' } });
  values.set(`kidssync:mobile:schedule:v1:${oldId}`, 'old'); values.set(`kidssync:mobile:schedule:v1:${newId}`, 'new');
  let finish; deletionReply = () => new Promise(resolve => { finish = resolve; });
  find(app.render(), BottomNavigation).props.onChange('account');
  const pending = app.screen('AccountSettings').onDeleteAccount({ password: 'password', confirmationEmail: 'test@example.com' });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  currentSession = { user: { id: newId, email: 'new@example.com' } }; authListener('SIGNED_IN', currentSession); await app.settle();
  finish({ data: { deleted: true } }); await pending; await app.settle();
  assert.equal(currentSession.user.id, newId); assert.equal(values.get(`kidssync:mobile:schedule:v1:${newId}`), 'new');
  assert.equal(values.has(`kidssync:mobile:schedule:v1:${oldId}`), false);
  assert.equal(app.screen('AccountDeletionReceipt'), undefined); assert.deepEqual(cancelledReminderUsers, [oldId]);
});

test('failed local cleanup retries without sending another account deletion request', async () => {
  const id = 'delete-cleanup-retry'; const app = await mount({ user: { id, email: 'test@example.com' } });
  values.set(`kidssync:mobile:schedule:v1:${id}`, 'old');
  let calls = 0; deletionReply = async () => { calls++; return { data: { deleted: true } }; };
  const remove = storage.multiRemove; storage.multiRemove = async () => { throw Error('storage unavailable'); };
  try {
    find(app.render(), BottomNavigation).props.onChange('account');
    await app.screen('AccountSettings').onDeleteAccount({ password: 'password', confirmationEmail: 'test@example.com' }); await app.settle();
    assert.equal(app.screen('AccountDeletionReceipt').needsCleanup, true); assert.equal(currentSession, null);
    storage.multiRemove = remove; await app.screen('AccountDeletionReceipt').onRetry(); await app.settle();
    assert.equal(app.screen('AccountDeletionReceipt').needsCleanup, false); assert.equal(calls, 1);
    assert.equal(values.has(`kidssync:mobile:schedule:v1:${id}`), false);
  } finally { storage.multiRemove = remove; }
});

test('a confirmed cleanup marker restores a receipt after restarting without repeating remote deletion', async () => {
  const id = 'delete-recovery'; const app = await mount({ user: { id, email: 'test@example.com' } }, map => {
    map.set(`kidssync:mobile:deletion:v1:${id}`, JSON.stringify({ version: 1, userId: id, confirmedDeleted: true }));
    map.set(`kidssync:mobile:schedule:v1:${id}`, 'private');
  });
  let calls = 0; deletionReply = async () => { calls++; throw Error('must not request'); };
  assert.ok(app.screen('AccountDeletionReceipt')); assert.equal(app.screen('HomeScreen'), undefined);
  await app.screen('AccountDeletionReceipt').onRetry(); await app.settle();
  assert.equal(currentSession, null); assert.equal(calls, 0); assert.equal(app.screen('AccountDeletionReceipt').needsCleanup, false);
});

test('startup offers every confirmed account cleanup in one session and preserves the current account', async () => {
  const ids = ['delete-recovery-first', 'delete-recovery-second'], current = 'delete-recovery-current';
  const marker = id => `kidssync:mobile:deletion:v1:${id}`, cache = id => `kidssync:mobile:schedule:v1:${id}`;
  const app = await mount({ user: { id: current, email: 'current@example.com' } }, map => {
    for (const id of ids) {
      map.set(marker(id), JSON.stringify({ version: 1, userId: id, confirmedDeleted: true })); map.set(cache(id), id);
    }
    map.set(cache(current), 'keep current');
  });
  let calls = 0; deletionReply = async () => { calls++; throw Error('must not request'); };
  assert.equal(app.screen('AccountDeletionReceipt').userId, ids[0]);
  await app.screen('AccountDeletionReceipt').onRetry(); await app.settle();
  assert.equal(app.screen('AccountDeletionReceipt').needsCleanup, false);
  assert.equal(values.has(marker(ids[0])), false); assert.equal(values.has(cache(ids[0])), false);
  const finishFirst = app.screen('AccountDeletionReceipt').onClose;
  finishFirst(); finishFirst(); await app.settle();
  assert.equal(app.screen('AccountDeletionReceipt').userId, ids[1]);
  assert.equal(app.screen('AccountDeletionReceipt').needsCleanup, true);
  await app.screen('AccountDeletionReceipt').onRetry(); await app.settle();
  app.screen('AccountDeletionReceipt').onClose(); await app.settle();
  assert.equal(app.screen('AccountDeletionReceipt'), undefined);
  assert.equal(values.has(marker(ids[1])), false); assert.equal(values.has(cache(ids[1])), false);
  assert.equal(values.get(cache(current)), 'keep current'); assert.equal(currentSession.user.id, current);
  assert.deepEqual(cancelledReminderUsers, ids); assert.equal(calls, 0);
});

test('a failed cleanup marker survives dismissal while the next account can finish recovery', async () => {
  const first = 'delete-recovery-failed', second = 'delete-recovery-after-failure';
  const marker = id => `kidssync:mobile:deletion:v1:${id}`, cache = id => `kidssync:mobile:schedule:v1:${id}`;
  const app = await mount(null, map => {
    for (const id of [first, second]) {
      map.set(marker(id), JSON.stringify({ version: 1, userId: id, confirmedDeleted: true })); map.set(cache(id), id);
    }
  });
  let calls = 0; deletionReply = async () => { calls++; throw Error('must not request'); };
  const remove = storage.multiRemove; let release;
  storage.multiRemove = keys => keys.includes(cache(first)) ? new Promise((_resolve, reject) => {
    release = () => reject(Error('storage unavailable'));
  }) : remove(keys);
  try {
    const cleanup = app.screen('AccountDeletionReceipt').onRetry();
    while (!release) await new Promise(resolve => setImmediate(resolve));
    app.screen('AccountDeletionReceipt').onClose();
    assert.equal(app.screen('AccountDeletionReceipt').userId, first); assert.equal(app.screen('AccountDeletionReceipt').busy, true);
    release(); await cleanup; await app.settle();
    assert.equal(app.screen('AccountDeletionReceipt').needsCleanup, true);
    app.screen('AccountDeletionReceipt').onClose(); await app.settle();
    assert.equal(app.screen('AccountDeletionReceipt').userId, second);
    await app.screen('AccountDeletionReceipt').onRetry(); await app.settle();
    app.screen('AccountDeletionReceipt').onClose(); await app.settle();
    assert.equal(app.screen('AccountDeletionReceipt'), undefined);
    assert.ok(values.has(marker(first))); assert.equal(values.get(cache(first)), first);
    assert.equal(values.has(marker(second)), false); assert.equal(values.has(cache(second)), false); assert.equal(calls, 0);
  } finally { storage.multiRemove = remove; }
});
