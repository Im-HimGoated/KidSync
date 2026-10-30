const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { dateKey, parseDateKey, addDays, startOfWeek, monthDays, eventsForDate, kidsForEvent, formatTime } = require('../mobile/src/lib/calendar');
const on = (event, day) => eventsForDate([event], parseDateKey(day)).length === 1;

test('date-only helpers validate dates, cross year boundaries, and leave input dates unchanged', () => {
  const sunday = parseDateKey('2027-01-03');
  assert.equal(dateKey(startOfWeek(sunday)), '2026-12-28');
  assert.equal(dateKey(addDays(sunday, -3)), '2026-12-31');
  assert.equal(dateKey(sunday), '2027-01-03');
  assert.equal(sunday.getHours(), 0);
  assert.equal(dateKey(parseDateKey('2028-02-29')), '2028-02-29');
  assert.equal(dateKey(parseDateKey('0099-01-01')), '0099-01-01');
  for (const invalid of ['2026-02-29', '2026-13-01', '2026-01-00', '2026-1-01', 'bad', null]) {
    assert.equal(dateKey(parseDateKey(invalid)), '');
  }
});

test('month grids contain 42 distinct local dates beginning on Monday', () => {
  const grid = monthDays(parseDateKey('2026-11-15'));
  assert.equal(grid.length, 42);
  assert.equal(dateKey(grid[0]), '2026-10-26');
  assert.equal(grid[0].getDay(), 1);
  assert.equal(dateKey(grid[41]), '2026-12-06');
  assert.equal(new Set(grid.map(dateKey)).size, 42);
  assert.deepEqual(monthDays(new Date(NaN)), []);
});

test('daily recurrence and date arithmetic survive daylight-saving changes in both hemispheres', () => {
  const modulePath = path.resolve(__dirname, '../mobile/src/lib/calendar');
  for (const [zone, dates] of [
    ['America/Los_Angeles', ['2026-03-07', '2026-10-31']],
    ['Pacific/Auckland', ['2026-09-26', '2026-04-04']]
  ]) {
    const script = `
      const assert = require('node:assert/strict');
      const {dateKey, parseDateKey, addDays, eventsForDate} = require(${JSON.stringify(modulePath)});
      for (const key of ${JSON.stringify(dates)}) {
        const start = parseDateKey(key); const next = addDays(start, 2);
        assert.equal(start.getDate(), Number(key.slice(-2)));
        assert.equal(next.getHours(), 0);
        assert.equal(eventsForDate([{startDate:key, recurrence:'daily', repeatInterval:2}], next).length, 1);
        assert.equal(dateKey(addDays(next, -2)), key);
      }
    `;
    const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    assert.equal(result.status, 0, `${zone}: ${result.stderr}`);
  }
});

test('daily series respect interval, inclusive repeatUntil, exceptions, and the anchor date', () => {
  const event = { startDate: '2026-10-20', recurrence: 'daily', repeatInterval: 2,
    repeatUntil: '2026-10-26', excludedDates: ['2026-10-24'] };
  for (const day of ['2026-10-20', '2026-10-22', '2026-10-26']) assert.equal(on(event, day), true, day);
  for (const day of ['2026-10-18', '2026-10-21', '2026-10-24', '2026-10-28']) assert.equal(on(event, day), false, day);
});

test('weekly custom weekdays use Sunday=0 and web-compatible intervals anchored to the start date', () => {
  const event = { startDate: '2026-10-21', recurrence: 'weekly', repeatInterval: 2, repeatDays: ['0', '3', '5'] };
  for (const day of ['2026-10-21', '2026-10-23', '2026-10-25', '2026-11-04']) assert.equal(on(event, day), true, day);
  for (const day of ['2026-10-18', '2026-10-22', '2026-10-28', '2026-10-30', '2026-11-01']) assert.equal(on(event, day), false, day);
  assert.equal(on({ startDate: '2026-10-21', recurrence: 'weekly' }, '2026-10-28'), true);
  assert.equal(on({ startDate: '2026-10-21', recurrence: 'weekly' }, '2026-10-29'), false);
});

