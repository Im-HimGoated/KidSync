const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const calendar = require('../mobile/src/lib/calendar');
const form = require('../mobile/src/lib/event-form');
const model = require('../mobile/src/calendar/model');
const event = extra => ({ id: 7, title: 'Family trip', child: '__family__', startDate: '2026-10-30', endDate: '2026-11-01',
  start: '21:00', end: '07:00', recurrence: 'weekly', repeatDays: [5], repeatInterval: 1, ...extra });
const clone = value => JSON.parse(JSON.stringify(value));

test('multi-day recurrence resolves the actual series start and applies exclusions to that whole occurrence', () => {
  const source = event({ repeatUntil: '2026-11-06', excludedDates: ['2026-10-30'] });
  assert.deepEqual(calendar.occurrencesForDate(source, '2026-11-01'), []);
  assert.deepEqual(calendar.occurrencesForDate(source, '2026-11-08'), [{ date: '2026-11-08', startDate: '2026-11-06',
    endDate: '2026-11-08', spanDays: 2, isStart: false, isEnd: true }]);
  assert.deepEqual(calendar.occurrencesForDate(source, '2026-11-13'), []);
  const long = event({ startDate: '2025-01-01', endDate: '2027-01-01', recurrence: 'none' });
  assert.equal(calendar.eventsForDate([long], calendar.parseDateKey('2026-10-30'))[0], long);
});

test('overlapping multi-day occurrences stay explicit rather than silently choosing an anchor', () => {
  const source = event({ recurrence: 'daily', endDate: '2026-11-01' });
  assert.deepEqual(calendar.occurrencesForDate(source, '2026-11-01').map(item => item.startDate),
    ['2026-10-30', '2026-10-31', '2026-11-01']);
  const layout = model.layoutDay([source], { date: '2026-11-01' });
  assert.equal(layout.timed.length, 3);
  assert.deepEqual(new Set(layout.timed.map(item => item.occurrenceStartDate)), new Set(['2026-10-30', '2026-10-31', '2026-11-01']));
  assert(layout.timed.every(item => item.event === source));
});

test('timed multi-day segments use start-day, full middle-day and end-day bounds without inventing gaps', () => {
  const source = event({ recurrence: 'none' });
  const expected = [['2026-10-30', 1260, 1440, false, true], ['2026-10-31', 0, 1440, true, true],
    ['2026-11-01', 0, 420, true, false]];
  for (const [date, start, end, before, after] of expected) {
    const segment = calendar.daySegment(source, date);
    assert.equal(segment.start, start); assert.equal(segment.end, end);
    assert.equal(segment.continuesBefore, before); assert.equal(segment.continuesAfter, after);
    const layout = model.layoutDay([source], { date });
    assert.equal(layout.timed[0].start, start); assert.equal(layout.timed[0].end, end);
  }
  const breakfast = event({ id: 8, title: 'Breakfast', startDate: '2026-11-01', endDate: '', recurrence: 'none', start: '06:00', end: '07:00' });
  assert.deepEqual(model.sortAgenda([breakfast, source], '2026-11-01'), [source, breakfast]);
  assert.equal(calendar.daySegment(source, '2026-11-02'), null);
  const midnight = { ...source, endDate: '2026-10-31', end: '00:00' };
  assert.equal(calendar.eventsForDate([midnight], calendar.parseDateKey('2026-10-30')).length, 1);
  assert.equal(calendar.eventsForDate([midnight], calendar.parseDateKey('2026-10-31')).length, 0);
  assert.equal(calendar.eventsForDate([{ ...midnight, allDay: true }], calendar.parseDateKey('2026-10-31')).length, 1);
});

test('overnight clocks require an explicit later end date and retain unknown timezone metadata', () => {
  const values = { title: 'Overnight train', date: '2026-10-30', endDate: '2026-10-31', start: '23:30', end: '04:15' };
  assert.deepEqual(form.validateEventForm(null, values), {});
  assert.equal(form.validateEventForm(null, { ...values, endDate: '2026-10-30' }).end, 'endAfterStart');
  assert.equal(form.validateEventForm(null, { ...values, endDate: '2026-02-30' }).endDate, 'endDateInvalid');
  const result = form.buildEvent({ id: 3, timeZone: 'Asia/Shanghai', unknown: { keep: true } }, values);
  assert.equal(result.event.timeZone, 'Asia/Shanghai'); assert.deepEqual(result.event.unknown, { keep: true });
});

