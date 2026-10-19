const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const engine = require('../assets/smart-scheduling.js');
const { localDate, dateString, bufferMinutes, clock, wallTime, affectsPeople, busyIntervals, roomFor, slotAvailable, findSlots, quickDate, tokenizeQuickLine } = engine;
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../assets/smart-scheduling.js'), 'utf8');
const now = new Date(2026, 9, 19, 0, 0);
const rules = extra => ({ date: '2026-10-20', days: 1, earliest: 8 * 60, latest: 21 * 60, duration: 30, before: 15, after: 15, notice: 30, people: ['Sam'], ...extra });

test('scheduling dates, clocks, and padding are strict and bounded', () => {
  assert.equal(localDate('2026-02-30'), null); assert.equal(localDate('0001-01-01'), null);
  assert.equal(dateString(localDate('2028-02-29')), '2028-02-29');
  assert.equal(clock('23:59'), 1439); assert.equal(clock('24:00'), 1440);
  assert.equal(clock('25:00'), null); assert.equal(clock('13:61'), null);
  assert.equal(bufferMinutes(-10), 0); assert.equal(bufferMinutes('500'), 120); assert.equal(bufferMinutes('oops'), 0);
});

test('busy people respect child ownership, named attendees, family plans, and legacy defaults', () => {
  assert.equal(affectsPeople({ child: 'Alex', attendees: ['all'] }, ['Sam']), false);
  assert.equal(affectsPeople({ child: 'Alex', attendees: ['Sam'] }, ['Sam']), true);
  assert.equal(affectsPeople({ child: '__family__' }, ['Sam']), true);
  assert.equal(affectsPeople({ child: '__family__', attendees: ['Alex'] }, ['Sam']), false);
  assert.equal(affectsPeople({ child: 'Sam', status: 'cancelled' }, ['Sam']), false);
  assert.equal(affectsPeople({ child: '__family__', isBuiltInHoliday: true }, ['Sam']), false);
  assert.equal(affectsPeople({ child: 'Unknown old child' }, ['__family__']), true);
});

test('busy intervals include stored buffers, travel, trips, all-day plans, and neighboring days', () => {
  assert.deepEqual(busyIntervals([{ child: 'Sam', start: '10:00', end: '11:00', bufferBeforeMinutes: 15, bufferAfterMinutes: 10, travelMinutes: 30 }], ['Sam']), [[555, 670]]);
  assert.deepEqual(busyIntervals([{ child: 'Sam', start: '00:15', end: '01:00', travelMinutes: 30, dayOffset: 1 }], ['Sam']), [[1425, 1500]]);
  assert.deepEqual(busyIntervals([{ child: 'Sam', eventType: 'trip', start: '10:00', end: '11:00' }], ['Sam']), [[0, 1440]]);
  assert.deepEqual(busyIntervals([{ child: 'Sam', allDay: true }, { child: 'Sam', start: 'broken' }], ['Sam']), [[0, 1440], [0, 1440]]);
});

test('padding-only overlaps block suggestions, with exact adjacency still available', () => {
  const busy = [[600, 660]];
  assert.equal(roomFor(660, 690, busy, 15, 0), false);
  assert.equal(roomFor(675, 705, busy, 15, 0), true);
  assert.equal(roomFor(555, 585, busy, 0, 15), true);
  assert.equal(roomFor(570, 600, busy, 0, 15), false);
});

test('time finder returns chronological, bounded suggestions and never mutates events', () => {
  const event = Object.freeze({ child: 'Sam', start: '08:00', end: '10:00', bufferAfterMinutes: 15 });
  const options = rules({ days: 3 });
  const result = findSlots(options, () => [event], now);
  assert.equal(result.length, 9);
  assert.equal(result[0].start, 630); // 10:30, leaving the event's padding and the new before-buffer.
  assert.equal(result[0].end, 660);
  assert.equal(result[3].date, '2026-10-21');
  assert(result.every(slot => slot.start - 15 >= options.earliest && slot.end + 15 <= options.latest));
  assert.equal(event.end, '10:00');
  assert.equal(findSlots(rules({ days: 14 }), () => [], now).length, 30);
});

