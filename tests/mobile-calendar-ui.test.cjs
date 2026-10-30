const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDisplayPreferences, startOfDisplayWeek, displayMonthDays, movePeriod,
  filterActivities, timeMinutes, sortAgenda, layoutDay, initialEventForm, buildCalendarEvent, createCalendarActions,
} = require('../mobile/src/calendar/model');
const { dateKey, parseDateKey, eventsForDate } = require('../mobile/src/lib/calendar');

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const kids = [{ id: 'kid-mia', name: 'Mia', palette: 'purple' }, { id: 7, name: 'Oliver', palette: 'green' }];
const activity = extra => ({ id: 42, title: 'Soccer', child: 'Oliver', startDate: '2026-10-29',
  start: '15:30', end: '16:30', allDay: false, recurrence: 'none', ...extra });
const snapshot = () => ({ version: 2, activeCalendarId: 'home', calendars: [{ id: 'home', name: 'Home' }],
  kids, activities: [activity()], futureRoot: { keep: true },
  calendarData: { home: { kids, activities: [activity()], futureData: { retain: 'yes' } } } });

function fakeClient(initial = { schedule: snapshot(), updated_at: '2026-10-29T10:00:00.000Z' }, options = {}) {
  const state = { row: clone(initial), auths: 0, reads: 0, writes: [], inserts: [] };
  return {
    state,
    auth: { async getUser() { state.auths++; return { data: { user: { id: 'owner-1' } }, error: null }; } },
    from(table) {
      assert.equal(table, 'family_schedules');
      let operation = 'read', payload;
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        update(value) { operation = 'update'; payload = clone(value); return query; },
        insert(value) { operation = 'insert'; payload = clone(value); return query; },
        async maybeSingle() {
          if (operation === 'read') {
            state.reads++; options.onRead?.(state);
            assert.equal(filters.user_id, 'owner-1');
            return { data: clone(state.row), error: null };
          }
          if (operation === 'insert') {
            state.inserts.push(payload);
            if (state.row) return { data: null, error: { code: '23505' } };
            state.row = { schedule: payload.schedule, updated_at: payload.updated_at };
            return { data: clone(state.row), error: null };
          }
          state.writes.push({ filters, payload }); options.onPatch?.(state);
          if (options.failure) return { data: null, error: options.failure };
          if (filters.user_id !== 'owner-1' || filters.updated_at !== state.row?.updated_at) return { data: null, error: null };
          state.row = payload;
          return { data: clone(state.row), error: null };
        },
      };
      return query;
    },
  };
}

test('saved display choices determine opening view, first weekday, visible hours and new reminder metadata', () => {
  assert.deepEqual(normalizeDisplayPreferences({ people: 'children', view: 'week', week: 'sunday', hours: 'afternoon', reminders: '30' }),
    { people: 'children', view: 'week', firstDay: 0, initialHour: 12, defaultReminderMinutes: 30 });
  assert.equal(normalizeDisplayPreferences({ view: 'today', hours: 'morning', reminders: 'start' }).view, 'agenda');
  assert.equal(normalizeDisplayPreferences({ hours: 'morning', reminders: 'start' }).initialHour, 6);
  assert.equal(normalizeDisplayPreferences({ hours: 'evening', reminders: '10' }).initialHour, 18);
  assert.equal(normalizeDisplayPreferences({ reminders: '10' }).defaultReminderMinutes, 10);
  for (const bad of [null, undefined, 'week', { people: 'invalid', view: 'invalid', week: 8, hours: 'night', reminders: 'danger' }]) {
    assert.deepEqual(normalizeDisplayPreferences(bad), { people: 'family', view: 'agenda', firstDay: 1, initialHour: 8, defaultReminderMinutes: null });
  }
});

test('normalized preference objects remain usable by form and grid helpers', () => {
  const normalized = normalizeDisplayPreferences({ view: 'month', week: 'sunday', hours: 'afternoon', reminders: '10' });
  assert.deepEqual(normalizeDisplayPreferences(normalized), normalized);
  assert.equal(initialEventForm(null, parseDateKey('2026-10-29'), normalized).reminderMinutes, 10);
});

