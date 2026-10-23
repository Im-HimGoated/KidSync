import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Image,
  Linking, Pressable, StyleSheet, Text, View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './lib/supabase';
import schedules from '../../shared/backend/schedules';
import WelcomeScreen from './screens/WelcomeScreen';
import SignInScreen, { signInCopy } from './screens/SignInScreen';
import signInHelpers from './lib/sign-in';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from './screens/OnboardingScreen';
import preferences from './lib/preferences';

const preferenceStore = preferences.createPreferenceStore(AsyncStorage);

const copy = {
  en: {
    signIn: 'Sign in', email: 'Email', password: 'Password', signOut: 'Sign out',
    calendar: 'Calendar', empty: 'No activities yet', noCalendar: 'No calendars yet',
    loading: 'Loading your calendar', live: 'Live', connecting: 'Connecting',
    failed: 'Could not sync. Pull down to retry.', account: 'Create or recover an account',
    allDay: 'All day', recurring: 'Repeats', noTime: 'Time not set',
    readOnly: 'Calendar preview', noDate: 'Date not set', authFailed: 'Sign-in failed. Please try again.',
    back: 'Back to welcome', linkFailed: 'Could not open KidsSync. Please try again.',
    setupSaved: 'Your setup choices are saved for this account on this device.',
    setupFailed: 'Could not finish saving your setup choices.', retrySetup: 'Retry saving choices'
  },
  zh: {
    signIn: '\u767b\u5f55', email: '\u90ae\u7bb1', password: '\u5bc6\u7801', signOut: '\u9000\u51fa',
    calendar: '\u65e5\u5386', empty: '\u6682\u65e0\u6d3b\u52a8', noCalendar: '\u6682\u65e0\u65e5\u5386',
    loading: '\u6b63\u5728\u52a0\u8f7d\u65e5\u5386', live: '\u5b9e\u65f6\u540c\u6b65', connecting: '\u6b63\u5728\u8fde\u63a5',
    failed: '\u540c\u6b65\u5931\u8d25\uff0c\u8bf7\u4e0b\u62c9\u91cd\u8bd5\u3002',
    account: '\u521b\u5efa\u6216\u627e\u56de\u8d26\u6237', allDay: '\u5168\u5929',
    recurring: '\u91cd\u590d', noTime: '\u672a\u8bbe\u7f6e\u65f6\u95f4', readOnly: '\u65e5\u5386\u9884\u89c8',
    noDate: '\u672a\u8bbe\u7f6e\u65e5\u671f', authFailed: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002',
    back: '\u8fd4\u56de\u6b22\u8fce\u9875', linkFailed: '\u65e0\u6cd5\u6253\u5f00 KidsSync\uff0c\u8bf7\u91cd\u8bd5\u3002',
    setupSaved: '设置选择已为此账户保存在此设备上。',
    setupFailed: '无法完成保存设置选择。', retrySetup: '重试保存选择'
  }
};