test('different children do not block one another, but selecting both checks both schedules', () => {
  const events = [{ child: 'Alex', allDay: true }];
  assert(findSlots(rules(), () => events, now).length);
  assert.equal(findSlots(rules({ people: ['Sam', 'Alex'] }), () => events, now).length, 0);
  assert.equal(findSlots(rules({ people: [] }), () => events, now).length, 0);
});

test('advance notice prevents past/last-minute starts and slots are revalidated against current data', () => {
  const options = rules({ date: '2026-10-19', earliest: 0, before: 0, after: 0, notice: 60 });
  const current = new Date(2026, 9, 19, 9, 10);
  const slots = findSlots(options, () => [], current);
  assert.equal(slots[0].start, 10 * 60 + 15);
  assert.equal(slotAvailable(slots[0], options, () => [{ child: 'Sam', allDay: true }], current), false);
  assert.equal(slotAvailable(slots[0], options, () => [], current), true);
  assert.equal(findSlots(rules({ date: '2026-02-30' }), () => [], now).length, 0);
  assert.equal(findSlots(rules({ earliest: 600, latest: 500 }), () => [], now).length, 0);
});

test('neighboring-day buffers protect late-night slots, and early flights fit', () => {
  const options = rules({ earliest: 23 * 60, latest: 1439, before: 0, after: 0, duration: 15 });
  const event = { child: 'Sam', start: '00:15', end: '01:00', travelMinutes: 30, dayOffset: 1 };
  const late = findSlots(options, () => [event], now);
  assert(late.every(slot => slot.end <= 1425));
  const early = findSlots(rules({ earliest: 0, latest: 120, before: 0, after: 0 }), () => [], now);
  assert.equal(early[0].start, 0);
});

test('DST gaps and clock-changing intervals are not offered as ordinary wall-clock slots', () => {
  const sourcePath = path.resolve(__dirname, '../assets/smart-scheduling.js');
  const output = execFileSync(process.execPath, ['-e', `const e=require(${JSON.stringify(sourcePath)}); console.log(JSON.stringify([e.wallTime('2027-03-14',150), e.slotAvailable({date:'2027-11-07',start:90,end:150},{earliest:0,latest:400,before:0,after:0,notice:0,people:['Sam']},()=>[],new Date(2027,10,1))]));`], { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), [null, false]);
  assert(wallTime('2026-10-20', 240));
});

test('Quick Add extracts English and Chinese sentences without inventing a person', () => {
  const en = tokenizeQuickLine('Piano tomorrow 4–5pm @ Music Studio', '2026-10-17');
  assert.equal(en.title, 'Piano'); assert.equal(en.date, '2026-10-18'); assert.equal(en.time, '4–5pm'); assert.equal(en.location, 'Music Studio');
  const zh = tokenizeQuickLine('钢琴 明天 下午4点至5点 @ 音乐教室', '2026-10-17');
  assert.equal(zh.title, '钢琴'); assert.equal(zh.date, '2026-10-18'); assert.equal(zh.time, '下午4点至5点');
  assert.equal(en.child, undefined);
  assert.equal(quickDate('next Monday', '2026-10-19'), '2026-10-26');
  assert.equal(quickDate('下周一', '2026-10-19'), '2026-10-26');
});

test('Quick Add flags ambiguous, recurring, timezone, all-day, and missing-date text for review', () => {
  for (const input of ['Piano every Monday 4pm', 'Trip today tomorrow 4pm', 'Webinar tomorrow 4pm PST', 'Holiday tomorrow all day', 'Call tomorrow 4pm and 6pm']) assert(tokenizeQuickLine(input, '2026-10-17').advanced, input);
  assert.equal(tokenizeQuickLine('Piano 2026-02-30 16:00', '2026-10-17').date, '');
  assert.equal(tokenizeQuickLine('Piano 4pm', '2026-10-17').missingDate, true);
  const duration = tokenizeQuickLine('Piano 2026-10-20 at 16:00 for 60 minutes', '2026-10-17');
  assert.equal(duration.date, '2026-10-20'); assert.equal(duration.duration, '60 minutes'); assert.equal(duration.time, '16:00');
});