test('monthly series skip unavailable month days and yearly leap-day series skip non-leap years', () => {
  const monthly = { startDate: '2026-01-31', recurrence: 'monthly', repeatInterval: 2 };
  assert.equal(on(monthly, '2026-03-31'), true);
  assert.equal(on(monthly, '2026-02-28'), false);
  assert.equal(on(monthly, '2026-04-30'), false);
  assert.equal(on({ startDate: '2024-02-29', recurrence: 'yearly' }, '2028-02-29'), true);
  assert.equal(on({ startDate: '2024-02-29', recurrence: 'yearly' }, '2025-02-28'), false);
  assert.equal(on({ startDate: '2024-10-21', recurrence: 'yearly', repeatInterval: 2 }, '2026-10-21'), true);
});

test('multi-day events include both endpoints and preserve web series-start exceptions', () => {
  const trip = { startDate: '2026-12-30', endDate: '2027-01-02', allDay: true };
  for (const day of ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']) assert.equal(on(trip, day), true, day);
  assert.equal(on(trip, '2027-01-03'), false);
  const recurring = { startDate: '2026-10-19', endDate: '2026-10-21', recurrence: 'weekly',
    repeatUntil: '2026-10-26', excludedDates: ['2026-10-19'] };
  assert.equal(on(recurring, '2026-10-20'), false);
  assert.equal(on(recurring, '2026-10-28'), true, 'a final occurrence can end after repeatUntil');
  assert.equal(on(recurring, '2026-11-02'), false);
});

test('legacy weekday schedules remain visible and malformed or undated activities do not', () => {
  assert.equal(on({ day: 'wednesday' }, '2026-10-21'), true);
  assert.equal(on({ day: 'wednesday' }, '2026-10-22'), false);
  assert.equal(on({ day: 'wednesday', excludedDates: ['2026-10-21'] }, '2026-10-21'), false);
  assert.equal(on({}, '2026-10-21'), false);
  assert.equal(on({ startDate: '2026-02-31' }, '2026-03-03'), false);
  assert.deepEqual(eventsForDate([null, 'bad', {}], parseDateKey('2026-10-21')), []);
});

test('agendas sort all-day first, then numeric time and title, retaining source objects and stable ties', () => {
  const events = [
    { title: 'Untimed', startDate: '2026-10-21' },
    { title: 'Later', startDate: '2026-10-21', start: '10:00' },
    { title: 'Zebra', startDate: '2026-10-21', start: '9:00' },
    { title: 'Alpha', startDate: '2026-10-21', start: '09:00' },
    { title: 'All day', startDate: '2026-10-21', allDay: true },
    { title: 'Other day', startDate: '2026-10-22', allDay: true }
  ].map(Object.freeze);
  Object.freeze(events);
  const result = eventsForDate(events, parseDateKey('2026-10-21'));
  assert.deepEqual(result.map(event => event.title), ['All day', 'Alpha', 'Zebra', 'Later', 'Untimed']);
  assert.equal(result[1], events[3]);
  const equal = [{ startDate: '2026-10-21', id: 1 }, { startDate: '2026-10-21', id: 2 }];
  assert.deepEqual(eventsForDate(equal, parseDateKey('2026-10-21')).map(event => event.id), [1, 2]);
});

test('child matching supports stored display names, IDs and family sentinel with original profiles', () => {
  const kids = [{ id: 'kid-1', name: 'Alice' }, { id: 'kid-2', name: 'Ben' }];
  assert.deepEqual(kidsForEvent({ child: 'Alice' }, kids), [kids[0]]);
  assert.deepEqual(kidsForEvent({ child: 'kid-2' }, kids), [kids[1]]);
  assert.deepEqual(kidsForEvent({ childId: 'kid-1' }, kids), [kids[0]]);
  assert.deepEqual(kidsForEvent({ child: '__family__' }, kids), kids);
  assert.deepEqual(kidsForEvent({}, kids), kids);
  assert.deepEqual(kidsForEvent({ child: 'Deleted child' }, kids), []);
  assert.deepEqual(kidsForEvent({ child: ['Ben', 'kid-1'] }, kids), kids);
  assert.deepEqual(kidsForEvent({}, null), []);
  assert.deepEqual(kidsForEvent({ child: 'undefined' }, [{ name: 'Alice' }]), []);
});

test('time formatting handles noon, midnight and Chinese 24-hour display', () => {
  assert.equal(formatTime('00:05'), '12:05 AM');
  assert.equal(formatTime('12:00'), '12:00 PM');
  assert.equal(formatTime('19:30'), '7:30 PM');
  assert.equal(formatTime('9:05', 'zh'), '09:05');
  for (const value of ['24:00', '09:60', 'abc', null]) assert.equal(formatTime(value), '');
});
