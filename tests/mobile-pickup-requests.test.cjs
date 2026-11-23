const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePickupEvent, respondToCurrentPickup } = require('../mobile/src/family/pickup-requests');

const event = patch => ({ id: 'plan', title: 'Practice', startDate: '2026-11-23', start: '15:00', end: '16:00', recurrence: 'none', ...patch });
const pickup = patch => ({ id: 'pickup', event_id: 'plan', occurrence_date: '2026-11-23', status: 'pending', ...patch });
const pending = patch => pickup({ owner_id: 'owner', calendar_id: 'family', updated_at: '2026-11-23T10:00:00.123456+00:00', ...patch });
const selected = events => ({ id: 'family', ownerId: 'owner', data: { activities: events ?? [event()] } });

test('pickup resolution keeps the exact saved event and does not mutate account data', () => {
  const saved = event({ futureMetadata: { retain: true } }), request = pickup();
  const before = structuredClone([saved, request]);
  assert.equal(resolvePickupEvent([saved], request), saved);
  assert.deepEqual([saved, request], before);
  assert.equal(resolvePickupEvent([saved], pickup({ occurrence_date: '2026-11-24' })), null);
  assert.equal(resolvePickupEvent([], request), null);
});

test('cancelled, deleted, holiday and source-managed plans cannot offer a pickup response', () => {
  for (const patch of [{ status: 'cancelled' }, { isBuiltInHoliday: true }, { eventType: 'holiday' }, { externalSource: 'google' }]) {
    assert.equal(resolvePickupEvent([event(patch)], pickup()), null);
  }
  assert.equal(resolvePickupEvent([event({ id: 'different' })], pickup()), null);
  assert.equal(resolvePickupEvent([event({ status: 'tentative' })], pickup()).status, 'tentative');
});

test('recurring pickup requests disappear when their occurrence is excluded or moved', () => {
  const recurring = event({ startDate: '2026-11-16', recurrence: 'weekly', repeatDays: [1] });
  assert.equal(resolvePickupEvent([recurring], pickup()), recurring);
  const removed = { ...recurring, excludedDates: ['2026-11-23'] };
  assert.equal(resolvePickupEvent([removed], pickup()), null);
  const moved = event({ id: 'moved', startDate: '2026-11-24', movedFrom: { eventId: recurring.id, date: '2026-11-23' } });
  assert.equal(resolvePickupEvent([removed, moved], pickup()), null);
  assert.equal(resolvePickupEvent([removed, moved], pickup({ event_id: 'moved', occurrence_date: '2026-11-24' })), moved);
  assert.equal(resolvePickupEvent([{ ...recurring, repeatUntil: '2026-11-22' }], pickup()), null);
});

test('interval and monthly recurrences use the same actual-day rules as the calendar', () => {
  const biweekly = event({ startDate: '2026-11-16', recurrence: 'weekly', repeatDays: [1], repeatInterval: 2 });
  assert.equal(resolvePickupEvent([biweekly], pickup()), null);
  assert.equal(resolvePickupEvent([biweekly], pickup({ occurrence_date: '2026-11-30' })), biweekly);
  const monthly = event({ startDate: '2026-01-31', recurrence: 'monthly' });
  assert.equal(resolvePickupEvent([monthly], pickup({ occurrence_date: '2026-02-28' })), null);
  assert.equal(resolvePickupEvent([monthly], pickup({ occurrence_date: '2026-03-31' })), monthly);
});

test('multi-day requests resolve on covered days and respect midnight and excluded-start boundaries', () => {
  const trip = event({ endDate: '2026-11-25', allDay: true, eventType: 'trip' });
  for (const day of ['2026-11-23', '2026-11-24', '2026-11-25']) assert.equal(resolvePickupEvent([trip], pickup({ occurrence_date: day })), trip);
  assert.equal(resolvePickupEvent([trip], pickup({ occurrence_date: '2026-11-26' })), null);
  const overnight = event({ start: '23:00', end: '01:00', endDate: '2026-11-24' });
  assert.equal(resolvePickupEvent([overnight], pickup({ occurrence_date: '2026-11-24' })), overnight);
  assert.equal(resolvePickupEvent([{ ...overnight, end: '00:00' }], pickup({ occurrence_date: '2026-11-24' })), null);
  const series = { ...trip, recurrence: 'weekly', excludedDates: ['2026-11-23'] };
  assert.equal(resolvePickupEvent([series], pickup({ occurrence_date: '2026-11-24' })), null);
});

test('string and numeric IDs interoperate, but ambiguous duplicate IDs fail closed', () => {
  for (const id of [7, '7']) {
    const saved = event({ id });
    assert.equal(resolvePickupEvent([saved], pickup({ event_id: '7' })), saved);
    assert.equal(resolvePickupEvent([saved], pickup({ event_id: 7 })), saved);
  }
  assert.equal(resolvePickupEvent([event({ id: 7 }), event({ id: '7' })], pickup({ event_id: '7' })), null);
  assert.equal(resolvePickupEvent([event(), event()], pickup()), null);
  assert.equal(resolvePickupEvent([event({ id: 'constructor' })], pickup({ event_id: 'constructor' })).id, 'constructor');
});

test('malformed requests and calendar dates cannot be normalized into a different pickup day', () => {
  for (const occurrence_date of ['2026-02-30', '2026-13-01', '2026-11-00', '0000-11-23', '2026-1-23', '2026-11-23T00:00:00Z', '', null, {}]) {
    assert.equal(resolvePickupEvent([event()], pickup({ occurrence_date })), null);
  }
  for (const event_id of [null, {}, [], '', ' ', Infinity]) assert.equal(resolvePickupEvent([event()], pickup({ event_id })), null);
  for (const malformed of [null, {}, [], true, 'plans']) assert.equal(resolvePickupEvent(malformed, pickup()), null);
  for (const malformed of [null, [], true, 'pickup']) assert.equal(resolvePickupEvent([event()], malformed), null);
  assert.equal(resolvePickupEvent([null, [], event({ id: {} })], pickup()), null);
});

