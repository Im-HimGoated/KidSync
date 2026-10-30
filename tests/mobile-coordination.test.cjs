const test = require('node:test');
const assert = require('node:assert/strict');
const coordination = require('../shared/backend/mobile-coordination');

const user = { id: 'owner-1', email: 'Parent@Example.com' };
const calendar = { id: 'family', ownerId: 'owner-1' };
const pickup = changes => ({ id: 'pickup-1', owner_id: 'owner-1', calendar_id: 'family', event_id: 'soccer',
  occurrence_date: '2026-11-02', assignee_email: 'parent@example.com', status: 'pending', assigned_by: 'owner-1',
  responded_at: null, updated_at: '2026-10-30T10:00:00Z', ...changes });
const ok = data => ({ data, error: null });

function fakeClient(...responses) {
  const requests = [];
  function next(request) { requests.push(request); assert.ok(responses.length); return Promise.resolve(responses.shift()); }
  return { requests,
    rpc(name, args) { return next({ rpc: name, args }); },
    from(table) {
      const request = { table, filters: [] };
      const builder = {
        select(columns) { request.operation = 'select'; request.columns = columns; return this; },
        eq(key, value) { request.filters.push(['eq', key, value]); return this; },
        gte(key, value) { request.filters.push(['gte', key, value]); return this; },
        lte(key, value) { request.filters.push(['lte', key, value]); return this; },
        order(key, options) { request.order = [key, options]; return this; },
        maybeSingle() { request.cardinality = 'maybeSingle'; return this; },
        then(resolve, reject) { return next(request).then(resolve, reject); }
      };
      return builder;
    }
  };
}

test('pickup list is bounded to one authorized calendar and a strict date range', async () => {
  const client = fakeClient(ok([pickup()]));
  assert.deepEqual(await coordination.listCalendarPickups(client, user, calendar, { startDate: '2026-11-01', endDate: '2026-11-14' }), [pickup()]);
  assert.deepEqual(client.requests[0].filters, [
    ['eq', 'owner_id', 'owner-1'], ['eq', 'calendar_id', 'family'],
    ['gte', 'occurrence_date', '2026-11-01'], ['lte', 'occurrence_date', '2026-11-14']
  ]);
  await assert.rejects(coordination.listCalendarPickups(fakeClient(), user, calendar, { startDate: 'bad', endDate: '2026-11-14' }), /valid pickup date range/);
  await assert.rejects(coordination.listCalendarPickups(fakeClient(ok([pickup({ calendar_id: 'private' })])), user, calendar, { startDate: '2026-11-01', endDate: '2026-11-14' }), /could not be confirmed/);
});

test('assignment uses the server RPC and confirms the exact event occurrence and assignee', async () => {
  const client = fakeClient(ok(null), ok(pickup({ assignee_email: 'helper@example.com' })));
  const saved = await coordination.assignCalendarPickup(client, user, calendar, { eventId: 'soccer', date: '2026-11-02', email: ' Helper@Example.com ' });
  assert.equal(saved.assignee_email, 'helper@example.com');
  assert.deepEqual(client.requests[0], { rpc: 'assign_calendar_pickup', args: {
    p_owner: 'owner-1', p_calendar: 'family', p_event: 'soccer', p_day: '2026-11-02', p_email: 'helper@example.com'
  } });
  assert.deepEqual(client.requests[1].filters, [
    ['eq', 'owner_id', 'owner-1'], ['eq', 'calendar_id', 'family'], ['eq', 'event_id', 'soccer'], ['eq', 'occurrence_date', '2026-11-02']
  ]);
  await assert.rejects(coordination.assignCalendarPickup(fakeClient(ok(null), ok(pickup())), user, calendar, { eventId: 'soccer', date: '2026-11-02', email: 'other@example.com' }), /could not be confirmed/);
});

test('only the assigned account can answer and the saved version is re-read', async () => {
  const client = fakeClient(ok(null), ok(pickup({ status: 'accepted' })));
  const saved = await coordination.respondCalendarPickup(client, user, pickup(), 'accepted');
  assert.equal(saved.status, 'accepted');
  assert.deepEqual(client.requests[0], { rpc: 'respond_calendar_pickup', args: {
    p_id: 'pickup-1', p_status: 'accepted', p_version: '2026-10-30T10:00:00Z'
  } });
  await assert.rejects(coordination.respondCalendarPickup(fakeClient(), { ...user, email: 'other@example.com' }, pickup(), 'accepted'), /assigned recipient/);
  await assert.rejects(coordination.respondCalendarPickup(fakeClient(), user, pickup(), 'cancelled'), /Accept or Decline/);
  await assert.rejects(coordination.respondCalendarPickup(fakeClient(ok(null), ok(pickup({ status: 'pending' }))), user, pickup(), 'declined'), /could not be confirmed/);
});

test('pickup dates reject rollovers and leap-day errors', () => {
  assert.equal(coordination.validDate('2028-02-29'), true);
  assert.equal(coordination.validDate('2027-02-29'), false);
  assert.equal(coordination.validDate('2026-13-01'), false);
});
