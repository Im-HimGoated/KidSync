const test = require('node:test');
const assert = require('node:assert/strict');
const { FAMILY_CHILD, validateEventForm, buildEvent } = require('../mobile/src/lib/event-form');
const kids = [{ id: 'kid-1', name: 'Alice', palette: 'blue' }, { id: 'kid-2', name: 'Ben', palette: 'green' }];
const base = { title: 'Library', date: '2026-10-22', start: '9:00', end: '10:00', child: 'kid-1' };

test('new activities use the web schema with trimmed copy, canonical child names, and fresh IDs', () => {
  const first = buildEvent(null, { ...base, title: '  Library  ', location: '  Main branch ', notes: ' Bring books ' }, kids);
  assert.equal(first.error, null);
  assert.deepEqual(first.errors, {});
  assert.equal(first.event.title, 'Library');
  assert.equal(first.event.startDate, '2026-10-22');
  assert.equal(first.event.start, '09:00');
  assert.equal(first.event.end, '10:00');
  assert.equal(first.event.child, 'Alice');
  assert.equal(first.event.location, 'Main branch');
  assert.equal(first.event.notes, 'Bring books');
  assert.equal(first.event.recurrence, 'none');
  assert.equal(first.event.eventType, 'activity');
  assert.equal(first.event.status, 'confirmed');
  assert.equal(first.event.importance, 'normal');
  assert.ok(first.event.id);
  assert.notEqual(first.event.id, buildEvent(null, base, kids).event.id);
  assert.equal(Object.hasOwn(first.event, 'date'), false);
});

test('validation reports field errors and never returns a saveable invalid event', () => {
  const result = buildEvent(null, { ...base, title: ' ', date: '2026-02-30', start: '25:00', end: '09:65' }, kids);
  assert.equal(result.event, null);
  assert.equal(result.error, 'titleRequired');
  assert.deepEqual(result.errors, { title: 'titleRequired', date: 'dateInvalid', start: 'startTimeInvalid', end: 'endTimeInvalid' });
  assert.deepEqual(validateEventForm(null, {}, kids), {
    title: 'titleRequired', date: 'dateRequired', start: 'startTimeRequired', end: 'endTimeRequired'
  });
});

test('timed events require a later end time as the website does, while all-day events require no time', () => {
  assert.equal(buildEvent(null, { ...base, end: '9:00' }, kids).errors.end, 'endAfterStart');
  assert.equal(buildEvent(null, { ...base, end: '08:59' }, kids).errors.end, 'endAfterStart');
  const result = buildEvent(null, { title: 'Holiday', startDate: '2026-10-22', allDay: true }, kids);
  assert.equal(result.error, null);
  assert.equal(result.event.child, FAMILY_CHILD);
  assert.equal(result.event.start, '');
  assert.equal(result.event.end, '');
});

test('trip dates validate real calendar values and include an optional same-day end', () => {
  assert.equal(buildEvent(null, { ...base, eventType: 'trip' }, kids).errors.endDate, 'endDateRequired');
  assert.equal(buildEvent(null, { ...base, endDate: '2026-02-30' }, kids).errors.endDate, 'endDateInvalid');
  assert.equal(buildEvent(null, { ...base, endDate: '2026-10-21' }, kids).errors.endDate, 'endDateBeforeStart');
  const trip = buildEvent(null, { ...base, endDate: '2026-10-24' }, kids);
  assert.equal(trip.error, null);
  assert.equal(trip.event.eventType, 'trip');
  assert.equal(trip.event.endDate, '2026-10-24');
  assert.equal(buildEvent(null, { ...base, endDate: '2026-10-22' }, kids).error, null);
});

test('edits preserve identity, unexposed metadata and exclusions without mutating any source', () => {
  const excludedDates = Object.freeze(['2026-11-05']);
  const futureField = Object.freeze({ version: 7 });
  const existing = Object.freeze({ ...base, id: 'activity-123', startDate: base.date, child: 'Alice',
    recurrence: 'weekly', repeatInterval: 2, repeatDays: Object.freeze([4]), repeatUntil: '2026-12-31',
    excludedDates, futureField, responsible: 'Grandparent', attendees: Object.freeze(['parent-1']),
    travelMinutes: 20, color: 'coral', status: 'tentative', icon: '📚' });
  const form = Object.freeze({ title: 'Updated library', notes: 'New note' });
  const result = buildEvent(existing, form, kids);
  assert.equal(result.error, null);
  assert.equal(result.event.id, 'activity-123');
  for (const key of ['futureField', 'responsible', 'attendees', 'travelMinutes', 'color', 'status', 'icon']) {
    assert.equal(result.event[key], existing[key], key);
  }
  assert.deepEqual(result.event.excludedDates, excludedDates);
  assert.notEqual(result.event.excludedDates, excludedDates);
  assert.equal(result.event.recurrence, 'weekly');
  assert.equal(result.event.repeatInterval, 2);
  assert.equal(result.event.repeatUntil, '2026-12-31');
  assert.equal(existing.title, 'Library');
  assert.deepEqual(form, { title: 'Updated library', notes: 'New note' });
});

