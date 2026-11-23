const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../mobile/src/calendar/model');
const calendar = require('../mobile/src/lib/calendar');
const screen = fs.readFileSync(require.resolve('../mobile/src/calendar/CalendarScreen.js'), 'utf8');

test('shared display normalization supports four days, boolean weekends and explicit valid durations', () => {
  const preferences = { view: 'four', hours: 'evening', week: 'sunday', reminders: '30', defaultEventDuration: 45, showWeekends: false };
  const result = model.normalizeDisplayPreferences(preferences);
  assert.equal(result.view, 'four'); assert.equal(result.showWeekends, false); assert.equal(result.defaultEventDuration, 45);
  assert.equal(result.initialHour, 18); assert.equal(result.firstDay, 0); assert.equal(result.defaultReminderMinutes, 30);
  assert.deepEqual(model.normalizeDisplayPreferences(result), result);
  for (const duration of [undefined, null, '', '45', true, 0, 15, 46, 240, Infinity, NaN]) {
    assert.equal(model.normalizeDisplayPreferences({ defaultEventDuration: duration }).defaultEventDuration, 60);
  }
  for (const value of [undefined, null, 'false', 0]) assert.equal(model.normalizeDisplayPreferences({ showWeekends: value }).showWeekends, true);
});

test('new activity forms use the shared duration and preserve every existing clock', () => {
  for (const [duration, end] of [[30, '18:30'], [45, '18:45'], [60, '19:00'], [90, '19:30'], [120, '20:00']]) {
    const preferences = { hours: 'evening', defaultEventDuration: duration };
    const form = model.initialEventForm(null, '2026-11-23', preferences);
    assert.equal(form.start, '18:00'); assert.equal(form.end, end); assert.equal(form.endDate, '');
    for (const event of [{ start: '10:15', end: '10:40' }, { start: '17:00' }, { allDay: true }, { start: '23:00', end: '01:00', endDate: '2026-11-24' }]) {
      const edited = model.initialEventForm({ id: 1, startDate: '2026-11-23', ...event }, '2026-11-23', preferences);
      assert.equal(edited.start, event.start || ''); assert.equal(edited.end, event.end || ''); assert.equal(edited.endDate, event.endDate || '');
    }
  }
});

test('empty timeline slots honor duration and roll exclusive midnight ends into the correct next date', () => {
  const date = calendar.parseDateKey('2026-12-31'), before = date.getTime();
  assert.deepEqual(model.newEventWindow(date, 23, { defaultEventDuration: 45 }),
    { startDate: '2026-12-31', start: '23:00', end: '23:45', endDate: '' });
  assert.deepEqual(model.newEventWindow(date, 23, { defaultEventDuration: 60 }),
    { startDate: '2026-12-31', start: '23:00', end: '00:00', endDate: '2027-01-01' });
  const overnight = model.newEventWindow('2028-02-28', 23, { defaultEventDuration: 120 });
  assert.deepEqual(overnight, { startDate: '2028-02-28', start: '23:00', end: '01:00', endDate: '2028-02-29' });
  const form = { ...model.initialEventForm(null, overnight.startDate), date: overnight.startDate, ...overnight, title: 'Night plan' };
  assert.ok(model.buildCalendarEvent(null, form).event);
  assert.equal(date.getTime(), before);
  for (const [day, hour] of [['bad', 8], ['2026-02-30', 8], ['2026-12-31', 24], ['2026-12-31', -1], ['2026-12-31', 8.5]]) {
    assert.throws(() => model.newEventWindow(day, hour), /INVALID_EVENT_WINDOW/);
  }
  assert.match(screen, /initialDraft: model\.newEventWindow\(day, hour, preferences\)/);
});

function mountDisplay() {
  const effects = [
    screen.match(/useEffect\(\(\) => \{\s*if \(viewPreference\.current\?\.view[^]*?\}, \[display\.view, display\.initialHour, scopeId\]\);/)[0],
    screen.match(/useEffect\(\(\) => \{\s*setHideWeekends\(!display\.showWeekends\);\s*\}, \[scopeId, display\.showWeekends\]\);/)[0],
  ];
  const state = {}, previous = [], viewPreference = { current: null }, monthReturnView = { current: 'agenda' };
  const setter = key => value => { state[key] = value; };
  return {
    state,
    manual(patch) { Object.assign(state, patch); },
    render(scopeId, preferences) {
      const display = model.normalizeDisplayPreferences(preferences);
      effects.forEach((source, index) => vm.runInNewContext(source, { display, scopeId, viewPreference, monthReturnView,
        setView: setter('view'), setFullMonthOpen: setter('fullMonthOpen'), setFocusedHour: setter('hour'), setHideWeekends: setter('hideWeekends'),
        useEffect: (effect, dependencies) => {
          if (!previous[index] || dependencies.some((value, i) => !Object.is(value, previous[index][i]))) effect();
          previous[index] = dependencies;
        } }));
    }
  };
}

test('ordinary realtime snapshots preserve manual and saved-view selections until a display setting changes', () => {
  const app = mountDisplay(), preferences = { view: 'week', hours: 'morning', showWeekends: false };
  app.render('owner:family', preferences);
  assert.deepEqual(app.state, { view: 'week', fullMonthOpen: false, hour: 6, hideWeekends: true });
  app.manual({ view: 'month', fullMonthOpen: true, hour: 15, hideWeekends: false });
  app.render('owner:family', { ...preferences });
  assert.deepEqual(app.state, { view: 'month', fullMonthOpen: true, hour: 15, hideWeekends: false });
  app.render('owner:family', { ...preferences, showWeekends: true });
  assert.deepEqual(app.state, { view: 'month', fullMonthOpen: true, hour: 15, hideWeekends: false });
  app.render('owner:family', { ...preferences });
  assert.deepEqual(app.state, { view: 'month', fullMonthOpen: true, hour: 15, hideWeekends: true });
  app.render('owner:family', { ...preferences, view: 'four' });
  assert.deepEqual(app.state, { view: 'four', fullMonthOpen: false, hour: 6, hideWeekends: true });
});

test('calendar scope changes hydrate the new default even when its scalar preferences match the old calendar', () => {
  const app = mountDisplay(), preferences = { view: 'week', showWeekends: false };
  app.render('owner:family', preferences);
  app.manual({ view: 'agenda', hideWeekends: false, hour: 17 });
  app.render('owner:school', preferences);
  assert.deepEqual(app.state, { view: 'week', fullMonthOpen: false, hour: 8, hideWeekends: true });
  // External Home focus runs after preference hydration so a requested weekend
  // is revealed even when the new calendar's default hides weekends.
  assert.ok(screen.indexOf('setHideWeekends(!display.showWeekends)') < screen.indexOf('const focused = calendar.parseDateKey(focusDate)'));
});
