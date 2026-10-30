const test = require('node:test');
const assert = require('node:assert/strict');
const { createCalendarActions } = require('../mobile/src/calendar/model');

test('bound durable save/remove adapters receive calendar arguments and retain the pending marker', async () => {
  const calls = [], published = [];
  const row = { schedule: { activities: [] }, updated_at: '2026-10-30T12:00:00Z', pending: true };
  const event = { id: 7, title: 'Draft' }, original = { id: 7, title: 'Original' };
  const actions = createCalendarActions({ userId: 'owner', onSchedule: value => published.push(value),
    activityActions: { save: async (...args) => { calls.push(['save', ...args]); return row; },
      remove: async (...args) => { calls.push(['remove', ...args]); return row; } } });
  assert.equal(await actions.save('family', event, original), row);
  assert.equal(await actions.remove('family', event.id, original), row);
  assert.deepEqual(calls, [['save', 'family', event, original], ['remove', 'family', 7, original]]);
  assert.deepEqual(published, [row, row]); assert.equal(published[0].pending, true);
});

test('failed durable saves never publish success or clear the callers draft', async () => {
  for (const code of ['SYNC_CONFLICT', 'QUEUE_FULL', 'STORAGE_ERROR']) {
    const published = [], event = { id: 'draft', title: 'Keep this draft' };
    const actions = createCalendarActions({ userId: 'owner', onSchedule: value => published.push(value),
      activityActions: { save: async () => { throw Object.assign(new Error(code), { code }); } } });
    await assert.rejects(actions.save('family', event), { code });
    assert.deepEqual(published, []); assert.equal(event.title, 'Keep this draft');
  }
});