test('Sunday/Monday week starts and 42-day month grids cross year boundaries without mutating dates', () => {
  const input = parseDateKey('2027-01-01'), before = input.getTime();
  assert.equal(dateKey(startOfDisplayWeek(input, 0)), '2026-12-27');
  assert.equal(dateKey(startOfDisplayWeek(input, 1)), '2026-12-28');
  const sunday = displayMonthDays(input, 0), monday = displayMonthDays(input, 1);
  assert.equal(sunday.length, 42); assert.equal(monday.length, 42);
  assert.equal(sunday[0].getDay(), 0); assert.equal(monday[0].getDay(), 1);
  assert.equal(new Set(sunday.map(dateKey)).size, 42);
  assert.equal(input.getTime(), before);
  assert.deepEqual(displayMonthDays(new Date(NaN)), []);
});

test('previous/next periods use local dates and clamp month ends, including leap years', () => {
  const first = parseDateKey('2027-01-31');
  assert.equal(dateKey(movePeriod(first, 'month', 1)), '2027-02-28');
  assert.equal(dateKey(movePeriod(parseDateKey('2028-01-31'), 'month', 1)), '2028-02-29');
  assert.equal(dateKey(movePeriod(first, 'month', -1)), '2026-12-31');
  assert.equal(dateKey(movePeriod(first, 'week', 1)), '2027-02-07');
  assert.equal(dateKey(movePeriod(first, 'agenda', -1)), '2027-01-30');
  assert.equal(dateKey(first), '2027-01-31');
  assert.equal(dateKey(movePeriod(first, 'month', Infinity)), '');
});

test('person and search filters include family plans and resolve child IDs without altering raw activities', () => {
  const family = activity({ id: 'family', title: 'Dinner', child: '__family__', responsible: 'Dad' });
  const mia = activity({ id: 'mia', title: 'PIANO', child: 'kid-mia', location: 'Willow Studio' });
  const oliver = activity({ child: 7, items: 'Water bottle', notes: '北门接送' });
  const input = [family, mia, oliver], before = clone(input);
  assert.deepEqual(filterActivities(input, kids, { person: 'Mia' }), [family, mia]);
  assert.deepEqual(filterActivities(input, kids, { person: 'Oliver', query: 'water' }), [oliver]);
  // A family activity includes Mia too, so searching her name keeps that plan.
  assert.deepEqual(filterActivities(input, kids, { query: 'mia' }), [family, mia]);
  assert.deepEqual(filterActivities(input, kids, { query: 'ｗｉｌｌｏｗ' }), [mia]);
  assert.deepEqual(filterActivities(input, kids, { query: '北门' }), [oliver]);
  assert.equal(filterActivities(input, kids, { query: 'dad' })[0], family);
  assert.deepEqual(input, before);
  assert.deepEqual(filterActivities(null), []);
});

test('strict grid times reject malformed hours and missing intervals instead of rendering activities off screen', () => {
  assert.equal(timeMinutes('00:00'), 0); assert.equal(timeMinutes('23:59'), 1439);
  for (const value of ['24:00', '25:00', '08:90', '-1:30', '9:00', '12', '', null]) assert.equal(timeMinutes(value), null);
  const all = activity({ id: 'all', allDay: true });
  const missing = activity({ id: 'missing', end: '' });
  const reversed = activity({ id: 'reversed', start: '18:00', end: '17:00' });
  const invalid = activity({ id: 'invalid', start: '25:00', end: '26:00' });
  const valid = activity();
  const layout = layoutDay([all, missing, reversed, invalid, valid]);
  assert.deepEqual(layout.allDay, [all]);
  assert.deepEqual(layout.untimed, [missing, reversed, invalid]);
  assert.equal(layout.timed.length, 1); assert.equal(layout.timed[0].event, valid);
  assert.equal(layout.timed[0].top, 930);
});

