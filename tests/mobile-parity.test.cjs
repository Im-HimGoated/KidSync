const test = require('node:test');
const assert = require('node:assert/strict');
const calendar = require('../mobile/src/lib/calendar');
const model = require('../mobile/src/calendar/model');
const options = require('../mobile/src/calendar/event-options');
const holidays = require('../mobile/src/calendar/holidays');
const files = require('../mobile/src/calendar/calendar-files');
const quick = require('../mobile/src/calendar/quick-add');
const history = require('../mobile/src/calendar/calendar-history');
const fs = require('node:fs');
const vm = require('node:vm');
const theme = require('../mobile/src/ui/theme');
const profileOptions = require('../shared/family-profiles');
const { toolUrl } = require('../mobile/src/lib/website-tools');

test('event options use web-compatible fields and duplication creates a distinct one-off draft', () => {
  const profiles = [{ name: 'Casey' }, { name: 'Riley' }];
  const { event } = model.buildCalendarEvent(null, { title: 'Trip', date: '2026-11-13', endDate: '2026-11-14',
    allDay: true, eventType: 'trip', attendees: ['Casey', 'Riley', 'Casey'], icon: '✈️', color: 'teal', travelMinutes: 45,
    status: 'tentative', bufferBeforeMinutes: '15', bufferAfterMinutes: 30 }, profiles);
  assert.deepEqual(event.attendees, ['Casey', 'Riley']);
  assert.equal(event.icon, '✈️');
  assert.equal(event.color, 'teal');
  const draft = options.duplicateDraft(event, calendar.parseDateKey('2026-12-12'));
  assert.equal(draft.id, undefined);
  assert.equal(draft.endDate, '2026-12-13');
  assert.equal(draft.status, 'confirmed');
  assert.equal(draft.bufferBeforeMinutes, 15);
  assert.equal(draft.bufferAfterMinutes, 30);
  assert.equal(draft.recurrence, 'none');
  assert.equal(model.buildCalendarEvent(null, { ...draft, attendees: ['Unknown'] }, profiles).event, null);
});

test('schedule warnings respect named attendees and never flag different children by default', () => {
  const form = { date: '2026-11-13', child: 'Casey', start: '16:00', end: '17:00' };
  const other = { id: '1', startDate: form.date, child: 'Riley', start: '16:00', end: '17:00', recurrence: 'none' };
  assert.deepEqual(options.conflictingEvents(form, [other]), []);
  assert.deepEqual(options.conflictingEvents(form, [{ ...other, attendees: ['Casey'] }]).map(event => event.id), ['1']);
  assert.deepEqual(options.conflictingEvents({ ...form, bufferAfterMinutes: 15 }, [{ ...other, child: 'Casey', start: '17:10', end: '18:00' }]).map(event => event.id), ['1']);
});

test('shared activity changes preserve the actor and merge with existing web history', () => {
  const move = history.changeFromServer({ id: 'change', event_id: 'event-1', actor_email: 'parent@example.test',
    created_at: '2026-11-13T20:00:00Z', before_event: { title: 'Pickup', start: '14:00' }, after_event: { title: 'Pickup', start: '15:00' } });
  assert.equal(move.action, 'moved');
  const audit = [{ ...move, id: 'duplicate', at: '2026-11-13T20:00:01Z' }, { id: 'earlier', at: '2026-11-12T11:30:00Z' }];
  assert.deepEqual(history.mergeChanges([move], audit).map(item => item.id), ['change', 'earlier']);
});

test('holiday dates and filters work across English, Chinese, and four-day navigation', () => {
  const en = holidays.builtInHolidays(2026);
  assert.equal(en.find(event => event.title === 'Thanksgiving').startDate, '2026-11-26');
  assert.equal(en.find(event => event.title === 'Labor Day').startDate, '2026-09-07');
  assert.equal(holidays.builtInHolidays(2026, 'zh').find(event => event.startDate === '2026-03-17').title, '圣帕特里克节');
  assert.ok(en.every(event => event.isBuiltInHoliday && holidays.matchesCategory(event, 'holidays')));
  assert.equal(holidays.matchesCategory({ eventType: 'activity' }, 'holidays'), false);
  assert.equal(calendar.dateKey(model.movePeriod(calendar.parseDateKey('2026-12-30'), 'four', 1)), '2027-01-03');
});

