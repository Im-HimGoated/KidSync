const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizePreferences, sidebarWidth, snappedMinute, scrollTopForMinute, filterEntries } = require('../assets/ui-features.js');
const script = fs.readFileSync(path.join(__dirname, '../assets/ui-features.js'), 'utf8');

test('display defaults and stored values are normalized without affecting events', () => {
  assert.deepEqual(normalizePreferences(null), { contrast: false, guides: true });
  assert.deepEqual(normalizePreferences({ contrast: true, guides: false }), { contrast: true, guides: false });
  assert.deepEqual(normalizePreferences({ contrast: 'true', guides: 'false', events: [] }), { contrast: false, guides: true });
  assert.equal(sidebarWidth(100), 220); assert.equal(sidebarWidth(500), 360);
  assert.equal(sidebarWidth(271.8), 272); assert.equal(sidebarWidth(NaN), 260);
});

test('hover time agrees with the existing 15-minute click snap and stops before next midnight', () => {
  assert.equal(snappedMinute(100, 100, 2880), 0);
  assert.equal(snappedMinute(820, 100, 2880), 360);
  assert.equal(snappedMinute(100 + 33 * 2, 100, 2880), 30);
  assert.equal(snappedMinute(-400, 100, 2880), 0);
  assert.equal(snappedMinute(5000, 100, 2880), 1425);
  assert.equal(snappedMinute(100, 100, 0), null);
});

test('time jumps use actual zoomed timeline height, clamp scroll, and never navigate dates', () => {
  assert.equal(scrollTopForMinute(0, 2880, 600, 3006), 0);
  assert.equal(scrollTopForMinute(720, 2880, 600, 3006), 1440);
  assert.equal(scrollTopForMinute(720, 2160, 600, 2286), 1080);
  assert.equal(scrollTopForMinute(1440, 2880, 600, 3006), 2406);
});

test('filter chips reflect search, category, every hidden child, and applicable weekend settings', () => {
  const profiles = [{ name: 'Sam' }, { name: 'Alex' }];
  assert.deepEqual(filterEntries('all', ' ', profiles, new Set(['Sam', 'Alex']), true, 'week'), []);
  assert.deepEqual(filterEntries('trip', '  airport ', profiles, new Set(['Sam']), false, 'four'), [
    { kind: 'category', value: 'trip' }, { kind: 'search', value: 'airport' }, { kind: 'child', value: 'Alex' }, { kind: 'weekends', value: '' }
  ]);
  assert.equal(filterEntries('all', '', [], new Set(), false, 'month').length, 0);
});

function fixture() {
  const nodes = new Map(), events = {}, storage = new Map(), calls = [];
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { id, handlers: {}, dataset: {}, style: { setProperty(k, v) { this[k] = v; } }, checked: false, open: false,
        classList: { add: k => classes.add(k), remove: k => classes.delete(k), contains: k => classes.has(k), toggle(k, on) { if (on) classes.add(k); else classes.delete(k); } },
        addEventListener(type, fn) { this.handlers[type] = fn; }, setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; },
        getClientRects: () => [1], focus() {}, isConnected: true, contains() { return false; },
        querySelectorAll() { return []; }, querySelector() { return node('summary'); },
        showModal() { this.open = true; }, close() { this.open = false; },
        setPointerCapture(id) { this.capture = id; }, hasPointerCapture(id) { return this.capture === id; }, releasePointerCapture() { this.capture = null; }
      });
    }
    return nodes.get(id);
  };
  Object.assign(node('weekSchedule'), { clientHeight: 600, scrollHeight: 3006, scrollLeft: 175, scrollTo: options => calls.push(options) });
  node('timeline').offsetHeight = 2880;
  node('scheduleGrid').querySelector = () => node('timeline');
  const context = vm.createContext({
    window: { addEventListener(type, fn) { events[type] = fn; } },
    document: { documentElement: node('html'), activeElement: node('opening'), getElementById: node,
      querySelectorAll: () => [], querySelector: () => node('summary'), addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    matchMedia: query => ({ matches: query === '(hover: hover) and (pointer: fine)' }),
    requestAnimationFrame: fn => fn(), resizeCalendarWorkspace() {},
    currentLanguage: 'en', currentView: 'week', scheduleStartMinutes: 0, scheduleEndMinutes: 1440, scheduleDurationMinutes: 1440,
    settingsDialog: node('settingsDialog'), grid: node('scheduleGrid'), weekSchedule: node('weekSchedule'),
    workspaceLayout: { sideWidth: 260, sidePosition: 'right' }, applyWorkspaceLayout: () => calls.push('layout'), saveWorkspaceLayout: () => calls.push('save-layout'),
    state: { eventFilter: 'trip', searchQuery: '<airport>', visibleKids: new Set(['Sam']), showWeekends: false, activities: [{ id: 'untouched' }] },
    kidProfiles: [{ name: 'Sam' }, { name: 'Alex' }], scheduleSearch: node('search'),
    userSettings: { reduceMotion: false }, saveSettings: () => calls.push('save-settings'), conflictCursor: 3, travelCursor: 2,
    setSidebarActive: value => calls.push(value), renderAll: () => context.window.KidsSyncUI.refresh(), scheduleSmartCalendarFocus() {},
    escapeHtml: value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'), t: key => key,
    formatTimeLabel: minute => `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`
  });
  vm.runInContext(script, context);
  const clickFilter = index => node('activeFilterChips').handlers.click({ target: { closest: () => ({ dataset: { clearUiFilter: String(index) } }) } });
  return { context, node, events, storage, calls, clickFilter };
}

