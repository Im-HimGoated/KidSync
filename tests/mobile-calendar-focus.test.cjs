const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const calendar = require('../mobile/src/lib/calendar');
const focus = require('../mobile/src/calendar/focus');
const source = fs.readFileSync(require.resolve('../mobile/src/calendar/CalendarScreen.js'), 'utf8');
// Execute the component's actual focus effect with React's dependency semantics.
const focusEffect = source.match(/useEffect\(\(\) => \{\s*const focused = calendar\.parseDateKey\(focusDate\);[^]*?\}, \[focusDate, focusTime, focusRequest\]\);/)[0];
function mount() {
  let date = '2026-11-01', query = '', person = 'all', hour = 8, accepted = 0, previous;
  return { state: () => ({ date, query, person }), navigate: next => { date = next; },
    focus: () => ({ hour, accepted }),
    filter: (nextQuery, nextPerson) => { query = nextQuery; person = nextPerson; },
    render(focusDate, focusRequest, focusTime = null, initialHour = 8) {
      vm.runInNewContext(focusEffect, { calendar, focus, focusDate, focusTime, focusRequest, display: { initialHour },
        validDate: value => Number.isFinite(value.getTime()),
        setDate: value => { date = calendar.dateKey(value); },
        setQuery: value => { query = value; }, setPerson: value => { person = value; },
        setFocusedHour: value => { hour = value; }, setAcceptedFocusRequest: value => { accepted = typeof value === 'function' ? value(accepted) : value; },
        useEffect: (effect, deps) => { if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) effect(); previous = deps; }
      });
    }
  };
}
test('fresh Home focus requests reveal the requested date by clearing search and person filters, including a repeated date', () => {
  const app = mount(); app.filter('no matching activity', 'Robin');
  app.render('2026-11-03', 1);
  assert.deepEqual(app.state(), { date: '2026-11-03', query: '', person: 'all' });
  app.navigate('2026-11-04'); app.filter('piano', 'Casey');
  app.render('2026-11-03', 1);
  assert.deepEqual(app.state(), { date: '2026-11-04', query: 'piano', person: 'Casey' });
  app.render('2026-11-03', 2);
  assert.deepEqual(app.state(), { date: '2026-11-03', query: '', person: 'all' });
  assert.deepEqual(app.focus(), { hour: 8, accepted: 2 });
});
test('ordinary rerenders preserve manual dates and filters, and invalid focus requests change neither', () => {
  const app = mount(); app.render('2026-11-03', undefined); app.navigate('2026-11-05');
  app.filter('soccer', 'Robin');
  const manual = { date: '2026-11-05', query: 'soccer', person: 'Robin' };
  app.render('2026-11-03', undefined); assert.deepEqual(app.state(), manual);
  for (const [index, invalid] of [undefined, null, 'invalid', '2026-02-30'].entries()) {
    app.render(invalid, index + 3); assert.deepEqual(app.state(), manual);
  }
  app.render('2026-11-06', 7);
  assert.deepEqual(app.state(), { date: '2026-11-06', query: '', person: 'all' });
});

test('valid event times override the saved hour and repeated requests re-center Week', () => {
  const app = mount();
  app.render('2026-11-03', 1, '05:15', 12);
  assert.deepEqual(app.focus(), { hour: 5.25, accepted: 1 });
  app.render('2026-11-03', 2, '05:15', 12);
  assert.deepEqual(app.focus(), { hour: 5.25, accepted: 2 });
  app.render('2026-11-03', 3, null, 18);
  assert.deepEqual(app.focus(), { hour: 18, accepted: 3 });
  app.render('invalid', 4, '09:00', 6);
  assert.deepEqual(app.focus(), { hour: 18, accepted: 3 });
});
