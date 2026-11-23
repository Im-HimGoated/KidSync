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
const calendarTools = require('../mobile/src/lib/calendar');
const realSchedules = require('../shared/backend/schedules');
let host;
const hooks = {
  ...React,
  useState(initial) {
    const owner = host, index = owner.cursor++;
    const cell = owner.cells[index] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [cell.value, value => { cell.value = typeof value === 'function' ? value(cell.value) : value; }];
  },
  useRef(initial) { return host.cells[host.cursor++] ||= { current: initial }; },
  useMemo(factory, dependencies) {
    const index = host.cursor++, previous = host.cells[index];
    if (!previous || dependencies.some((value, key) => !Object.is(value, previous.dependencies[key]))) host.cells[index] = { dependencies, value: factory() };
    return host.cells[index].value;
  },
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
const filename = path.join(mobile, 'src/screens/FamilyScreen.js');
const mocks = {
  sharing: {
    listCalendarMembers: async client => client.fixture.members,
    listCalendarInvitations: async client => client.fixture.invitations,
    readMemberCalendar: async (client, _account, invitationId) => {
      const fixture = client.fixture; fixture.calls.push(['shared-read', invitationId]);
      const source = fixture.shared.find(context => context.invitation.id === invitationId);
      if (!source) throw new Error('missing shared calendar');
      return fixture.readShared ? fixture.readShared(source) : source.calendar;
    },
    listCalendarComments: async () => [],
  },
  coordination: {
    listCalendarPickups: async (client, _account, calendar) => client.fixture.pickups.filter(row => row.owner_id === calendar.ownerId && row.calendar_id === calendar.id),
    respondCalendarPickup: async (client, account, pickup, status) => {
      const fixture = client.fixture; fixture.calls.push(['response', account.id, pickup, status]);
      const saved = { ...pickup, status, updated_at: '2026-11-23T12:01:00Z' };
      fixture.pickups = fixture.pickups.map(row => row.id === pickup.id ? saved : row);
      return saved;
    },
  },
};
const previousLoad = Module._load;
Module._load = function (request, parent) {
  if (parent?.filename !== filename) return previousLoad.apply(this, arguments);
  if (request === 'react') return hooks;
  if (request === 'react-native') return {
    ActivityIndicator: 'Spinner', Pressable: 'Pressable', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    StyleSheet: { create: value => value }, Share: { share: async () => {} }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  };
  if (request === 'lucide-react-native') return new Proxy({}, { get: (_value, key) => key === '__esModule' ? false : String(key) });
  if (request === '../family/FamilyProfiles') return 'FamilyProfiles';
  if (request === '../family/foreground-refresh') return { startForegroundRefresh: options => { host.fixture.refreshControls.push(options); return () => {}; } };
  if (request === '../../../shared/backend/mobile-sharing') return mocks.sharing;
  if (request === '../../../shared/backend/mobile-coordination') return mocks.coordination;
  if (request === '../../../shared/backend/schedules') return { ...realSchedules, readSchedule: async (client, userId) => {
    const fixture = client.fixture; fixture.calls.push(['owner-read', userId]);
    return fixture.readOwner ? fixture.readOwner() : fixture.ownerRow;
  } };
  if (request === '../calendar/ui') return { Button: 'Button', ChoiceRow: 'ChoiceRow', Field: 'Field', IconButton: 'IconButton', Sheet: 'Sheet', useCalendarUi: () => ({ ...theme, u: {} }) };
  if (request === '../ui/AppearanceContext') return { useAppearance: () => theme, useThemeStyles: factory => factory(theme.colors) };
  return previousLoad.apply(this, arguments);
};
let FamilyScreen, copy;
try {
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const source = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
    plugins: [[jsx, { runtime: 'automatic' }], commonjs] }).code;
  // The clock effect is real, but its timer is inert. Foreground polling has its
  // own unit tests and is represented by an explicitly invoked refresh callback.
  compiled._compile('const setTimeout = () => 1; const clearTimeout = () => {};\n' + source, filename);
  FamilyScreen = compiled.exports.default; copy = compiled.exports.familyCopy;
} finally { Module._load = previousLoad; }

