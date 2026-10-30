import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import scheduleSync from './schedule-sync';

const empty = userId => ({ userId, row: null, confirmedRow: null, loaded: false, status: 'CONNECTING', pendingCount: 0,
  pending: [], conflicts: [], error: null, offline: false, cachedAt: null });

/** App retains Auth refresh lifecycle and navigation; this hook owns schedule IO. */
export default function useScheduleSync({ client, userId, storage = AsyncStorage }) {
  const scope = useRef(userId); scope.current = userId;
  const controller = useRef(null);
  const [state, setState] = useState(() => empty(userId));
  useEffect(() => {
    if (!userId) { controller.current = null; setState(empty(userId)); return; }
    let active = true, channel;
    const store = scheduleSync.createScheduleSync({ client, storage, userId,
      isCurrent: () => active && scope.current === userId,
      onChange: next => { if (active && scope.current === userId) setState(next); } });
    controller.current = { userId, store };
    const refresh = () => { if (active && scope.current === userId && AppState.currentState === 'active') void store.refresh(); };
    // The subscription's status alone never claims that a schedule was saved.
    // An authenticated read or acknowledged write establishes the data state.
    try {
      channel = client.channel(`native-owner-sync:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_schedules', filter: `user_id=eq.${userId}` }, refresh)
        .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    } catch { /* Five-second foreground catch-up also works without Realtime. */ }
    void store.load().then(refresh).catch(() => {});
    const listener = AppState.addEventListener('change', next => { if (next === 'active') refresh(); });
    const interval = setInterval(refresh, 5000);
    return () => {
      active = false; store.stop(); listener.remove(); clearInterval(interval);
      if (controller.current?.store === store) controller.current = null;
      if (channel) { try { Promise.resolve(client.removeChannel(channel)).catch(() => {}); } catch {} }
    };
  }, [client, storage, userId]);

  const call = useCallback((method, ...args) => {
    const current = controller.current;
    if (!userId || scope.current !== userId || current?.userId !== userId) {
      const error = new Error('This account is no longer active.'); error.code = 'STALE_SCOPE'; return Promise.reject(error);
    }
    return current.store[method](...args);
  }, [userId]);
  const refresh = useCallback(() => call('refresh'), [call]);
  const retry = useCallback(() => call('retry'), [call]);
  const acceptConfirmed = useCallback(row => call('acceptConfirmed', row), [call]);
  const saveActivity = useCallback((calendarId, event, options) => call('saveActivity', calendarId, event, options), [call]);
  const deleteActivity = useCallback((calendarId, eventId, options) => call('deleteActivity', calendarId, eventId, options), [call]);
  const discardPending = useCallback(() => call('discardPending'), [call]);
  const visible = state.userId === userId ? state : empty(userId);
  return { ...visible, refresh, retry, acceptConfirmed, saveActivity, deleteActivity, discardPending };
}
