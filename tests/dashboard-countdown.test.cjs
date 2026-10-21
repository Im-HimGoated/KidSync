const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert(start >= 0);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}
function render(activity, { past = false, language = 'en' } = {}) {
  const now = new Date(2026, 9, 21, 16, 5);
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  }
  const targets = [], keys = [];
  const labels = language === 'zh' ? { 'dashboard.begins': '{time}开始', 'dashboard.ends': '{time}结束', 'dashboard.happened': '发生于{time}', 'calendar.allDay': '全天' }
    : { 'dashboard.begins': 'Begins {time}', 'dashboard.ends': 'Ends {time}', 'dashboard.happened': 'Happened {time}', 'calendar.allDay': 'All day' };
  const context = vm.createContext({ Date: FrozenDate, currentLanguage: language,
    parseDateKey: value => { const [year, month, day] = value.split('-').map(Number); return new FrozenDate(year, month - 1, day); },
    activityDateRangeText: () => '', formatTimeLabel: minute => `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`,
    minutes: value => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; },
    formatRelativeTime: date => { targets.push(date.getTime()); return language === 'zh' ? '还有72天' : 'in 72 days'; },
    t: (key, values = {}) => { keys.push(key); return (labels[key] || key).replace('{time}', values.time); },
    displayChild: () => 'Family', eventColors: () => ({ line: '#00aa55' }), escapeHtml: value => String(value),
    displayIcon: () => '🎉', activityCompactTitle: event => event.title, formatShortDate: () => 'Jan 1',
    document: { createElement: () => ({ style: { setProperty() {} }, addEventListener() {} }) }
  });
  vm.runInContext(['occurrenceDateTime', 'occurrenceEndDateTime', 'dashboardTimelineElement'].map(source).join('\n'), context);
  const button = context.dashboardTimelineElement(activity, { past });
  return { markup: button.innerHTML, target: targets[0], key: keys.find(key => ['dashboard.begins', 'dashboard.ends', 'dashboard.happened'].includes(key)) };
}
const holiday = { title: 'New Year’s Day', startDate: '2027-01-01', allDay: true, eventType: 'holiday' };
test('future all-day holidays count down to their beginning at midnight', () => {
  const result = render(holiday);
  assert.match(result.markup, /Begins in 72 days/);
  assert.doesNotMatch(result.markup, /Ends /);
  assert.equal(result.target, new Date(2027, 0, 1).getTime());
});
test('future timed and recurring events use the actual occurrence start', () => {
  const result = render({ title: 'Soccer', startDate: '2026-09-01', occurrenceDate: '2026-10-22', start: '17:00', end: '18:30' });
  assert.equal(result.key, 'dashboard.begins');
  assert.equal(result.target, new Date(2026, 9, 22, 17).getTime());
});
test('an all-day event already underway counts down to its end', () => {
  const result = render({ ...holiday, occurrenceDate: '2026-10-21' });
  assert.equal(result.key, 'dashboard.ends');
  assert.equal(result.target, new Date(2026, 9, 21, 23, 59, 59, 999).getTime());
});
test('a timed event already underway uses its end time, including the exact start instant', () => {
  for (const start of ['15:30', '16:05']) {
    const result = render({ title: 'Practice', startDate: '2026-10-21', start, end: '17:30' });
    assert.equal(result.key, 'dashboard.ends');
    assert.equal(result.target, new Date(2026, 9, 21, 17, 30).getTime());
  }
});
test('past-event history retains its completed-event wording and end timestamp', () => {
  const result = render({ title: 'Practice', startDate: '2026-10-20', start: '15:30', end: '17:30' }, { past: true });
  assert.equal(result.key, 'dashboard.happened');
  assert.equal(result.target, new Date(2026, 9, 20, 17, 30).getTime());
});
test('Chinese upcoming-event wording also describes the beginning', () => {
  const result = render(holiday, { language: 'zh' });
  assert.equal(result.key, 'dashboard.begins');
  assert.match(result.markup, /还有72天开始/);
  assert.match(html, /"dashboard.begins": "\{time\}开始"/);
  assert.match(html, /"dashboard.begins": "Begins \{time\}"/);
});
