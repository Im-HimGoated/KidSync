import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from './theme';
import appearanceStorage from './appearance-store';

const defaultTheme = theme.createTheme(theme.DEFAULT_APPEARANCE);
const fallback = { ...defaultTheme, loading: false, saving: false, error: '', setAppearance: async () => false, resetAppearance: async () => false, retry: async () => false, available: false };
const Context = createContext(fallback);

/** Wrap the complete workspace, including native Modals, once per account.
 * Render-function children let an auth-owning shell consume runtime tokens
 * without moving its authentication state under a second provider.
 */
export function AppearanceProvider({ accountId = null, storage = AsyncStorage, children }) {
  const scope = appearanceStorage.scopeFor(accountId), systemScheme = useColorScheme();
  const store = useMemo(() => appearanceStorage.createAppearanceStore(storage), [storage]);
  const [state, setState] = useState({ scope: null, settings: theme.DEFAULT_APPEARANCE, loaded: false, saving: false, error: '' });
  const owner = useRef(scope), mounted = useRef(true), version = useRef(0), operation = useRef('save'), settingsRef = useRef({ scope, settings: theme.DEFAULT_APPEARANCE });
  owner.current = scope;
  if (settingsRef.current.scope !== scope) settingsRef.current = { scope, settings: theme.DEFAULT_APPEARANCE };
  const visible = state.scope === scope ? state : { scope, settings: theme.DEFAULT_APPEARANCE, loaded: false, saving: false, error: '' };
  const resolved = useMemo(() => theme.createTheme(visible.settings, systemScheme), [visible.settings, systemScheme]);
  const load = useCallback(async () => {
    if (!mounted.current || owner.current !== scope) return false;
    const request = ++version.current, captured = scope;
    try {
      const settings = await store.read(accountId);
      if (!mounted.current || owner.current !== captured || version.current !== request) return false;
      settingsRef.current = { scope: captured, settings };
      setState({ scope: captured, settings, loaded: true, saving: false, error: '' });
      return true;
    } catch {
      if (mounted.current && owner.current === captured && version.current === request) {
        settingsRef.current = { scope: captured, settings: theme.DEFAULT_APPEARANCE };
        setState({ scope: captured, settings: theme.DEFAULT_APPEARANCE, loaded: true, saving: false, error: 'load' });
      }
      return false;
    }
  }, [accountId, scope, store]);
  useEffect(() => {
    mounted.current = true; load();
    return () => { mounted.current = false; version.current++; };
  }, [load]);
  const setAppearance = useCallback(async patch => {
    if (!mounted.current || owner.current !== scope) return false;
    operation.current = 'save';
    const captured = scope, request = ++version.current;
    const next = theme.normalizeAppearance({ ...settingsRef.current.settings, ...patch });
    settingsRef.current = { scope: captured, settings: next };
    setState({ scope: captured, settings: next, loaded: true, saving: true, error: '' });
    try {
      const saved = await store.save(accountId, patch);
      if (!mounted.current || owner.current !== captured || version.current !== request) return false;
      settingsRef.current = { scope: captured, settings: saved };
      setState({ scope: captured, settings: saved, loaded: true, saving: false, error: '' });
      return true;
    } catch {
      if (mounted.current && owner.current === captured && version.current === request) setState({ scope: captured, settings: next, loaded: true, saving: false, error: 'save' });
      return false;
    }
  }, [accountId, scope, store]);
  const resetAppearance = useCallback(async () => {
    if (!mounted.current || owner.current !== scope) return false;
    operation.current = 'reset';
    const captured = scope, request = ++version.current;
    settingsRef.current = { scope: captured, settings: theme.DEFAULT_APPEARANCE };
    setState({ scope: captured, settings: theme.DEFAULT_APPEARANCE, loaded: true, saving: true, error: '' });
    try {
      const settings = await store.reset(accountId);
      if (!mounted.current || owner.current !== captured || version.current !== request) return false;
      settingsRef.current = { scope: captured, settings };
      setState({ scope: captured, settings, loaded: true, saving: false, error: '' });
      return true;
    } catch {
      if (mounted.current && owner.current === captured && version.current === request) setState({ scope: captured, settings: theme.DEFAULT_APPEARANCE, loaded: true, saving: false, error: 'save' });
      return false;
    }
  }, [accountId, scope, store]);
  const retry = useCallback(() => visible.error === 'save' ? operation.current === 'reset' ? resetAppearance() : setAppearance(settingsRef.current.settings) : load(), [visible.error, setAppearance, resetAppearance, load]);
  const value = useMemo(() => ({ ...resolved, loading: !visible.loaded, saving: visible.saving, error: visible.error, setAppearance, resetAppearance, retry, available: true }), [resolved, visible.loaded, visible.saving, visible.error, setAppearance, resetAppearance, retry]);
  return <Context.Provider value={value}>{typeof children === 'function' ? children(value) : children}</Context.Provider>;
}
export function useAppearance() { return useContext(Context); }
// Declare the factory outside the component. It returns StyleSheet.create(...)
// or a plain style map, keeping layout stable while runtime colors change.
export function useThemeStyles(factory) {
  const { colors, palettes, isDark } = useAppearance();
  return useMemo(() => factory(colors, palettes, isDark), [factory, colors, palettes, isDark]);
}
