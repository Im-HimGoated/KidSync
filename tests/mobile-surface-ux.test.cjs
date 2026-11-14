const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const app = read('mobile/src/App.js');
const home = read('mobile/src/screens/HomeScreen.js');
const family = read('mobile/src/screens/FamilyScreen.js');
const account = read('mobile/src/ui/AccountSettings.js');
const syncStatus = read('mobile/src/ui/SyncStatus.js');
const calendarScreen = read('mobile/src/calendar/CalendarScreen.js');
const calendarCopy = read('mobile/src/calendar/copy.js');

test('profile and settings are a first-class mobile destination', () => {
  assert.match(app, /key: 'account'.*icon: CircleUserRound/);
  assert.match(app, /active=\{accountOpen \? 'account' : workspaceView\}/);
  assert.match(app, /if \(view === 'account'\) \{ setAccountOpen\(true\); return; \}/);
  assert.match(account, /You & settings/);
  assert.match(account, /signedIn: 'Signed in as'/);
  assert.match(account, /style=\{s\.identity\}/);
  assert.match(account, /preferencesSection/);
  assert.match(account, /supportSection/);
});

test('dashboard prioritizes primary destinations and progressively reveals tools', () => {
  assert.match(home, /primaryAction/);
  assert.match(home, /secondaryAction/);
  assert.match(home, /onPress=\{openCurrentFamily\}/);
  assert.match(home, /accessibilityState=\{\{ expanded: toolsOpen \}\}/);
  assert.match(home, /toolsHint/);
  assert.match(home, /toolsOpen && <>/);
  assert.match(home, /accessibilityLabel=\{t\.preferences\}/);
});

test('signed-in chrome stays compact and only surfaces sync when action is useful', () => {
  assert.match(app, /session && styles\.signedInHeader/);
  assert.match(app, /!session && <View style=\{styles\.headerActions\}>/);
  assert.match(syncStatus, /status === 'SUBSCRIBED' && count === 0 && !reviewOpen/);
});

test('calendar search and person filters use one progressive disclosure', () => {
  assert.match(calendarScreen, /const \[filtersOpen, setFiltersOpen\] = useState\(false\)/);
  assert.match(calendarScreen, /accessibilityState=\{\{ expanded: filtersOpen \}\}/);
  assert.match(calendarScreen, /filtersOpen && <View style=\{s\.filterPanel\}>/);
  assert.match(calendarScreen, /agendaActions[^]*MessageCircle/);
  assert.doesNotMatch(calendarScreen, /commentsAccessRow/);
  assert.match(calendarCopy, /findFilter: 'Search or filter'/);
  assert.match(calendarCopy, /findFilter: '搜索或筛选'/);
  assert.match(calendarScreen, /planning\.findEvents\(filtered, from, through, ''\)/);
  assert.match(calendarScreen, /occurrenceDate=\{searchActive \? item\.occurrenceDate : ''\}/);
  assert.match(calendarScreen, /events=\{filtered\}/);
});

test('mobile Week uses one date header and keeps its timeline height responsive', () => {
  const calendarViews = read('mobile/src/calendar/CalendarViews.js');
  const trialCalendar = read('mobile/src/screens/TrialCalendarScreen.js');
  assert.match(calendarScreen, /!searchActive && view !== 'week' && view !== 'four' && <DateStrip/);
  assert.match(trialCalendar, /view !== 'week' && <DateStrip/);
  assert.match(calendarViews, /const timelineHeight = Math\.max\(360, Math\.min\(520, windowHeight - \(dayOnly \? 300 : 330\)\)\)/);
  assert.match(calendarViews, /style=\{\[s\.hoursViewport, \{ height: timelineHeight \}\]\}/);
  assert.match(calendarViews, /onMomentumScrollEnd/);
  assert.match(calendarViews, /onDate\?\.\(dates\[index\]\)/);
});

test('settings choices expose labeled radio groups and navigation badges stay localized', () => {
  const onboarding = read('mobile/src/screens/OnboardingScreen.js');
  const appearance = read('mobile/src/ui/AppearanceSettings.js');
  assert.match(onboarding, /accessibilityRole="radiogroup" accessibilityLabel=\{current\[0\]\}/);
  assert.equal((appearance.match(/accessibilityRole="radiogroup"/g) || []).length, 2);
  assert.match(app, /language === 'zh' \? `\$\{item\.count\} 项待处理` : `\$\{item\.count\} pending`/);
  assert.match(app, /importantForAccessibility="no"/);
});

test('family actions and empty states stay visible and informative', () => {
  assert.match(family, /function beginInvite\(\)/);
  assert.match(family, /action=\{ownerCalendar \? beginInvite : null\}/);
  assert.match(family, /function EmptyState/);
  assert.match(family, /requestsBody/);
  assert.match(family, /members\.filter\(item => item\.status === 'active'\)\.length \+ 1/);
});
