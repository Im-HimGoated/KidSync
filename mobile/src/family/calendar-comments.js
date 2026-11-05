const sharing = require('../../../shared/backend/mobile-sharing');

function createCalendarComments({ client, account, calendar, getAccess = () => ({}), isCurrent = () => true, onChange = () => {}, api = sharing }) {
  const actor = { id: account?.id, email: String(account?.email || '').trim().toLowerCase() };
  const selected = { id: calendar?.id, ownerId: calendar?.ownerId || calendar?.owner_id };
  if (![actor.id, actor.email, selected.id, selected.ownerId].every(value => typeof value === 'string' && value.trim())) throw new Error('INVALID_COMMENT_SCOPE');
  const scope = JSON.stringify([actor.id, actor.email, selected.ownerId, selected.id]);
  let disposed = false, readVersion = 0, reading = false;
  let state = { scope, comments: [], loaded: false, loading: false, posting: false, loadError: false, postError: false, needsReview: false };
  const current = () => !disposed && isCurrent();
  const publish = patch => { if (current()) { state = { ...state, ...patch }; onChange(state); } };
  const canPost = () => {
    const access = getAccess();
    return current() && !access.stale && (selected.ownerId === actor.id || ['commenter', 'editor'].includes(access.role));
  };
  async function authenticate() {
    if (!current()) throw new Error('STALE_SCOPE');
    const result = await client.auth.getUser();
    const user = result?.data?.user;
    if (result?.error || user?.id !== actor.id || String(user?.email || '').trim().toLowerCase() !== actor.email) throw new Error('FORBIDDEN');
    if (!current()) throw new Error('STALE_SCOPE');
  }
  function checked(comment) {
    if (!comment || typeof comment.id !== 'string' || typeof comment.body !== 'string'
      || comment.owner_id !== selected.ownerId || comment.calendar_id !== selected.id) throw new Error('INVALID_COMMENT_SCOPE');
    return comment;
  }
  async function load({ silent = false } = {}) {
    if (!current() || state.posting || reading) return false;
    reading = true;
    const version = ++readVersion;
    if (!silent || !state.loaded) publish({ loading: true, loadError: false });
    try {
      await authenticate();
      const comments = await api.listCalendarComments(client, actor, selected);
      if (!Array.isArray(comments)) throw new Error('INVALID_COMMENTS');
      comments.forEach(checked);
      if (!current() || version !== readVersion) return false;
      publish({ comments, loaded: true, loading: false, loadError: false, needsReview: false });
      return true;
    } catch {
      if (current() && version === readVersion) publish({ loading: false, loadError: true });
      return false;
    } finally { reading = false; }
  }
  async function post(value) {
    if (!canPost() || state.posting || state.needsReview || !state.loaded) return { ok: false, reason: 'unavailable' };
    const body = typeof value === 'string' ? value.trim() : '';
    if (!body || Array.from(body).length > 1000) return { ok: false, reason: 'invalid' };
    readVersion++; // A read started before this post cannot erase its confirmation.
    publish({ posting: true, postError: false, loading: false });
    try {
      await authenticate();
      if (!canPost()) throw new Error('FORBIDDEN');
      const saved = checked(await api.addCalendarComment(client, actor, selected, { body }));
      if (saved.author_user_id !== actor.id || saved.body !== body) throw new Error('UNCONFIRMED_COMMENT');
      if (!current()) return { ok: false, reason: 'stale' };
      publish({ posting: false, comments: [...state.comments.filter(item => item.id !== saved.id), saved], postError: false });
      return { ok: true };
    } catch {
      if (current()) publish({ posting: false, postError: true, needsReview: true });
      return { ok: false, reason: 'failed' };
    }
  }
  return { scope, getState: () => state, canPost, load, post, dispose() { disposed = true; readVersion++; } };
}

module.exports = { createCalendarComments };
