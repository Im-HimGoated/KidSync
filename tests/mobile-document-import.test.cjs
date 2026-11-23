const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseDocumentText, MAX_DOCUMENT_LENGTH } = require('../shared/document/parse-document');
const calendar = require('../mobile/src/lib/calendar');
const model = require('../mobile/src/calendar/model');
const kids = [{ id: 'child-a', name: 'Charlie' }, { id: 'child-b', name: '安安' }];

test('native document import reads the website metadata and preserves original instructions as notes', () => {
  const text = 'Title: Piano lesson\nChild: Charlie\nDate: 17 October 2026\nTime: 14:00-15:30\nLocation: Music Studio\nAddress: 125 Main Street\nResponsible adult: Ms. Chen\nBring: Sheet music\nRepeat: Every 2 weeks on Saturday\nUntil: December 19, 2026\nStatus: Tentative\nPriority: High\nTravel time: 30 minutes';
  const { draft, warnings } = parseDocumentText(text, { kids });
  assert.equal(draft.child, 'child-a');
  assert.equal(draft.startDate, '2026-10-17');
  assert.equal(draft.start, '14:00');
  assert.equal(draft.end, '15:30');
  assert.equal(draft.responsible, 'Ms. Chen');
  assert.equal(draft.items, 'Sheet music');
  assert.equal(draft.location, 'Music Studio, 125 Main Street');
  assert.equal(draft.repeatInterval, 2);
  assert.deepEqual(draft.repeatDays, [6]);
  assert.equal(draft.repeatUntil, '2026-12-19');
  assert.equal(draft.status, 'tentative');
  assert.equal(draft.importance, 'high');
  assert.equal(draft.notes, text);
  assert.equal(warnings.length, 0);
  // Exercise the normal editor model before persistence.
  const form = model.initialEventForm(draft, new Date(2026, 9, 17));
  const result = model.buildCalendarEvent(null, form, kids);
  assert.ok(result.event, JSON.stringify(result.errors));
  assert.equal(result.event.items, draft.items);
  assert.equal(result.event.responsible, draft.responsible);
  assert.deepEqual(result.event.repeatDays, [6]);
});

test('Chinese logistics and clocks reach the review draft and unknown children stay unassigned', () => {
  const { draft } = parseDocumentText('活动：编程课\n孩子：安安\n日期：2026年10月17日\n时间：下午3点半至5点\n地点：电脑室\n负责人：王老师\n携带物品：笔记本电脑\n重复：每周六', { kids });
  assert.equal(draft.child, 'child-b');
  assert.equal(draft.start, '15:30');
  assert.equal(draft.end, '17:00');
  assert.equal(draft.responsible, '王老师');
  assert.equal(draft.items, '笔记本电脑');
  assert.deepEqual(draft.repeatDays, [6]);
  assert.equal(parseDocumentText('Title: Lesson\nChild: Unknown', { kids }).draft.child, undefined);
});

test('native extraction retains website review warnings and never invents missing fields', () => {
  const { draft, warnings } = parseDocumentText('Title: Webinar\nDate: 10/17/2026\nTime: 10:00-11:00 AM EST');
  assert.equal(draft.startDate, '2026-10-17');
  assert.ok(warnings.includes('numericDateReview'));
  assert.ok(warnings.includes('timezoneReview'));
  const missing = parseDocumentText('Title: Appointment');
  assert.equal(missing.draft.startDate, '');
  assert.equal(missing.draft.start, '');
  assert.ok(missing.warnings.includes('dateReview'));
  assert.ok(missing.warnings.includes('timeReview'));
  assert.ok(parseDocumentText('Title: Match\nDate: 2026-10-17\nDate: 2026-10-18').warnings.includes('multipleEvents'));
  assert.ok(parseDocumentText('Title: Sleepover\nTime: 23:00-01:00').warnings.includes('timeReview'));
});

test('document content stays data and cannot supply event identity or executable metadata', () => {
  const text = 'Title: __proto__\nDate: 2026-10-17\nAll day\n<script>globalThis.__documentExecuted = true</script>\nID: existing-event\nownerId: another-account';
  const result = parseDocumentText(text);
  assert.equal(result.draft.title, '__proto__');
  assert.equal(result.draft.id, undefined);
  assert.equal(result.draft.ownerId, undefined);
  assert.equal(result.draft.allDay, true);
  assert.equal(result.draft.notes, text);
  assert.equal(globalThis.__documentExecuted, undefined);
  assert.throws(() => parseDocumentText(null), /DOCUMENT_EMPTY/);
  assert.throws(() => parseDocumentText('   '), /DOCUMENT_EMPTY/);
  assert.throws(() => parseDocumentText('x'.repeat(MAX_DOCUMENT_LENGTH + 1)), /DOCUMENT_TOO_LONG/);
  assert.equal(parseDocumentText('x'.repeat(3000)).draft.notes.length, 3000);
});

test('portable rules match the website for trip dates, arrival times, duration and packing lists', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const context = vm.createContext({
    kidProfiles: kids, FAMILY_CHILD: '__family__', userSettings: { defaultEventDuration: 45 },
    dateKey: date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'),
    addDays: (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; },
    timeInputValue: minutes => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'),
  });
  vm.runInContext(html.slice(html.indexOf('    function validScannedDate('), html.indexOf('    function renderScannedGameSummary(')), context);
  const examples = [
    'Title: Family trip\nDate: 2026-10-17\nEnd date: 2026-10-20\nTime: 9:00-17:00',
    'Title: Soccer\nDate: October 17, 2026\nArrival: 9:30 AM\nTime: 10:00-11:15 AM\nCoach Alex will supervise.\nPlayers should bring cleats and water.',
    'Title: Robotics\nDate: 2026-10-17\nStart: 4 PM\nDuration: 90 minutes',
    'Title: Coding\nDate: 2026-10-17\nStart: 4 PM\nBring:\n- Laptop\n- Water',
  ];
  for (const text of examples) {
    const web = JSON.parse(JSON.stringify(context.parseScannedGameDetails(text)));
    const native = parseDocumentText(text, { kids, defaultDuration: 45 });
    for (const field of ['title', 'start', 'end', 'location', 'responsible', 'items']) assert.equal(native.draft[field], web[field], field);
    assert.equal(native.draft.startDate, web.date);
    assert.equal(native.draft.endDate, web.endDate || '');
    assert.deepEqual(native.warnings, web.warnings);
  }
});
