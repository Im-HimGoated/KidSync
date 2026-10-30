import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from './theme';
const KEY = 'kidssync:mobile:language:v1';
export default function useDeviceLanguage() {
  const [language, update] = useState('en');
  const changed = useRef(false), queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY).then(value => { if (active && !changed.current) update(theme.normalizeLanguage(value)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const setLanguage = useCallback(value => {
    changed.current = true;
    const next = theme.normalizeLanguage(value);
    update(next);
    queue.current = queue.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, next)).catch(() => {});
  }, []);
  return [language, setLanguage];
}
