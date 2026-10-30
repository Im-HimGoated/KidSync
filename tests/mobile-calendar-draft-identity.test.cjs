const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// Exercise the real editor's change/submit handlers with a small hook host. This
// checks retry identity without native I/O or a network/account fixture.
const root = path.resolve(__dirname, '..'), mobile = path.join(root, 'mobile');
const modulesRoot = path.join(mobile, 'node_modules/.pnpm');
function dependency(name) {
  const prefix = name.replace('/', '+') + '@';
  const folder = fs.readdirSync(modulesRoot).find(value => value.startsWith(prefix));
  if (!folder) throw Error(`Missing installed test dependency: ${name}`);
  return require(path.join(modulesRoot, folder, 'node_modules', name));
}
const babel = dependency('@babel/core'), jsx = dependency('@babel/plugin-transform-react-jsx');
const commonjs = dependency('@babel/plugin-transform-modules-commonjs');
const React = require(path.join(mobile, 'node_modules/react'));
const theme = require('../mobile/src/ui/theme');
let host;
function useState(initial) {
  const index = host.cursor++, owner = host;
  if (!owner.cells[index]) owner.cells[index] = { value: typeof initial === 'function' ? initial() : initial };
  const cell = owner.cells[index];
  return [cell.value, value => { cell.value = typeof value === 'function' ? value(cell.value) : value; }];
}
function useRef(initial) {
  const index = host.cursor++;
  if (!host.cells[index]) host.cells[index] = { current: initial };
  return host.cells[index];
}
const hooks = { ...React, useState, useRef, useEffect() { host.cursor++; }, useMemo(factory) { host.cursor++; return factory(); } };
const load = Module._load;
Module._load = function (request, parent) {
  if (request === 'react') return hooks;
  if (request === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', StyleSheet: { create: value => value } };
  if (request === 'lucide-react-native') return new Proxy({}, { get: (_object, key) => key === '__esModule' ? false : String(key) });
  if (request === './ui' && parent?.filename.endsWith('/calendar/ActivityEditor.js')) return { Button: 'Button', Field: 'Field' };
  if (request === '../ui/AppearanceContext') return { useAppearance: () => theme.createTheme({ mode: 'light' }) };
  return load.apply(this, arguments);
};
const filename = path.join(mobile, 'src/calendar/ActivityEditor.js');
const editorModule = new Module(filename, module); editorModule.filename = filename; editorModule.paths = Module._nodeModulePaths(path.dirname(filename));
const source = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
  plugins: [[jsx, { runtime: 'automatic' }], commonjs] }).code;
editorModule._compile(source, filename);
const ActivityEditor = editorModule.exports.ActivityEditor;
function find(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
  return null;
}
function mount(props) {
  const state = { cursor: 0, cells: [] };
  const body = ActivityEditor({ date: '2026-10-30', ...props });
  function render() { host = state; state.cursor = 0; return body.type(body.props); }
  return { render, changeTitle(value) { find(render(), element => element.type === 'Field' && element.props.label === 'Activity title').props.onChangeText(value); },
    save() { return find(render(), element => element.type === 'Button' && element.props.children === 'Save activity').props.onPress(); } };
}

test('new editor retains its first valid ID across a lost response and subsequent draft edits', async () => {
  const submitted = [];
  const editor = mount({ onSave: async event => { submitted.push(event); throw new TypeError('Lost response'); } });
  editor.changeTitle('School pickup'); await editor.save(); await editor.save();
  editor.changeTitle('School pickup at north gate'); await editor.save();
  assert.equal(submitted.length, 3);
  assert.ok(submitted[0].id);
  assert.equal(submitted[1].id, submitted[0].id); assert.equal(submitted[2].id, submitted[0].id);
  assert.equal(submitted[2].title, 'School pickup at north gate');
});

test('a new mounted draft gets its own identity while existing event IDs stay unchanged', async () => {
  const submitted = [], onSave = async event => { submitted.push(event); return false; };
  const first = mount({ onSave }); first.changeTitle('First'); await first.save();
  const second = mount({ onSave }); second.changeTitle('Second'); await second.save();
  assert.notEqual(submitted[0].id, submitted[1].id);
  const existing = { id: 17, title: 'Existing', startDate: '2026-10-30', start: '08:00', end: '09:00', recurrence: 'none' };
  const edit = mount({ event: existing, onSave }); edit.changeTitle('Updated'); await edit.save(); await edit.save();
  assert.equal(submitted[2].id, 17); assert.equal(submitted[3].id, 17); assert.equal(existing.title, 'Existing');
});

test('validation failures do not submit or reserve an invalid event before the valid retry', async () => {
  const submitted = [], editor = mount({ onSave: async event => { submitted.push(event); return false; } });
  await editor.save(); assert.equal(submitted.length, 0);
  editor.changeTitle('Valid plan'); await editor.save(); await editor.save();
  assert.equal(submitted.length, 2); assert.equal(submitted[0].id, submitted[1].id);
});

test.after(() => { Module._load = load; });
