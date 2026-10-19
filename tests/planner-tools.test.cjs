const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const helpers = require('../assets/planner-tools.js');
const { localDate, dateString, plusDays, packingItems, personalStore, packingKey, copyForDate, agendaItems } = helpers;
const source = fs.readFileSync(path.join(__dirname, '../assets/planner-tools.js'), 'utf8');

test('planner dates reject rollovers, handle leap days, and keep local calendar days', () => {
  for (const value of ['', '2026-2-01', '2026-02-29', '2026-04-31', '1899-12-31', '10000-01-01']) assert.equal(localDate(value), null);
  assert.equal(dateString(localDate('2028-02-29')), '2028-02-29');
  assert.equal(dateString(plusDays(localDate('2026-10-31'), 2)), '2026-11-02');
});

test('copying makes a separate confirmed one-off without changing the source series', () => {
  const original = { id: 'a', title: 'Practice', startDate: '2026-10-01', endDate: '', start: '07:00', end: '08:00',
    recurrence: 'weekly', repeatInterval: 2, repeatDays: ['thu'], repeatUntil: '2027-01-01', status: 'cancelled',
    occurrenceDate: '2026-10-15', day: 'thu', attendees: ['Sam'], notes: '<script>not executable</script>' };
  const snapshot = JSON.stringify(original);
  const copy = copyForDate(original, '2026-10-17', 'copy-1');
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(copy.id, 'copy-1');
  assert.equal(copy.startDate, '2026-10-17');
  assert.equal(copy.recurrence, 'none');
  assert.equal(copy.status, 'confirmed');
  assert.deepEqual(copy.repeatDays, []);
  assert.equal(copy.repeatUntil, '');
  assert.equal(copy.start, '07:00');
  assert.equal(copy.occurrenceDate, undefined);
  assert.equal(copy.day, undefined);
  copy.attendees.push('Taylor');
  assert.deepEqual(original.attendees, ['Sam']);
  assert.throws(() => copyForDate(original, '2026-02-30', 'x'), /invalid-date/);
});

test('trip copies keep their calendar-day span through DST and year boundaries', () => {
  const trip = { id: 'trip', eventType: 'trip', startDate: '2026-10-31', endDate: '2026-11-03', recurrence: 'none', allDay: true };
  const copy = copyForDate(trip, '2026-12-30', 'new');
  assert.equal(copy.endDate, '2027-01-02');
  assert.equal(copy.allDay, true);
  assert.throws(() => copyForDate(trip, '9999-12-30', 'overflow'), /invalid-date/);
  const holiday = copyForDate({ id: 'holiday', startDate: '2026-10-31', isBuiltInHoliday: true, eventType: 'holiday', allDay: true }, '2026-11-01', 'custom');
  assert.equal(holiday.isBuiltInHoliday, undefined);
  assert.equal(holiday.eventType, 'holiday');
});

test('packing parser handles English/Chinese lists, deduplicates and bounds entries', () => {
  assert.deepEqual(packingItems('Water, cleats; WATER\n• Sunscreen，帽子；雨衣、毛巾'), ['Water', 'cleats', 'Sunscreen', '帽子', '雨衣', '毛巾']);
  assert.deepEqual(packingItems(null), []);
  assert.equal(packingItems(Array.from({ length: 100 }, (_, i) => `Item ${i}`).join(',')).length, 30);
  assert.notEqual(packingKey({ id: 'weekly', occurrenceDate: '2026-10-15' }), packingKey({ id: 'weekly', occurrenceDate: '2026-10-22' }));
  assert.equal(packingKey({ id: 'trip', eventType: 'trip', startDate: '2026-10-15', occurrenceDate: '2026-10-16' }), 'trip:2026-10-15');
});

test('personal helper storage sanitizes corrupted data and limits local storage growth', () => {
  assert.deepEqual(personalStore(null), { favorites: [], packed: {} });
  const result = personalStore({ favorites: ['a', 'a', 4, 'b'], packed: { valid: ['Water', 'Water', 2], bad: false } });
  assert.deepEqual(result, { favorites: ['a', 'b'], packed: { valid: ['Water'] } });
  const large = personalStore({ favorites: Array.from({ length: 600 }, (_, i) => `id${i}`), packed: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`key${i}`, ['Water']])) });
  assert.equal(large.favorites.length, 500);
  assert.equal(Object.keys(large.packed).length, 300);
});