function all(element, predicate) {
  if (!element || typeof element !== 'object') return [];
  return [...(predicate(element) ? [element] : []), ...[element.props?.children].flat(Infinity).flatMap(child => all(child, predicate))];
}
const day = calendarTools.dateKey(new Date());
const event = patch => ({ id: 'plan', title: 'Practice', startDate: day, start: '15:00', end: '16:00', recurrence: 'none', ...patch });
const pickup = patch => ({ id: 'pickup', owner_id: 'owner', calendar_id: 'home', event_id: 'plan', occurrence_date: day,
  assignee_email: 'owner@example.com', status: 'pending', updated_at: '2026-11-23T10:00:00.123456+00:00', ...patch });
const ownerCalendar = activities => ({ id: 'home', name: 'Home', data: { activities, kids: [] } });
const ownerRow = activities => ({ schedule: { calendars: [{ id: 'home', name: 'Home' }], calendarData: { home: { activities, kids: [] } } } });
const invitation = patch => ({ id: 'invite', owner_id: 'other-owner', calendar_id: 'shared', calendar_name: 'Shared', status: 'active', role: 'viewer', ...patch });
const mounts = [];
function mount(initial = {}, supplied = {}) {
  const fixture = { calls: [], members: [], invitations: [], pickups: [], shared: [], refreshControls: [], ownerRow: ownerRow([event()]), ...supplied };
  let props = { language: 'en', user: { id: 'owner', email: 'owner@example.com' }, client: { fixture }, calendar: ownerCalendar([event()]),
    onPendingCount: value => fixture.pending = value, onSaveProfiles: async () => {}, ...initial };
  const state = { cursor: 0, cells: [], effects: [], fixture };
  function render() {
    host = state; state.cursor = 0; state.effects = [];
    const tree = FamilyScreen(props);
    for (const effect of state.effects) effect();
    return tree;
  }
  const app = {
    fixture, render,
    props(patch) { props = { ...props, ...patch }; render(); },
    async settle() { for (let count = 0; count < 5; count++) { render(); await new Promise(resolve => setImmediate(resolve)); } },
    buttons(label) { return all(render(), node => node.type === 'Button' && node.props.children === label); },
    texts(text) { return all(render(), node => node.type === 'Text' && node.props.children === text); },
    component(type) { return all(render(), node => node.type === type)[0]; },
    tab(label) { const node = all(render(), node => node.type === 'Pressable' && node.props.accessibilityRole === 'tab'
      && all(node, child => child.type === 'Text' && child.props.children === label).length)[0]; node.props.onPress(); render(); },
    unmount() { for (const cell of state.cells) cell?.cleanup?.(); },
  };
  mounts.push(app); render(); return app;
}
test.afterEach(() => { for (const app of mounts.splice(0)) app.unmount(); });

test('Inbox offers actions only for current occurrences and counts only eligible requests', async () => {
  const events = [event(), event({ id: 'cancelled', status: 'cancelled' }), event({ id: 'excluded', recurrence: 'daily', excludedDates: [day] })];
  const app = mount({ calendar: ownerCalendar(events) }, { pickups: [pickup(), pickup({ id: 'p-cancelled', event_id: 'cancelled' }),
    pickup({ id: 'p-excluded', event_id: 'excluded' }), pickup({ id: 'p-deleted', event_id: 'deleted' })],
    invitations: [invitation({ id: 'new-invitation', status: 'pending' })] });
  await app.settle(); app.tab('Inbox');
  assert.equal(app.buttons('I can do it').length, 1); assert.equal(app.buttons('I cannot').length, 1);
  assert.equal(app.texts(copy.en.pickupPlanUnavailable).length, 3);
  assert.equal(app.fixture.pending, 2, 'one valid pickup plus one invitation');
});

