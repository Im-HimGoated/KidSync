const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { validateSignUp, createAccount, signUpErrorKey } = require('../mobile/src/lib/sign-up');
const { createPreferenceStore } = require('../mobile/src/lib/preferences');

test('sign-up requires valid email, the existing eight-character minimum, and matching confirmation', () => {
  assert.deepEqual(validateSignUp('', '', ''), { email: 'emailRequired', password: 'passwordRequired', confirmation: 'confirmationRequired' });
  assert.deepEqual(validateSignUp('bad', '1234567', 'different'), { email: 'emailInvalid', password: 'passwordShort', confirmation: 'passwordMismatch' });
  assert.deepEqual(validateSignUp(' user@example.com ', 'password ', 'password '), {});
  assert.deepEqual(validateSignUp('user@example.com', 'password ', 'password'), { confirmation: 'passwordMismatch' });
});

test('invalid sign-up fields never call the auth service', async () => {
  let calls = 0;
  const client = { auth: { signUp() { calls++; } } };
  for (const args of [['invalid', 'password', 'password'], ['a@example.com', 'short', 'short'], ['a@example.com', 'password', 'mismatch']]) {
    await assert.rejects(createAccount(client, ...args), { code: 'INVALID_FIELDS' });
  }
  assert.equal(calls, 0);
});

test('native signup uses existing auth, trims only email, preserves passwords and uses the production confirmation URL', async () => {
  const calls = [];
  const client = { auth: { signUp: async value => { calls.push(value); return { data: { user: { id: 'new' }, session: null } }; } } };
  assert.deepEqual(await createAccount(client, ' person@example.com ', ' password ', ' password '), { status: 'confirmation', email: 'person@example.com' });
  assert.deepEqual(calls, [{ email: 'person@example.com', password: ' password ', options: { emailRedirectTo: 'https://kid-sync-delta.vercel.app/' } }]);
});

test('confirmation-only and immediate-session responses are distinct; missing user data is not success', async () => {
  for (const [data, status] of [[{ user: { id: 'new' }, session: null }, 'confirmation'], [{ user: { id: 'new' }, session: { user: { id: 'new' } } }, 'signedIn'], [{ user: { id: 'private', identities: [] }, session: null }, 'confirmation']]) {
    assert.equal((await createAccount({ auth: { signUp: async () => ({ data }) } }, 'a@example.com', 'password', 'password')).status, status);
  }
  for (const data of [null, {}, { user: null }]) await assert.rejects(createAccount({ auth: { signUp: async () => ({ data }) } }, 'a@example.com', 'password', 'password'), /did not complete/);
});

test('SDK failures remain failures and render safe errors rather than server details', async () => {
  const error = { code: 'weak_password', message: 'internal details' };
  await assert.rejects(createAccount({ auth: { signUp: async () => ({ error }) } }, 'a@example.com', 'password', 'password'), value => value === error);
  for (const [input, expected] of [[error, 'weakPassword'], [{ code: 'user_already_exists' }, 'alreadyRegistered'], [{ code: 'email_exists' }, 'alreadyRegistered'], [{ code: 'email_address_invalid' }, 'emailInvalid'], [{ code: 'signup_disabled' }, 'signupDisabled'], [{ code: 'email_provider_disabled' }, 'signupDisabled'], [{ status: 429 }, 'rateLimited'], [{ name: 'AuthRetryableFetchError' }, 'connectionFailed'], [new Error('sensitive detail'), 'authFailed']]) assert.equal(signUpErrorKey(input), expected);
});

test('reviewed answers survive confirmation and are attached only after a successful account sign-in', async () => {
  const data = new Map();
  const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => data.set(key, value), removeItem: async key => data.delete(key) };
  const store = createPreferenceStore(storage);
  const answers = { people: 'children', view: 'week', week: 'sunday', hours: 'evening', reminders: '30' };
  await store.savePending(answers);
  await createAccount({ auth: { signUp: async () => ({ data: { user: { id: 'new' }, session: null } }) } }, 'a@example.com', 'password', 'password');
  assert.deepEqual(await createPreferenceStore(storage).readPending(), answers);
  assert.equal(await store.readForUser('new'), null);
  await store.adoptPending('new', answers);
  assert.deepEqual(await store.readForUser('new'), answers);
  assert.equal(await store.readForUser('different'), null);
});

test('native signup translations cover all form fields, validation and server error states', () => {
  const source = fs.readFileSync(require.resolve('../mobile/src/screens/SignUpScreen.js'), 'utf8');
  const copy = vm.runInNewContext(`(${source.match(/export const signUpCopy = (\{[^]*?\n\});/)[1]})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  for (const language of ['en', 'zh']) for (const value of Object.values(copy[language])) assert.ok(value.length);
  for (const key of Object.values(validateSignUp('', '', '')).concat('passwordShort', 'passwordMismatch', 'weakPassword', 'alreadyRegistered', 'signupDisabled', 'rateLimited', 'connectionFailed', 'authFailed')) assert.ok(copy.en[key] && copy.zh[key]);
});