test('occurrence drafts shift inclusive spans, preserve unknown metadata and materialize legacy weekdays', () => {
  const source = event({ excludedDates: ['2026-10-23'], timeZone: 'Pacific/Auckland', future: { keep: true } }), before = clone(source);
  const draft = model.occurrenceDraft(source, '2026-11-06');
  assert.equal(draft.id, 7); assert.equal(draft.startDate, '2026-11-06'); assert.equal(draft.endDate, '2026-11-08');
  assert.equal(draft.recurrence, 'none'); assert.deepEqual(draft.excludedDates, []);
  assert.equal(draft.timeZone, source.timeZone); assert.deepEqual(draft.future, source.future);
  assert.notEqual(draft.future, source.future); assert.deepEqual(source, before);
  const legacy = { id: 'old', title: 'Piano', day: 'monday', start: '15:00', end: '16:00' };
  assert.equal(model.occurrenceDraft(legacy, '2026-11-02').startDate, '2026-11-02');
  assert.equal(model.occurrenceDraft(legacy, '2026-11-02').day, undefined);
  assert.throws(() => model.occurrenceDraft(source, '2026-11-07'), { code: 'INVALID_OCCURRENCE' });
  assert.throws(() => model.occurrenceDraft({ ...source, externalSource: 'google' }, '2026-11-06'), { code: 'INVALID_OCCURRENCE' });
});

test('one-occurrence changes produce atomic original checks and never change the caller series', () => {
  const source = event({ excludedDates: ['2026-10-23'], future: { keep: 1 } }), before = clone(source);
  const edited = { ...model.occurrenceDraft(source, '2026-11-06'), title: 'Changed trip', startDate: '2026-11-07',
    endDate: '2026-11-09', recurrence: 'daily' };
  const plan = model.planOccurrenceChange(source, '2026-11-06', { event: edited, id: 'detached' });
  assert.equal(plan.changes.length, 2); assert.equal(plan.changes[0].original, source);
  assert.deepEqual(plan.changes[0].event.excludedDates, ['2026-10-23', '2026-11-06']);
  assert.equal(plan.changes[1].original, null); assert.equal(plan.changes[1].event.id, 'detached');
  assert.equal(plan.changes[1].event.recurrence, 'none'); assert.equal(plan.changes[1].event.startDate, '2026-11-07');
  assert.deepEqual(plan.changes[1].event.future, { keep: 1 }); assert.deepEqual(plan.changes[1].event.repeatDays, []);
  assert.equal(model.planOccurrenceChange(source, '2026-11-06', { remove: true }).changes.length, 1);
  assert.throws(() => model.planOccurrenceChange(source, '2026-11-06', { event: edited, id: source.id }), { code: 'INVALID_OCCURRENCE' });
  assert.throws(() => model.planOccurrenceChange(source, '2026-10-23', { remove: true }), { code: 'INVALID_OCCURRENCE' });
  assert.deepEqual(source, before);
});

test('occurrence actions and undo use one injected atomic mutation and publish only confirmed results', async () => {
  const calls = [], published = [], client = {}, source = event();
  const row = { schedule: { keep: true }, undoToken: { token: 'undo-1' } };
  const activityActions = {
    async mutateActivities(...args) { calls.push(args); return row; },
    async restoreActivities(...args) { calls.push(args); return { schedule: { restored: true } }; }
  };
  const actions = model.createCalendarActions({ client, userId: 'owner', activityActions, onSchedule: value => published.push(value) });
  const result = await actions.saveOccurrence('family', source, '2026-11-06', model.occurrenceDraft(source, '2026-11-06'));
  assert.equal(result, row); assert.equal(calls.length, 1); assert.equal(calls[0][3].length, 2);
  assert.deepEqual(calls[0].slice(0, 3), [client, 'owner', 'family']);
  await actions.removeOccurrence('family', source, '2026-11-06'); assert.equal(calls[1][3].length, 1);
  await actions.restore('family', row.undoToken); assert.equal(calls[2][3], row.undoToken); assert.equal(published.length, 3);
  activityActions.mutateActivities = async () => { throw Object.assign(new Error('changed'), { code: 'CONFLICT' }); };
  await assert.rejects(actions.removeOccurrence('family', source, '2026-11-06'), { code: 'CONFLICT' });
  assert.equal(published.length, 3);
});

test('occurrence dates, shifted spans and exclusions remain local-calendar values across timezones and DST', () => {
  const source = `const a=require(${JSON.stringify(require.resolve('../mobile/src/lib/calendar'))});
const m=require(${JSON.stringify(require.resolve('../mobile/src/calendar/model'))});
const e={id:7,title:'Trip',startDate:'2026-03-06',endDate:'2026-03-09',start:'23:00',end:'06:00',recurrence:'weekly',repeatDays:[5]};
const d=m.occurrenceDraft(e,'2026-10-30');
process.stdout.write(JSON.stringify([a.occurrencesForDate(e,'2026-03-09').map(x=>x.startDate),d.startDate,d.endDate,a.daySegment(e,'2026-03-08').start,a.daySegment(e,'2026-03-08').end]));`;
  for (const TZ of ['America/Los_Angeles', 'America/New_York', 'Australia/Sydney', 'Pacific/Kiritimati', 'UTC']) {
    assert.deepEqual(JSON.parse(execFileSync(process.execPath, ['-e', source], { env: { ...process.env, TZ }, encoding: 'utf8' })),
      [['2026-03-06'], '2026-10-30', '2026-11-02', 0, 1440], TZ);
  }
});
