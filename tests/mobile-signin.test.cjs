const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateSignIn, authenticate, signInErrorKey, requestPasswordReset } = require('../mobile/src/lib/sign-in');
const root = path.resolve(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'mobile/src/screens/SignInScreen.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'mobile/src/App.js'), 'utf8');

test('sign-in validates required fields and email, without imposing new signup password rules', () => {
  assert.deepEqual(validateSignIn('', ''), { email: 'emailRequired', password: 'passwordRequired' });
  assert.deepEqual(validateSignIn('invalid', 'password'), { email: 'emailInvalid' });
  assert.deepEqual(validateSignIn(' user@example.com ', '  '), {});
  assert.deepEqual(validateSignIn('user@example.com', 'short'), {});
});

test('sign-in sends the trimmed email and unchanged password to the existing SDK', async () => {
  const calls = [];
  const client = { auth: { async signInWithPassword(value) { calls.push(value); return { data: { session: 'test-session' } }; } } };
  assert.deepEqual(await authenticate(client, ' user@example.com ', ' password '), { session: 'test-session' });
  assert.deepEqual(calls, [{ email: 'user@example.com', password: ' password ' }]);
  await assert.rejects(authenticate(client, 'invalid', 'password'), { code: 'INVALID_FIELDS' });
  assert.equal(calls.length, 1);
});

test('SDK errors remain errors, and messages are mapped to safe localized copy', async () => {
  const error = { code: 'invalid_credentials' };
  await assert.rejects(authenticate({ auth: { signInWithPassword: async () => ({ error }) } }, 'user@example.com', 'password'), actual => actual === error);
  for (const [input, expected] of [
    [error, 'invalidCredentials'], [{ code: 'email_not_confirmed' }, 'emailNotConfirmed'],
    [{ status: 429 }, 'rateLimited'], [{ code: 'over_email_send_rate_limit' }, 'rateLimited'],
    [{ name: 'AuthRetryableFetchError' }, 'connectionFailed'], [{ status: 0 }, 'connectionFailed'],
    [new Error('sensitive server detail'), 'authFailed']
  ]) assert.equal(signInErrorKey(input), expected);
});

test('password recovery uses the same backend with the existing HTTPS web recovery flow', async () => {
  const calls = [];
  const client = { auth: { async resetPasswordForEmail(...args) { calls.push(args); return {}; } } };
  await requestPasswordReset(client, ' user@example.com ');
  assert.deepEqual(calls, [['user@example.com', { redirectTo: 'https://kid-sync-delta.vercel.app/?recovery=1' }]]);
  await assert.rejects(requestPasswordReset(client, 'invalid'), /Invalid email/);
  assert.equal(calls.length, 1);
  await assert.rejects(requestPasswordReset({ auth: { resetPasswordForEmail: async () => ({ error: new Error('limited') }) } }, 'user@example.com'), /limited/);
});

test('professional sign-in provides Chinese parity and every validation/error translation', () => {
  const literal = screen.match(/export const signInCopy = (\{[^]*?\n\});/)[1];
  const copy = vm.runInNewContext(`(${literal})`);
  assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
  for (const language of ['en', 'zh']) {
    for (const value of Object.values(copy[language])) assert.ok(value.length);
    for (const key of ['emailRequired', 'emailInvalid', 'passwordRequired', 'invalidCredentials', 'emailNotConfirmed', 'rateLimited', 'connectionFailed', 'authFailed']) assert.ok(copy[language][key]);
  }
});

test('sign-in supports password visibility, keyboard navigation and accessible validation', () => {
  assert.match(screen, /secureTextEntry=\{!showPassword\}/);
  assert.match(screen, /accessibilityLabel=\{showPassword \? t.hide : t.show\}/);
  assert.match(screen, /onSubmitEditing=\{\(\) => passwordRef.current\?\.focus\(\)\}/);
  assert.match(screen, /onSubmitEditing=\{submit\}/);
  assert.match(screen, /autoComplete="current-password"/);
  assert.match(screen, /keyboardShouldPersistTaps="handled"/);
  assert.match(screen, /KeyboardAvoidingView/);
  assert.match(screen, /accessibilityRole="alert"/);
  assert.match(screen, /accessibilityLiveRegion="polite"/);
  assert.match(screen, /if \(errors.email\) \{ emailRef.current\?\.focus\(\); return; \}/);
});

test('sign-in uses bundled family imagery and keeps existing auth/sync ownership', () => {
  const imagePath = screen.match(/require\('([^']+\.jpg)'\)/)[1];
  assert.ok(fs.existsSync(path.resolve(root, 'mobile/src/screens', imagePath)));
  assert.match(screen, /heroImage: \{ width: '100%', height: '100%' \}/);
  assert.match(app, /<SignInScreen language=\{language\}/);
  assert.match(app, /signInHelpers.authenticate\(supabase, email, password\)/);
  assert.match(app, /signInHelpers.requestPasswordReset\(supabase, email\)/);
  assert.equal((app.match(/if \(authRequest.current\)/g) || []).length, 3);
  assert.doesNotMatch(screen, /createClient|\.signInWithPassword\(|\.resetPasswordForEmail\(/);
});