function Workspace() {
  const [language, setLanguage] = useState('en');
  const t = copy[language];
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const authRequest = useRef(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('CONNECTING');
  const [calendarId, setCalendarId] = useState(null);
  const [watcher, setWatcher] = useState(null);
  const [entryScreen, setEntryScreen] = useState('welcome');
  const [onboardingInitial, setOnboardingInitial] = useState(null);
  const [pendingSetup, setPendingSetup] = useState(null);
  const [preferencesUser, setPreferencesUser] = useState(null);
  const [preferenceError, setPreferenceError] = useState(false);
  const [preferenceAttempt, setPreferenceAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let authChanged = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authChanged = true;
      if (active) { setSession(next); setBooting(false); if (!next) setPendingSetup(null); }
    });
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!active || authChanged) return;
      setSession(data.session);
      if (authError) setError(authError.message);
      setBooting(false);
    }).catch(() => { if (active) { setError(copy.en.authFailed); setBooting(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    const userId = session?.user.id;
    setPreferencesUser(null); setPreferenceError(false);
    if (!userId) return;
    (async () => {
      try {
        const saved = pendingSetup ? await preferenceStore.adoptPending(userId, pendingSetup) : await preferenceStore.readForUser(userId);
        if (!active) return;
        setPreferencesUser(saved ? userId : null);
        if (pendingSetup) setPendingSetup(null);
      } catch { if (active) setPreferenceError(true); }
    })();
    return () => { active = false; };
  }, [session?.user.id, pendingSetup, preferenceAttempt]);

  async function beginSetup() {
    try {
      const draft = await preferenceStore.readDraft();
      const saved = draft ? null : await preferenceStore.readPending();
      setOnboardingInitial(draft || (saved ? { answers: saved, step: 4, review: true, choice: saved.reminders } : null));
    }
    catch { setOnboardingInitial(null); }
    setError(''); setEntryScreen('onboarding');
  }

  async function beginSignIn() {
    try { setPendingSetup(await preferenceStore.readPending()); }
    catch { setPendingSetup(null); }
    setError(''); setEntryScreen('signin');
  }

  async function completeSetup(answers) {
    await preferenceStore.savePending(answers);
    setPendingSetup(answers); setError(''); setEntryScreen('signin');
  }

  useEffect(() => {
    setSnapshot(null);
    setCalendarId(null);
    setLoaded(false);
    setError('');
    setStatus('CONNECTING');
    if (!session?.user.id) { setWatcher(null); return; }
    setEntryScreen('welcome');
    let active = true;
    const sync = schedules.watchSchedule(supabase, session.user.id, {
      onData: row => { setSnapshot({ userId: session.user.id, value: row?.schedule || null }); setLoaded(true); setError(''); },
      onError: () => { setError('sync'); setLoaded(true); },
      onStatus: setStatus
    });
    setWatcher(sync);
    const foreground = next => {
      if (next === 'active') {
        supabase.auth.startAutoRefresh();
        sync.refresh();
      } else supabase.auth.stopAutoRefresh();
    };
    foreground(AppState.currentState);
    const listener = AppState.addEventListener('change', foreground);
    // Reconnect/catch up even if a device temporarily loses Realtime connectivity.
    const interval = setInterval(() => {
      if (active && AppState.currentState === 'active') sync.refresh();
    }, 5000);
    return () => {
      active = false;
      listener.remove();
      clearInterval(interval);
      sync.stop();
      supabase.auth.stopAutoRefresh();
    };
  }, [session?.user.id]);

  async function signIn() {
    if (authRequest.current) return;
    authRequest.current = true;
    setBusy(true); setError('');
    try {
      await signInHelpers.authenticate(supabase, email, password);
      setPassword('');
    } catch (authError) { setError(signInCopy[language][signInHelpers.signInErrorKey(authError)]); }
    finally { authRequest.current = false; setBusy(false); }
  }

  async function recoverPassword() {
    if (authRequest.current) return false;
    authRequest.current = true;
    setBusy(true); setError('');
    try {
      await signInHelpers.requestPasswordReset(supabase, email);
      return true;
    } catch (authError) {
      setError(signInCopy[language][signInHelpers.signInErrorKey(authError)]);
      return false;
    } finally { authRequest.current = false; setBusy(false); }
  }

  async function openWebsite() {
    setError('');
    try { await Linking.openURL('https://kid-sync-delta.vercel.app/'); }
    catch { setError(t.linkFailed); }
  }

  const calendars = schedules.calendarEntries(snapshot?.userId === session?.user.id ? snapshot?.value : null);
  const calendar = calendars.find(item => item.id === calendarId) || calendars[0];
  const activities = (Array.isArray(calendar?.data.activities) ? calendar.data.activities : [])
    .filter(item => item && typeof item === 'object')
    .slice().sort((a, b) => `${a.startDate || ''} ${a.start || ''}`.localeCompare(`${b.startDate || ''} ${b.start || ''}`));

  return <SafeAreaView style={styles.page}>
    <View style={styles.header}>
      <View style={styles.brand}>
        <Image source={require('../../assets/kidssync-app-icon-192.png')} style={styles.logo} />
        <Text style={styles.title}>KidsSync</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={language === 'en' ? 'Switch to Chinese' : 'Switch to English'}
        onPress={() => setLanguage(language === 'en' ? 'zh' : 'en')} style={styles.button}>
        <Text style={styles.link}>{language === 'en' ? '\u4e2d\u6587' : 'EN'}</Text>
      </Pressable>
    </View>
    {booting ? <ActivityIndicator accessibilityLabel={t.loading} style={styles.loader} /> : !session && entryScreen === 'welcome' ?
      <WelcomeScreen language={language} onSignIn={beginSignIn}
        onGetStarted={beginSetup} onOpenWebsite={openWebsite} error={error} /> : !session && entryScreen === 'onboarding' ?
      <OnboardingScreen language={language} initialDraft={onboardingInitial} onDraftChange={preferenceStore.saveDraft} onComplete={completeSetup}
        onBack={() => setEntryScreen('welcome')} /> : !session ?
      <SignInScreen language={language} email={email} password={password} busy={busy} error={error}
        onEmailChange={value => { setEmail(value); setError(''); }}
        onPasswordChange={value => { setPassword(value); setError(''); }}
        onSignIn={signIn} onGetStarted={beginSetup} onOpenWebsite={openWebsite} onRecover={recoverPassword}
        onBack={() => { setError(''); setPassword(''); setEntryScreen('welcome'); }} /> : <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.heading}>{t.calendar}</Text>
            <Text style={styles.secondary}>{t.readOnly} · {status === 'SUBSCRIBED' ? t.live : t.connecting}</Text>
          </View>
          <Pressable accessibilityRole="button" style={styles.button} onPress={async () => {
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) setError(signOutError.message);
          }}><Text style={styles.link}>{t.signOut}</Text></Pressable>
        </View>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error === 'sync' ? t.failed : error}</Text>}
        {preferencesUser === session.user.id && <Text style={[styles.secondary, { paddingHorizontal: 16 }]}>{t.setupSaved}</Text>}
        {preferenceError && <View style={{ paddingHorizontal: 16 }}><Text accessibilityRole="alert" style={styles.error}>{t.setupFailed}</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setPreferenceAttempt(value => value + 1)}><Text style={styles.link}>{t.retrySetup}</Text></Pressable></View>}
        <View style={styles.calendars}>{calendars.map(item => <Pressable key={item.id} accessibilityRole="button"
          accessibilityState={{ selected: item.id === calendar?.id }} onPress={() => setCalendarId(item.id)}
          style={[styles.calendar, item.id === calendar?.id && styles.selected]}>
          <Text style={styles.label}>{item.name}</Text>
        </Pressable>)}</View>
        {!loaded ? <ActivityIndicator accessibilityLabel={t.loading} style={styles.loader} /> :
          <FlatList data={activities} keyExtractor={(item, index) => `${item.id || 'event'}:${index}`}
            refreshing={false} onRefresh={() => watcher?.refresh()} contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.secondary}>{calendar ? t.empty : t.noCalendar}</Text>}
            renderItem={({ item }) => <View style={styles.event}>
              <Text style={styles.eventTitle}>{item.title || t.calendar}</Text>
              <Text style={styles.secondary}>{item.startDate || t.noDate} · {item.allDay ? t.allDay : item.start ? `${item.start}${item.end ? ` - ${item.end}` : ''}` : t.noTime}</Text>
              {!!item.child && <Text style={styles.secondary}>{item.child}</Text>}
              {!!item.location && <Text style={styles.secondary}>{item.location}</Text>}
              {!!item.recurrence && item.recurrence !== 'none' && <Text style={styles.secondary}>{t.recurring}</Text>}
            </View>} />}
      </View>}
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><Workspace /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, gap: 12, flexWrap: 'wrap' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36 },
  title: { fontSize: 22, fontWeight: '700', color: '#172b3a' },
  heading: { fontSize: 24, fontWeight: '700', color: '#172b3a' },
  label: { fontSize: 16, color: '#172b3a' },
  button: { minHeight: 44, minWidth: 44, padding: 10, justifyContent: 'center' },
  link: { color: '#17649b', fontSize: 16 },
  error: { color: '#a12632', paddingHorizontal: 16, fontSize: 16 },
  loader: { margin: 32 },
  content: { flex: 1 },
  flex: { flexShrink: 1, gap: 4 },
  secondary: { color: '#4c626e', fontSize: 15, lineHeight: 22 },
  calendars: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
  calendar: { minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#c5d2da' },
  selected: { backgroundColor: '#dceefa', borderColor: '#17649b' },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  event: { paddingVertical: 16, gap: 4, borderBottomWidth: 1, borderBottomColor: '#d7e1e7' },
  eventTitle: { fontSize: 18, fontWeight: '600', color: '#172b3a' }
});
