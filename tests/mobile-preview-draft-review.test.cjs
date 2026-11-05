const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// Load the real review component. Native containers and the shared modal/button
// are inert render hosts; no account, storage, notification or backend is used.
const mobile = path.resolve(__dirname, '../mobile');
function dependency(name) {
  const folder = fs.readdirSync(path.join(mobile, 'node_modules/.pnpm'))
    .find(value => value.startsWith(name.replace('/', '+') + '@'));
  if (!folder) throw Error(`Missing installed test dependency: ${name}`);
  return require(path.join(mobile, 'node_modules/.pnpm', folder, 'node_modules', name));
}
const babel = dependency('@babel/core'), jsx = dependency('@babel/plugin-transform-react-jsx');
const commonjs = dependency('@babel/plugin-transform-modules-commonjs');
const React = require(path.join(mobile, 'node_modules/react'));
const ReactDOMServer = require(path.join(mobile, 'node_modules/react-dom/server'));
const theme = require('../mobile/src/ui/theme');
const appearance = theme.createTheme({ mode: 'light', accent: 'sage' });
let rendered;
function nativeHost(name, tag = 'div') {
  return function NativeHost(props) {
    rendered.native.push({ name, props });
    return React.createElement(tag, { 'data-native': name }, props.children);
  };
}
const native = {
  View: nativeHost('View'), Text: nativeHost('Text', 'span'), ScrollView: nativeHost('ScrollView', 'section'),
  Pressable: nativeHost('Pressable', 'button'), TextInput: nativeHost('TextInput', 'input'), Switch: nativeHost('Switch', 'input'),
  StyleSheet: { create: value => value },
};
function Sheet(props) {
  rendered.sheets.push(props);
  return React.createElement('section', { 'data-sheet': props.title }, props.children);
}
function Button(props) {
  rendered.buttons.push(props);
  return React.createElement('button', { type: 'button' }, props.children);
}
const filename = path.join(mobile, 'src/ui/PreviewDraftReview.js');
const target = new Module(filename, module);
target.filename = filename;
target.paths = Module._nodeModulePaths(path.dirname(filename));
const load = Module._load;
try {
  Module._load = function (request, parent) {
    if (parent?.filename === filename) {
      if (request === 'react-native') return native;
      if (request === '../calendar/ui') return { Sheet, Button };
      if (request === './AppearanceContext') return {
        useAppearance: () => appearance,
        useThemeStyles: factory => factory(appearance.colors, appearance.palettes, appearance.isDark),
      };
      if (request === 'lucide-react-native') return new Proxy({}, { get: (_value, key) => key === '__esModule' ? false : nativeHost(String(key), 'i') });
      if (/backend|supabase|storage|notifications|schedule-sync/i.test(request)) {
        throw Error(`Read-only draft review must not import an I/O service: ${request}`);
      }
    }
    return load.apply(this, arguments);
  };
  const compiled = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: [[jsx, { runtime: 'automatic' }], commonjs],
  }).code;
  target._compile(compiled, filename);
} finally { Module._load = load; }
const PreviewDraftReview = target.exports.default;
const { previewDraftCopy, previewDraftRows } = target.exports;
const keys = ['title', 'startDate', 'start', 'end', 'allDay', 'child', 'location', 'responsible', 'items', 'importance', 'reminderMinutes'];
const textKeys = ['title', 'startDate', 'start', 'end', 'child', 'location', 'responsible', 'items'];
const valueFor = (draft, key, language = 'en') => previewDraftRows(draft, language).find(row => row.key === key).value;
function render(props = {}) {
  rendered = { native: [], sheets: [], buttons: [] };
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(PreviewDraftReview, props));
  return { ...rendered, html };
}

test('draft review has complete matching English and Chinese copy and eleven labeled rows', () => {
  function checkCopy(en, zh) {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
    for (const key of Object.keys(en)) {
      if (typeof en[key] === 'object' && en[key] !== null) checkCopy(en[key], zh[key]);
      else {
        assert.equal(typeof en[key], 'string'); assert.ok(en[key].trim(), key);
        assert.equal(typeof zh[key], 'string'); assert.ok(zh[key].trim(), key);
      }
    }
  }
  checkCopy(previewDraftCopy.en, previewDraftCopy.zh);
  for (const language of ['en', 'zh']) {
    const rows = previewDraftRows({}, language);
    assert.deepEqual(rows.map(row => row.key), keys);
    assert.equal(new Set(rows.map(row => row.label)).size, keys.length);
    for (const row of rows) { assert.equal(typeof row.label, 'string'); assert.ok(row.label.trim()); assert.equal(typeof row.value, 'string'); }
  }
});

