const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const mobile = path.resolve(__dirname, '../mobile');
function dependency(name) {
  const folder = fs.readdirSync(path.join(mobile, 'node_modules/.pnpm')).find(value => value.startsWith(name.replace('/', '+') + '@'));
  return require(path.join(mobile, 'node_modules/.pnpm', folder, 'node_modules', name));
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
    return [cell.value, value => { cell.value = typeof value === 'function' ? value(cell.value) : value; owner.writes++; }];
  },
  useRef(initial) { return host.cells[host.cursor++] ||= { current: initial }; },
  useEffect(callback, dependencies) {
    const owner = host, index = owner.cursor++, previous = owner.cells[index];
    if (!previous || dependencies.some((value, key) => !Object.is(value, previous.dependencies[key]))) {
      owner.effects.push(() => { previous?.cleanup?.(); owner.cells[index] = { dependencies, cleanup: callback() }; });
    }
  },
};
const filename = path.join(mobile, 'src/family/FamilyProfiles.js'), previousLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename !== filename) return previousLoad.apply(this, arguments);
  if (request === 'react') return hooks;
  if (request === 'react-native') return { ScrollView: 'ScrollView', Text: 'Text', View: 'View' };
  if (request === '../calendar/ui') return { Button: 'Button', ChoiceRow: 'ChoiceRow', Field: 'Field', useCalendarUi: () => ({ ...theme, u: {} }) };
  return previousLoad.apply(this, arguments);
};
let FamilyProfiles;
try {
  const compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: [[jsx, { runtime: 'automatic' }], commonjs],
  }).code, filename);
  FamilyProfiles = compiled.exports.default;
} finally { Module._load = previousLoad; }

function find(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const found = find(child, predicate); if (found) return found;
  }
  return null;
}
const profile = (extra = {}) => ({ id: 'child-1', name: 'Casey', palette: 'blue', avatar: '🧒', grade: '', school: '', ...extra });
function mount(initial = {}) {
  const dirty = [], state = { cursor: 0, cells: [], effects: [], writes: 0 };
  let props = { original: [profile()], language: 'en', busy: false, onDirtyChange: value => dirty.push(value), onSave: async () => {}, ...initial };
  function render() {
    host = state; state.cursor = 0; state.effects = [];
    const tree = FamilyProfiles(props);
    for (const effect of state.effects) effect();
    return tree;
  }
  render();
  return {
    dirty, state, render,
    props(patch) { props = { ...props, ...patch }; render(); },
    button(label) { return find(render(), node => node.type === 'Button' && node.props.children === label); },
    field(label) { return find(render(), node => node.type === 'Field' && node.props.label === label); },
    choice(label) { return find(render(), node => node.type === 'ChoiceRow' && node.props.label === label); },
    open(name = 'Casey') { find(render(), node => node.type === 'Button' && typeof node.props.children === 'string' && node.props.children.endsWith(` ${name}`)).props.onPress(); render(); },
    message(text) { return find(render(), node => node.type === 'Text' && node.props.children === text); },
    unmount() { for (const cell of state.cells) cell?.cleanup?.(); },
  };
}

test('normalized legacy forms begin clean and pass the unchanged raw backend baseline', async () => {
  const original = [{ name: 'Casey', future: { preserve: true } }]; let received;
  const app = mount({ original, onSave: async request => { received = request; } });
  assert.deepEqual(app.dirty, [false]);
  app.open(); assert.equal(app.field('Name').props.value, 'Casey');
  app.field('Name').props.onChangeText('Riley'); app.render();
  assert.equal(app.dirty.at(-1), true);
  app.button('Done').props.onPress(); await app.button('Save profiles').props.onPress(); app.render();
  assert.equal(received.original, original);
  assert.equal(received.original[0].id, undefined);
  assert.ok(received.profiles[0].id);
  assert.equal(received.profiles[0].palette, 'blue');
  assert.deepEqual(received.profiles[0].future, { preserve: true });
  assert.equal(app.dirty.at(-1), false);
});

test('name, color, avatar, grade and school edits each dirty the form and can be reverted', () => {
  for (const [type, label, changed, original] of [
    ['field', 'Name', 'Riley', 'Casey'], ['choice', 'Color', 'coral', 'blue'],
    ['choice', 'Avatar', '🐼', '🧒'], ['field', 'Grade', '4', ''], ['field', 'School', 'Oak', ''],
  ]) {
    const app = mount(); app.open(); assert.deepEqual(app.dirty, [false]);
    const change = value => { const input = app[type](label); (input.props.onChangeText || input.props.onChange)(value); app.render(); };
    change(changed); assert.equal(app.dirty.at(-1), true, label);
    change(original); assert.equal(app.dirty.at(-1), false, label);
  }
});

test('adding/removing tracks profile changes without treating navigation as an edit', () => {
  const app = mount({ original: [] });
  app.button('Add a child').props.onPress(); app.render();
  assert.equal(app.dirty.at(-1), true);
  app.field('Name').props.onChangeText('Casey'); app.button('Done').props.onPress();
  app.open(); assert.equal(app.dirty.at(-1), true);
  app.button('Remove profile').props.onPress(); app.render();
  assert.equal(app.dirty.at(-1), false);
  const existing = mount(); existing.open(); existing.button('Done').props.onPress(); existing.render();
  assert.deepEqual(existing.dirty, [false]);
  existing.open(); existing.button('Remove profile').props.onPress(); existing.render();
  assert.equal(existing.dirty.at(-1), true);
});