test('an owner response freshly verifies the calendar before calling the versioned backend', async () => {
  const request = pickup(), app = mount({}, { pickups: [request] });
  await app.settle(); app.tab('Inbox');
  await app.buttons('I can do it')[0].props.onPress(); await app.settle();
  assert.deepEqual(app.fixture.calls.map(item => item[0]), ['owner-read', 'response']);
  assert.equal(app.fixture.calls[1][2].updated_at, request.updated_at);
  assert.equal(app.fixture.calls[1][3], 'accepted'); assert.equal(app.fixture.pending, 0);
  assert.equal(app.texts(copy.en.responseAccepted).length, 1);
});

test('an owner plan excluded after rendering is rejected before the response RPC', async () => {
  const app = mount({}, { pickups: [pickup()], readOwner: async () => ownerRow([event({ recurrence: 'daily', excludedDates: [day] })]) });
  await app.settle(); app.tab('Inbox');
  await app.buttons('I can do it')[0].props.onPress(); await app.settle();
  assert.deepEqual(app.fixture.calls.map(item => item[0]), ['owner-read']);
  assert.equal(app.texts(copy.en.pickupPlanUnavailable).length, 1);
});

test('a shared recipient re-reads its accepted calendar and rejects a newly cancelled plan', async () => {
  const invite = invitation();
  const shared = { invitation: invite, calendar: { id: 'shared', ownerId: 'other-owner', name: 'Shared', data: { activities: [event()], kids: [] } } };
  let sharedReads = 0;
  const app = mount({}, { invitations: [invite], shared: [shared],
    pickups: [pickup({ owner_id: 'other-owner', calendar_id: 'shared' })],
    readShared: context => ++sharedReads === 1 ? context.calendar : { ...context.calendar, data: { activities: [event({ status: 'cancelled' })] } },
  });
  await app.settle(); app.tab('Inbox');
  await app.buttons('I can do it')[0].props.onPress(); await app.settle();
  assert.equal(sharedReads, 2); assert.equal(app.fixture.calls.filter(item => item[0] === 'response').length, 0);
  assert.equal(app.texts(copy.en.pickupPlanUnavailable).length, 1);
});

test('a callback retained from another calendar cannot read or answer a pickup', async () => {
  const app = mount({}, { pickups: [pickup()] });
  await app.settle(); app.tab('Inbox'); const answer = app.buttons('I can do it')[0].props.onPress;
  app.props({ calendar: { id: 'work', name: 'Work', data: { activities: [], kids: [] } } });
  await answer(); await app.settle();
  assert.equal(app.fixture.calls.length, 0);
});

test('switching calendars during preflight prevents a late response', async () => {
  let finishRead;
  const app = mount({}, { pickups: [pickup()], readOwner: () => new Promise(resolve => { finishRead = resolve; }) });
  await app.settle(); app.tab('Inbox');
  const answering = app.buttons('I can do it')[0].props.onPress();
  app.props({ calendar: { id: 'work', name: 'Work', data: { activities: [], kids: [] } } });
  finishRead(ownerRow([event()])); await answering; await app.settle();
  assert.equal(app.fixture.calls.filter(item => item[0] === 'response').length, 0);
});

test('foreground catch-up updates the badge without dismissing forms or starting real timers', async () => {
  const app = mount(); await app.settle();
  assert.equal(app.fixture.pending, 0);
  const refresh = app.fixture.refreshControls.at(-1); assert.equal(refresh.canRefresh(), true);
  app.fixture.pickups = [pickup()]; await refresh.refresh(); await app.settle();
  assert.equal(app.fixture.pending, 1);
  app.buttons('Manage family profiles')[0].props.onPress(); app.render();
  assert.equal(refresh.canRefresh(), false); assert.ok(app.component('Sheet'));
});