test('review preserves unfinished text exactly and never changes or completes the draft', () => {
  const draft = { title: '  School & sports\nUnfinished <details>  ', startDate: '2026-11-', start: '06:', end: '',
    child: '  Robin\nLee  ', location: 'North gate\nSecond floor', responsible: '  Dad  ', items: 'Water\nBooks',
    allDay: false, importance: 'high', reminderMinutes: 10, unknown: { keep: ['metadata'] } };
  const before = structuredClone(draft);
  for (const language of ['en', 'zh']) {
    for (const key of textKeys.filter(key => key !== 'end')) assert.equal(valueFor(draft, key, language), draft[key]);
    const first = previewDraftRows(draft, language); first[0].value = 'Changed review output';
    assert.equal(valueFor(draft, 'title', language), before.title);
    render({ draft, language, onClose() {} });
  }
  assert.deepEqual(draft, before);
});

test('missing and malformed drafts and non-text values use safe placeholders', () => {
  for (const draft of [undefined, null, [], [{ title: 'Must not appear' }], 'bad', 17, true]) {
    for (const language of ['en', 'zh']) {
      const rows = previewDraftRows(draft, language);
      assert.deepEqual(rows.map(row => row.value), keys.map(() => previewDraftCopy[language].notSet));
      assert.doesNotThrow(() => render({ draft, language, onClose() {} }));
    }
  }
  for (const bad of [undefined, null, {}, [], true, false, 0, 17, NaN, Infinity]) {
    for (const key of textKeys) assert.equal(valueFor({ [key]: bad }, key), 'Not set', `${key}: ${String(bad)}`);
  }
  for (const blank of ['', ' ', '\n\t']) for (const key of textKeys) assert.equal(valueFor({ [key]: blank }, key), 'Not set');
  for (const language of ['en', 'zh']) {
    const draft = Object.fromEntries(keys.map(key => [key, { malformed: 'legacy JSON' }]));
    const before = structuredClone(draft), { html } = render({ draft, language, onClose() {} });
    assert.ok(!html.includes('[object Object]')); assert.ok(!html.includes('NaN')); assert.ok(!html.includes('Infinity'));
    assert.deepEqual(draft, before);
  }
});

test('boolean, family, importance and reminder values are explicit and localized', () => {
  assert.equal(valueFor({ child: '__family__' }, 'child'), 'Everyone');
  assert.equal(valueFor({ reminderMinutes: null }, 'reminderMinutes'), 'No reminder');
  for (const [key, values, copyKeys] of [
    ['allDay', [true, false], ['yes', 'no']],
    ['importance', ['low', 'normal', 'high'], ['low', 'normal', 'high']],
    ['reminderMinutes', [null, 0, 10, 30], ['none', 'atStart', 'tenBefore', 'thirtyBefore']],
  ]) {
    const english = values.map(value => valueFor({ [key]: value }, key));
    const chinese = values.map(value => valueFor({ [key]: value }, key, 'zh'));
    assert.deepEqual(english, copyKeys.map(copyKey => previewDraftCopy.en[copyKey]), key);
    assert.deepEqual(chinese, copyKeys.map(copyKey => previewDraftCopy.zh[copyKey]), key);
    assert.equal(new Set(english).size, values.length, key); assert.equal(new Set(chinese).size, values.length, key);
    for (let index = 0; index < values.length; index++) {
      assert.notEqual(english[index], 'Not set'); assert.notEqual(chinese[index], english[index]); assert.match(chinese[index], /[\u3400-\u9fff]/);
    }
  }
  for (const bad of [undefined, null, 'true', 'false', 0, 1, {}, []]) assert.equal(valueFor({ allDay: bad }, 'allDay'), 'Not set');
  for (const bad of [undefined, null, 'urgent', 'errors', {}, [], 1]) assert.equal(valueFor({ importance: bad }, 'importance'), 'Not set');
  for (const bad of [undefined, '10', -10, 5, 60, NaN, Infinity, {}, []]) assert.equal(valueFor({ reminderMinutes: bad }, 'reminderMinutes'), 'Not set');
  assert.match(valueFor({ child: '__family__' }, 'child', 'zh'), /[\u3400-\u9fff]/);
});