test('successful saves clear dirty state and establish the next exact baseline', async () => {
  const requests = [];
  const app = mount({ onSave: async request => { requests.push(request); } });
  app.open(); app.field('Name').props.onChangeText(' Riley '); app.button('Done').props.onPress();
  await app.button('Save profiles').props.onPress(); app.render();
  assert.equal(requests[0].profiles[0].name, 'Riley'); assert.equal(app.dirty.at(-1), false);
  app.open('Riley'); app.field('School').props.onChangeText(' Oak '); app.button('Done').props.onPress();
  await app.button('Save profiles').props.onPress(); app.render();
  assert.deepEqual(requests[1].original, requests[0].profiles);
  assert.equal(requests[1].profiles[0].school, 'Oak'); assert.equal(app.dirty.at(-1), false);
});

test('failed and conflicting saves retain the draft and raw baseline for retry', async () => {
  for (const code of ['CONFLICT', 'NETWORK']) {
    const requests = []; let calls = 0;
    const app = mount({ onSave: async request => {
      requests.push(request); if (++calls === 1) throw Object.assign(new Error('failed'), { code });
    } });
    app.open(); app.field('Name').props.onChangeText('Riley'); app.button('Done').props.onPress();
    await app.button('Save profiles').props.onPress(); app.render();
    assert.equal(app.dirty.at(-1), true);
    assert.ok(app.message(code === 'CONFLICT' ? 'Profiles changed on another device. Close and reopen to see the latest changes.' : 'Could not save. Check your connection and try again.'));
    app.open('Riley'); assert.equal(app.field('Name').props.value, 'Riley'); app.button('Done').props.onPress();
    await app.button('Save profiles').props.onPress(); app.render();
    assert.equal(requests[1].original, requests[0].original);
    assert.equal(app.dirty.at(-1), false);
  }
});

test('pending saves reject duplicate taps and disable list controls before parent busy changes', async () => {
  let finish, calls = 0;
  const app = mount({ onSave: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const oldAdd = app.button('Add a child').props.onPress;
  app.open(); const oldFieldChange = app.field('Name').props.onChangeText;
  app.field('Name').props.onChangeText('Riley'); app.button('Done').props.onPress();
  const save = app.button('Save profiles').props.onPress, pending = save(); await save();
  assert.equal(calls, 1);
  assert.equal(app.button('Saving…').props.disabled, true);
  assert.equal(app.button('Add a child').props.disabled, true);
  assert.equal(app.button('🧒 Riley').props.disabled, true);
  oldAdd(); oldFieldChange('Unexpected'); app.button('🧒 Riley').props.onPress();
  assert.equal(app.field('Name'), null);
  finish(); await pending; app.render();
  assert.equal(app.dirty.at(-1), false);
  app.open('Riley'); assert.equal(app.field('Name').props.value, 'Riley');
});

test('external busy state disables and guards every profile editor control', () => {
  const app = mount(); app.open(); app.props({ busy: true });
  for (const label of ['Name', 'Grade', 'School']) {
    assert.equal(app.field(label).props.editable, false); app.field(label).props.onChangeText('Blocked');
  }
  for (const [label, value] of [['Color', 'gold'], ['Avatar', '🐼']]) {
    assert.equal(app.choice(label).props.disabled, true); app.choice(label).props.onChange(value);
  }
  assert.equal(app.button('Done').props.disabled, true); assert.equal(app.button('Remove profile').props.disabled, true);
  app.button('Done').props.onPress(); app.button('Remove profile').props.onPress(); app.render();
  assert.equal(app.field('Name').props.value, 'Casey'); assert.deepEqual(app.dirty, [false]);
  app.props({ busy: false }); assert.equal(app.field('Name').props.editable, true);
});

test('invalid names never dispatch a save and remain dirty for correction', async () => {
  let calls = 0;
  const app = mount({ onSave: async () => { calls++; } });
  app.open(); app.field('Name').props.onChangeText('all'); app.button('Done').props.onPress();
  await app.button('Save profiles').props.onPress(); app.render();
  assert.equal(calls, 0); assert.equal(app.dirty.at(-1), true);
  assert.ok(app.message('Enter a unique name for each child.'));
});

test('unmount clears exit protection and suppresses late failure state writes', async () => {
  let fail;
  const app = mount({ onSave: () => new Promise((_resolve, reject) => { fail = reject; }) });
  app.open(); app.field('Name').props.onChangeText('Riley'); app.button('Done').props.onPress();
  const pending = app.button('Save profiles').props.onPress(); app.render(); app.unmount();
  const writes = app.state.writes;
  fail(new Error('late')); await pending;
  assert.equal(app.state.writes, writes); assert.equal(app.dirty.at(-1), false);
});

test('Chinese editing uses the same dirty lifecycle and reports failed saves', async () => {
  const app = mount({ language: 'zh', onSave: async () => false });
  app.open(); app.field('学校').props.onChangeText('小学'); app.button('完成').props.onPress();
  await app.button('保存资料').props.onPress(); app.render();
  assert.equal(app.dirty.at(-1), true);
  assert.ok(app.message('保存失败，请检查网络后重试。'));
});

test('calendar scope failures keep the draft and explain reopening in both languages', async () => {
  for (const [language, name, done, save, message] of [
    ['en', 'Name', 'Done', 'Save profiles', 'This calendar is no longer selected. Reopen its profiles to continue.'],
    ['zh', '姓名', '完成', '保存资料', '此日历已不再选中。请重新打开其资料后继续。'],
  ]) {
    const app = mount({ language, onSave: async () => { const error = new Error('stale'); error.code = 'STALE_SCOPE'; throw error; } });
    app.open(); app.field(name).props.onChangeText('Riley'); app.button(done).props.onPress();
    await app.button(save).props.onPress(); app.render();
    assert.ok(app.message(message)); assert.equal(app.dirty.at(-1), true);
    app.open('Riley'); assert.equal(app.field(name).props.value, 'Riley');
  }
});