test('dirty profile Close offers Keep editing and Discard while retaining the mounted form', async () => {
  const app = mount(); await app.settle();
  app.buttons('Manage family profiles')[0].props.onPress();
  const original = app.component('FamilyProfiles'); original.props.onDirtyChange(true);
  app.component('Sheet').props.onClose();
  assert.equal(app.component('Sheet').props.title, copy.en.discardProfiles);
  const hidden = all(app.render(), node => node.type === 'View' && node.props.accessibilityElementsHidden === true)[0];
  assert.equal(all(hidden, node => node.type === 'FamilyProfiles').length, 1);
  assert.equal(app.component('FamilyProfiles').props.original, original.props.original);
  app.buttons('Keep editing')[0].props.onPress();
  assert.equal(app.component('Sheet').props.title, copy.en.manageProfiles);
  assert.equal(app.component('FamilyProfiles').props.original, original.props.original);
  app.component('Sheet').props.onClose(); app.buttons('Discard changes')[0].props.onPress();
  assert.equal(app.component('Sheet'), undefined);
});

test('a pending profile save cannot close its sheet and completes only after confirmation', async () => {
  let finishSave, calls = 0;
  const app = mount({ onSaveProfiles: () => { calls++; return new Promise(resolve => { finishSave = resolve; }); } });
  await app.settle(); app.buttons('Manage family profiles')[0].props.onPress();
  const saving = app.component('FamilyProfiles').props.onSave({ profiles: [] });
  assert.equal(app.component('Sheet').props.busy, true);
  app.component('Sheet').props.onClose(); assert.ok(app.component('FamilyProfiles'));
  assert.equal(app.buttons('Discard changes').length, 0);
  finishSave(); await saving;
  assert.equal(calls, 1); assert.equal(app.component('Sheet'), undefined);
});

test('a profile draft opened in A cannot save into B with identical original profiles', async () => {
  const kids = [{ id: 'kid', name: 'Casey' }], calls = [];
  const calendar = { ...ownerCalendar([]), data: { activities: [], kids } };
  const app = mount({ calendar, onSaveProfiles: async (...args) => { calls.push(args); } });
  await app.settle(); app.buttons('Manage family profiles')[0].props.onPress();
  app.component('FamilyProfiles').props.onDirtyChange(true);
  const staleSave = app.component('FamilyProfiles').props.onSave;
  app.props({ calendar: { id: 'other', name: 'Other', data: { activities: [], kids: structuredClone(kids) } } });
  await app.settle();
  await assert.rejects(app.component('FamilyProfiles').props.onSave({ original: kids, profiles: [] }), { code: 'STALE_SCOPE' });
  await assert.rejects(staleSave({ original: kids, profiles: [] }), { code: 'STALE_SCOPE' });
  assert.equal(calls.length, 0); assert.ok(app.component('FamilyProfiles'));
});

test('ordinary same-calendar realtime updates keep an open profile draft savable', async () => {
  const kids = [{ id: 'kid', name: 'Casey' }], calls = [];
  const calendar = { ...ownerCalendar([]), data: { activities: [], kids } };
  const app = mount({ calendar, onSaveProfiles: async (...args) => { calls.push(args); } });
  await app.settle(); app.buttons('Manage family profiles')[0].props.onPress();
  app.props({ calendar: { ...calendar, data: { ...calendar.data, activities: [event()] } } });
  await app.component('FamilyProfiles').props.onSave({ original: kids, profiles: [] });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'home');
  assert.equal(app.component('FamilyProfiles'), undefined);
});

test('a profile save completing after a calendar switch preserves the visible draft', async () => {
  let finish;
  const app = mount({ onSaveProfiles: () => new Promise(resolve => { finish = resolve; }) });
  await app.settle(); app.buttons('Manage family profiles')[0].props.onPress();
  app.component('FamilyProfiles').props.onDirtyChange(true);
  const saving = app.component('FamilyProfiles').props.onSave({ original: [], profiles: [] });
  app.props({ calendar: { id: 'other', name: 'Other', data: { activities: [], kids: [] } } });
  finish(); await assert.rejects(saving, { code: 'STALE_SCOPE' });
  assert.ok(app.component('FamilyProfiles'));
});
