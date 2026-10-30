import { useLayoutEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import reminders from './local-reminders';
import lifecycleHelpers from './reminder-lifecycle';

const service = reminders.createLocalReminderService({ notifications: Notifications, storage: AsyncStorage, platform: Platform.OS });

// Mount once in the signed-in app shell (also keep mounted during sign-out).
// ready means a complete, confirmed owner snapshot, not cached optimistic edits.
export default function useLocalReminders({ userId, calendars, ready, language = 'en', onNavigate }) {
  const [state, setState] = useState({ status: 'loading', enabled: false });
  const lifecycle = useRef(null), navigate = useRef(onNavigate);
  // Snapshot helpers may return a new array every render; do not reconcile in
  // a setState/render loop when confirmed calendar contents have not changed.
  const snapshotKey = JSON.stringify(calendars ?? null);
  useLayoutEffect(() => { navigate.current = onNavigate; }, [onNavigate]);
  useLayoutEffect(() => {
    const controller = lifecycleHelpers.createReminderLifecycle({ service, onState: setState, onNavigate: target => navigate.current?.(target) });
    lifecycle.current = controller;
    if (Platform.OS !== 'web') {
      Notifications.setNotificationHandler({ handleNotification: async notice => controller.presentation(notice) });
    }
    const foreground = AppState.addEventListener('change', next => { if (next === 'active') controller.refresh(); });
    const taps = Platform.OS === 'web' ? null : Notifications.addNotificationResponseReceivedListener(response => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      controller.receiveResponse(response).catch(() => {});
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    });
    if (Platform.OS !== 'web') Notifications.getLastNotificationResponseAsync().then(response => {
      if (response && response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        controller.receiveResponse(response).catch(() => {});
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    }).catch(() => {});
    return () => { controller.dispose(); foreground.remove(); taps?.remove(); lifecycle.current = null; };
  }, []);
  useLayoutEffect(() => { lifecycle.current?.update({ userId, calendars, ready, language }); }, [userId, snapshotKey, ready, language]);
  return { state, busy: ['loading', 'configuring'].includes(state.status),
    enable: () => lifecycle.current?.configure(true), disable: () => lifecycle.current?.configure(false),
    refresh: () => lifecycle.current?.refresh(), openSettings: () => Linking.openSettings() };
}
