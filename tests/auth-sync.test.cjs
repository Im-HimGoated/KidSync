const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function source(name, async = false) {
  const start = html.indexOf(`    ${async ? 'async ' : ''}function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}

function signInSetup(response) {
  const submit = { disabled: false };
  const error = {};
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: id => id === 'signInEmail' ? { value: ' TEST@example.com ' } : id === 'signInPassword' ? { value: 'test-only-placeholder' } : error },
    normalizeEmail: value => value.trim().toLowerCase(), t: key => key,
    cloudClient: { auth: { async signInWithPassword(input) { calls.push(input.email); return response(); } } },
    cloudAuthMessage: value => value?.message || 'auth.unavailable',
    activateCloudAccount: user => calls.push(user.id), trackProductEvent() {},
    location: { reload: () => calls.push('reload') }, reportClientError: () => calls.push('error')
  });
  vm.runInContext(source('handleSignIn', true), context);
  return { submit, error, calls, run: () => context.handleSignIn({ preventDefault() {}, currentTarget: { querySelector: () => submit } }) };
}

test('successful cloud sign-in normalizes email and activates only a valid session', async () => {
  const setup = signInSetup(() => ({ data: { user: { id: 'test-user' }, session: {} }, error: null }));
  await setup.run();
  assert.deepEqual(setup.calls, ['test@example.com', 'test-user', 'reload']);
  assert.equal(setup.submit.disabled, false);
});

test('invalid sign-in and network failures restore the submit button without activating an account', async () => {
  for (const response of [() => ({ data: {}, error: { message: 'Invalid credentials' } }), () => { throw new Error('Offline'); }]) {
    const setup = signInSetup(response);
    await setup.run();
    assert.equal(setup.submit.disabled, false);
    assert.equal(setup.submit.textContent, 'auth.submitSignIn');
    assert(setup.error.textContent);
    assert(!setup.calls.includes('reload'));
  }
});

test('new cloud accounts start with no kids and existing kids are never replaced', () => {
  const storage = new Map();
  const context = vm.createContext({
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    cacheCloudAccount: user => ({ id: user.id }), migrateGuestDataToAccount() {}, migrateLegacyDataToAccount() {},
    accountDataKey: (id, name) => `${id}.${name}`, AUTH_ACTIVE_KEY: 'active', CLOUD_PENDING_KEY: 'pending', AUTH_PENDING_GUEST_CLAIM_KEY: 'claim'
  });
  vm.runInContext(source('activateCloudAccount'), context);
  context.activateCloudAccount({ id: 'new' });
  assert.equal(storage.get('new.kids'), '[]');
  storage.set('existing.kids', '[{"name":"Charlie"}]');
  context.activateCloudAccount({ id: 'existing' });
  assert.equal(storage.get('existing.kids'), '[{"name":"Charlie"}]');
});

function syncSetup({ online = true, pending = false, response = { data: null, error: null } } = {}) {
  const calls = [];
  const query = { select() { return this; }, eq(key, value) { calls.push([key, value]); return this; }, async maybeSingle() { return response; } };
  const context = vm.createContext({
    cloudClient: { from: table => { calls.push(table); return query; } }, cloudSession: { user: { id: 'test-user' } }, activeAccount: { provider: 'supabase' },
    hasPendingCloudSave: () => pending, flushCloudSave: async () => { calls.push('flush'); return true; },
    navigator: { onLine: online }, setCloudSaveState: value => calls.push(value),
    markCloudSavePending: () => calls.push('pending'), localStorage: { getItem: () => null, setItem: () => calls.push('timestamp') },
    cloudUpdatedKey: () => 'updated', applyCloudSnapshot: () => calls.push('apply'),
    window: { setTimeout() {} }, openWelcomeBackIfNeeded() {}, reportClientError: () => calls.push('error')
  });
  vm.runInContext(source('hydrateCloudSchedule', true), context);
  return { calls, run: () => context.hydrateCloudSchedule() };
}

test('offline sync avoids network reads and pending local edits are flushed first', async () => {
  const offline = syncSetup({ online: false });
  assert.equal(await offline.run(), false);
  assert.deepEqual(offline.calls, ['offline']);
  const pending = syncSetup({ pending: true });
  assert.equal(await pending.run(), true);
  assert.deepEqual(pending.calls, ['flush']);
});

test('cloud reads are scoped to the current user and errors leave local data untouched', async () => {
  const success = syncSetup({ response: { data: { schedule: {}, updated_at: 'version-1' }, error: null } });
  assert.equal(await success.run(), true);
  assert(success.calls.some(value => Array.isArray(value) && value[0] === 'user_id' && value[1] === 'test-user'));
  assert(success.calls.includes('apply'));
  assert.equal(success.calls.at(-1), 'cloud');
  const failure = syncSetup({ response: { data: null, error: new Error('Unavailable') } });
  assert.equal(await failure.run(), false);
  assert(!failure.calls.includes('apply'));
  assert.equal(failure.calls.at(-1), 'syncFailed');
});

test('first cloud sync creates a pending snapshot rather than erasing local data', async () => {
  const setup = syncSetup();
  assert.equal(await setup.run(), true);
  assert(setup.calls.includes('pending'));
  assert(setup.calls.includes('flush'));
  assert(!setup.calls.includes('apply'));
});