test('real review render exposes only Close and leaves long unfinished values untruncated', () => {
  const longTitle = 'Unfinished <script>family plan</script>\n' + 'Details still to finish. '.repeat(40);
  const draft = { title: longTitle, items: 'Books\nWater', allDay: false, reminderMinutes: null };
  let closed = 0;
  const onClose = () => { closed++; };
  for (const language of ['en', 'zh']) {
    const result = render({ draft, language, onClose });
    assert.equal(result.sheets.length, 1); assert.equal(result.sheets[0].onClose, onClose);
    assert.equal(result.sheets[0].closeLabel, previewDraftCopy[language].close);
    assert.equal(result.buttons.length, 1); assert.equal(result.buttons[0].onPress, onClose);
    assert.equal(result.buttons[0].children, previewDraftCopy[language].close);
    assert.ok(result.native.some(item => item.name === 'ScrollView'));
    assert.ok(!result.native.some(item => ['TextInput', 'Switch', 'Pressable'].includes(item.name)));
    assert.ok(!result.html.includes('<input')); assert.ok(!result.html.includes('<textarea')); assert.ok(!result.html.includes('<script>'));
    const title = result.native.find(item => item.name === 'Text' && item.props.children === longTitle);
    assert.ok(title, 'The entire raw title is rendered as text');
    assert.equal(title.props.selectable, true);
    assert.equal(title.props.numberOfLines, undefined); assert.equal(title.props.ellipsizeMode, undefined);
    const rows = previewDraftRows(draft, language);
    for (const row of rows) assert.ok(result.native.some(item => item.name === 'Text' && item.props.children === row.label), row.key);
    assert.equal(closed, language === 'en' ? 0 : 1, 'Rendering never closes or submits');
    result.buttons[0].onPress();
  }
  assert.equal(closed, 2);
});

test('review copy explains that the unfinished draft is outside the account and how to finish it', () => {
  const english = render({ draft: {}, onClose() {} }).html;
  assert.match(english, /unfinished/i); assert.match(english, /not[^<]*added[^<]*account/i);
  assert.match(english, /Calendar/); assert.match(english, /Add activity/);
  const chinese = render({ draft: {}, language: 'zh', onClose() {} }).html;
  assert.match(chinese, /[\u3400-\u9fff]/);
});

test('a retained editing draft directs people to Edit existing activities and Add only new plans', () => {
  const draft = Object.freeze({ id: 'already-imported-preview-event', title: 'Unfinished change to an existing plan',
    startDate: '2026-11-07', start: '09:00', end: '10:00', child: '__family__',
    future: Object.freeze({ imported: true }) });
  const before = structuredClone(draft);
  for (const language of ['en', 'zh']) {
    let closed = 0;
    const onClose = () => { closed++; }, result = render({ draft, language, onClose });
    const guidance = result.native.find(item => item.name === 'Text' && item.props.children === previewDraftCopy[language].guidance);
    assert.ok(guidance, 'The actual review renders the recovery guidance');
    if (language === 'en') {
      assert.match(guidance.props.children, /editing an existing activity[^]*Edit activity/);
      assert.match(guidance.props.children, /new plan[^]*Add activity/);
    } else {
      assert.match(guidance.props.children, /已有活动[^]*编辑活动/);
      assert.match(guidance.props.children, /新计划[^]*添加活动/);
    }
    assert.equal(closed, 0); assert.equal(result.buttons.length, 1);
    assert.equal(result.buttons[0].children, previewDraftCopy[language].close);
    assert.equal(result.buttons[0].onPress, onClose); assert.equal(result.sheets[0].onClose, onClose);
    assert.ok(!result.native.some(item => ['TextInput', 'Switch', 'Pressable'].includes(item.name)));
    result.buttons[0].onPress(); result.sheets[0].onClose(); assert.equal(closed, 2);
    assert.deepEqual(draft, before); assert.equal(draft.id, 'already-imported-preview-event');
  }
});
