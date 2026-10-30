const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const theme = require('../mobile/src/ui/theme');
const { createAppearanceStore, decode, keyFor } = require('../mobile/src/ui/appearance-store');
const read = name => fs.readFileSync(require.resolve(`../mobile/src/${name}`), 'utf8');
function storage() {
  const data = new Map();
  return { data, getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } };
}
function luminance(hex) { return hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (x + 0.05) / (y + 0.05); }

test('appearance accepts only supported choices and removes arbitrary account data', () => {
  assert.deepEqual(theme.normalizeAppearance({ mode: 'dark', accent: 'ocean', token: 'private' }), { mode: 'dark', accent: 'ocean' });
  for (const value of [null, false, {}, { mode: 'pink', accent: 'neon' }]) assert.deepEqual(theme.normalizeAppearance(value), theme.DEFAULT_APPEARANCE);
});
test('device default follows OS while explicit modes override it', () => {
  assert.equal(theme.createTheme({ mode: 'system' }, 'dark').resolvedMode, 'dark');
  assert.equal(theme.createTheme({ mode: 'system' }, null).resolvedMode, 'light');
  for (const mode of ['light', 'dark']) for (const system of ['light', 'dark']) assert.equal(theme.createTheme({ mode }, system).resolvedMode, mode);
});
test('every mode and accent meets AA body, input, action, semantic and event text contrast', () => {
  for (const mode of ['light', 'dark']) for (const accent of theme.ACCENTS) {
    const { colors: c, palettes } = theme.createTheme({ mode, accent });
    for (const fg of ['ink', 'muted']) for (const bg of ['page', 'surface', 'surface2', 'primarySoft', 'input', 'inputFocused']) assert(contrast(c[fg], c[bg]) >= 4.5, `${mode}/${accent}: ${fg}/${bg}`);
    for (const [fg, bg] of [['onPrimary', 'primary'], ['primary', 'primarySoft'], ['error', 'errorSoft'], ['success', 'successSoft'], ['warning', 'warningSoft']]) assert(contrast(c[fg], c[bg]) >= 4.5, `${mode}/${accent}: ${fg}/${bg}`);
    for (const [name, palette] of Object.entries(palettes)) assert(contrast(palette.ink, palette.soft) >= 4.5, `${mode}/${name}`);
  }
});
test('creating a dark accent never mutates the static fallback or another theme', () => {
  const light = theme.createTheme({ mode: 'light', accent: 'sage' });
  const dark = theme.createTheme({ mode: 'dark', accent: 'rose' });
  assert.notEqual(light.colors.primary, dark.colors.primary);
  assert.equal(theme.colors.primary, '#235B47');
  assert.equal(light.colors.surface, '#FFFFFF');
  assert(Object.isFrozen(dark.colors));
});
test('guest and multiple account appearances survive reopen without leaking', async () => {
  const disk = storage(), store = createAppearanceStore(disk);
  await store.save(null, { mode: 'dark', accent: 'rose' });
  await store.save('account-a', { mode: 'light', accent: 'ocean' });
  await store.save('account-b', { accent: 'lavender' });
  const reopened = createAppearanceStore(disk);
  assert.deepEqual(await reopened.read(null), { mode: 'dark', accent: 'rose' });
  assert.deepEqual(await reopened.read('account-a'), { mode: 'light', accent: 'ocean' });
  assert.deepEqual(await reopened.read('account-b'), { mode: 'system', accent: 'lavender' });
  assert.deepEqual(await reopened.read('new-account'), theme.DEFAULT_APPEARANCE);
});
test('rapid changes across store instances merge against the latest durable selection', async () => {
  const disk = storage(), first = createAppearanceStore(disk), second = createAppearanceStore(disk);
  await Promise.all([first.save('a', { mode: 'dark' }), second.save('a', { accent: 'ocean' }), first.save('a', { accent: 'rose' })]);
  assert.deepEqual(await second.read('a'), { mode: 'dark', accent: 'rose' });
});
test('account keys reject invalid identities and encode delimiters safely', async () => {
  assert.notEqual(keyFor(null), keyFor('guest'));
  assert.notEqual(keyFor('a:b'), keyFor('a%3Ab'));
  for (const value of ['', ' ', {}, 7, 'a'.repeat(201)]) assert.throws(() => keyFor(value), /INVALID_ACCOUNT_SCOPE/);
});
test('unknown versions and corrupt JSON are preserved until explicit appearance reset', async () => {
  const disk = storage(), store = createAppearanceStore(disk);
  for (const value of ['broken', '{"version":2,"settings":{}}', '{"version":1,"settings":[]}']) {
    disk.data.set(keyFor('a'), value);
    await assert.rejects(store.read('a'), /INVALID_APPEARANCE/);
    await assert.rejects(store.save('a', { mode: 'dark' }), /INVALID_APPEARANCE/);
    assert.equal(disk.data.get(keyFor('a')), value);
  }
  disk.data.set('calendar:data', 'untouched');
  await store.save('b', { accent: 'ocean' });
  await store.reset('a');
  assert.deepEqual(await store.read('a'), theme.DEFAULT_APPEARANCE);
  assert.equal((await store.read('b')).accent, 'ocean');
  assert.equal(disk.data.get('calendar:data'), 'untouched');
});
test('storage contains only appearance choices, never arbitrary supplied data', async () => {
  const disk = storage(), store = createAppearanceStore(disk);
  await store.save('a', { accent: 'rose', email: 'private', token: 'private' });
  const value = JSON.parse(disk.data.get(keyFor('a')));
  assert.deepEqual(value, { version: 1, settings: { mode: 'system', accent: 'rose' } });
  assert.deepEqual(decode(null), theme.DEFAULT_APPEARANCE);
});
test('a failed write retains the durable choice and does not poison future operations', async () => {
  const disk = storage(), store = createAppearanceStore(disk);
  await store.save('a', { mode: 'light' });
  const set = disk.setItem;
  disk.setItem = async () => { throw new Error('disk full'); };
  await assert.rejects(store.save('a', { mode: 'dark' }), /disk full/);
  assert.equal((await store.read('a')).mode, 'light');
  disk.setItem = set;
  await store.save('a', { mode: 'dark' });
  assert.equal((await store.read('a')).mode, 'dark');
});
test('a failed read cannot overwrite an existing profile and queue recovers', async () => {
  const disk = storage(), store = createAppearanceStore(disk);
  await store.save('a', { accent: 'lavender' });
  const get = disk.getItem;
  disk.getItem = async () => { throw new Error('unavailable'); };
  await assert.rejects(store.save('a', { mode: 'dark' }), /unavailable/);
  disk.getItem = get;
  assert.deepEqual(await store.read('a'), { mode: 'system', accent: 'lavender' });
});
test('appearance controls and failure recovery have complete English and Chinese copy', () => {
  const source = read('ui/AppearanceSettings.js');
  const copy = vm.runInNewContext(`(${source.match(/export const appearanceCopy = (\{[^]*?\n\});/)[1]})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  for (const language of ['en', 'zh']) for (const key of [...theme.MODES, ...theme.ACCENTS, 'loadFailed', 'saveFailed', 'reset', 'retry']) assert(copy[language][key]);
  assert.match(source, /accessibilityRole="radio"/);
  assert.match(source, /accessibilityState=\{\{ checked:/);
  assert.match(source, /loading \|\| saving \|\| !available/);
  assert.doesNotMatch(source, /Animated|LayoutAnimation|setInterval/);
});
