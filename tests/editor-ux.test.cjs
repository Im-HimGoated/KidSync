const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}

function navigation({ invalid = 0, pending = false, current = 1 } = {}) {
  const calls = [];
  const context = vm.createContext({
    eventFormStep: current, EVENT_FORM_STEPS: ['event', 'when', 'schedule', 'details'],
    requireEventDraftChoice: () => pending,
    applySmartEventDefaults: () => calls.push('defaults'),
    validateEventFormStep: () => { calls.push(`validate:${context.eventFormStep}`); return context.eventFormStep !== invalid; },
    setEventFormStep: (step, options) => { context.eventFormStep = step; calls.push(`step:${step}:${options?.focus === false ? 'quiet' : 'focus'}`); }
  });
  vm.runInContext(source('navigateEventFormStep'), context);
  return { context, calls };
}

test('jumping to review validates every intervening step and focuses the destination', () => {
  const { context, calls } = navigation();
  context.navigateEventFormStep(4);
  assert.equal(context.eventFormStep, 4);
  assert.deepEqual(calls, ['defaults', 'validate:1', 'step:2:quiet', 'validate:2', 'step:3:quiet', 'validate:3', 'step:4:quiet', 'step:4:focus']);
});

test('invalid date/time stops navigation at the field that needs attention', () => {
  const { context, calls } = navigation({ invalid: 2 });
  context.navigateEventFormStep(4);
  assert.equal(context.eventFormStep, 2);
  assert(!calls.includes('step:3:quiet'));
});

test('backward navigation allows correction and pending drafts are not overwritten', () => {
  const back = navigation({ current: 4 });
  back.context.navigateEventFormStep(1);
  assert.deepEqual(back.calls, ['step:1:focus']);
  const pending = navigation({ pending: true });
  pending.context.navigateEventFormStep(4);
  assert.deepEqual(pending.calls, []);
});

test('closing an edited event preserves changes until explicitly discarded', () => {
  let draft = { title: 'Soccer', notes: 'Bring water' };
  const panel = { hidden: true };
  const calls = [];
  const context = vm.createContext({
    fields: { id: { value: 'existing' } }, eventEditBaseline: JSON.stringify(draft),
    captureEventDraft: () => draft, comparableEventDraft: value => JSON.stringify(value),
    closeDialog: () => calls.push('close'), document: { getElementById: id => id === 'eventCloseConfirm' ? panel : { focus: () => calls.push('focus') } },
    dialog: { scrollTo: () => calls.push('scroll') }
  });
  vm.runInContext(source('hasUnsavedEventEdits') + source('requestCloseEventDialog'), context);
  assert.equal(context.hasUnsavedEventEdits(), false);
  draft = { ...draft, notes: 'Bring cleats too' };
  context.requestCloseEventDialog();
  assert.equal(panel.hidden, false);
  assert(!calls.includes('close'));
  assert(calls.includes('focus'));
  context.fields.id.value = '';
  context.requestCloseEventDialog();
  assert(calls.includes('close'), 'New events retain the existing autosaved draft flow');
});

test('review includes trip range, all-day state, and exact weekly days', () => {
  const context = vm.createContext({
    t: key => key, FAMILY_CHILD: '__family__', parseDateKey: value => value, formatFullDate: value => value,
    minutes: value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; }, formatTimeLabel: value => `${value}m`
  });
  vm.runInContext(source('eventSaveReviewRows'), context);
  const rows = context.eventSaveReviewRows({ title: 'Trip', child: '__family__', date: '2026-10-17', endDate: '2026-10-20', eventType: 'trip', allDay: true, recurrence: 'weekly', repeatInterval: 2, repeatDays: [1, 3] });
  assert.equal(rows[1].value, 'calendar.family');
  assert.match(rows[2].value, /2026-10-17.*2026-10-20.*form.allDay/);
  assert.match(rows[3].value, /2 repeat.unit.weekly.*day.shortMon, day.shortWed/);
});
