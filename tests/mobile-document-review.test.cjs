const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const mobile = path.resolve(__dirname, '../mobile');
function dependency(name) {
  const directory = fs.readdirSync(path.join(mobile, 'node_modules/.pnpm'))
    .find(entry => entry.startsWith(name.replace('/', '+') + '@'));
  return require(path.join(mobile, 'node_modules/.pnpm', directory, 'node_modules', name));
}
const babel = dependency('@babel/core'), jsx = dependency('@babel/plugin-transform-react-jsx');
const commonjs = dependency('@babel/plugin-transform-modules-commonjs');
const React = require(path.join(mobile, 'node_modules/react'));
const theme = require('../mobile/src/ui/theme').createTheme({ mode: 'dark' });
let host;
const hooks = {
  ...React,
  useState(initial) {
    const owner = host, index = owner.cursor++;
    const cell = owner.cells[index] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [cell.value, value => { cell.value = typeof value === 'function' ? value(cell.value) : value; }];
  },
  useRef(initial) { return host.cells[host.cursor++] ||= { current: initial }; },
  useEffect() { host.cursor++; },
};
const filename = path.join(mobile, 'src/calendar/DocumentImport.js');
const previousLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename !== filename) return previousLoad.apply(this, arguments);
  if (request === 'react') return hooks;
  if (request === 'react-native') return { ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value } };
  if (request === 'lucide-react-native') return { FileText: 'FileText' };
  if (request === './ui') return { Field: 'Field', Button: 'Button', Sheet: 'Sheet', useCalendarUi: () => ({ ...theme, u: {} }) };
  if (request === '../ui/AppearanceContext') return { useThemeStyles: factory => factory(theme.colors) };
  return previousLoad.apply(this, arguments);
};
let DocumentImport;
try {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: [[jsx, { runtime: 'automatic' }], commonjs],
  }).code, filename);
  DocumentImport = compiled.exports.default;
} finally { Module._load = previousLoad; }

function find(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
function mount(props) {
  const state = { cursor: 0, cells: [] };
  const render = () => { host = state; host.cursor = 0; return DocumentImport(props); };
  return {
    render,
    button(label) { return find(render(), node => node.type === 'Button' && node.props.children === label); },
    type(text) { find(render(), node => node.type === 'Field').props.onChangeText(text); },
  };
}

test('document text reaches event review only after both explicit actions, with retry after failure', async () => {
  let calls = 0, received;
  const app = mount({ onReview: async draft => { received = draft; return ++calls > 1; } });
  assert.equal(app.button('Find event details').props.disabled, true);
  app.type('Title: Soccer\nDate: 2026-11-28\nTime: 4-5 PM\nBring: Water');
  app.button('Find event details').props.onPress();
  assert.equal(calls, 0);
  const tree = app.render();
  assert.ok(find(tree, node => node.type === 'Text' && node.props.children === 'Soccer'));
  await app.button('Review in event editor').props.onPress();
  assert.equal(calls, 1);
  assert.equal(received.items, 'Water');
  assert.equal(received.id, undefined);
  assert.ok(find(app.render(), node => node.props?.accessibilityRole === 'alert'));
  await app.button('Review in event editor').props.onPress();
  assert.equal(calls, 2);
  assert.equal(find(app.render(), node => node.props?.accessibilityRole === 'alert'), null);
});

test('literal prototype-like titles stay text, editing preserves the source, and a double handoff runs once', async () => {
  let finish, calls = 0;
  const app = mount({ onReview: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const source = 'Title: __proto__\nDate: 2026-11-28\nAll day';
  app.type(source);
  app.button('Find event details').props.onPress();
  assert.ok(find(app.render(), node => node.type === 'Text' && node.props.children === '__proto__'));
  app.button('Edit source text').props.onPress();
  assert.equal(find(app.render(), node => node.type === 'Field').props.value, source);
  app.button('Find event details').props.onPress();
  const review = app.button('Review in event editor').props.onPress;
  const pending = review();
  await review();
  assert.equal(calls, 1);
  finish(true);
  await pending;
});

test('Chinese source and warnings remain available before review', () => {
  const app = mount({ language: 'zh' });
  app.type('活动：编程课\n负责人：王老师\n携带物品：电脑');
  app.button('提取活动详情').props.onPress();
  const tree = app.render();
  assert.ok(find(tree, node => node.type === 'Text' && node.props.children === '王老师'));
  assert.ok(find(tree, node => node.type === 'Text' && node.props.children === '请在编辑器中选择日期。'));
  assert.equal(app.button('在活动编辑器中核对').props.disabled, true);
});
