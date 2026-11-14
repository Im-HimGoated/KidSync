const test = require('node:test');
const assert = require('node:assert/strict');
const calendar = require('../mobile/src/lib/calendar');
const model = require('../mobile/src/calendar/model');
const options = require('../mobile/src/calendar/event-options');
const holidays = require('../mobile/src/calendar/holidays');
const files = require('../mobile/src/calendar/calendar-files');
const quick = require('../mobile/src/calendar/quick-add');
const history = require('../mobile/src/calendar/calendar-history');
const { toolUrl } = require('../mobile/src/lib/website-tools');

test('event options use web-compatible fields and duplication creates a distinct one-off draft', () => {
  const profiles = [{ name: 'Casey' }, { name: 'Riley' }];
  const { event } = model.buildCalendarEvent(null, { title: 'Trip', date: '2026-11-13', endDate: '2026-11-14',
    allDay: true, eventType: 'trip', attendees: ['Casey', 'Riley', 'Casey'], icon: '✈️', color: 'teal', travelMinutes: 45,
    status: 'tentative', bufferBeforeMinutes: '15', bufferAfterMinutes: 30 }, profiles);
  assert.deepEqual(event.attendees, ['Casey', 'Riley']);
  assert.equal(event.icon, '✈️');
  assert.equal(event.color, 'teal');
  const draft = options.duplicateDraft(event, calendar.parseDateKey('2026-12-12'));
  assert.equal(draft.id, undefined);
  assert.equal(draft.endDate, '2026-12-13');
  assert.equal(draft.status, 'confirmed');
  assert.equal(draft.bufferBeforeMinutes, 15);
  assert.equal(draft.bufferAfterMinutes, 30);
  assert.equal(draft.recurrence, 'none');
  assert.equal(model.buildCalendarEvent(null, { ...draft, attendees: ['Unknown'] }, profiles).event, null);
});

test('schedule warnings respect named attendees and never flag different children by default', () => {
  const form = { date: '2026-11-13', child: 'Casey', start: '16:00', end: '17:00' };
  const other = { id: '1', startDate: form.date, child: 'Riley', start: '16:00', end: '17:00', recurrence: 'none' };
  assert.deepEqual(options.conflictingEvents(form, [other]), []);
  assert.deepEqual(options.conflictingEvents(form, [{ ...other, attendees: ['Casey'] }]).map(event => event.id), ['1']);
  assert.deepEqual(options.conflictingEvents({ ...form, bufferAfterMinutes: 15 }, [{ ...other, child: 'Casey', start: '17:10', end: '18:00' }]).map(event => event.id), ['1']);
});

test('shared activity changes preserve the actor and merge with existing web history', () => {
  const move = history.changeFromServer({ id: 'change', event_id: 'event-1', actor_email: 'parent@example.test',
    created_at: '2026-11-13T20:00:00Z', before_event: { title: 'Pickup', start: '14:00' }, after_event: { title: 'Pickup', start: '15:00' } });
  assert.equal(move.action, 'moved');
  const audit = [{ ...move, id: 'duplicate', at: '2026-11-13T20:00:01Z' }, { id: 'earlier', at: '2026-11-12T11:30:00Z' }];
  assert.deepEqual(history.mergeChanges([move], audit).map(item => item.id), ['change', 'earlier']);
});

test('holiday dates and filters work across English, Chinese, and four-day navigation', () => {
  const en = holidays.builtInHolidays(2026);
  assert.equal(en.find(event => event.title === 'Thanksgiving').startDate, '2026-11-26');
  assert.equal(en.find(event => event.title === 'Labor Day').startDate, '2026-09-07');
  assert.equal(holidays.builtInHolidays(2026, 'zh').find(event => event.startDate === '2026-03-17').title, '圣帕特里克节');
  assert.ok(en.every(event => event.isBuiltInHoliday && holidays.matchesCategory(event, 'holidays')));
  assert.equal(holidays.matchesCategory({ eventType: 'activity' }, 'holidays'), false);
  assert.equal(calendar.dateKey(model.movePeriod(calendar.parseDateKey('2026-12-30'), 'four', 1)), '2027-01-03');
});

test('ICS round trip retains overnight times, exclusive all-day ends and recurrence exclusions', () => {
  const data = [
    { id: 'night', title: 'Overnight', startDate: '2026-11-13', endDate: '2026-11-14', start: '23:00', end: '01:00' },
    { id: 'festival', title: 'A, B; C', startDate: '2026-11-13', endDate: '2026-11-15', allDay: true,
      eventType: 'trip', recurrence: 'yearly', excludedDates: ['2027-11-13'] },
  ];
  const ics = files.exportIcs(data, 'Family');
  assert.match(ics, /DTEND;VALUE=DATE:20261116/);
  const imported = files.readImport(ics).events;
  assert.equal(imported[0].end, '01:00');
  assert.equal(imported[1].title, 'A, B; C');
  assert.equal(imported[1].endDate, '2026-11-15');
  assert.deepEqual(imported[1].excludedDates, ['2027-11-13']);
  assert.notEqual(imported[0].id, 'night');
  assert.match(files.printHtml('<script>', '<img>'), /&lt;img&gt;/);
});

test('Quick Add creates a reviewable event and web tools keep fixed, encoded destinations', () => {
  assert.deepEqual(quick.quickDraft('Piano tomorrow 4–5pm @ Music Studio', '2026-11-13', '2026-11-13'),
    { title: 'Piano', startDate: '2026-11-14', start: '16:00', end: '17:00', location: 'Music Studio' });
  assert.equal(toolUrl('https://elsewhere.invalid'), null);
  const url = new URL(toolUrl('scan-document', 'calendar&tool=other'));
  assert.equal(url.searchParams.get('calendar'), 'calendar&tool=other');
  assert.equal(url.searchParams.get('tool'), 'scan-document');
});
