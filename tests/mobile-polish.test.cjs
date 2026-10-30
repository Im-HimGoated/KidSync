const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { colors, normalizeLanguage } = require('../mobile/src/ui/theme');
const read = file => fs.readFileSync(require.resolve(`../mobile/src/${file}`), 'utf8');
function luminance(hex) {
  return hex.replace('#', '').match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); }
test('shared mobile palette has AA body text, action and error contrast', () => {
  for (const [foreground, backgrounds] of [[colors.ink, [colors.white, colors.page]], [colors.muted, [colors.white, colors.page, colors.primarySoft]], [colors.white, [colors.primary, colors.blue]], [colors.red, [colors.white, colors.redSoft]]]) {
    for (const background of backgrounds) assert(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
  }
});
test('language values normalize and saved restoration cannot override a newer deliberate choice', () => {
  assert.equal(normalizeLanguage('zh'), 'zh');
  for (const value of [null, 'fr', '', {}, 'en']) assert.equal(normalizeLanguage(value), 'en');
  const source = read('ui/use-device-language.js');
  assert.match(source, /active && !changed.current/);
  assert.match(source, /changed.current = true/);
  assert.match(source, /queue.current = queue.current.catch/);
  assert.match(read('App.js'), /const \[language, setLanguage\] = useDeviceLanguage\(\)/);
});
test('account help is bilingual and is honest about notifications, sharing and guest persistence', () => {
  const source = read('ui/AccountSettings.js');
  const copy = vm.runInNewContext(`(${source.match(/export const accountCopy = (\{[^]*?\n\});/)[1]})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  for (const language of ['en', 'zh']) {
    assert.equal(copy[language].faqs.length, 6);
    for (const [title, answer] of copy[language].faqs) { assert(title); assert(answer.length > 30); }
  }
  assert.match(copy.en.faqs[4][1], /not scheduled/);
  assert.match(copy.en.faqs[5][1], /Open Family/);
  assert.match(copy.en.faqs[5][1], /depend on your role and calendar setup/);
  assert.match(copy.en.faqs[3][1], /saved offline changes stay on this device until synced/);
  assert.match(copy.en.faqs[3][1], /Shared changes need an online confirmation/);
  assert.match(source, /index === 4 && onReminders \? t.remindersHelp/);
  assert.match(source, /accessibilityState=\{\{ expanded: question === index \}\}/);
  assert.match(source, /closeLabel=\{t.close\}[^]*onClose=\{onClose\}/);
});
test('account sign out has an explicit cancel path, synchronous duplicate guard and retained failure feedback', () => {
  const source = read('ui/AccountSettings.js');
  assert.match(source, /if \(request.current\) return/);
  assert.match(source, /result === false \|\| result\?\.error/);
  assert.match(source, /t.stay/);
  assert.match(source, /setFailure\(t.signOutFailed\)/);
  const app = read('App.js');
  const signOut = app.match(/async function signOut\(\) \{([^]*?)\n  \}/)[1];
  assert(signOut.indexOf('signOutError') < signOut.indexOf('setAccountOpen(false)'));
});
test('shared modal motion respects accessibility and native escape does not bypass busy state', () => {
  const source = read('calendar/ui.js');
  assert.match(source, /reduceMotion \? 'none' : 'slide'/);
  assert.match(source, /AccessibilityInfo.isReduceMotionEnabled/);
  assert.match(source, /onAccessibilityEscape=\{\(\) => \{ if \(!busy\) onClose\(\); \}\}/);
});

test('calendar add action stays in the toolbar instead of covering mobile filters', () => {
  const source = read('calendar/CalendarScreen.js');
  assert.match(source, /<View style=\{s\.calendarRow\}>[^]*<IconButton icon=\{Plus\} label=\{t\.add\}/);
  assert.doesNotMatch(source, /style=\{\(\{ pressed \}\) => \[s\.add/);
  assert.doesNotMatch(source, /add: \{ position: 'absolute'/);
});
