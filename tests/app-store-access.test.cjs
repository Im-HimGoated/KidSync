const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { APP, createReadToken, checkAppAccess } = require('../mobile/scripts/check-app-store.cjs');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const keyId = 'TESTKEY123';
const record = { data: { id: APP.id, attributes: { name: 'KidsSync', bundleId: APP.bundleId, sku: 'kidssync-ios-001' } } };
const response = (body = record) => ({ ok: true, status: 200, json: async () => body });

test('individual verification tokens are signed, short-lived and scoped to one read of KidsSync', () => {
  const token = createReadToken(privateKey, keyId, 1_800_000_000);
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: keyId, typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.deepEqual(claims, { sub: 'user', iat: 1_799_999_995, exp: 1_800_000_120, aud: 'appstoreconnect-v1', scope: [`GET /v1/apps/${APP.id}`] });
  assert.equal(crypto.verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
});

test('verification calls only the pinned app endpoint, rejects redirects and returns selected public fields', async () => {
  const calls = [];
  const app = await checkAppAccess({ privateKey, keyId, fetchImpl: async (...args) => { calls.push(args); return response({ ...record, secret: 'not returned' }); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `https://api.appstoreconnect.apple.com/v1/apps/${APP.id}`);
  assert.equal(calls[0][1].method, 'GET');
  assert.equal(calls[0][1].redirect, 'error');
  assert.deepEqual(app, { id: APP.id, name: 'KidsSync', bundleId: APP.bundleId, sku: 'kidssync-ios-001' });
});

test('another app or bundle cannot be accepted as a verified KidsSync record', async () => {
  for (const body of [{ data: { ...record.data, id: 'other' } }, { data: { ...record.data, attributes: { bundleId: 'another.app' } } }]) {
    await assert.rejects(checkAppAccess({ privateKey, keyId, fetchImpl: async () => response(body) }), { code: 'APP_MISMATCH' });
  }
});

test('authentication failures and transport exceptions cannot echo credentials', async () => {
  for (const status of [401, 403, 404, 500]) {
    let reads = 0;
    await assert.rejects(checkAppAccess({ privateKey, keyId, fetchImpl: async () => ({ ok: false, status, json: async () => { reads++; return { secret: 'PRIVATE_CREDENTIAL' }; } }) }), error => !error.message.includes('PRIVATE_CREDENTIAL'));
    assert.equal(reads, 0);
  }
  await assert.rejects(checkAppAccess({ privateKey, keyId, fetchImpl: async () => { throw new Error('PRIVATE_CREDENTIAL'); } }), { code: 'CONNECTION_FAILED', message: 'Could not verify access with Apple. Check the connection and try again.' });
  await assert.rejects(checkAppAccess({ privateKey, keyId, fetchImpl: async () => { throw Object.assign(new Error('PRIVATE_CREDENTIAL'), { code: 'UNAUTHORIZED' }); } }), { code: 'CONNECTION_FAILED' });
});

test('invalid key material fails before any network request and never echoes its input', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(); };
  await assert.rejects(checkAppAccess({ privateKey: 'PRIVATE_CREDENTIAL', keyId, fetchImpl }), { code: 'KEY_FORMAT', message: 'The supplied file is not a supported private key.' });
  await assert.rejects(checkAppAccess({ privateKey, keyId: '', fetchImpl }), { code: 'KEY_ID_REQUIRED' });
  assert.equal(calls, 0);
});
