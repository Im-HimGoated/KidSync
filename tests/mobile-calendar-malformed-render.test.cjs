const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..'), mobile = path.join(root, 'mobile');
function dependency(name) {
  const folder = fs.readdirSync(path.join(mobile, 'node_modules/.pnpm')).find(value => value.startsWith(name.replace('/', '+') + '@'));
  if (!folder) throw Error(`Missing installed test dependency: ${name}`);
  return require(path.join(mobile, 'node_modules/.pnpm', folder, 'node_modules', name));
}
const babel = dependency('@babel/core'), jsx = dependency('@babel/plugin-transform-react-jsx');
const commonjs = dependency('@babel/plugin-transform-modules-commonjs');
const React = require(path.join(mobile, 'node_modules/react'));
const ReactDOMServer = require(path.join(mobile, 'node_modules/react-dom/server'));
const nativeWeb = require(path.join(mobile, 'node_modules/react-native-web'));
const load = Module._load, extension = Module._extensions['.js'];
Module._load = function (request) {
  if (request === 'react-native') return nativeWeb;
  if (request === 'react-native-safe-area-context') return { SafeAreaView: nativeWeb.View, SafeAreaProvider: nativeWeb.View };
  if (request === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {} };
  if (request === 'lucide-react-native') return new Proxy({}, { get: (_value, key) => key === '__esModule' ? false : () => React.createElement(nativeWeb.View) });
  return load.apply(this, arguments);
};
Module._extensions['.js'] = function (target, filename) {
  if (!['calendar', 'ui'].some(folder => filename.startsWith(path.join(mobile, 'src', folder) + path.sep))) return extension(target, filename);
  let source = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
    plugins: [[jsx, { runtime: 'automatic' }], commonjs] }).code;
  // Expose the real private card to this module loader only; production exports
  // stay unchanged, and malformed dates can be tested in the search-result card.
  if (filename.endsWith('/calendar/CalendarScreen.js')) source += '\nexports.__ActivityCard = ActivityCard;';
  target._compile(source, filename);
};
const ActivityCard = require('../mobile/src/calendar/CalendarScreen').__ActivityCard;
const { ActivityDetails } = require('../mobile/src/calendar/ActivityEditor');
const base = { id: 'legacy', title: 'Legacy plan', icon: '📅', startDate: '2026-10-30', start: '08:00', end: '09:00', recurrence: 'none' };
const render = (component, props) => ReactDOMServer.renderToStaticMarkup(React.createElement(component, props));

test('legacy object, array, boolean and nonfinite display fields cannot crash calendar cards or details', () => {
  const fields = ['title', 'icon', 'location', 'responsible', 'startDate', 'child', 'notes', 'items', 'importance', 'reminderMinutes'];
  for (const malformed of [{ malformed: 'legacy JSON' }, ['legacy array'], true, NaN, Infinity]) {
    const event = { ...base, ...Object.fromEntries(fields.map(field => [field, malformed])) };
    const before = structuredClone(event);
    for (const language of ['en', 'zh']) {
      const card = render(ActivityCard, { event, date: new Date(2026, 9, 30), showDate: true, kids: [], language, onPress: () => {} });
      const details = render(ActivityDetails, { event, kids: [], language, canEdit: false });
      assert.ok(card.length); assert.ok(details.length);
      for (const html of [card, details]) {
        assert.ok(!html.includes('[object Object]')); assert.ok(!html.includes('NaN')); assert.ok(!html.includes('Infinity'));
      }
    }
    assert.deepEqual(event, before);
  }
});

test('finite numeric metadata renders as text and translation-key collisions stay primitive', () => {
  const event = { ...base, title: 17, icon: 3, location: 23, responsible: 71, startDate: 20261030,
    items: 19, notes: 0, importance: 'errors', recurrence: 'errors' };
  const card = render(ActivityCard, { event, date: new Date(2026, 9, 30), showDate: true, kids: [], language: 'en', onPress: () => {} });
  const details = render(ActivityDetails, { event, kids: [], language: 'en', canEdit: false });
  for (const value of ['17', '23', '71']) { assert.ok(card.includes(value)); assert.ok(details.includes(value)); }
  assert.ok(card.includes('20261030')); assert.ok(details.includes('errors'));
  assert.ok(!details.includes('[object Object]'));
});

test.after(() => { Module._load = load; Module._extensions['.js'] = extension; });