test('30-day agenda uses upstream filtered occurrences, excludes cancelled and deduplicates trips', () => {
  const seenDates = [];
  const get = date => {
    const key = dateString(date); seenDates.push(key);
    if (key === '2026-10-15') return [
      { id: 'late', title: 'Later', start: '17:00' }, { id: 'early', title: 'Early', start: '08:00' },
      { id: 'holiday', title: 'Holiday', allDay: true }, { id: 'cancelled', status: 'cancelled' },
      { id: 'trip', eventType: 'trip', startDate: key, endDate: '2026-10-18' }];
    if (key === '2026-10-16') return [{ id: 'trip', eventType: 'trip', startDate: '2026-10-15', endDate: '2026-10-18' }];
    if (key === '2026-10-22') return [{ id: 'early', title: 'Early', start: '08:00' }];
    return [];
  };
  const agenda = agendaItems('2026-10-15', get);
  assert.equal(seenDates.length, 30);
  assert.equal(seenDates.at(-1), '2026-11-13');
  assert.equal(agenda[0].id, 'holiday');
  assert.equal(agenda.filter(item => item.id === 'trip').length, 1);
  assert.equal(agenda.filter(item => item.id === 'early').length, 2);
  assert(!agenda.some(item => item.id === 'cancelled'));
  assert.deepEqual(agendaItems('2026-10-15', get, ['early']).map(item => item.id), ['early', 'early']);
  assert.deepEqual(agendaItems('2026-10-15', get, []), []);
  assert.deepEqual(agendaItems('bad', get), []);
  assert.equal(agendaItems('9999-12-31', () => [{ id: 'x' }]).length, 1);
});

// Exercise the actual UI listeners with a small DOM fixture: no cloud account or real calendar is used.
function fixture() {
  const nodes = new Map();
  const storage = new Map();
  let failWrite = false;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, dataset: {}, handlers: {}, textContent: '', value: '', innerHTML: '', hidden: false,
      addEventListener(type, fn) { this.handlers[type] = fn; }, setAttribute(key, value) { this[key] = value; },
      querySelectorAll() { return []; }, querySelector() { return node('tablist'); }, remove() {},
      insertAdjacentHTML(_, text) { this.innerHTML += text; }, focus() {}, select() {}, close() { this.open = false; }, showModal() { this.open = true; } });
    return nodes.get(id);
  };
  const activity = { id: 'a', title: '<Practice>', child: 'Sam', startDate: '2026-10-15', start: '08:00', end: '09:00', items: 'Water, cleats' };
  const calls = [];
  const context = vm.createContext({ console, Date, Set, Map, JSON, Object, String, Number, Boolean,
    currentLanguage: 'en', selectedDate: localDate('2026-10-15'), scope: 'account1:family',
    state: { activities: [activity] }, window: {}, navigator: { clipboard: { writeText: async () => {} } },
    document: { getElementById: node, querySelectorAll: () => [], querySelector: () => null }, eventDetailsDialog: node('eventDetailsDialog'),
    localStorage: { getItem: key => storage.get(key) || null, setItem(key, value) { if (failWrite) throw Error('quota'); storage.set(key, value); } },
    escapeHtml: value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    dateKey: dateString, formatFullDate: dateString, formatShortDate: dateString,
    activityDateRangeText: () => '', eventTimeText: () => '8–9 AM', activityTitle: event => event.title, displayChild: event => event.child,
    occurrencesOnDate: () => [activity], activityOccursOn: () => true, findConflictPairs: () => [],
    makeId: () => 'copy', t: key => key, rememberCurrentSchedule: () => calls.push('history'),
    saveActivities: () => true, auditActivity: () => calls.push('audit'), renderAll: () => calls.push('render'), showEventDetails() {}
  });
  vm.runInContext('function scheduleStorageKey(name) { return scope + ":" + name; }', context);
  vm.runInContext(source, context);
  function attach() { context.window.KidsSyncTools.attach({ ...activity, occurrenceDate: '2026-10-15' }); }
  async function click(id) {
    const button = node(id);
    button.closest = () => node('eventUtilityPanel');
    await node('eventDetailsBody').handlers.click({ target: { closest: () => button } });
  }
  return { context, node, storage, activity, calls, attach, click, failWrite: value => { failWrite = value; } };
}

