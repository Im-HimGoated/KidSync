const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createCalendarComments } = require('../mobile/src/family/calendar-comments');
const { sharedCalendarTarget } = require('../mobile/src/family/async-flow');

function fixture(extra = {}) {
  const account = { id: 'actor', email: 'actor@example.com' }, calendar = { id: 'same-id', ownerId: 'owner' };
  let access = { role: 'commenter', stale: false }, current = true;
  const calls = [], states = [];
  const saved = { id: 'comment-1', owner_id: 'owner', calendar_id: 'same-id', author_user_id: 'actor', author_email: account.email, body: 'Pickup confirmed.' };
  const client = { auth: { getUser: async () => ({ data: { user: account } }) } };
  const api = { listCalendarComments: async (...args) => { calls.push(['read', ...args]); return []; },
    addCalendarComment: async (...args) => { calls.push(['post', ...args]); return saved; }, ...extra };
  const controller = createCalendarComments({ client, account, calendar, api, getAccess: () => access, isCurrent: () => current, onChange: state => states.push(state) });
  return { controller, client, account, calendar, api, calls, states, saved, access: value => { access = value; }, leave: () => { current = false; } };
}

test('accepted viewer/commenter/editor invitations target the real owner calendar immediately', () => {
  for (const role of ['viewer', 'commenter', 'editor']) {
    const invitation = { id: 'invite', owner_id: 'owner', calendar_id: 'same-id', calendar_name: 'School', status: 'active', role };
    const target = sharedCalendarTarget(invitation);
    assert.deepEqual(target.calendar, { id: 'same-id', ownerId: 'owner', name: 'School' });
    assert.equal(target.invitation.role, role);
    assert.notEqual(target.invitation, invitation);
  }
  for (const patch of [{ status: 'pending' }, { status: 'banned' }, { role: 'unknown' }, { owner_id: '' }, { calendar_id: '' }]) assert.throws(() => sharedCalendarTarget({ id: 'invite', owner_id: 'owner', calendar_id: 'same-id', status: 'active', role: 'viewer', ...patch }));
});
test('comments read only the selected owner/calendar and publish confirmed records', async () => {
  const f = fixture();
  await f.controller.load();
  assert.deepEqual(f.calls[0].slice(1), [f.client, f.account, f.calendar]);
  assert.equal((await f.controller.post('  Pickup confirmed.  ')).ok, true);
  assert.deepEqual(f.calls[1].slice(2), [f.account, f.calendar, { body: 'Pickup confirmed.' }]);
  assert.deepEqual(f.controller.getState().comments, [f.saved]);
});
test('viewers and stale roles can read but cannot post', async () => {
  for (const access of [{ role: 'viewer' }, { role: 'unknown' }, { role: 'commenter', stale: true }]) {
    const f = fixture(); f.access(access); await f.controller.load();
    assert.equal(f.controller.canPost(), false);
    assert.equal((await f.controller.post('Pickup confirmed.')).ok, false);
    assert.equal(f.calls.filter(call => call[0] === 'post').length, 0);
  }
});
test('authenticated account mismatch blocks both reads and posts', async () => {
  const f = fixture();
  f.client.auth.getUser = async () => ({ data: { user: { id: 'other', email: 'other@example.com' } } });
  assert.equal(await f.controller.load(), false);
  assert.equal(f.controller.getState().loadError, true);
  assert.deepEqual(f.calls, []);
});
test('different owner data and unconfirmed post results never appear in the conversation', async () => {
  const f = fixture({ listCalendarComments: async () => [{ id: 'wrong', owner_id: 'other', calendar_id: 'same-id', body: 'private' }] });
  await f.controller.load(); assert.equal(f.controller.getState().loaded, false);
  assert.deepEqual(f.controller.getState().comments, []);
  f.api.listCalendarComments = async () => []; await f.controller.load();
  f.api.addCalendarComment = async () => ({ ...f.saved, owner_id: 'other' });
  assert.equal((await f.controller.post('Pickup confirmed.')).ok, false);
  assert.deepEqual(f.controller.getState().comments, []);
});
test('failed posts require review and never automatically resend', async () => {
  let attempts = 0;
  const f = fixture({ addCalendarComment: async () => { attempts++; throw new Error('response lost'); } });
  await f.controller.load(); await f.controller.post('Pickup confirmed.');
  assert.equal(f.controller.getState().postError, true);
  assert.equal(f.controller.getState().needsReview, true);
  await f.controller.post('Pickup confirmed.'); assert.equal(attempts, 1);
  await f.controller.load(); assert.equal(f.controller.getState().needsReview, false);
});
test('duplicate taps and background reads cannot race an in-flight post', async () => {
  let finish;
  const f = fixture({ addCalendarComment: () => new Promise(resolve => { finish = resolve; }) });
  await f.controller.load();
  const first = f.controller.post('Pickup confirmed.');
  await Promise.resolve(); await Promise.resolve();
  assert.equal((await f.controller.post('Pickup confirmed.')).ok, false);
  assert.equal(await f.controller.load(), false);
  finish(f.saved); assert.equal((await first).ok, true);
});
test('a read started before a post cannot remove its confirmed comment', async () => {
  const f = fixture(); await f.controller.load(); let finish;
  f.api.listCalendarComments = () => new Promise(resolve => { finish = resolve; });
  const pending = f.controller.load(); await Promise.resolve(); await Promise.resolve();
  await f.controller.post('Pickup confirmed.'); finish([]); await pending;
  assert.deepEqual(f.controller.getState().comments, [f.saved]);
});
test('late reads after changing calendar or account never publish', async () => {
  let finish;
  const f = fixture({ listCalendarComments: () => new Promise(resolve => { finish = resolve; }) });
  const pending = f.controller.load(); await Promise.resolve(); await Promise.resolve();
  const before = f.states.length; f.leave(); finish([f.saved]); await pending;
  assert.equal(f.states.length, before);
});
test('slow comment reads complete without being starved by periodic refreshes', async () => {
  let finish, calls = 0;
  const f = fixture({ listCalendarComments: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const first = f.controller.load(); await Promise.resolve(); await Promise.resolve();
  assert.equal(await f.controller.load({ silent: true }), false);
  assert.equal(await f.controller.load(), false);
  assert.equal(calls, 1);
  finish([f.saved]); assert.equal(await first, true);
  assert.equal(f.controller.getState().loaded, true);
  assert.deepEqual(f.controller.getState().comments, [f.saved]);
});
test('a role downgrade during authentication is checked before sending', async () => {
  const f = fixture(); await f.controller.load(); let finish;
  f.client.auth.getUser = () => new Promise(resolve => { finish = resolve; });
  const pending = f.controller.post('Pickup confirmed.'); f.access({ role: 'viewer' });
  finish({ data: { user: f.account } }); await pending;
  assert.equal(f.calls.filter(call => call[0] === 'post').length, 0);
});
test('empty and oversized comments cannot be submitted', async () => {
  const f = fixture(); await f.controller.load();
  for (const value of ['', '  ', 'a'.repeat(1001), {}]) assert.equal((await f.controller.post(value)).reason, 'invalid');
  assert.equal(f.calls.filter(call => call[0] === 'post').length, 0);
});
test('comments have complete bilingual copy and use the existing modal host', () => {
  const source = fs.readFileSync(require.resolve('../mobile/src/ui/CalendarComments.js'), 'utf8');
  const copy = vm.runInNewContext(`(${source.match(/export const calendarCommentsCopy = (\{[^]*?\n\});/)[1]})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  assert.doesNotMatch(source, /<Modal|<Sheet/);
  const calendar = fs.readFileSync(require.resolve('../mobile/src/calendar/CalendarScreen.js'), 'utf8');
  assert.match(calendar, /<Sheet visible=\{!!sheet\}/);
  assert.match(calendar, /'planning', 'comments'\]\.includes/);
  assert.match(calendar, /<CalendarComments key=\{scopeId\}/);
});
