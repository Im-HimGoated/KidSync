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
const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => values.set(key, value), removeItem: async key => values.delete(key) };
let host, authListener, currentSession, preview, trialStore, lastImport, websiteFails = false;
let sharedRead;
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
const ownerSync = { userId: null, loaded: true, row: { schedule: {} }, confirmedRow: { schedule: {} }, status: 'SYNCED',
  refresh: async () => {}, acceptConfirmed: async () => {}, saveActivity: async () => {}, deleteActivity: async () => {} };
const client = { auth: {
  onAuthStateChange(fn) { authListener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
  getSession: async () => ({ data: { session: currentSession } }), startAutoRefresh() {}, stopAutoRefresh() {},
  async signInWithPassword() { currentSession = { user: { id: 'account-a', email: 'test@example.com' } }; authListener('SIGNED_IN', currentSession); return { data: { session: currentSession } }; },
  async signOut() { currentSession = null; authListener('SIGNED_OUT', null); return {}; }
} };
const realLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'react') return hooks;
  if (request === 'react-native') return { ActivityIndicator: 'Spinner', View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image',
    StyleSheet: { create: value => value }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Linking: { openURL: async () => { if (websiteFails) throw Error('unavailable'); } }, Platform: { OS: 'ios', select: value => value.ios || value.default } };
  if (request === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', SafeAreaProvider: 'SafeAreaProvider' };
  if (request === '@react-native-async-storage/async-storage') return storage;
  if (request === 'lucide-react-native') return new Proxy({}, { get: (_object, key) => key === '__esModule' ? false : String(key) });
  if (parent?.filename === path.join(mobile, 'src/App.js')) {
    if (/\.(png|jpg)$/.test(request)) return 'bundled-image';
    if (request === './lib/supabase') return { supabase: client };
    if (request === './ui/AppearanceContext') return { AppearanceProvider: 'AppearanceProvider', useAppearance: () => appearance };
    if (request === './ui/use-device-language') return () => ['en', () => {}];
    if (request === './lib/use-schedule-sync') return () => { ownerSync.userId = currentSession?.user.id; return ownerSync; };
    if (request === './lib/use-local-reminders') return () => ({ state: { status: 'disabled' } });
    if (request.endsWith('/mobile-shared-calendar')) return {
      readSharedCalendar: (_client, _account, source) => sharedRead(source),
      createSharedCalendarAdapter: () => ({})
    };
    if (request === './ui/ReminderSettings') return { default: 'ReminderSettings', __esModule: true, reminderCopy: { en: { disabled: 'Off' } } };
    if (request === './lib/use-native-trial') return () => ({ data: preview, error: '',
      ...Object.fromEntries(['start', 'saveProfile', 'saveProfileDraft', 'reserveClaim', 'markClaimed'].map(key => [key, async (...args) => { preview = await trialStore[key](...args); return preview; }])) });
    if (request.endsWith('/claim-native-trial')) return { claimNativeTrial: async (_client, userId, data) => {
      lastImport = { userId, data }; return { calendarId: 'imported-calendar', schedule: {} };
    } };
    const names = { './screens/WelcomeScreen': 'WelcomeScreen', './screens/OnboardingScreen': 'OnboardingScreen',
      './screens/SignInScreen': 'SignInScreen', './screens/SignUpScreen': 'SignUpScreen', './screens/TrialCalendarScreen': 'TrialCalendarScreen',
      './screens/PersonalizeCalendarScreen': 'PersonalizeCalendarScreen', './screens/HomeScreen': 'HomeScreen',
      './screens/FamilyScreen': 'FamilyScreen', './calendar/CalendarScreen': 'CalendarScreen', './ui/AccountSettings': 'AccountSettings', './ui/SyncStatus': 'SyncStatus', './ui/PreviewDraftReview': 'PreviewDraftReview' };
    if (names[request]) return { __esModule: true, default: names[request], signInCopy: { en: {} }, signUpCopy: { en: {} }, trialCopy: { en: {} } };
  }
  return realLoad.apply(this, arguments);
};
const filename = path.join(mobile, 'src/App.js');
const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
  plugins: [[jsx, { runtime: 'automatic' }], commonjs] }).code + '\nexports.__Workspace = Workspace; exports.__BottomNavigation = BottomNavigation;', filename);
const Workspace = compiled.exports.__Workspace;
const BottomNavigation = compiled.exports.__BottomNavigation;
function find(element, type, predicate = () => true) {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type && predicate(element)) return element;
  const children = typeof element.props?.children === 'function' ? element.props.children(appearance) : element.props?.children;
  for (const child of [children].flat(Infinity)) { const result = find(child, type, predicate); if (result) return result; }
  return null;
}
async function mount() {
  for (const cell of previousHost?.cells || []) cell?.cleanup?.();
  values.clear(); currentSession = null; preview = null; lastImport = null; websiteFails = false;
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
test('primary entry reaches questions, review survives signup→preview→welcome→review', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onGetStarted();
  assert.ok(app.screen('OnboardingScreen')); assert.equal(preview, null);
  await app.screen('OnboardingScreen').onComplete(answers);
  assert.equal(app.screen('SignUpScreen').hasPreferences, true);
  await app.screen('SignUpScreen').onPreview();
  assert.deepEqual(app.screen('TrialCalendarScreen').preferences, answers);
  app.screen('TrialCalendarScreen').onBack(); await app.screen('WelcomeScreen').onGetStarted();
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
test('reviewed answers reach the authenticated calendar and remain editable through Account', async () => {
  const app = await mount(); await app.screen('WelcomeScreen').onGetStarted();
  await app.screen('OnboardingScreen').onComplete(answers); await app.screen('SignUpScreen').onSignIn();
  app.screen('SignInScreen').onEmailChange('test@example.com'); app.screen('SignInScreen').onPasswordChange('test-password');
  await app.screen('SignInScreen').onSignIn(); await app.settle();
  assert.deepEqual(app.screen('CalendarScreen').preferences, answers);
  app.screen('HomeScreen').onOpenDate('2026-01-30', '05:00');
  find(app.render(), 'Pressable', element => element.props.accessibilityLabel === 'Account').props.onPress();
  app.screen('AccountSettings').onPreferences(); await app.settle();
  assert.equal(app.screen('OnboardingScreen').initialDraft.review, true);
  const updated = { ...answers, hours: 'morning' };
  await app.screen('OnboardingScreen').onComplete(updated); await app.settle();
  assert.deepEqual(app.screen('CalendarScreen').preferences, updated);
  assert.equal(app.screen('CalendarScreen').focusDate, calendarTools.dateKey(new Date()));
  assert.equal(app.screen('CalendarScreen').focusTime, null);
  find(app.render(), 'Pressable', element => element.props.accessibilityLabel === 'Account').props.onPress();
  app.screen('AccountSettings').onPreferences(); await app.settle();
  app.screen('OnboardingScreen').onBack();
  assert.ok(app.screen('HomeScreen'));
  assert.equal(app.screen('CalendarScreen').focusTime, null);
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
  assert.equal(app.screen('FamilyScreen').peopleRequest, 1);
  assert.ok(find(app.render(), 'View', element => element.props.children?.type === 'FamilyScreen' && element.props.style[1] === false));
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
