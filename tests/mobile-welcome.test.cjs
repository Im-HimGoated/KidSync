const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'mobile/src/App.js'), 'utf8');
const welcome = fs.readFileSync(path.join(root, 'mobile/src/screens/WelcomeScreen.js'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'mobile/src/ui/CalendarPreview.js'), 'utf8');

test('native entry defaults to welcome after auth restores, and existing sessions bypass it', () => {
  assert.match(app, /\[entryScreen, setEntryScreen\] = useState\('welcome'\)/);
  assert.match(app, /booting \? <ActivityIndicator[^]*!session && entryScreen === 'welcome' \?/);
  assert.match(app, /<WelcomeScreen language=\{language\}/);
  assert.match(app, /setEntryScreen\('signin'\)/);
  assert.match(app, /setPassword\(''\); setEntryScreen\('welcome'\)/);
});

test('welcome has matching complete English and Chinese copy', () => {
  const literal = welcome.match(/export const welcomeCopy = (\{[^]*?\n\});/)[1];
  const copy = vm.runInNewContext(`(${literal})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  for (const language of ['en', 'zh']) {
    assert.equal(copy[language].photoDescriptions.length, 3);
    for (const value of Object.values(copy[language])) assert.ok(value.length);
  }
  assert.equal(copy.en.getStarted, 'Get started');
  assert.equal(copy.zh.getStarted, '\u5f00\u59cb\u4f7f\u7528');
  assert.match(copy.zh.heading, /\u6b22\u8fce/);
});

test('welcome is scrollable and uses bundled imagery with accessible actions', () => {
  assert.match(welcome, /<ScrollView contentContainerStyle/);
  assert.match(welcome, /maxWidth: 560/);
  assert.match(welcome, /flexWrap: 'wrap'/);
  assert.match(welcome, /imageStyle=\{styles.heroImage\}/);
  assert.match(welcome, /heroImage: \{ width: '100%', height: '100%' \}/);
  assert.match(welcome, /accessibilityRole="button" onPress=\{onSignIn\}/);
  assert.equal((welcome.match(/accessibilityRole="link" onPress=\{onOpenWebsite\}/g) || []).length, 1);
  assert.match(welcome, /accessibilityRole="button" onPress=\{onGetStarted\}/);
  const imagePath = welcome.match(/require\('([^']+\.jpg)'\)/)[1];
  assert.ok(fs.existsSync(path.resolve(root, 'mobile/src/screens', imagePath)));
  assert.match(app, /catch \{ setError\(t.linkFailed\); \}/);
});

test('welcome never creates sample accounts, children, or database rows', () => {
  assert.doesNotMatch(welcome, /supabase|\.insert\(|\.upsert\(|AsyncStorage/);
  assert.match(app, /Linking.openURL\('https:\/\/kid-sync-delta.vercel.app\/'\)/);
});

test('welcome emphasizes Get started and keeps sign-in as an unboxed secondary action', () => {
  assert.match(welcome, /styles\.primaryText\}>\{t\.getStarted\}/);
  assert.match(welcome, /styles\.returningText\}>\{t\.returning\}/);
  assert.match(welcome, /styles\.signInText\}>\{t\.signIn\}/);
  assert.doesNotMatch(welcome, /styles\.secondary/);
});

test('welcome uses a static calendar preview with the web calendar structure and palettes', () => {
  assert.match(welcome, /<CalendarPreview language=\{language\}/);
  assert.match(preview, /styles\.example\}>\{t\.example\}/);
  assert.match(preview, /styles\.allDayRow/);
  assert.match(preview, /styles\.selectedDate/);
  assert.match(preview, /styles\.eventTitle/);
  assert.doesNotMatch(preview, /Pressable|supabase|\.insert\(|\.upsert\(/);
  assert.match(welcome, /inner: \{[^\n]*flexGrow: 1/);
  const literal = preview.match(/export const calendarPreviewCopy = (\{[^]*?\n\});/)[1];
  const copy = vm.runInNewContext(`(${literal})`);
  assert.equal(copy.en.example, 'Example calendar');
  assert.equal(copy.en.titles[1], 'Soccer practice');
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  for (const language of ['en', 'zh']) {
    for (const key of ['days', 'hours', 'titles', 'times']) assert.equal(copy[language][key].length, 3);
  }
  const web = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const color of ['#e4f0f7', '#88aec5', '#173f59', '#e7f2eb', '#94b9a3', '#214c38', '#f8f0dc', '#c8ae71', '#594514']) {
    assert.ok(preview.includes(color) && web.includes(color));
  }
});

test('family photo rotation pauses for accessibility, app backgrounding and user preference', () => {
  assert.match(welcome, /if \(paused \|\| reduceMotion \|\| \(appState && appState !== 'active'\)\) return/);
  assert.match(welcome, /setInterval\([^\n]*8000\)/);
  assert.match(welcome, /clearInterval\(timer\)/);
  assert.match(welcome, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(welcome, /'reduceMotionChanged'/);
  assert.match(welcome, /motionListener\.remove\(\); stateListener\.remove\(\)/);
  assert.match(welcome, /accessibilityLabel=\{paused \? t\.play : t\.pause\}/);
  assert.match(welcome, /accessibilityLabel=\{t\.nextPhoto\}/);
  const paths = [...welcome.matchAll(/require\('([^']+\.jpg)'\)/g)].map(match => match[1]);
  assert.equal(paths.length, 3);
  for (const file of paths) assert.ok(fs.existsSync(path.resolve(root, 'mobile/src/screens', file)));
});

test('mobile welcome explains family-specific benefits and keeps entry actions outside the scroll', () => {
  const literal = welcome.match(/export const welcomeCopy = (\{[^]*?\n\});/)[1];
  const copy = vm.runInNewContext(`(${literal})`);
  assert.equal(copy.en.tagline, 'Every kid. Every pickup.');
  assert.equal(copy.zh.tagline, '每个孩子，每次接送。');
  assert.equal(copy.en.headlineAccent, 'One clear plan.');
  assert(welcome.indexOf('</ScrollView>') < welcome.indexOf('<View style={styles.actionBar}>'));
  assert.match(welcome, /actionBar: \{ flexShrink: 0/);
  assert.match(welcome, /useWindowDimensions\(\)/);
  assert.match(welcome, /height < 760 && fontScale <= 1\.25/);
  assert.match(welcome, /<CalendarPreview language=\{language\} compact=\{compact\} showHandoff/);
  assert.match(welcome, /accessible=\{false\} resizeMode="cover"/);
  assert.match(welcome, /accessibilityHint=\{t\.photoDescriptions\[photoIndex\]\}/);
  assert.match(welcome, /setupHint\}>[\s\S]*t\.setupHint/);
  assert.match(preview, /showHandoff && <View/);
  assert.match(preview, /styles\.handoffLabel\}>\{t\.pickup\}/);
  assert.match(preview, /styles\.handoffLabel\}>\{t\.bring\}/);
});

test('mobile welcome and sign-in use four genuinely different image files', () => {
  const signIn = fs.readFileSync(path.join(root, 'mobile/src/screens/SignInScreen.js'), 'utf8');
  const imagePaths = [...welcome.matchAll(/require\('([^']+\.jpg)'\)/g), ...signIn.matchAll(/require\('([^']+\.jpg)'\)/g)]
    .map(match => path.resolve(root, 'mobile/src/screens', match[1]));
  assert.equal(imagePaths.length, 4);
  assert.equal(new Set(imagePaths).size, 4);
  const hashes = imagePaths.map(file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  assert.equal(new Set(hashes).size, 4, 'different filenames must not conceal duplicate photos');
});
