const erasure = require('./account-erasure');
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const known = new Set(['AUTH_REQUIRED', 'NOT_CONFIGURED', 'REAUTH_FAILED', 'ADDITIONAL_VERIFICATION_REQUIRED',
  'DELETE_FAILED', 'SERVICE_UNAVAILABLE', 'INVALID_REQUEST']);
const MARKER_PREFIX = 'kidssync:mobile:deletion:v1:';
function markerKey(userId) {
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 300) throw failure('INVALID_ACCOUNT_SCOPE');
  return MARKER_PREFIX + encodeURIComponent(userId);
}
async function rememberDeletedAccount(storage, userId) {
  await storage.setItem(markerKey(userId), JSON.stringify({ version: 1, userId, confirmedDeleted: true }));
}
async function pendingCleanup(storage) {
  const ids = [];
  for (const key of await storage.getAllKeys()) {
    if (!key.startsWith(MARKER_PREFIX)) continue;
    try {
      const value = JSON.parse(await storage.getItem(key));
      if (value?.version === 1 && value.confirmedDeleted === true && markerKey(value.userId) === key) ids.push(value.userId);
    } catch { /* Unrecognized storage is never authority to erase an account. */ }
  }
  return ids;
}
function failure(code) { const error = new Error(code); error.code = code; return error; }
function current(isCurrent) { if (typeof isCurrent !== 'function' || !isCurrent()) throw failure('STALE_SCOPE'); }
async function actor(client, userId, isCurrent) {
  current(isCurrent);
  const result = await client.auth.getUser(); current(isCurrent);
  if (result.error || result.data?.user?.id !== userId) throw failure('AUTH_REQUIRED');
  return result.data.user;
}
async function invoke(client, method, body) {
  let result;
  try { result = await client.functions.invoke('delete-account', { method, ...(body ? { body } : {}) }); }
  catch { throw failure('SERVICE_UNAVAILABLE'); }
  if (result.error) {
    let code;
    try { code = (await result.error.context?.clone?.().json())?.code; } catch { /* Gateway errors may have no JSON body. */ }
    if (!known.has(code)) code = result.error.context?.status === 404 ? 'NOT_CONFIGURED'
      : result.error.context?.status === 401 ? 'AUTH_REQUIRED' : 'SERVICE_UNAVAILABLE';
    throw failure(code);
  }
  return result.data;
}
async function availability(client, userId, { isCurrent = () => true } = {}) {
  await actor(client, userId, isCurrent);
  const data = await invoke(client, 'GET'); current(isCurrent);
  if (data?.available !== true || data?.version !== 1) throw failure('NOT_CONFIGURED');
  return true;
}
async function deleteAccount(client, userId, { password, confirmationEmail, isCurrent = () => true } = {}) {
  if (typeof password !== 'string' || !password || password.length > 1024) throw failure('INVALID_REQUEST');
  const user = await actor(client, userId, isCurrent);
  if (!normalizeEmail(user.email) || normalizeEmail(confirmationEmail) !== normalizeEmail(user.email)) throw failure('STALE_SCOPE');
  current(isCurrent);
  const data = await invoke(client, 'POST', { password, confirmationEmail: user.email });
  // Once the server confirms deletion, a changed screen must not disguise it
  // as a failed deletion. Cleanup uses this captured ID, never a new account.
  if (data?.deleted !== true) throw failure('DELETE_FAILED');
  return { deleted: true, userId };
}
module.exports = { availability, deleteAccount, forgetAccount: erasure.forgetAccount,
  rememberDeletedAccount, pendingCleanup, finishCleanup: (storage, userId) => storage.removeItem(markerKey(userId)) };
