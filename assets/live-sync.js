(() => {
  let channel = null;
  let userId = null;
  let timer = null;
  let fallback = null;
  let reading = false;
  let requested = false;
  let generation = 0;
  let appliedVersion = null;

  function isEditing() {
    return Boolean(document.querySelector('dialog[open]'));
  }

  function eligible() {
    return Boolean(userId && cloudSession?.user.id === userId
      && activeAccount?.provider === 'supabase' && navigator.onLine && !document.hidden);
  }

  function requestRefresh(delay = 120) {
    if (!userId) return;
    requested = true;
    if (timer !== null || reading) return;
    timer = window.setTimeout(refresh, delay);
  }

  async function refresh() {
    timer = null;
    if (!eligible()) return;
    if (isEditing() || cloudSyncBusy || cloudHydrating || hasPendingCloudSave()) {
      requestRefresh(750);
      return;
    }
    const run = generation;
    requested = false;
    reading = true;
    try {
      const applied = await hydrateCloudSchedule({ live: true });
      if (run === generation && !applied) requested = true;
    } catch (error) {
      if (run === generation) {
        requested = true;
        reportClientError(error, 'live-sync');
      }
    } finally {
      if (run === generation) {
        reading = false;
        if (requested) requestRefresh(1000);
      }
    }
  }

  function stop() {
    generation += 1;
    window.clearTimeout(timer);
    window.clearInterval(fallback);
    timer = null;
    fallback = null;
    userId = null;
    requested = false;
    reading = false;
    appliedVersion = null;
    if (channel) {
      const previous = channel;
      channel = null;
      Promise.resolve(cloudClient.removeChannel(previous)).catch(() => {});
    }
  }

  function start() {
    const nextUser = activeAccount?.provider === 'supabase' ? cloudSession?.user.id : null;
    if (!cloudClient || !nextUser) { stop(); return; }
    if (nextUser === userId && channel) return;
    stop();
    userId = nextUser;
    const run = generation;
    const onChange = () => { if (run === generation) requestRefresh(); };
    try {
      channel = cloudClient.channel(`family-schedule:${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'family_schedules', filter: `user_id=eq.${userId}` }, onChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'family_schedules', filter: `user_id=eq.${userId}` }, onChange)
        .subscribe(status => {
          if (run !== generation) return;
          if (status === 'SUBSCRIBED') requestRefresh(0);
          else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) requestRefresh(1000);
        });
    } catch (error) {
      reportClientError(error, 'live-sync-subscribe');
    }
    // Also catches missed messages and projects not yet added to Realtime's publication.
    fallback = window.setInterval(() => { if (eligible()) requestRefresh(0); }, 5000);
    requestRefresh(0);
  }

  document.addEventListener('close', () => { if (requested) requestRefresh(0); }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRefresh(0); });
  window.addEventListener('online', () => { start(); requestRefresh(0); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  cloudClient?.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') stop();
    else if (['SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) window.setTimeout(start, 0);
  });
  window.KidsSyncLiveSync = {
    start, stop, isEditing, refresh: requestRefresh,
    version: () => appliedVersion,
    rememberVersion: value => { appliedVersion = value; }
  };
  start();
})();