test('ICS round trip retains overnight times, exclusive all-day ends and recurrence exclusions', () => {
  const data = [
    { id: 'night', title: 'Overnight', startDate: '2026-11-13', endDate: '2026-11-14', start: '23:00', end: '01:00' },
    { id: 'festival', title: 'A, B; C', startDate: '2026-11-13', endDate: '2026-11-15', allDay: true,
      eventType: 'trip', recurrence: 'yearly', excludedDates: ['2027-11-13'] },
  ];
  const ics = files.exportIcs(data, 'Family');
  assert.match(ics, /DTEND;VALUE=DATE:20261116/);
  const imported = files.readImport(ics).events;
  assert.equal(imported[0].end, '01:00');
  assert.equal(imported[1].title, 'A, B; C');
  assert.equal(imported[1].endDate, '2026-11-15');
  assert.deepEqual(imported[1].excludedDates, ['2027-11-13']);
  assert.notEqual(imported[0].id, 'night');
  assert.match(files.printHtml('<script>', '<img>'), /&lt;img&gt;/);
});

test('calendar backups import missing profiles, match existing names and retain future event fields', () => {
  const originalKids = [{ id: 'existing', name: 'Casey', palette: 'green', avatar: '🧒' }];
  const backup = { kids: [...originalKids, { id: 'old-riley', name: 'Riley', palette: 'coral', avatar: '🦊', grade: '4', school: 'School' }], activities: [
    { id: 'source', title: 'Piano', startDate: '2026-11-28', start: '16:00', end: '17:00', child: 'old-riley', attendees: ['existing', 'old-riley'], futureMetadata: { keep: true } },
    { id: 'second', title: 'Pickup', startDate: '2026-11-28', start: '17:30', end: '18:00', child: 'casey' },
  ] };
  const result = files.readImport(JSON.stringify(backup), originalKids);
  assert.equal(result.profiles.length, 1);
  assert.notEqual(result.profiles[0].id, 'old-riley');
  assert.equal(result.profiles[0].palette, 'coral');
  assert.equal(result.events[0].child, 'Riley');
  assert.deepEqual(result.events[0].attendees, ['Casey', 'Riley']);
  assert.deepEqual(result.events[0].futureMetadata, { keep: true });
  assert.equal(result.events[1].child, 'Casey');
  assert.deepEqual(result.originalKids, originalKids);
  assert.equal(result.reassigned, 0);
});

test('iCalendar export folds Unicode lines and rejects repeating rules that would change imported dates', () => {
  const title = '家庭旅行🦊'.repeat(30);
  const source = files.exportIcs([{ id: 'long', title, startDate: '2026-11-28', allDay: true }], 'Family');
  assert(source.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
  assert.equal(files.readImport(source).events[0].title, title);
  const calendarText = rule => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Monthly class\r\nDTSTART:20261128T160000\r\nDTEND:20261128T170000\r\n${rule}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  assert.throws(() => files.readImport(calendarText('RRULE:FREQ=MONTHLY;BYDAY=SA')), /UNSUPPORTED_RECURRENCE/);
  assert.throws(() => files.readImport(calendarText('RECURRENCE-ID:20261128T160000')), /UNSUPPORTED_RECURRENCE/);
  assert.throws(() => files.readImport(calendarText('RRULE:FREQ=WEEKLY\r\nEXDATE;TZID=Invalid/Zone:20261205T160000')), /UNSUPPORTED_TIME_ZONE/);
  assert.throws(() => files.readImport(calendarText('RRULE:FREQ=WEEKLY\r\nEXDATE;VALUE=DATE:20261399')), /UNSUPPORTED_RECURRENCE/);
});

test('family and event color identities match the website in every appearance', () => {
  const web = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const webPalettes = vm.runInNewContext(`(${web.match(/const palettes = (\{[^]*?\n    \});/)[1]})`);
  const eventColors = vm.runInNewContext(`(${web.match(/const EVENT_COLOR_OPTIONS = (\[[^]*?\n    \]);/)[1]})`);
  assert.deepEqual(profileOptions.PALETTES, Object.keys(webPalettes));
  for (const key of profileOptions.PALETTES) for (const mode of ['light', 'dark']) assert(theme.createTheme({ mode }).palettes[key], `${mode}/${key}`);
  for (const color of eventColors) assert.equal(options.colors[color.id][0], color.line, color.id);
});

test('Quick Add creates a reviewable event and web tools keep fixed, encoded destinations', () => {
  assert.deepEqual(quick.quickDraft('Piano tomorrow 4–5pm @ Music Studio', '2026-11-13', '2026-11-13'),
    { title: 'Piano', startDate: '2026-11-14', start: '16:00', end: '17:00', location: 'Music Studio' });
  assert.equal(toolUrl('https://elsewhere.invalid'), null);
  const url = new URL(toolUrl('scan-document', 'calendar&tool=other'));
  assert.equal(url.searchParams.get('calendar'), 'calendar&tool=other');
  assert.equal(url.searchParams.get('tool'), 'scan-document');
});
