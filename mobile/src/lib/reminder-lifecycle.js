const { notificationTarget } = require('./local-reminders');

/** Confirmed owner snapshots only; never pass optimistic/outbox calendar data.
 * update invalidates in-flight work synchronously. All methods return promises
 * and absorb SDK failures into onState({ status: 'error' }). No prompt at startup.
 */
function createReminderLifecycle({ service, onState = () => {}, onNavigate = () => {} }) {
  let context = {}, generation = 0, disposed = false, enabledFor = null, pendingResponse = null;
  let actionPending = false;
  const current = token => !disposed && token === generation;
  const publish = (token, state) => { if (current(token)) onState(state); };
  async function routePending() {
    if (disposed || !context.userId || !context.ready || !pendingResponse) return;
    const response = pendingResponse;
    pendingResponse = null;
    const target = notificationTarget(response, context.userId);
    const entry = target && context.calendars?.find(item => item.id === target.calendarId && (!item.ownerId || item.ownerId === context.userId));
    if (entry?.data?.activities?.some(event => String(event?.id) === target.eventId && event.status !== 'cancelled')) {
      onNavigate(target);
    }
  }
  async function reconcile(token) {
    if (!current(token)) return;
    const captured = context;
    try {
      if (!service.available()) { publish(token, { status: 'unsupported', enabled: false }); return; }
      await service.activateAccount(captured.userId);
      if (!current(token)) return;
      if (!captured.userId) { enabledFor = null; publish(token, { status: 'signed-out', enabled: false }); return; }
      const preference = await service.readPreference(captured.userId);
      if (!current(token)) return;
      enabledFor = preference.enabled ? captured.userId : null;
      if (!preference.enabled) {
        await service.cancelForUser(captured.userId);
        publish(token, { status: 'disabled', enabled: false });
        await routePending();
        return;
      }
      if (!captured.ready) { publish(token, { status: preference.enabled ? 'waiting' : 'disabled', enabled: preference.enabled }); return; }
      const result = await service.synchronize({ ...captured, privateContent: true, isCurrent: () => current(token) });
      if (!current(token)) return;
      if (result.status === 'permission-denied') enabledFor = null;
      publish(token, { ...result, enabled: result.status === 'permission-denied' ? false : preference.enabled });
      await routePending();
    } catch {
      if (!current(token)) return;
      enabledFor = null;
      try { if (captured.userId) await service.cancelForUser(captured.userId); } catch { /* Retry on foreground or explicit retry. */ }
      publish(token, { status: 'error', enabled: false });
    }
  }
  return {
    update(next) {
      const previous = context.userId;
      context = { userId: next?.userId || null, ready: next?.ready === true,
        calendars: next?.calendars, language: next?.language === 'zh' ? 'zh' : 'en' };
      if (previous !== context.userId) enabledFor = null;
      const token = ++generation;
      publish(token, { status: 'loading', enabled: enabledFor === context.userId && !!enabledFor });
      return reconcile(token);
    },
    refresh() { return reconcile(generation); },
    async configure(enabled) {
      if (actionPending || disposed || !context.userId) return;
      actionPending = true;
      const token = generation, userId = context.userId;
      if (!enabled) enabledFor = null;
      publish(token, { status: 'configuring', enabled: !!enabled, busy: true });
      try {
        const result = await service.configure(userId, { enabled, showTitles: false, userInitiated: true });
        if (!current(token)) { await service.cancelForUser(userId); return; }
        if (result.status === 'permission-denied' || result.status === 'unsupported') {
          enabledFor = null;
          publish(token, { ...result, enabled: false });
        } else await reconcile(token);
      } catch {
        enabledFor = null;
        try { await service.cancelForUser(userId); } catch { /* Retry remains available. */ }
        publish(token, { status: 'error', enabled: false });
      } finally { actionPending = false; }
    },
    receiveResponse(response) {
      pendingResponse = response;
      return routePending();
    },
    presentation(notice) {
      const target = notificationTarget(notice, context.userId);
      const exists = target && context.calendars?.some(entry => entry.id === target.calendarId
        && (!entry.ownerId || entry.ownerId === context.userId)
        && entry.data?.activities?.some(event => String(event?.id) === target.eventId && event.status !== 'cancelled'));
      const show = !disposed && !!enabledFor && enabledFor === context.userId
        && !!exists;
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
    },
    dispose() { disposed = true; generation++; enabledFor = null; pendingResponse = null; },
  };
}
module.exports = { createReminderLifecycle };
