const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseDay, clock, dayBrief, normalizeViews } = require('../assets/smart-planner.js');
const source = fs.readFileSync(require.resolve('../assets/smart-planner.js'), 'utf8');
const event = (start, end, extra = {}) => ({ id: start, start, end, status: 'confirmed', ...extra });

test('strict dates and times reject rollover, impossible dates and invalid clocks', () => {
  assert(parseDay('2028-02-29')); assert.equal(parseDay('2027-02-29'), null);
  assert.equal(parseDay('2027-13-01'), null); assert.equal(parseDay('9999-01-01'), null);
  assert.equal(clock('24:00'), null); assert.equal(clock('09:61'), null); assert.equal(clock('9:30'), null);
  assert.equal(clock('23:59'), 1439);
});
test('briefs are chronological and flag missing handoffs without inventing logistics', () => {
  const rows = dayBrief([event('12:00', '13:00', { title: 'Later', responsible: 'Pat', travelMinutes: 20 }),
    event('00:10', '01:00', { title: 'Early', status: 'tentative', travelMinutes: 30 }),
    event('09:00', '10:00', { allDay: true, eventType: 'birthday' }), event('08:00', '09:00', { status: 'cancelled' })]);
  assert.equal(rows.length, 3); assert.equal(rows[0].event.eventType, 'birthday');
  assert.equal(rows[0].needsAdult, false); assert.equal(rows[1].departure, -20);
  assert.equal(rows[1].tentative, true); assert.equal(rows[1].needsAdult, true);
  assert.equal(rows[2].departure, 700); assert.equal(rows[2].needsAdult, false);
});
test('saved views are bounded, normalized, deduplicated and contain no event data', () => {
  assert.deepEqual(normalizeViews(null), []);
  const stored = normalizeViews([{ id: 'one', name: '  School ', view: 'bad', filter: 'bad', children: ['Sam', 'Sam', null], weekends: false, activities: [{}] },
    { id: 'one', name: 'Duplicate' }, { id: 'blank', name: '  ' }]);
  assert.deepEqual(stored, [{ id: 'one', name: 'School', view: 'week', filter: 'all', query: '', children: ['Sam'], weekends: false }]);
  assert.equal(normalizeViews(Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: 'x'.repeat(80) }))).length, 8);
  assert.equal(stored[0].activities, undefined);
});

