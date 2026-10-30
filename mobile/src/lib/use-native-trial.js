import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import trial from './native-trial';

const store = trial.createTrialStore(AsyncStorage);
export default function useNativeTrial(active) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const mounted = useRef(true);
  const execute = useCallback(async (action, fallback = 'saveFailed') => {
    try {
      const next = await action();
      if (mounted.current) { setData(next); setError(''); }
      return next;
    } catch (failure) {
      if (failure.code === 'clockFailed' && mounted.current) setData(value => value ? { ...value, elapsedMs: trial.LIMIT_MS } : value);
      if (mounted.current) setError(['expired', 'alreadyClaimed', 'eventLimit', 'eventMissing', 'loadFailed', 'clockFailed'].includes(failure.code) ? failure.code : fallback);
      return null;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    execute(() => store.load(), 'loadFailed').finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [execute]);
  useEffect(() => {
    if (!active || !data?.id || data.claimedBy) return;
    const clock = trial.createForegroundClock(delta => { if (delta > 0) execute(() => store.advance(delta)); });
    clock.setActive(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', state => clock.setActive(state === 'active'));
    const interval = setInterval(clock.sample, 1000);
    return () => { clock.setActive(false); clearInterval(interval); listener.remove(); };
  }, [active, data?.id, data?.claimedBy, execute]);
  return { data, loading, error, clearError: () => setError(''),
    start: () => execute(() => store.start(), 'loadFailed'),
    reload: () => execute(() => store.load(), 'loadFailed'),
    saveDraft: draft => execute(() => store.saveDraft(draft)),
    saveEvent: (input, id) => execute(() => store.saveEvent(input, id)),
    removeEvent: id => execute(() => store.removeEvent(id)),
    saveProfile: (profile, requireName) => execute(() => store.saveProfile(profile, requireName)),
    saveProfileDraft: profile => execute(() => store.saveProfileDraft(profile)),
    reserveClaim: userId => execute(() => store.reserveClaim(userId)),
    markClaimed: (userId, calendarId) => execute(() => store.markClaimed(userId, calendarId)) };
}
