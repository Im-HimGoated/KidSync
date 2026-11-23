const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const mobile = path.resolve(__dirname, '../mobile');
function dependency(name) {
  const directory = fs.readdirSync(path.join(mobile, 'node_modules/.pnpm')).find(value => value.startsWith(name.replace('/', '+') + '@'));
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
  useEffect(callback, dependencies) {
    const owner = host, index = owner.cursor++, previous = owner.cells[index];
    if (!previous || dependencies.some((value, key) => !Object.is(value, previous.dependencies[key]))) {
      owner.effects.push(() => {
        previous?.cleanup?.();
        owner.cells[index] = { dependencies, cleanup: callback() };
      });
    }
  },
};
const filename = path.join(mobile, 'src/ui/CalendarDisplaySettings.js');
const previousLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename !== filename) return previousLoad.apply(this, arguments);
  if (request === 'react') return hooks;
  if (request === 'react-native') return { Switch: 'Switch', Text: 'Text', View: 'View', StyleSheet: { create: value => value } };
  if (request === '../calendar/ui') return { ChoiceRow: 'ChoiceRow', Button: 'Button' };
  if (request === './AppearanceContext') return { useAppearance: () => theme, useThemeStyles: factory => factory(theme.colors) };
  return previousLoad.apply(this, arguments);
};
let CalendarDisplaySettings, copy;
try {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: [[jsx, { runtime: 'automatic' }], commonjs],
  }).code, filename);
  CalendarDisplaySettings = compiled.exports.default; copy = compiled.exports.calendarDisplayCopy;
} finally { Module._load = previousLoad; }

function find(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const found = find(child, predicate); if (found) return found;
  }
  return null;
}
const calendar = (settings = {}) => ({ id: 'home', name: 'Home', data: { activities: [], settings } });
const row = settings => ({ schedule: { calendars: [{ id: 'home', name: 'Home' }], calendarData: { home: { settings } } }, updated_at: '2026-11-23T12:00:00Z' });
function mount(initial) {
  let props = { calendar: calendar(), preferences: { view: 'week', week: 'sunday', hours: 'evening', reminders: '10' }, available: true, ...initial };
  const state = { cursor: 0, cells: [], effects: [] };
  function render() {
    host = state; state.cursor = 0; state.effects = [];
    const element = CalendarDisplaySettings(props);
    for (const effect of state.effects) effect();
    return element;
  }
  render();
  return {
    render,
    props(patch) { props = { ...props, ...patch }; render(); },
    choice(label) { return find(render(), node => node.type === 'ChoiceRow' && node.props.label === label); },
    toggle() { const node = find(render(), node => node.type === 'Switch'); node.props.onValueChange(!node.props.value); },
    button(label = 'Save changes') { return find(render(), node => node.type === 'Button' && node.props.children === label); },
    message(text) { return find(render(), node => node.type === 'Text' && node.props.children === text); },
    unmount() { for (const cell of state.cells) cell?.cleanup?.(); },
  };
}

test('cloud choices render and saving changes only the reviewed field', async () => {
  const original = { defaultView: 'four', defaultEventDuration: 45, showWeekends: false };
  let received;
  const app = mount({ calendar: calendar({ ...original, notifications: true, reminderMinutes: 1440, future: 'keep' }),
    onSave: async request => { received = request; return row({ ...original, ...request.changes }); } });
  assert.equal(app.choice('Opening view').props.value, 'four');
  assert.equal(app.choice('New event length').props.value, 45);
  assert.equal(app.button().props.disabled, true);
  app.choice('New event length').props.onChange(90);
  await app.button().props.onPress();
  assert.deepEqual(received, { original, changes: { defaultEventDuration: 90 } });
  assert.ok(app.message(copy.en.saved));
  assert.equal(app.choice('New event length').props.value, 90);
  assert.equal(app.button().props.disabled, true);
});

test('unset cloud defaults stay absent when saving a different preference', async () => {
  let received;
  const app = mount({ onSave: async request => { received = request; return row(request.changes); } });
  assert.equal(app.choice('Opening view').props.value, 'week');
  assert.equal(app.choice('New event length').props.value, 60);
  app.toggle(); await app.button().props.onPress();
  assert.deepEqual(received, { original: {}, changes: { showWeekends: false } });
  assert.equal(received.changes.week, undefined);
  assert.equal(received.changes.notifications, undefined);
});

test('explicitly selecting the current device fallback can establish a shared cloud default', async () => {
  for (const [label, value, field] of [['Opening view', 'week', 'defaultView'], ['New event length', 60, 'defaultEventDuration']]) {
    let received;
    const app = mount({ onSave: async request => { received = request; return row(request.changes); } });
    assert.equal(app.choice(label).props.value, value);
    app.choice(label).props.onChange(value);
    assert.equal(app.button().props.disabled, false);
    await app.button().props.onPress();
    assert.deepEqual(received, { original: {}, changes: { [field]: value } });
    assert.equal(app.button().props.disabled, true);
  }
});

