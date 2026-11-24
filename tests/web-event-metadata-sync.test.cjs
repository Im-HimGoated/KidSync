const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const start = html.indexOf('    form.addEventListener("submit", event => {');
const end = html.indexOf('    kidsForm.addEventListener("submit"', start);
assert(start >= 0 && end > start, 'use the actual production event submit handler');
const source = html.slice(start, end);

const baseFields = {
  id: 'plan', child: 'Casey', date: '2026-11-23', endDate: '', eventType: 'activity', importance: 'normal',
  recurrence: 'none', repeatInterval: '1', repeatUntil: '', allDay: false, start: '15:00', end: '16:00',
  title: 'Practice', style: 'blue', color: 'default', status: 'confirmed', travelMinutes: '0',
  bufferBefore: '0', bufferAfter: '0', notes: '', location: '', responsible: '', items: '',
};
const existing = (extra = {}) => ({
  id: 'plan', child: 'Casey', startDate: '2026-11-23', endDate: '', eventType: 'activity', importance: 'normal',
  recurrence: 'none', repeatInterval: 1, repeatUntil: '', repeatDays: [], allDay: false,
  start: '15:00', end: '16:00', title: 'Practice', icon: '⚽', style: 'blue', color: 'default', attendees: ['Casey'],
  status: 'confirmed', travelMinutes: 0, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
  notes: '', location: '', responsible: '', items: '', ...extra,
});

function submit({ activities = [], fields = {}, attendees = ['Casey'], weekdays = [], icon = '⚽', saved = true } = {}) {
  const context = vm.createContext({ seedJSON: JSON.stringify({ activities, fields, attendees, weekdays, icon, saved, defaults: baseFields }) });
  vm.runInContext(`
    const seed = JSON.parse(seedJSON), trace = [], checkpoints = [], audits = [], savedSnapshots = [], validations = [];
    const clone = value => JSON.parse(JSON.stringify(value));
    const values = { ...seed.defaults, ...seed.fields };
    const fields = Object.fromEntries(Object.entries(values).map(([name,value]) => [name, {
      value: name === 'allDay' ? '' : value,
      checked: name === 'allDay' && !!value,
      setCustomValidity(message) { validations.push([name,message]); },
      reportValidity() { trace.push('invalid:' + name); }
    }]));
    const state = { activities: seed.activities }, originalRows = state.activities.slice();
    const form = { addEventListener(name, callback) { if(name !== 'submit') throw Error('wrong event'); globalThis.handler = callback; } };
    const document = { querySelectorAll: selector => {
      if(selector !== '#repeatWeekdays input:checked') throw Error('unexpected selector');
      return seed.weekdays.map(value => ({value}));
    }};
    const requireEventDraftChoice = () => false;
    const eventFormStep = 4, EVENT_FORM_STEPS = [1,2,3,4];
    const minutes = value => { const [h,m] = value.split(':').map(Number); return h * 60 + m; };
    const eventImportance = activity => ['high','low'].includes(activity.importance) ? activity.importance : 'normal';
    const t = key => key;
    const makeId = prefix => prefix + '-new';
    const selectedEventIcon = () => seed.icon;
    const selectedAttendees = () => seed.attendees;
    const activityTitle = activity => activity.title;
    const rememberCurrentSchedule = label => { trace.push('checkpoint'); checkpoints.push({label, activities:clone(state.activities)}); };
    const saveActivities = () => { trace.push('save'); savedSnapshots.push(clone(state.activities)); return seed.saved; };
    const clearCompletedEventDraft = () => trace.push('clearDraft');
    const saveNewEventDraft = () => trace.push('retainDraft');
    const auditActivity = (action,before,after) => { trace.push('audit'); audits.push({action,before:clone(before),after:clone(after)}); };
    const trackProductEvent = (name,details) => trace.push(name);
    const closeDialog = () => trace.push('close');
    const renderAll = () => trace.push('render');
    const scheduleSmartCalendarFocus = () => trace.push('focus');
    const showFeedbackToast = message => trace.push(message);
  `, context);
  vm.runInContext(source + `
    handler({preventDefault() {trace.push('preventDefault');}});
    const clonedExclusions = state.activities.length && originalRows.length && state.activities[0].excludedDates !== originalRows[0].excludedDates;
    globalThis.result = { activities:state.activities, originalRows, trace, checkpoints, audits, savedSnapshots, validations, clonedExclusions };
  `, context);
  return JSON.parse(vm.runInContext('JSON.stringify(result)', context));
}

test('actual website edits preserve native reminder choices including explicit off and start values', () => {
  for (const reminderMinutes of [0, 10, 30, null]) {
    const original = existing({ reminderMinutes });
    const result = submit({ activities: [original], fields: { title: 'Edited on website' } });
    assert.equal(result.activities.length, 1);
    assert.equal(Object.hasOwn(result.activities[0], 'reminderMinutes'), true);
    assert.equal(result.activities[0].reminderMinutes, reminderMinutes);
    assert.equal(result.activities[0].title, 'Edited on website');
    assert.deepEqual(result.originalRows, [original]);
  }
});