test('agenda orders all-day and chronological starts before same-time importance, retaining raw cancelled events', () => {
  const allLow = activity({ id: 'all-low', title: 'All low', allDay: true, start: '', end: '', importance: 'low' });
  const allHigh = activity({ id: 'all-high', title: 'All high', allDay: true, start: '', end: '', importance: 'high' });
  const earlyLow = activity({ id: 'early', start: '14:00', end: '15:00', importance: 'low' });
  const lateHigh = activity({ id: 'late', start: '17:00', end: '18:00', importance: 'high' });
  const normal = activity({ id: 'normal', title: 'Beta', importance: 'normal' });
  const unknown = activity({ id: 'unknown', title: 'Alpha', importance: 'future-value' });
  const low = activity({ id: 'low', title: 'A low', importance: 'low' });
  const high = activity({ id: 'high', title: 'Zulu', importance: 'high' });
  const cancelled = activity({ id: 99, title: 'Alpha', importance: 'high', status: 'cancelled' });
  const untimed = activity({ id: 'untimed', start: '', end: '', importance: 'high' });
  const input = [lateHigh, normal, low, allLow, unknown, high, earlyLow, cancelled, allHigh, untimed], before = clone(input);
  const result = sortAgenda(input);
  assert.deepEqual(result.map(event => event.id), ['all-high', 'all-low', 'early', 99, 'high', 'unknown', 'normal', 'low', 'late', 'untimed']);
  assert.equal(result[3], cancelled); assert.equal(result[3].status, 'cancelled');
  assert.deepEqual(input, before);
});

test('identical agenda ties remain stable, including unknown importance treated as normal', () => {
  const first = activity({ id: 1, title: 'Same', importance: 'normal' });
  const second = activity({ id: 2, title: 'Same', importance: 'unexpected' });
  const third = activity({ id: 3, title: 'Same' });
  assert.deepEqual(sortAgenda([second, third, first]), [second, third, first]);
  assert.deepEqual(sortAgenda(null), []);
});

test('same-start grid events put high importance in the first lane without changing times or displayed bounds', () => {
  const low = activity({ id: 'low', importance: 'low', start: '15:00', end: '15:30' });
  const normal = activity({ id: 'normal', importance: 'future-value', start: '15:00', end: '16:00' });
  const high = activity({ id: 'high', importance: 'high', start: '15:00', end: '17:00', status: 'cancelled' });
  const earlier = activity({ id: 'earlier', importance: 'low', start: '14:00', end: '14:30' });
  const input = [low, normal, high, earlier], before = clone(input);
  const layout = layoutDay(input);
  assert.deepEqual(layout.timed.map(item => item.event.id), ['earlier', 'high', 'normal', 'low']);
  const highBlock = layout.timed.find(item => item.event === high);
  const normalBlock = layout.timed.find(item => item.event === normal);
  const lowBlock = layout.timed.find(item => item.event === low);
  assert.equal(highBlock.lane, 0); assert.equal(normalBlock.lane, 1); assert.equal(lowBlock.lane, 2);
  for (const item of [highBlock, normalBlock, lowBlock]) {
    assert.equal(item.top, 900); assert.equal(item.start, 900); assert.equal(item.lanes, 3);
    assert.equal(item.height, item.end - item.start);
  }
  assert.equal(highBlock.end, 1020); assert.equal(highBlock.height, 120);
  assert.equal(highBlock.event.status, 'cancelled'); assert.deepEqual(input, before);
});

test('minimum-height short events receive disjoint visual lanes and independent later groups use full width', () => {
  const first = activity({ id: 'a', start: '15:00', end: '15:05' });
  const second = activity({ id: 'b', start: '15:05', end: '15:10' });
  const later = activity({ id: 'c', start: '17:00', end: '18:00' });
  const layout = layoutDay([later, second, first], { hourHeight: 60, minHeight: 30 });
  assert.deepEqual(layout.timed.map(item => item.event.id), ['a', 'b', 'c']);
  assert.equal(layout.timed[0].lanes, 2); assert.equal(layout.timed[1].lanes, 2);
  assert.notEqual(layout.timed[0].lane, layout.timed[1].lane);
  assert.equal(layout.timed[2].lanes, 1);
});

test('overlap grouping uses displayed bounds, preserves numeric IDs and includes late-night minimum-height blocks', () => {
  const events = [activity({ id: 1, start: '12:00', end: '13:00' }), activity({ id: 2, start: '12:30', end: '13:30' }),
    activity({ id: 3, start: '13:15', end: '14:00' }), activity({ id: 4, start: '23:58', end: '23:59' })];
  const layout = layoutDay(events);
  assert.equal(layout.timed[0].lanes, 2);
  assert.equal(layout.timed[1].lanes, 2);
  assert.equal(layout.timed[2].lane, layout.timed[0].lane);
  assert.equal(layout.timed[3].event.id, 4);
  assert.ok(layout.height >= layout.timed[3].top + layout.timed[3].height);
  assert.ok(layout.height > 1440);
});