test('Quick Add preserves title words while removing date and time prepositions', () => {
  const parsed = tokenizeQuickLine('On-call team on tomorrow at 4pm @ Cafe', '2026-10-17');
  assert.equal(parsed.title, 'On-call team'); assert.equal(parsed.time, '4pm');
  assert.equal(tokenizeQuickLine('Dinner at home tomorrow 18:00', '2026-10-17').title, 'Dinner at home');
});

test('quick ranges reuse the existing clock parser, including estimated end warnings', () => {
  const context = vm.createContext({ userSettings: { defaultEventDuration: 30 }, kidProfiles: [], FAMILY_CHILD: '__family__',
    timeInputValue: minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` });
  const start = html.indexOf('    function scannedClockValue('), end = html.indexOf('    function scannedLineValue(', start);
  vm.runInContext(html.slice(start, end), context);
  const en = context.parseScannedTimes('Time: 4–5pm'); assert.equal(en.start, '16:00'); assert.equal(en.end, '17:00');
  const zh = context.parseScannedTimes('Time: 下午4点至5点'); assert.equal(zh.start, '16:00'); assert.equal(zh.end, '17:00');
  const single = context.parseScannedTimes('Time: 16:00'); assert.equal(single.estimatedEnd, true); assert.equal(single.end, '16:30');
});

test('buffers survive normal save, edit, draft fields, and JSON snapshots without a database migration', () => {
  assert.match(html, /bufferBeforeMinutes: Math\.max\(0, Math\.min\(120, Math\.round\(Number\(fields.bufferBefore\?\.value\) \|\| 0\)\)\)/);
  assert.match(html, /bufferAfterMinutes: Math\.max\(0, Math\.min\(120, Math\.round\(Number\(fields.bufferAfter\?\.value\) \|\| 0\)\)\)/);
  const draftFields = JSON.parse(html.match(/const EVENT_DRAFT_FIELDS = (\[[^;]+\]);/)[1]);
  assert(draftFields.includes('bufferBefore')); assert(draftFields.includes('bufferAfter'));
  assert.match(html, /fields.bufferBefore.value = String\([\s\S]*?activity\?\.bufferBeforeMinutes/);
  assert.match(html, /fields.bufferAfter.value = String\([\s\S]*?activity\?\.bufferAfterMinutes/);
  assert.match(script, /readEventDraft\(scheduleStorageKey\('event-draft'\)\)/);
  assert.match(script, /navigateEventFormStep\(4\); scheduleNewEventDraftSave\(\)/);
  assert.doesNotMatch(script, /saveActivities\(|\.from\(|fetch\(/);
});

test('reviewed suggestions are saved as user drafts after deferred defaults, without touching a replaced session', () => {
  const tasks = [], session = { baseline: null }; let saves = 0;
  const context = vm.createContext({ queueMicrotask: callback => tasks.push(callback), eventDraftSession: session, saveNewEventDraft: () => saves++ });
  const start = script.indexOf('  function persistReviewedDraft('), end = script.indexOf('  function reviewDraft(', start);
  vm.runInContext(script.slice(start, end), context);
  context.persistReviewedDraft('empty editor', session);
  session.baseline = 'reviewed values'; // Normal editor's earlier microtask.
  tasks.shift()(); assert.equal(session.baseline, 'empty editor'); assert.equal(saves, 1);
  context.persistReviewedDraft('old defaults', session); context.eventDraftSession = {};
  tasks.shift()(); assert.equal(saves, 1); assert.equal(session.baseline, 'empty editor');
});

test('new labels match in both languages and phone layouts retain clear inputs and touch targets', () => {
  const start = script.indexOf('  const words ='), end = script.indexOf('  const tx =', start);
  const words = vm.runInNewContext(script.slice(start, end) + '\nwords');
  assert.deepEqual(Object.keys(words.en).sort(), Object.keys(words.zh).sort());
  const css = fs.readFileSync(path.join(__dirname, '../assets/smart-scheduling.css'), 'utf8');
  assert.match(css, /@media \(max-width: 600px\)/); assert.match(css, /font-size: 16px/); assert.match(css, /min-height: 44px/);
  assert.match(css, /pointer-events: none/); // Buffer decorations must not intercept event clicks or drags.
  const worker = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  assert(worker.includes('"./assets/smart-scheduling.css?v=2"')); assert(worker.includes('"./assets/smart-scheduling.js?v=4"'));
});