test('native detached occurrence and unknown fields survive an unrelated web edit', () => {
  const original = existing({ reminderMinutes: 10, movedFrom: { eventId: 'series', date: '2026-11-21' },
    nativeReceipt: { revision: 7, nested: ['keep', { future: true }] }, excludedDates: ['2026-11-30'],
    futureScalar: false, futureNull: null, childId: 'kid-id' });
  const result = submit({ activities: [original], fields: { location: '  New room  ' } });
  assert.deepEqual(result.activities, [{ ...original, location: 'New room' }]);
  assert.deepEqual(result.checkpoints, [{ label: 'versions.beforeEdit', activities: [original] }]);
  assert.deepEqual(result.audits, [{ action: 'updated', before: original, after: result.activities[0] }]);
  assert.equal(result.clonedExclusions, true);
  assert.deepEqual(result.originalRows[0].excludedDates, ['2026-11-30']);
});

test('numeric activity IDs stay numeric and update their existing row instead of creating a duplicate', () => {
  for (const id of [0, 7, 13.5]) {
    const original = existing({ id, reminderMinutes: 30 });
    const unrelated = existing({ id: 'other', title: 'Keep', future: { untouched: true } });
    const result = submit({ activities: [original, unrelated], fields: { id: String(id), title: 'Edited numeric plan' } });
    assert.equal(result.activities.length, 2);
    assert.deepEqual(result.activities[0], { ...original, title: 'Edited numeric plan' });
    assert.deepEqual(result.activities[1], unrelated);
    assert.equal(result.audits[0].action, 'updated');
  }
});

test('new events inherit no metadata from existing plans', () => {
  const original = existing({ reminderMinutes: 10, movedFrom: { eventId: 'series', date: '2026-11-21' },
    excludedDates: ['2026-11-30'], future: { private: true } });
  const result = submit({ activities: [original], fields: { id: '', title: 'New plan' } });
  assert.equal(result.activities.length, 2); assert.deepEqual(result.activities[0], original);
  const created = result.activities[1];
  assert.equal(created.id, 'activity-new'); assert.equal(created.title, 'New plan');
  for (const field of ['reminderMinutes', 'movedFrom', 'excludedDates', 'future']) assert.equal(Object.hasOwn(created, field), false, field);
  assert.equal(result.audits[0].action, 'created'); assert.equal(result.audits[0].before, null);
});

test('website-controlled fields override previous values while history retains original metadata', () => {
  const original = existing({ reminderMinutes: 0, unknown: { retain: true }, excludedDates: ['2026-12-01'] });
  const result = submit({ activities: [original], fields: {
    child: 'Riley', date: '2026-11-24', endDate: '2026-11-25', eventType: 'trip', importance: 'high',
    recurrence: 'weekly', repeatInterval: '2', repeatUntil: '2027-01-01', allDay: true, start: '', end: '',
    title: '  Camp  ', style: 'green', color: 'coral', status: 'tentative', travelMinutes: '25',
    bufferBefore: '15', bufferAfter: '20', notes: ' note ', location: ' park ', responsible: ' Pat ', items: ' hat ',
  }, attendees: ['Riley', 'Guest'], weekdays: ['2', '4'], icon: '🏕️' });
  const saved = result.activities[0];
  assert.deepEqual(saved, { ...original, child: 'Riley', startDate: '2026-11-24', endDate: '2026-11-25',
    eventType: 'trip', importance: 'high', recurrence: 'weekly', repeatInterval: 2, repeatUntil: '2027-01-01', repeatDays: [2,4],
    allDay: true, start: '', end: '', title: 'Camp', icon: '🏕️', style: 'green', color: 'coral',
    attendees: ['Riley','Guest'], status: 'tentative', travelMinutes: 25, bufferBeforeMinutes: 15,
    bufferAfterMinutes: 20, notes: 'note', location: 'park', responsible: 'Pat', items: 'hat' });
  assert.deepEqual(result.checkpoints[0].activities, [original]);
  assert.deepEqual(result.audits[0].before, original);
  assert.deepEqual(result.trace, ['preventDefault','checkpoint','save','clearDraft','audit','Event Updated','close','render','focus','feedback.eventUpdated']);
});

test('an unchanged edit avoids a new history checkpoint and retains complete audit data', () => {
  const original = existing({ reminderMinutes: null, movedFrom: { eventId: 'series', date: '2026-11-21' }, excludedDates: ['2026-11-30'] });
  const result = submit({ activities: [original] });
  assert.deepEqual(result.activities, [original]); assert.deepEqual(result.checkpoints, []);
  assert.deepEqual(result.audits[0].before, original); assert.deepEqual(result.audits[0].after, original);
  assert.equal(result.clonedExclusions, true);
});

test('existing save-failure recovery path keeps original history and metadata for retry', () => {
  const original = existing({ reminderMinutes: 30, future: { retain: true }, excludedDates: ['2026-11-30'] });
  const result = submit({ activities: [original], fields: { title: 'Not yet persisted' }, saved: false });
  assert.equal(result.activities[0].reminderMinutes, 30);
  assert.deepEqual(result.activities[0].future, original.future);
  assert.deepEqual(result.checkpoints[0].activities, [original]);
  assert.ok(result.trace.includes('retainDraft')); assert.ok(!result.trace.includes('clearDraft'));
});