test('individual filter removal preserves every unrelated selection and escapes user text', () => {
  const f = fixture();
  assert.match(f.node('activeFilterChips').innerHTML, /&lt;airport&gt;/);
  f.clickFilter(1);
  assert.equal(f.context.state.searchQuery, '');
  assert.equal(f.context.state.eventFilter, 'trip');
  assert.equal(f.context.state.visibleKids.has('Alex'), false);
  assert.equal(f.context.state.showWeekends, false);
  f.clickFilter(1); // Alex is now the second chip.
  assert.equal(f.context.state.visibleKids.has('Alex'), true);
  assert.equal(f.context.state.eventFilter, 'trip');
  assert.deepEqual(f.context.state.activities, [{ id: 'untouched' }]);
});

test('Clear all restores child/weekend visibility as well as category and query', () => {
  const f = fixture();
  f.node('clearCalendarContext').handlers.click({ preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(f.context.state.eventFilter, 'all'); assert.equal(f.context.state.searchQuery, '');
  assert.equal(f.context.state.visibleKids.size, 2); assert.equal(f.context.state.showWeekends, true);
  assert.equal(f.node('calendarContextBar').hidden, true);
  assert(f.calls.includes('save-settings'));
});

test('high contrast and guide preferences save locally with an honest session-only fallback', () => {
  const f = fixture(); f.node('uiContrast').checked = true;
  f.node('uiContrast').handlers.change();
  assert(f.node('html').classList.contains('ui-high-contrast'));
  assert.equal(JSON.parse(f.storage.get('kidssync.visual-preferences.v1')).contrast, true);
  f.context.localStorage.setItem = () => { throw Error('quota'); };
  f.node('uiGuides').checked = false; f.node('uiGuides').handlers.change();
  assert.match(f.node('visualPreferencesStatus').textContent, /session only/);
  f.events.storage({ key: 'kidssync.visual-preferences.v1', newValue: '{"contrast":false}' });
  assert.equal(f.node('html').classList.contains('ui-high-contrast'), false);
});

test('sidebar keyboard and pointer resize share saved layout values and cancellation restores width', () => {
  const f = fixture(), divider = f.node('calendarSideResize');
  const key = value => divider.handlers.keydown({ key: value, preventDefault() {} });
  key('ArrowLeft'); assert.equal(f.context.workspaceLayout.sideWidth, 268);
  key('Home'); assert.equal(f.context.workspaceLayout.sideWidth, 220);
  key('End'); assert.equal(f.context.workspaceLayout.sideWidth, 360);
  f.context.workspaceLayout.sidePosition = 'left'; key('ArrowLeft');
  assert.equal(f.context.workspaceLayout.sideWidth, 352);
  divider.handlers.pointerdown({ button: 0, pointerId: 1, clientX: 400, preventDefault() {} });
  divider.handlers.pointermove({ pointerId: 1, clientX: 300 });
  assert.equal(f.context.workspaceLayout.sideWidth, 252);
  divider.handlers.pointercancel(); assert.equal(f.context.workspaceLayout.sideWidth, 352);
  divider.handlers.dblclick(); assert.equal(f.context.workspaceLayout.sideWidth, 260);
  assert.equal(divider['aria-valuenow'], '260');
  assert(f.calls.includes('save-layout'));
});

test('hover guide appears only on empty mouse slots and clears on scroll or disabling', () => {
  const f = fixture(), column = f.node('column');
  column.getBoundingClientRect = () => ({ top: 100, height: 2880 });
  const target = { closest: selector => selector === '.day-column' ? column : null };
  f.node('scheduleGrid').handlers.pointermove({ target, pointerType: 'mouse', buttons: 0, clientY: 820 });
  assert.equal(column['data-ui-time'], '6:00');
  assert.equal(column.style['--ui-slot-top'], '25%');
  f.node('weekSchedule').handlers.scroll(); assert.equal(column.classList.contains('ui-slot-hover'), false);
  f.node('scheduleGrid').handlers.pointermove({ target, pointerType: 'touch', buttons: 0, clientY: 820 });
  assert.equal(column.classList.contains('ui-slot-hover'), false);
  f.node('scheduleGrid').handlers.pointermove({ target, pointerType: 'mouse', buttons: 0, clientY: 820 });
  f.node('uiGuides').checked = false; f.node('uiGuides').handlers.change();
  assert.equal(column.classList.contains('ui-slot-hover'), false);
});

test('display dictionaries match, assets are offline-ready, and touch layouts hide desktop-only controls', () => {
  const words = vm.runInNewContext(script.slice(script.indexOf('  const labels ='), script.indexOf('  const text =')) + '\nlabels');
  assert.deepEqual(Object.keys(words.en).sort(), Object.keys(words.zh).sort());
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../assets/ui-features.css'), 'utf8');
  const worker = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  assert.match(html, /window.KidsSyncUI\?\.renderFilters\(\)/);
  assert.match(html, /window.KidsSyncUI\?\.syncResize\(\)/);
  assert(worker.includes('"./assets/ui-features.css"')); assert(worker.includes('"./assets/ui-features.js"'));
  assert.match(css, /@media \(max-width: 740px\)[\s\S]*?\.timeline-navigator \{ display: none !important/);
  assert.match(css, /@media \(min-width: 901px\)/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /#appShell \.active-filter-chip > span:first-child \{[^}]*width: auto;[^}]*font-size: inherit/);
});