test('unknown new children are rejected but existing orphan references remain editable', () => {
  assert.equal(buildEvent(null, { ...base, child: 'unknown' }, kids).errors.child, 'childInvalid');
  assert.equal(buildEvent(null, { ...base, child: 'Ben' }, kids).event.child, 'Ben');
  const existing = { ...base, id: 'old-event', startDate: base.date, child: 'Former child' };
  assert.equal(buildEvent(existing, { title: 'Renamed' }, kids).event.child, 'Former child');
  assert.equal(buildEvent(existing, { child: 'Another unknown' }, kids).errors.child, 'childInvalid');
});

test('weekly days are numeric, unique, sorted and default to the anchor weekday when omitted', () => {
  const weekly = buildEvent(null, { ...base, recurrence: 'weekly', repeatDays: ['4', '1', 4, 0] }, kids);
  assert.deepEqual(weekly.event.repeatDays, [0, 1, 4]);
  assert.deepEqual(buildEvent(null, { ...base, recurrence: 'weekly' }, kids).event.repeatDays, [4]);
  for (const days of [[], ['x'], [7], [-1], 'thursday']) {
    assert.equal(buildEvent(null, { ...base, recurrence: 'weekly', repeatDays: days }, kids).errors.repeatDays, 'repeatDaysRequired');
  }
});

test('recurrence validates intervals and an inclusive repeatUntil then clears inactive repeat controls', () => {
  assert.equal(buildEvent(null, { ...base, recurrence: 'hourly' }, kids).errors.recurrence, 'recurrenceInvalid');
  for (const repeatInterval of [0, 13, 1.5, 'bad']) {
    assert.equal(buildEvent(null, { ...base, recurrence: 'daily', repeatInterval }, kids).errors.repeatInterval, 'repeatIntervalInvalid');
  }
  assert.equal(buildEvent(null, { ...base, recurrence: 'daily', repeatUntil: '2026-02-30' }, kids).errors.repeatUntil, 'repeatUntilInvalid');
  assert.equal(buildEvent(null, { ...base, recurrence: 'daily', repeatUntil: '2026-10-21' }, kids).errors.repeatUntil, 'repeatUntilBeforeStart');
  assert.equal(buildEvent(null, { ...base, recurrence: 'daily', repeatUntil: '2026-10-22' }, kids).error, null);
  const existing = { ...base, startDate: base.date, recurrence: 'weekly', repeatDays: [4], repeatInterval: 2, repeatUntil: '2026-12-01' };
  const stopped = buildEvent(existing, { recurrence: 'none' }, kids).event;
  assert.deepEqual([stopped.repeatInterval, stopped.repeatUntil, stopped.repeatDays], [1, '', []]);
});

test('editing a legacy weekday schedule creates an anchored date while retaining weekly recurrence', () => {
  const existing = { id: 'legacy', title: 'School', child: FAMILY_CHILD, day: 'thursday', start: '08:00', end: '15:00' };
  const result = buildEvent(existing, { date: '2026-10-22' }, kids);
  assert.equal(result.error, null);
  assert.equal(result.event.startDate, '2026-10-22');
  assert.equal(result.event.recurrence, 'weekly');
  assert.deepEqual(result.event.repeatDays, [4]);
  assert.equal(Object.hasOwn(result.event, 'day'), false);
});

test('external and generated events cannot become local editable records', () => {
  for (const metadata of [{ externalSource: 'google' }, { externalSource: 'outlook' }, { isBuiltInHoliday: true }]) {
    const result = buildEvent({ ...base, startDate: base.date, ...metadata }, { title: 'Changed' }, kids);
    assert.equal(result.event, null);
    assert.equal(result.error, 'eventReadOnly');
  }
});