test('responding waits for a fresh calendar and passes the captured exact pickup version', async () => {
  const request = pending(), calls = [], saved = { ...request, status: 'accepted' };
  let finishRead;
  const answering = respondToCurrentPickup({ pickup: request, status: 'accepted',
    readCalendar: () => { calls.push('read'); return new Promise(resolve => { finishRead = resolve; }); },
    respond: async (captured, status) => {
      calls.push('respond'); assert.equal(status, 'accepted');
      assert.equal(captured.updated_at, '2026-11-23T10:00:00.123456+00:00');
      assert.notEqual(captured, request); return saved;
    }
  });
  assert.deepEqual(calls, ['read']);
  request.updated_at = '2026-11-23T10:01:00Z';
  finishRead(selected());
  assert.equal(await answering, saved);
  assert.deepEqual(calls, ['read', 'respond']);
});

test('fresh missing, cancelled, moved or excluded plans cannot reach the response writer', async () => {
  let writes = 0;
  for (const events of [[], [event({ status: 'cancelled' })], [event({ startDate: '2026-11-24' })],
    [event({ recurrence: 'weekly', excludedDates: ['2026-11-23'] })], [event(), event()]]) {
    await assert.rejects(respondToCurrentPickup({ pickup: pending(), status: 'declined',
      readCalendar: async () => selected(events), respond: async () => { writes++; }
    }), { code: 'PICKUP_UNAVAILABLE' });
  }
  assert.equal(writes, 0);
});

test('preflight cannot use another calendar or owner with the same event ID', async () => {
  let writes = 0;
  for (const calendar of [null, {}, { ...selected(), id: 'other' }, { ...selected(), ownerId: 'someone-else' }]) {
    await assert.rejects(respondToCurrentPickup({ pickup: pending(), status: 'accepted',
      readCalendar: async () => calendar, respond: async () => { writes++; }
    }), { code: 'PICKUP_UNAVAILABLE' });
  }
  assert.equal(writes, 0);
});

test('only current pending requests with a real response and version can start preflight', async () => {
  let reads = 0, writes = 0;
  const options = { status: 'accepted', readCalendar: async () => { reads++; return selected(); }, respond: async () => { writes++; } };
  for (const request of [null, pending({ status: 'accepted' }), pending({ status: 'cancelled' }),
    pending({ updated_at: '' }), pending({ updated_at: 'unknown' }), pending({ owner_id: '' }), pending({ occurrence_date: '2026-02-30' })]) {
    await assert.rejects(respondToCurrentPickup({ ...options, pickup: request }), { code: 'PICKUP_UNAVAILABLE' });
  }
  await assert.rejects(respondToCurrentPickup({ ...options, pickup: pending(), status: 'cancelled' }), { code: 'PICKUP_UNAVAILABLE' });
  assert.equal(reads, 0); assert.equal(writes, 0);
});

test('account or calendar changes during fresh read suppress the response', async () => {
  let active = true, finishRead, writes = 0;
  const answering = respondToCurrentPickup({ pickup: pending(), status: 'accepted', isCurrent: () => active,
    readCalendar: () => new Promise(resolve => { finishRead = resolve; }), respond: async () => { writes++; }
  });
  active = false; finishRead(selected());
  await assert.rejects(answering, { code: 'STALE_SCOPE' });
  assert.equal(writes, 0);
});

test('a stale action cannot start a fresh read or response', async () => {
  let calls = 0;
  await assert.rejects(respondToCurrentPickup({ pickup: pending(), status: 'accepted', isCurrent: () => false,
    readCalendar: async () => { calls++; return selected(); }, respond: async () => { calls++; }
  }), { code: 'STALE_SCOPE' });
  assert.equal(calls, 0);
});

test('a response finishing after scope change never publishes a former calendar result', async () => {
  let active = true, finishResponse;
  const answering = respondToCurrentPickup({ pickup: pending(), status: 'accepted', isCurrent: () => active,
    readCalendar: async () => selected(), respond: () => new Promise(resolve => { finishResponse = resolve; })
  });
  await new Promise(resolve => setImmediate(resolve));
  active = false; finishResponse({ ...pending(), status: 'accepted' });
  await assert.rejects(answering, { code: 'STALE_SCOPE' });
});

test('response conflicts propagate unchanged when a plan changes after valid preflight', async () => {
  const conflict = Object.assign(new Error('Assignment changed'), { code: '40001' });
  const request = pending(); let serverVersion = request.updated_at;
  await assert.rejects(respondToCurrentPickup({ pickup: request, status: 'accepted', readCalendar: async () => selected(),
    respond: async captured => {
      serverVersion = '2026-11-23T10:02:00Z';
      if (captured.updated_at !== serverVersion) throw conflict;
      return { ...captured, status: 'accepted' };
    }
  }), error => error === conflict);
});

test('scope checks also run after rejected reads and writes', async () => {
  for (const failing of ['read', 'respond']) {
    let active = true;
    await assert.rejects(respondToCurrentPickup({ pickup: pending(), status: 'accepted', isCurrent: () => active,
      readCalendar: async () => {
        if (failing === 'read') { active = false; throw new Error('read failed'); } return selected();
      },
      respond: async () => { active = false; throw new Error('write failed'); }
    }), { code: 'STALE_SCOPE' });
  }
});
