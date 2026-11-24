const MAX_BODY_BYTES = 8192;
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_REQUEST');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('INVALID_REQUEST'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { reader.releaseLock(); }
}

function assuranceLevel(jwt) {
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal; }
  catch { return null; }
}

/** No user ID or email target supplied by a client is ever used for deletion. */
export function createDeleteAccountHandler({ createClient, url, publishableKey, serviceRoleKey,
  allowedOrigin = 'https://kid-sync-delta.vercel.app' }) {
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
    if (origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (status, value) => new Response(JSON.stringify(value), { status, headers });
    if (origin && origin !== allowedOrigin) return respond(403, { code: 'ORIGIN_NOT_ALLOWED' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!['GET', 'POST'].includes(request.method)) return respond(405, { code: 'METHOD_NOT_ALLOWED' });
    if (!url || !publishableKey || !serviceRoleKey || typeof createClient !== 'function') return respond(503, { code: 'NOT_CONFIGURED' });
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
    if (!match) return respond(401, { code: 'AUTH_REQUIRED' });
    const jwt = match[1], authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
    let temporaryAuth;
    try {
      const caller = createClient(url, publishableKey, { auth: authOptions, global: { headers: { Authorization: `Bearer ${jwt}` } } });
      const verified = await caller.auth.getUser(jwt);
      const user = verified?.data?.user;
      if (verified?.error || !user?.id || !normalizeEmail(user.email)) return respond(401, { code: 'AUTH_REQUIRED' });
      const capability = await caller.rpc('account_deletion_status');
      if (capability.error || capability.data?.available !== true || capability.data?.version !== 1) {
        return respond(503, { code: 'NOT_CONFIGURED' });
      }
      if (request.method === 'GET') return respond(200, { available: true, version: 1 });
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return respond(400, { code: 'INVALID_REQUEST' });
      let body;
      try { body = await readBody(request); } catch { return respond(400, { code: 'INVALID_REQUEST' }); }
      if (!record(body) || Object.keys(body).some(key => !['password', 'confirmationEmail'].includes(key))
        || typeof body.password !== 'string' || !body.password || body.password.length > 1024
        || normalizeEmail(body.confirmationEmail) !== normalizeEmail(user.email)) return respond(400, { code: 'INVALID_REQUEST' });
      // getUser above verified the token. Only then is its assurance claim used.
      if (user.factors?.some(factor => factor.status === 'verified') && assuranceLevel(jwt) !== 'aal2') {
        return respond(403, { code: 'ADDITIONAL_VERIFICATION_REQUIRED' });
      }
      temporaryAuth = createClient(url, publishableKey, { auth: authOptions }).auth;
      const reauthenticated = await temporaryAuth.signInWithPassword({ email: user.email, password: body.password });
      body.password = '';
      if (reauthenticated.error || reauthenticated.data?.user?.id !== user.id) return respond(401, { code: 'REAUTH_FAILED' });
      // Validate the original actor again after the password request. A revoked
      // or deleted session must not acquire a privileged action from a stale read.
      const current = await caller.auth.getUser(jwt);
      if (current.error || current.data?.user?.id !== user.id
        || normalizeEmail(current.data.user.email) !== normalizeEmail(user.email)) return respond(401, { code: 'AUTH_REQUIRED' });
      const admin = createClient(url, serviceRoleKey, { auth: authOptions });
      const removed = await admin.auth.admin.deleteUser(user.id, false);
      if (removed.error) return respond(503, { code: 'DELETE_FAILED' });
      return respond(200, { deleted: true });
    } catch {
      return respond(503, { code: 'SERVICE_UNAVAILABLE' });
    } finally {
      // Reauthentication must not leave an extra live session after a failed
      // deletion. After success, Auth has already removed every refresh session.
      try { await temporaryAuth?.signOut({ scope: 'local' }); } catch { /* No credentials or server details are logged. */ }
    }
  };
}
