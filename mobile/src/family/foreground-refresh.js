// Collaboration tables are not guaranteed to be in the Realtime publication.
// Catch up while active without interrupting forms or overlapping reads.
function startForegroundRefresh({ refresh, canRefresh, intervalMs = 15000, timers = globalThis }) {
  let stopped = false, pending = false;
  async function tick() {
    if (stopped || pending || !canRefresh()) return;
    pending = true;
    try { await refresh(); }
    catch { /* The screen owns load-error feedback; later refreshes remain usable. */ }
    finally { pending = false; }
  }
  const timer = timers.setInterval(() => { void tick(); }, intervalMs);
  return () => { stopped = true; timers.clearInterval(timer); };
}

module.exports = { startForegroundRefresh };
