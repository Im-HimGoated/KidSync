const fs = require('node:fs');
const crypto = require('node:crypto');

const APP = Object.freeze({ id: '6838889267', bundleId: 'com.kidssync.app' });
const APP_URL = `https://api.appstoreconnect.apple.com/v1/apps/${APP.id}`;
class VerificationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const publicError = (code, message) => new VerificationError(code, message);

function createReadToken(privateKey, keyId, now = Math.floor(Date.now() / 1000)) {
  if (!/^[A-Z0-9]+$/i.test(keyId || '')) throw publicError('KEY_ID_REQUIRED', 'Set ASC_KEY_ID to the individual API Key ID.');
  let key;
  try { key = privateKey instanceof crypto.KeyObject ? privateKey : crypto.createPrivateKey(privateKey); }
  catch { throw publicError('KEY_FORMAT', 'The supplied file is not a supported private key.'); }
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw publicError('KEY_TYPE', 'An Apple P-256 private key is required.');
  }
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = encode({ sub: 'user', iat: now - 5, exp: now + 120, aud: 'appstoreconnect-v1', scope: [`GET /v1/apps/${APP.id}`] });
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function checkAppAccess({ privateKey, keyId, fetchImpl = fetch, now } = {}) {
  const token = createReadToken(privateKey, keyId, now);
  let response, body;
  try {
    response = await fetchImpl(APP_URL, {
      method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const errors = {
        401: ['UNAUTHORIZED', 'Apple rejected the Key ID/private-key pair. Check the individual key and its revocation status.'],
        403: ['FORBIDDEN', 'This key does not have permission to read KidsSync.'],
        404: ['APP_NOT_FOUND', 'KidsSync is unavailable to this key. Check its Apple team and app access.'],
      };
      const [code, message] = errors[response.status] || ['API_ERROR', `Apple returned HTTP ${response.status}.`];
      throw publicError(code, message);
    }
    body = await response.json();
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    // Never echo transport exceptions, response bodies, tokens or private-key input.
    throw publicError('CONNECTION_FAILED', 'Could not verify access with Apple. Check the connection and try again.');
  }
  const record = body?.data;
  if (record?.id !== APP.id || record?.attributes?.bundleId !== APP.bundleId) {
    throw publicError('APP_MISMATCH', 'The response did not match the configured KidsSync app.');
  }
  return { id: record.id, name: record.attributes.name, bundleId: record.attributes.bundleId, sku: record.attributes.sku };
}

async function main() {
  const keyFile = process.env.ASC_PRIVATE_KEY_PATH;
  if (!keyFile) throw publicError('KEY_PATH_REQUIRED', 'Set ASC_PRIVATE_KEY_PATH to the local .p8 file; keep it outside Git.');
  let privateKey;
  try { privateKey = fs.readFileSync(keyFile); }
  catch { throw publicError('KEY_READ_FAILED', 'Could not read the configured private-key file.'); }
  const app = await checkAppAccess({ privateKey, keyId: process.env.ASC_KEY_ID });
  console.log(JSON.stringify({ verified: true, app }, null, 2));
}

if (require.main === module) main().catch(error => {
  console.error(error instanceof VerificationError ? `${error.code}: ${error.message}` : 'VERIFICATION_FAILED: Could not verify KidsSync API access.');
  process.exitCode = 1;
});

module.exports = { APP, createReadToken, checkAppAccess };
