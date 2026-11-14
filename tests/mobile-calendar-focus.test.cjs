const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const calendar = require('../mobile/src/lib/calendar');
const focus = require('../mobile/src/calendar/focus');
const source = fs.readFileSync(require.resolve('../mobile/src/calendar/CalendarScreen.js'), 'utf8');
// Execute the component's actual focus effect with React's dependency semantics.
const focusEffect = source.match(/useEffect\(\(\) => \{\s*const focused = calendar\.parseDateKey\(focusDate\);[^]*?\}, \[focusDate, focusTime, focusRequest\]\);/)[0];
const actionEffect = source.match(/useEffect\(\(\) => \{\s*if \(!actionRequest[^]*?\}, \[actionRequest,[^\n]+\]\);/)[0];
function mount() {
  let date = '2026-11-01', query = '', person = 'all', filtersOpen = false, hour = 8, accepted = 0;
  let view = 'week', fullMonthOpen = true, previous;
  return { state: () => ({ date, query, person, filtersOpen }), navigate: next => { date = next; },
    focus: () => ({ hour, accepted, view, fullMonthOpen }),
    filter: (nextQuery, nextPerson) => { query = nextQuery; person = nextPerson; filtersOpen = true; },
    render(focusDate, focusRequest, focusTime = null, initialHour = 8) {
      vm.runInNewContext(focusEffect, { calendar, focus, focusDate, focusTime, focusRequest, display: { initialHour },
        validDate: value => Number.isFinite(value.getTime()),
        setDate: value => { date = calendar.dateKey(value); },
        setQuery: value => { query = value; }, setPerson: value => { person = value; },
        setFiltersOpen: value => { filtersOpen = value; },
        setView: value => { view = value; }, setFullMonthOpen: value => { fullMonthOpen = value; },
        setFocusedHour: value => { hour = value; }, setAcceptedFocusRequest: value => { accepted = typeof value === 'function' ? value(accepted) : value; },
        useEffect: (effect, deps) => { if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) effect(); previous = deps; }
      });
    }
  };
}
test('Calendar opens Home actions once in the requested owner scope and preserves open sheets', () => {
  const day = '2026-11-13', event = { id: '5', title: 'School pickup', startDate: day, allDay: true };
  const actions = [], handledActionRequest = { current: 0 };
  const request = { id: 1, ownerId: 'owner', calendarId: 'family', type: 'details', date: day, eventId: 5 };
  const render = ({ actionRequest = request, activeId = 'family', ...overrides } = {}) => vm.runInNewContext(actionEffect, {
    actionRequest, activeId, active: activeId ? { id: activeId } : null, userId: 'owner', handledActionRequest,
    sheet: null, busy: false, planningBusy: false, loading: false, isShared: false, canCreate: true, canWrite: true,
    events: [event], calendar, language: 'en', useEffect: effect => effect(), setName() {},
    holidays: require('../mobile/src/calendar/holidays'), validDate: value => Number.isFinite(value.getTime()),
    open: type => actions.push(type),
    showEvent: (item, date) => actions.push([item, calendar.dateKey(date)]), ...overrides,
  });
  render({ activeId: 'other' });
  render({ sheet: { type: 'edit' } });
  render({ isShared: true });
  render({ userId: 'another' });
  assert.deepEqual(actions, []);
  render(); render();
  assert.deepEqual(actions, [[event, day]]);
  render({ actionRequest: { ...request, id: 2, type: 'new' }, canWrite: false });
  assert.equal(actions.length, 1);
  render({ actionRequest: { ...request, id: 3, type: 'new' } });
  render({ actionRequest: { ...request, id: 4, type: 'create', calendarId: null }, activeId: null });
  render({ actionRequest: { ...request, id: 5, type: 'history' } });
  render({ actionRequest: { ...request, id: 6, date: '2026-11-26', eventId: 'builtin-holiday-2026-11-26' } });
  assert.deepEqual(actions.slice(1, 4), ['new', 'create', 'records']);
  assert.equal(actions[4][0].title, 'Thanksgiving');
});
test('fresh Home focus requests reveal the requested date by clearing search and person filters, including a repeated date', () => {
  const app = mount(); app.filter('no matching activity', 'Robin');
  app.render('2026-11-03', 1);
  assert.deepEqual(app.state(), { date: '2026-11-03', query: '', person: 'all', filtersOpen: false });
  app.navigate('2026-11-04'); app.filter('piano', 'Casey');
  app.render('2026-11-03', 1);
  assert.deepEqual(app.state(), { date: '2026-11-04', query: 'piano', person: 'Casey', filtersOpen: true });
  app.render('2026-11-03', 2);
  assert.deepEqual(app.state(), { date: '2026-11-03', query: '', person: 'all', filtersOpen: false });
  assert.deepEqual(app.focus(), { hour: 8, accepted: 2, view: 'week', fullMonthOpen: true });
});
test('ordinary rerenders preserve manual dates and filters, and invalid focus requests change neither', () => {
  const app = mount(); app.render('2026-11-03', undefined); app.navigate('2026-11-05');
  app.filter('soccer', 'Robin');
  const manual = { date: '2026-11-05', query: 'soccer', person: 'Robin', filtersOpen: true };
  app.render('2026-11-03', undefined); assert.deepEqual(app.state(), manual);
  for (const [index, invalid] of [undefined, null, 'invalid', '2026-02-30'].entries()) {
    app.render(invalid, index + 3); assert.deepEqual(app.state(), manual);
  }
  app.render('2026-11-06', 7);
  assert.deepEqual(app.state(), { date: '2026-11-06', query: '', person: 'all', filtersOpen: false });
});

test('valid event times override the saved hour and repeated requests re-center Week', () => {
  const app = mount();
  app.render('2026-11-03', 1, '05:15', 12);
  assert.deepEqual(app.focus(), { hour: 5.25, accepted: 1, view: 'day', fullMonthOpen: false });
  app.render('2026-11-03', 2, '05:15', 12);
  assert.deepEqual(app.focus(), { hour: 5.25, accepted: 2, view: 'day', fullMonthOpen: false });
  app.render('2026-11-03', 3, null, 18);
  assert.deepEqual(app.focus(), { hour: 18, accepted: 3, view: 'day', fullMonthOpen: false });
  app.render('invalid', 4, '09:00', 6);
  assert.deepEqual(app.focus(), { hour: 18, accepted: 3, view: 'day', fullMonthOpen: false });
});