test('favorite and packing listeners persist by account/calendar, with honest quota failures', async () => {
  const f = fixture(); f.attach();
  assert.match(f.node('eventDetailsBody').innerHTML, /&lt;Practice&gt;|Packing checklist/);
  await f.click('favoriteEvent');
  assert.equal(f.node('favoriteEvent')['aria-pressed'], 'true');
  assert.deepEqual(JSON.parse(f.storage.get('account1:family:planner-helpers')).favorites, ['a']);
  const input = { matches: () => true, checked: true, dataset: { packingIndex: '0' } };
  f.node('eventDetailsBody').handlers.change({ target: input });
  assert.deepEqual(JSON.parse(f.storage.get('account1:family:planner-helpers')).packed['a:2026-10-15'], ['Water']);
  f.failWrite(true); await f.click('favoriteEvent');
  assert.equal(f.node('favoriteEvent')['aria-pressed'], 'true');
  assert.match(f.node('eventToolsStatus').textContent, /Could not save/);
  f.context.scope = 'account2:family'; await f.click('favoriteEvent');
  assert.equal(f.storage.size, 1);
  assert.match(f.node('eventToolsStatus').textContent, /calendar changed/);
});

test('copy listener uses normal save/audit, and rolls back when persistence fails', async () => {
  const f = fixture(); f.attach(); f.node('eventCopyDate').value = '2026-10-17';
  f.context.saveActivities = () => false;
  await f.click('createDatedEventCopy');
  assert.equal(f.context.state.activities.length, 1);
  assert(!f.calls.includes('audit'));
  assert.match(f.node('eventToolsStatus').textContent, /Could not save/);
  f.context.saveActivities = () => true;
  await f.click('createDatedEventCopy');
  assert.equal(f.context.state.activities.length, 2);
  assert.equal(f.context.state.activities[1].startDate, '2026-10-17');
  assert.equal(f.activity.startDate, '2026-10-15');
  assert(f.calls.includes('audit'));
  assert.match(f.node('eventToolsStatus').textContent, /Copy created/);
});

test('clipboard denial gives a selectable manual fallback and late results cannot affect a different event', async () => {
  const f = fixture(); f.attach();
  f.context.navigator.clipboard.writeText = async () => { throw Error('denied'); };
  await f.context.window.KidsSyncTools.copySummary();
  assert.equal(f.node('eventSummaryFallback').hidden, false);
  assert.match(f.node('eventSummaryFallback').value, /<Practice>/);
  assert.match(f.node('eventToolsStatus').textContent, /Select and copy/);
  let resolve;
  f.context.navigator.clipboard.writeText = () => new Promise(done => { resolve = done; });
  const task = f.context.window.KidsSyncTools.copySummary();
  f.context.eventDetailsDialog.handlers.close();
  f.node('eventToolsStatus').textContent = 'Different event';
  resolve(); await task;
  assert.equal(f.node('eventToolsStatus').textContent, 'Different event');
  assert.equal(f.node('eventDetailsCopy').disabled, false);
});

test('View date does not reopen Planner tools after an agenda event closes', () => {
  const f = fixture();
  f.node('openPlannerTools').handlers.click();
  assert.equal(f.node('plannerToolsDialog').open, true);
  f.node('plannerToolsResults').handlers.click({ target: { closest: () => ({ dataset: { toolsEvent: '0' } }) } });
  assert.equal(f.node('plannerToolsDialog').open, false);
  f.attach();
  f.node('eventDetailsLocate').handlers.click();
  f.node('eventDetailsDialog').handlers.close();
  assert.equal(f.node('plannerToolsDialog').open, false);
});

test('copy conflict warnings check hidden events too, rather than only the filtered agenda', async () => {
  const f = fixture(); f.attach();
  f.node('eventCopyDate').value = '2026-10-17';
  f.context.state.activities.push({ id: 'hidden', child: 'Sam', title: 'Hidden activity' });
  f.context.findConflictPairs = entries => {
    assert.equal(entries.length, 3);
    assert(entries.every(event => event.occurrenceDate === '2026-10-17'));
    return [[entries[1], entries[2]]];
  };
  await f.click('createDatedEventCopy');
  assert.match(f.node('eventToolsStatus').textContent, /overlaps another event for the same person/);
});

test('planner helper dictionaries match and integration keeps the main toolbar uncluttered', () => {
  const start = source.indexOf('  const words =');
  const end = source.indexOf('  const tx =', start);
  const words = vm.runInNewContext(source.slice(start, end) + '\nwords');
  assert.deepEqual(Object.keys(words.en).sort(), Object.keys(words.zh).sort());
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /class="more-actions-menu">[\s\S]*?id="openPlannerTools"/);
  assert.match(html, /window\.KidsSyncTools\?\.attach\(activity\)/);
  assert.match(html, /window\.KidsSyncTools\?\.refresh\(\)/);
  assert.match(html, /<script src="\.\/assets\/planner-tools.js"><\/script>\s*<script src="\.\/assets\/ui-features.js"><\/script>\s*<script src="\.\/assets\/smart-scheduling.js\?v=4"><\/script>\s*<script src="\.\/assets\/family-polls.js\?v=2"><\/script>/);
});
