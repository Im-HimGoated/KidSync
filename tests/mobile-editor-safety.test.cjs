const test = require('node:test');
const assert = require('node:assert/strict');
const { initialEventForm, normalizeDisplayPreferences, eventFormChanged } = require('../mobile/src/calendar/model');

const selectedDate = '2026-10-30';

test('new activity times follow saved hours and provide a one-hour interval', () => {
  for (const [hours, start, end] of [['morning', '06:00', '07:00'], ['afternoon', '12:00', '13:00'],
    ['evening', '18:00', '19:00'], ['daytime', '08:00', '09:00']]) {
    for (const choices of [{ hours }, normalizeDisplayPreferences({ hours })]) {
      const form = initialEventForm(null, selectedDate, choices);
      assert.equal(form.start, start); assert.equal(form.end, end);
      assert.equal(form.date, selectedDate); assert.equal(form.title, '');
    }
  }
  for (const invalid of [undefined, null, { hours: 'night', initialHour: 23 }]) {
    const form = initialEventForm(null, selectedDate, invalid);
    assert.equal(form.start, '08:00'); assert.equal(form.end, '09:00');
  }
});

test('changing hour preferences never fills or replaces an existing activity clock', () => {
  for (const event of [{ start: '01:30', end: '02:45' }, { start: '17:00' }, { allDay: true }, {}]) {
    const form = initialEventForm({ id: 7, startDate: selectedDate, ...event }, selectedDate, { hours: 'evening' });
    assert.equal(form.start, event.start || ''); assert.equal(form.end, event.end || '');
  }
});

test('dirty draft comparison starts clean, detects each field change and clears after reverting', () => {
  const initial = initialEventForm(null, selectedDate, { hours: 'morning', reminders: '30' });
  const clone = JSON.parse(JSON.stringify(initial));
  assert.equal(eventFormChanged(initial, clone), false);
  for (const [field, value] of [['title', 'Soccer'], ['child', 'Mia'], ['date', '2026-10-31'],
    ['endDate', '2026-11-01'], ['allDay', true], ['start', '07:00'], ['end', '08:00'],
    ['location', 'Field'], ['responsible', 'Dad'], ['items', 'Water'], ['notes', 'Gate 2'],
    ['importance', 'high'], ['reminderMinutes', null], ['recurrence', 'weekly'],
    ['repeatInterval', '2'], ['repeatDays', [2]], ['repeatUntil', '2027-01-01']]) {
    const edited = { ...clone, [field]: value };
    assert.equal(eventFormChanged(initial, edited), true, field);
    edited[field] = clone[field];
    assert.equal(eventFormChanged(initial, edited), false, `reverted ${field}`);
  }
  assert.equal(initial.title, ''); assert.deepEqual(initial.repeatDays, [5]);
});

test('weekday order and object property order do not trigger a false discard warning', () => {
  const initial = { title: 'Practice', repeatDays: [1, 3, 5], recurrence: 'weekly' };
  const equivalent = { recurrence: 'weekly', repeatDays: [5, 1, 3, 1], title: 'Practice' };
  assert.equal(eventFormChanged(initial, equivalent), false);
  assert.equal(eventFormChanged(initial, { ...equivalent, repeatDays: [1, 3] }), true);
  assert.deepEqual(initial.repeatDays, [1, 3, 5]);
  assert.deepEqual(equivalent.repeatDays, [5, 1, 3, 1]);
});