function fixture() {
  const nodes = new Map(), storage = new Map(), calls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, dataset: {}, handlers: {}, open: false, value: '', textContent: '', innerHTML: '',
      setAttribute(k, v) { this[k] = v; }, addEventListener(k, fn) { this.handlers[k] = fn; },
      querySelector(selector) { return node(selector); }, append() {}, replaceChildren() {}, focus() {},
      showModal() { this.open = true; }, close() { this.open = false; }, hasAttribute(k) { return Boolean(this.attrs?.includes(k)); }
    });
    return nodes.get(id);
  };
  const fields = Object.fromEntries(['allDay', 'start', 'end'].map(key => [key, node(key)]));
  const context = vm.createContext({ Date, Map, Set, Number, String, JSON, module: undefined,
    document: { createElement: () => node('dialog'), body: node('body'), getElementById: node, querySelector: () => null },
    window: {}, FormData: class { constructor(target) { this.target = target; } get(key) { return this.target.data[key]; } },
    localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    currentLanguage: 'en', currentView: 'week', selectedDate: new Date(2027, 0, 4), currentCalendarId: 'family',
    scheduleStorageKey: name => `${context.currentCalendarId}:${name}`, escapeHtml: value => String(value).replaceAll('<', '&lt;'),
    state: { activities: [], visibleKids: new Set(['Sam']), eventFilter: 'all', searchQuery: '', showWeekends: true }, kidProfiles: [{ name: 'Sam' }],
    userSettings: {}, scheduleSearch: node('search'), eventDetailsDialog: node('details'), fields, FAMILY_CHILD: '__family__',
    activityOccursOn: () => true, formatTimeLabel: value => { assert.equal(typeof value, 'number'); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }, timeInputValue: m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
    formatFullDate: date => date.toDateString(), formatShortDate: date => date.toDateString(), eventTimeText: e => e.start, activityTitle: e => e.title || '', displayChild: e => e.child || '',
    makeId: () => 'saved-one', saveSettings: () => calls.push('settings'), showCalendarPage: () => calls.push('calendar'),
    setSidebarActive: value => calls.push(value), activateCalendarView: (view, preserve) => calls.push([view, preserve]), showFeedbackToast: value => calls.push(value),
    openNewEventForDate: (date, child) => calls.push({ date, child }), updateAllDayFields() {}, updateConflictSuggestions() {}, showEventDetails: e => calls.push(e)
  });
  vm.runInContext(source, context);
  node('openSmartPlanner').handlers.click();
  const click = (dataset, attrs = []) => node('dialog').handlers.click({ target: { closest: () => ({ dataset, hasAttribute: key => attrs.includes(key) }) } });
  const submit = (id, data) => node('dialog').handlers.submit({ preventDefault() {}, target: { id, data } });
  return { context, node, calls, storage, click, submit };
}
test('brief includes hidden children regardless of category and search, and uses numeric time formatting', () => {
  const f = fixture();
  f.context.state.visibleKids.clear(); f.context.state.eventFilter = 'holidays'; f.context.state.searchQuery = 'unmatched';
  f.context.state.activities = [event('09:00', '10:00', { child: 'Sam', travelMinutes: 15 })];
  f.context.window.KidsSyncSmart.refresh();
  assert.match(f.node('#smartBrief').innerHTML, /Leave by 8:45/);
  assert.match(f.node('#smartBrief').innerHTML, /Adult not assigned/);
  f.click({ smartEvent: '0' }, ['data-smart-event']);
  assert.equal(f.calls[0].child, 'Sam'); assert.equal(f.node('dialog').open, false);
});
test('calendar changes close a stale panel rather than applying another calendar view', () => {
  const f = fixture(); f.context.currentCalendarId = 'another';
  f.click({ smartView: 'saved-one' });
  assert.equal(f.calls.length, 0); assert.equal(f.node('dialog').open, false);
});
test('saved views restore filters and view without moving the date and stay calendar scoped', () => {
  const f = fixture(); f.context.state.eventFilter = 'important'; f.context.state.searchQuery = 'piano';
  f.click({ briefMode: 'views' }); f.submit('smartViewForm', { name: 'School' });
  assert(f.storage.has('family:smart-views-v1'));
  f.context.state.eventFilter = 'all'; f.context.state.searchQuery = '';
  f.click({ smartView: 'saved-one' });
  assert.equal(f.context.state.eventFilter, 'important'); assert.equal(f.context.state.searchQuery, 'piano');
  assert(f.calls.some(call => Array.isArray(call) && call[0] === 'week' && call[1] === true));
  f.context.currentCalendarId = 'another'; f.context.window.KidsSyncSmart.refresh();
  assert.equal(f.node('dialog').open, false);
});
test('failed local writes leave saved views unchanged and report failure', () => {
  const f = fixture(); f.context.localStorage.setItem = () => { throw Error('quota'); };
  f.click({ briefMode: 'views' }); f.submit('smartViewForm', { name: 'School' });
  assert.equal(f.storage.size, 0); assert.match(f.node('#smartStatus').textContent, /Could not save/);
});
test('new features have complete bilingual dictionaries and offline assets', () => {
  const words = vm.runInNewContext(source.slice(source.indexOf('  const words ='), source.indexOf('  const tx =')) + '\nwords');
  assert.deepEqual(Object.keys(words.en).sort(), Object.keys(words.zh).sort());
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const sw = fs.readFileSync(require.resolve('../sw.js'), 'utf8');
  for (const asset of ['smart-planner.js', 'smart-planner.css']) { assert(html.includes(`./assets/${asset}`)); assert(sw.includes(`./assets/${asset}`)); }
  assert.match(html, /window.KidsSyncSmart\?\.refresh\(\)/);
  assert(!source.includes('data-smart-mode'), 'do not bind the other scheduling module tabs');
  assert(!source.includes('id="smartFindForm"'), 'only one free-time finder form');
});