test('new form defaults initialize reminder metadata without adding sample data or changing selected dates', () => {
  const date = parseDateKey('2026-10-29');
  const form = initialEventForm(null, date, { reminders: '30' });
  assert.equal(form.date, '2026-10-29'); assert.equal(form.title, '');
  assert.equal(form.child, '__family__'); assert.equal(form.reminderMinutes, 30);
  assert.deepEqual(form.repeatDays, [4]);
  const result = buildCalendarEvent(null, { ...form, title: 'Library', responsible: ' Dad ', items: ' Book bag ', importance: 'high' }, [], { reminders: '10' });
  assert.equal(result.error, null);
  assert.equal(result.event.reminderMinutes, 30);
  assert.equal(result.event.responsible, 'Dad'); assert.equal(result.event.items, 'Book bag');
  assert.equal(result.event.importance, 'high'); assert.ok(result.event.id);
  assert.equal(dateKey(date), '2026-10-29');
});

test('new event preference reminder applies only when the user has not explicitly changed it', () => {
  const form = { title: 'Breakfast', date: '2026-10-29', start: '08:00', end: '09:00' };
  assert.equal(buildCalendarEvent(null, form, [], { reminders: 'start' }).event.reminderMinutes, 0);
  assert.equal(buildCalendarEvent(null, { ...form, reminderMinutes: null }, [], { reminders: '30' }).event.reminderMinutes, null);
  assert.equal(buildCalendarEvent(null, { ...form, reminderMinutes: '10' }, [], { reminders: '30' }).event.reminderMinutes, 10);
});

test('opening an existing all-day or untimed event never invents missing clock times', () => {
  const allDay = initialEventForm({ id: 1, title: 'Holiday', allDay: true, startDate: '2026-10-29' }, parseDateKey('2026-10-29'));
  assert.equal(allDay.start, ''); assert.equal(allDay.end, '');
  const untimed = initialEventForm({ id: 2, title: 'Legacy', startDate: '2026-10-29', start: '17:00' }, parseDateKey('2026-10-29'));
  assert.equal(untimed.start, '17:00'); assert.equal(untimed.end, '');
});

test('edits retain unknown metadata, raw IDs, cancellations and recurrence exclusions; defaults never reset reminders', () => {
  const original = activity({ status: 'cancelled', reminderMinutes: 45, responsible: 'R'.repeat(90), items: 'I'.repeat(200),
    recurrence: 'weekly', repeatDays: [4], excludedDates: ['2026-11-05'], future: { extensive: Array.from({ length: 1000 }, (_, i) => ({ i })) } });
  const before = clone(original);
  const result = buildCalendarEvent(original, { title: 'Renamed soccer' }, kids, { reminders: '10' });
  assert.equal(result.error, null);
  assert.equal(result.event.id, 42); assert.equal(result.event.status, 'cancelled');
  assert.equal(result.event.reminderMinutes, 45); assert.equal(result.event.responsible, original.responsible); assert.equal(result.event.items, original.items);
  assert.deepEqual(result.event.future, original.future); assert.deepEqual(result.event.excludedDates, ['2026-11-05']);
  assert.deepEqual(original, before);
  const withoutReminder = activity();
  assert.equal(Object.hasOwn(buildCalendarEvent(withoutReminder, { title: 'Edited' }, kids, { reminders: '30' }).event, 'reminderMinutes'), false);
});

test('extra form validation rejects invalid metadata while retaining existing builder date/time/child validation', () => {
  const form = { title: 'Piano', date: '2026-10-29', start: '15:00', end: '14:00', child: 'Unknown',
    responsible: 'R'.repeat(61), items: 'I'.repeat(161), importance: 'extreme', reminderMinutes: 15 };
  const result = buildCalendarEvent(null, form, kids);
  assert.equal(result.event, null);
  for (const field of ['end', 'child', 'responsible', 'items', 'importance', 'reminderMinutes']) assert.ok(result.errors[field], field);
  assert.equal(buildCalendarEvent(activity({ externalSource: 'google' }), { title: 'Changed' }, kids).errors.event, 'eventReadOnly');
});

