const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tools = require('../mobile/src/calendar/planning');
const event = value => ({ id: 'school', title: 'School', startDate: '2026-11-04', start: '09:00', end: '10:00', ...value });
const now = new Date(2026, 10, 3, 8);
const scope = { userId: 'a', ownerId: 'owner', calendarId: 'family' };
const view = { date: '2026-11-04', view: 'week', query: 'school', person: 'all' };
function device() { const values = new Map(); return { values, getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } }; }
test('open time reuses website buffers and excludes holidays, cancelled and nonbusy events', () => {
  const events = [event({ bufferBeforeMinutes: 15, bufferAfterMinutes: 15 }), event({ id: 'holiday', isBuiltInHoliday: true, allDay: true }), event({ id: 'cancelled', allDay: true, status: 'cancelled' }), event({ id: 'free', allDay: true, externalBusy: false })];
  const before = JSON.stringify(events);
  const result = tools.openTime(events, { date: '2026-11-04', start: '08:00', end: '12:00', duration: 30, now });
  assert.deepEqual(result.map(item => [item.start, item.end]), [['08:00', '08:45'], ['10:15', '12:00']]);
  assert.equal(result[0].draft.end, '08:30'); assert.equal(JSON.stringify(events), before);
  assert.equal(tools.openTime([event({ allDay: true })], { date: '2026-11-04', now }).length, 0);
});
test('open time clips overnight spans and carries prior-day buffers across midnight', () => {
  const overnight = event({ startDate: '2026-11-03', endDate: '2026-11-04', start: '23:00', end: '02:00' });
  const result = tools.openTime([overnight], { date: '2026-11-04', start: '00:00', end: '04:00', duration: 30, now });
  assert.equal(result[0].start, '02:00');
  const previous = event({ startDate: '2026-11-03', start: '23:00', end: '23:50', bufferAfterMinutes: 30 });
  assert.equal(tools.openTime([previous], { date: '2026-11-04', start: '00:00', end: '02:00', duration: 30, now })[0].start, '00:20');
});
test('invalid windows fail and elapsed slots cannot become past or invalid end-of-day drafts', () => {
  assert.throws(() => tools.openTime([], { date: 'bad', now }), /INVALID_WINDOW/);
  assert.throws(() => tools.openTime([], { date: '2026-11-04', start: '20:00', end: '08:00', now }), /INVALID_WINDOW/);
  assert.deepEqual(tools.openTime([], { date: '2026-11-02', now }), []);
  assert.equal(tools.openTime([], { date: '2026-11-03', start: '08:00', end: '09:00', duration: 30, now })[0].start, '08:05');
  assert.deepEqual(tools.openTime([], { date: '2026-11-04', start: '23:30', end: '24:00', duration: 30, now }), []);
});
test('compare counts overlapping timed minutes only once and understands multi-day segments', () => {
  const result = tools.compareDay([event(), event({ id: 'second', start: '09:30', end: '11:00' }), event({ id: 'cancel', status: 'cancelled' })], '2026-11-04');
  assert.equal(result.count, 2); assert.equal(result.minutes, 120);
  assert.equal(tools.compareDay([event({ startDate: '2026-11-03', endDate: '2026-11-04', start: '23:00', end: '01:30' })], '2026-11-04').minutes, 90);
});
test('range search expands recurrence, honors exceptions and validates bounded date ranges', () => {
  const events = [event({ recurrence: 'daily', excludedDates: ['2026-11-05'], location: 'Gym', responsible: 'Alex' })];
  const result = tools.findEvents(events, '2026-11-04', '2026-11-06', 'gym alex');
  assert.deepEqual(result.map(item => item.occurrenceDate), ['2026-11-04', '2026-11-06']);
  assert.throws(() => tools.findEvents(events, '2026-11-04', '2028-01-01', ''), /INVALID_RANGE/);
});
test('weekly sharing contains all seven days, honors week start and includes private details only by choice', () => {
  const events = [event({ notes: 'private event note', items: 'Water' })];
  const plain = tools.weekAgenda(events, '2026-11-04');
  assert(plain.includes('Monday')); assert(plain.includes('Sunday')); assert(!plain.includes('private event note')); assert(!plain.includes('Water'));
  const detail = tools.weekAgenda(events, '2026-11-04', { includeDetails: true }); assert(detail.includes('Water')); assert(detail.includes('private event note'));
  assert.match(tools.weekAgenda(events, '2026-11-04', { language: 'zh', firstDay: 0 }), /每周安排/);
});
test('personal notes/views persist, serialize concurrent saves and isolate account AND owner', async () => {
  const storage = device(), store = tools.createPlanningStore(storage, scope);
  await Promise.all([store.saveNote('2026-11-04', 'Private day note'), store.saveView('School week', view)]);
  const reopened = await tools.createPlanningStore(storage, scope).read();
  assert.equal(reopened.notes['2026-11-04'], 'Private day note'); assert.equal(reopened.views[0].query, 'school');
  for (const changed of [{ userId: 'b' }, { ownerId: 'other' }, { calendarId: 'other' }]) assert.deepEqual((await tools.createPlanningStore(storage, { ...scope, ...changed }).read()).views, []);
  await store.saveNote('2026-11-04', ''); await store.removeView('School week'); assert.deepEqual(await store.read(), { version: 1, notes: {}, views: [] });
});
test('personal storage corruption and write failures preserve existing records and limits', async () => {
  const storage = device(), store = tools.createPlanningStore(storage, scope);
  for (let i = 0; i < 8; i++) await store.saveView(String(i), view);
  await assert.rejects(store.saveView('ninth', view), /VIEW_LIMIT/);
  await store.saveView('0', { ...view, view: 'month' }); assert.equal((await store.read()).views.length, 8);
  const before = storage.values.get(store.key); storage.setItem = async () => { throw new Error('disk full'); };
  await assert.rejects(store.saveNote('2026-11-04', 'keep draft'), /disk full/); assert.equal(storage.values.get(store.key), before);
  storage.values.set(store.key, 'broken'); await assert.rejects(store.read(), /INVALID_STORED/); assert.equal(storage.values.get(store.key), 'broken');
  assert.throws(() => tools.createPlanningStore(storage, { ...scope, userId: '' }), /INVALID_SCOPE/);
  await assert.rejects(store.saveNote('2026-02-30', 'bad'), /INVALID_NOTE/);
});
test('planning tools are bilingual, theme-aware and wired to native calendar with safe unsaved drafts', () => {
  const source = fs.readFileSync(require.resolve('../mobile/src/calendar/PlanningTools.js'), 'utf8');
  const copy = vm.runInNewContext(`(${source.match(/export const planningCopy = (\{[^]*?\n\});/)[1]})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh)); assert.equal(copy.en.modes.length, 6); assert.equal(copy.zh.modes.length, 6);
  assert.match(source, /useThemeStyles\(createStyles\)/); assert.match(source, /if \(dirty\) setDiscard\(true\)/);
  assert.match(source, /Share.share\(\{ message: agenda \}\)/);
  assert.match(source, /editable=\{!!data && !busy && validDay\}/, 'an incomplete note date cannot strand a dirty draft');
  assert.match(source, /invalid = mode !== 'views' && !validDay/);
  const screen = fs.readFileSync(require.resolve('../mobile/src/calendar/CalendarScreen.js'), 'utf8');
  assert.match(screen, /PlanningTools key=\{scopeId\}/); assert.match(screen, /open\('new', \{ initialDraft: draft \}\)/);
  assert.match(screen, /initialDraft=\{sheet.type === 'new'/);
});
test('iOS tools, planning and editor keep one native sheet, including dirty-note and in-flight save guards', () => {
  const screen = fs.readFileSync(require.resolve('../mobile/src/calendar/CalendarScreen.js'), 'utf8');
  const panel = fs.readFileSync(require.resolve('../mobile/src/calendar/PlanningTools.js'), 'utf8');
  const toolbox = fs.readFileSync(require.resolve('../mobile/src/ui/CalendarToolbox.js'), 'utf8');
  // Separate sibling Modal hosts caused the planning screen to disappear from
  // the actual iPhone accessibility tree during tools -> planning replacement.
  assert.equal((screen.match(/<Sheet\b/g) || []).length, 1);
  assert.match(screen, /<Sheet visible=\{!!sheet\}/);
  assert.match(screen, /<CalendarToolbox embedded/);
  assert.match(screen, /<PlanningTools key=\{scopeId\} embedded onDirtyChange=\{onDirtyChange\} onBusyChange=\{setPlanningBusy\}/);
  assert.match(screen, /if \(busy \|\| planningBusy\) return/);
  assert.match(screen, /\['new', 'edit', 'planning', 'comments'\]\.includes\(sheet\?\.type\) && draftDirty\.current/);
  for (const source of [panel, toolbox]) {
    assert.match(source, /embedded = false/);
    assert.match(source, /return embedded \? content : <Sheet/);
  }
  const ui = fs.readFileSync(require.resolve('../mobile/src/calendar/ui.js'), 'utf8');
  assert.match(ui, /visible = true/);
  assert.match(ui, /<Modal visible=\{visible\}/);
});
