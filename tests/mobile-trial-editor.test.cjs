const test = require('node:test');
const assert = require('node:assert/strict');
const { editorRequest } = require('../mobile/src/lib/trial-editor');
const trial = require('../mobile/src/lib/native-trial');

test('opening another event requires a decision before replacing the unfinished trial draft', () => {
  const draft = { ...trial.defaultEvent('2026-10-30'), title: 'Unfinished pickup', child: 'Maya' };
  const saved = { ...trial.defaultEvent('2026-10-31'), id: 'saved', title: 'School' };
  const before = JSON.stringify(draft);
  const newRequest = editorRequest(draft, null, '2026-11-01', { hours: 'evening' });
  assert.equal(newRequest.mode, 'confirm');
  assert.equal(newRequest.values.start, '18:00');
  assert.equal(newRequest.values.startDate, '2026-11-01');
  assert.deepEqual(editorRequest(draft, saved), { mode: 'confirm', values: saved });
  assert.equal(JSON.stringify(draft), before);
});

test('reopening the same saved event resumes its unfinished changes', () => {
  const event = { ...trial.defaultEvent('2026-10-30'), id: 'saved', title: 'School' };
  const draft = { ...event, title: 'School pickup', responsible: 'Alex' };
  const result = editorRequest(draft, event);
  assert.equal(result.mode, 'resume');
  assert.equal(result.values, draft);
  assert.equal(event.title, 'School');
});

test('without a draft the requested event opens with saved time and reminder defaults', () => {
  const result = editorRequest(null, null, '2026-10-30', { hours: 'afternoon', reminders: '10' });
  assert.equal(result.mode, 'open');
  assert.equal(result.values.start, '12:00');
  assert.equal(result.values.end, '13:00');
  assert.equal(result.values.reminderMinutes, 10);
  const event = { id: 'legacy', title: 'Existing', start: '', end: '' };
  assert.equal(editorRequest(null, event).values, event);
});

test('draft decision does not write or discard the durable preview; replacement is an explicit separate save', async () => {
  const values = new Map();
  const store = trial.createTrialStore({ getItem: async key => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value) });
  await store.start();
  const draft = { ...trial.defaultEvent('2026-10-30'), title: 'Keep this draft' };
  await store.saveDraft(draft);
  const before = values.get(trial.TRIAL_KEY);
  const request = editorRequest((await store.load()).draft, null, '2026-10-31');
  assert.equal(request.mode, 'confirm');
  assert.equal(values.get(trial.TRIAL_KEY), before);
  assert.equal((await store.load()).draft.title, 'Keep this draft');
  await store.saveDraft(request.values);
  assert.equal((await store.load()).draft.startDate, '2026-10-31');
});