test('display-preference form edits retain legacy weekday selection before explicit migration', () => {
  const form = initialEventForm({ id: 'legacy', title: 'Practice', day: 'monday', start: '15:00', end: '16:00' }, parseDateKey('2026-10-29'));
  assert.equal(form.recurrence, 'weekly'); assert.deepEqual(form.repeatDays, [1]);
});

test('calendar actions use real backend adapters and publish saved rows only after success', async () => {
  const client = fakeClient(), received = [];
  const actions = createCalendarActions({ client, userId: 'owner-1', onSchedule: value => received.push(value) });
  assert.equal(client.state.auths, 0); assert.equal(client.state.inserts.length, 0);
  const form = buildCalendarEvent(null, { id: 'new', title: 'Library', date: '2026-10-29', start: '17:00', end: '18:00', responsible: 'Dad', items: 'Books', importance: 'high' }, kids, { reminders: '10' });
  const row = await actions.save('home', form.event);
  assert.equal(received.length, 1); assert.equal(received[0], row);
  const stored = row.schedule.calendarData.home.activities.find(item => item.id === 'new');
  assert.equal(stored.reminderMinutes, 10); assert.equal(stored.responsible, 'Dad');
  assert.equal(row.schedule.futureRoot.keep, true); assert.equal(row.schedule.calendarData.home.futureData.retain, 'yes');
  assert.equal(eventsForDate(row.schedule.calendarData.home.activities, parseDateKey('2026-10-29')).length, 2);
  await actions.remove('home', 'new', stored);
  assert.equal(received.length, 2);
  assert.equal(client.state.row.schedule.calendarData.home.activities.length, 1);
  assert.equal(client.state.row.schedule.calendarData.home.activities[0].id, 42);
});

test('explicit create-calendar action emits the new row before selecting the created calendar', async () => {
  const client = fakeClient(null), calls = [];
  const actions = createCalendarActions({ client, userId: 'owner-1', onSchedule: row => calls.push(['row', row]), onSelectCalendar: id => calls.push(['select', id]) });
  const row = await actions.create('Our family');
  assert.equal(calls[0][0], 'row'); assert.deepEqual(calls[1], ['select', row.calendarId]);
  assert.deepEqual(row.schedule.calendarData[row.calendarId].activities, []);
  assert.deepEqual(row.schedule.calendarData[row.calendarId].kids, []);
  assert.equal(client.state.inserts.length, 1);
});

test('conflicting server changes never publish success or replace the authoritative row', async () => {
  const client = fakeClient(undefined, { onPatch(state) { state.row.updated_at = '2026-10-29T11:00:00.000Z'; state.row.schedule.futureRoot.newWebData = true; } });
  const received = [];
  const actions = createCalendarActions({ client, userId: 'owner-1', onSchedule: row => received.push(row) });
  await assert.rejects(actions.save('home', activity({ id: 'new', title: 'New plan' })), { code: 'CONFLICT' });
  assert.deepEqual(received, []); assert.equal(client.state.row.schedule.futureRoot.newWebData, true);
  assert.equal(client.state.row.schedule.calendarData.home.activities.length, 1);
});

test('account-scope checks suppress stale notifications and prevent new writes after account switching', async () => {
  let current = true;
  const client = fakeClient(undefined, { onPatch() { current = false; } });
  const received = [];
  const actions = createCalendarActions({ client, userId: 'owner-1', isCurrent: () => current, onSchedule: row => received.push(row) });
  await assert.rejects(actions.save('home', activity({ id: 'new' })), { code: 'STALE_SCOPE' });
  assert.equal(client.state.writes.length, 1); assert.deepEqual(received, []);
  await assert.rejects(actions.create('Should not exist'), { code: 'STALE_SCOPE' });
  assert.equal(client.state.inserts.length, 0);
});

test('duplicate action taps cannot issue concurrent owner mutations', async () => {
  const client = fakeClient(), actions = createCalendarActions({ client, userId: 'owner-1' });
  const first = actions.save('home', activity({ id: 'first' }));
  await assert.rejects(actions.save('home', activity({ id: 'second' })), { code: 'BUSY' });
  await first;
  assert.equal(client.state.writes.length, 1);
  assert.equal(client.state.row.schedule.calendarData.home.activities.at(-1).id, 'first');
});
