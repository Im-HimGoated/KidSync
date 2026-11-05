const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const focus = require('../mobile/src/calendar/focus');

test('event start times focus the week grid to the exact clock', () => {
  assert.equal(focus.hourForTime('05:00', 12), 5);
  assert.equal(focus.hourForTime('14:30', 8), 14.5);
  assert.equal(focus.hourForTime('23:59', 6), 23 + 59 / 60);
});

test('all-day, missing and malformed times fall back to the saved opening hour', () => {
  for (const value of [null, undefined, '', '5:00', '24:00', '09:60', 'noon']) {
    assert.equal(focus.hourForTime(value, 6), 6);
  }
  assert.equal(focus.hourForTime(null, 18), 18);
  assert.equal(focus.hourForTime(null, 99), 8);
  assert.equal(focus.hourForTime(null, '12'), 12);
});

test('calendar entry and reminder handoffs preserve saved-hour fallback rules', () => {
  const app = fs.readFileSync(require.resolve('../mobile/src/App.js'), 'utf8');
  const screen = fs.readFileSync(require.resolve('../mobile/src/calendar/CalendarScreen.js'), 'utf8');
  assert.match(app, /requestCalendarFocus\(target\.date, event\.allDay \? null : event\.start\)/);
  assert.match(screen, /focus\.hourForTime\(focusTime, display\.initialHour\)/);
  assert.match(screen, /<WeekGrid key=\{`focus:\$\{acceptedFocusRequest\}`\}/);
});