test('shared today opens the Day timeline while device-only Agenda remains a separate choice', async () => {
  const day = mount({ calendar: calendar({ defaultView: 'today' }) });
  assert.equal(day.choice('Opening view').props.value, 'today');
  assert.equal(day.choice('Opening view').props.options.find(option => option.value === 'today').label, 'Day');
  let received;
  const agenda = mount({ preferences: { view: 'today' }, onSave: async request => { received = request; return row(request.changes); } });
  assert.equal(agenda.choice('Opening view').props.value, '');
  agenda.choice('Opening view').props.onChange('today');
  await agenda.button().props.onPress();
  assert.deepEqual(received, { original: {}, changes: { defaultView: 'today' } });
});

test('a conflicting save retains edits and the original baseline until explicit reload', async () => {
  let received;
  const app = mount({ calendar: calendar({ defaultEventDuration: 30 }), onSave: async request => {
    received = request; const error = new Error('changed'); error.code = 'CONFLICT'; throw error;
  } });
  app.choice('New event length').props.onChange(45);
  app.props({ calendar: calendar({ defaultEventDuration: 90 }) });
  assert.equal(app.choice('New event length').props.value, 45);
  await app.button().props.onPress();
  assert.deepEqual(received.original, { defaultEventDuration: 30 });
  assert.ok(app.message(copy.en.conflict));
  assert.equal(app.choice('New event length').props.value, 45);
  app.button('Load saved choices').props.onPress();
  assert.equal(app.choice('New event length').props.value, 90);
  assert.equal(app.button().props.disabled, true);
});

test('ordinary incoming preferences hydrate a clean form without writing', () => {
  let calls = 0;
  const app = mount({ onSave: () => { calls++; } });
  app.props({ calendar: calendar({ defaultView: 'month', defaultEventDuration: 120, showWeekends: false }) });
  assert.equal(app.choice('Opening view').props.value, 'month');
  assert.equal(app.choice('New event length').props.value, 120);
  assert.equal(calls, 0);
});

test('pending saves block duplicate requests and report modal busy state', async () => {
  let finish, calls = 0; const busy = [];
  const app = mount({ onBusyChange: value => busy.push(value), onSave: () => {
    calls++; return new Promise(resolve => { finish = resolve; });
  } });
  app.toggle(); const save = app.button().props.onPress;
  const pending = save(); await save();
  assert.equal(calls, 1);
  assert.equal(app.button('Saving…').props.disabled, true);
  assert.equal(app.choice('Opening view').props.disabled, true);
  finish(row({ showWeekends: false })); await pending;
  assert.deepEqual(busy, [true, false]);
});

test('a failed request keeps editable choices available for retry', async () => {
  let calls = 0;
  const app = mount({ onSave: async request => {
    if (++calls === 1) throw new Error('offline'); return row(request.changes);
  } });
  app.toggle(); await app.button().props.onPress();
  assert.ok(app.message(copy.en.failed));
  assert.equal(app.button().props.disabled, false);
  await app.button().props.onPress();
  assert.equal(calls, 2); assert.ok(app.message(copy.en.saved));
});

test('offline and shared-calendar settings cannot dispatch saves', async () => {
  let calls = 0;
  const app = mount({ available: false, onSave: () => { calls++; } });
  app.toggle(); app.choice('Opening view').props.onChange('month');
  await app.button().props.onPress();
  assert.equal(calls, 0); assert.equal(app.button().props.disabled, true);
  assert.ok(app.message(copy.en.unavailable));
  const shared = mount({ calendar: null, onSave: () => { calls++; } });
  assert.ok(shared.message(copy.en.noCalendar)); assert.equal(shared.button(), null);
});

test('scope changes and unmounts do not claim a late save succeeded', async () => {
  let finish; const busy = [];
  const app = mount({ onBusyChange: value => busy.push(value), onSave: () => new Promise((_resolve, reject) => { finish = reject; }) });
  app.toggle(); const pending = app.button().props.onPress();
  app.unmount(); const error = new Error('stale'); error.code = 'STALE_SCOPE'; finish(error); await pending;
  assert.deepEqual(busy, [true, false]);
  assert.equal(app.message(copy.en.saved), null);
});

test('English and Chinese expose the same working fields and recovery actions', () => {
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  const app = mount({ language: 'zh', calendar: calendar({ defaultView: 'four' }) });
  assert.equal(app.choice(copy.zh.view).props.value, 'four');
  assert.equal(app.choice(copy.zh.duration).props.options.length, 5);
  assert.equal(app.choice(copy.zh.view).props.options.length, 4);
  assert.ok(app.button(copy.zh.save));
});

test('dirty state reaches exit protection and clears only on successful save or unmount', async () => {
  const changes = [];
  const app = mount({ onDirtyChange: value => changes.push(value), onSave: async request => row(request.changes) });
  assert.deepEqual(changes, [false]);
  app.toggle(); app.render(); assert.deepEqual(changes, [false, true]);
  await app.button().props.onPress(); app.render();
  assert.deepEqual(changes, [false, true, false]);
  app.toggle(); app.render(); assert.equal(changes.at(-1), true);
  app.unmount(); assert.equal(changes.at(-1), false);
});
