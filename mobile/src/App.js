import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Image,
  Dimensions, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Home, UsersRound } from 'lucide-react-native';
import { supabase } from './lib/supabase';
import schedules from '../../shared/backend/schedules';
import WelcomeScreen from './screens/WelcomeScreen';
import SignInScreen, { signInCopy } from './screens/SignInScreen';
import SignUpScreen, { signUpCopy } from './screens/SignUpScreen';
import signUpHelpers from './lib/sign-up';
import signInHelpers from './lib/sign-in';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from './screens/OnboardingScreen';
import preferences from './lib/preferences';
import nativeTrial from './lib/native-trial';
import useNativeTrial from './lib/use-native-trial';
import TrialCalendarScreen, { trialCopy } from './screens/TrialCalendarScreen';
import PersonalizeCalendarScreen from './screens/PersonalizeCalendarScreen';
import trialImport from '../../shared/backend/claim-native-trial';
import mobileCalendar from '../../shared/backend/mobile-calendar';
import CalendarScreen from './calendar/CalendarScreen';
import phoneAccess from './lib/phone-access';
import HomeScreen from './screens/HomeScreen';
import FamilyScreen from './screens/FamilyScreen';
import { colors } from './calendar/ui';
import AccountSettings from './ui/AccountSettings';
import useDeviceLanguage from './ui/use-device-language';
import useScheduleSync from './lib/use-schedule-sync';
import SyncStatus from './ui/SyncStatus';

const preferenceStore = preferences.createPreferenceStore(AsyncStorage);

const copy = {
  en: {
    signIn: 'Sign in', email: 'Email', password: 'Password', signOut: 'Sign out',
    calendar: 'Calendar', empty: 'No activities yet', noCalendar: 'No calendars yet',
    loading: 'Loading your calendar', live: 'Live', connecting: 'Connecting',
    failed: 'Could not sync. Pull down to retry.', account: 'Create or recover an account',
    allDay: 'All day', recurring: 'Repeats', noTime: 'Time not set',
    readOnly: 'Your family calendar', noDate: 'Date not set', authFailed: 'Sign-in failed. Please try again.',
    back: 'Back to welcome', linkFailed: 'Could not open KidsSync. Please try again.',
    setupSaved: 'Your setup choices are saved for this account on this device.',
    setupFailed: 'Could not finish saving your setup choices.', retrySetup: 'Retry saving choices',
    trialReady: 'Your preview plans are still on this device.', trialSave: 'Save preview to my account', trialPersonalize: 'Make your calendar yours',
    trialSaved: 'Your preview was saved as a separate account calendar.', trialSaving: 'Saving preview…', trialBack: 'Back to your calendar profile',
    trialSaveFailed: 'Could not save the preview to your account. Your plans are still on this device; retry when connected.',
    trialConflict: 'Your account calendar changed. Retry to save alongside its latest plans.',
    trialMarkFailed: 'The calendar is saved to your account, but this device could not mark it complete. Retrying is safe and will not create a duplicate.',
    home: 'Home', family: 'Family', account: 'Account', accountSettings: 'Calendar preferences', close: 'Close', signedInAs: 'Signed in as'
  },
  zh: {
    signIn: '\u767b\u5f55', email: '\u90ae\u7bb1', password: '\u5bc6\u7801', signOut: '\u9000\u51fa',
    calendar: '\u65e5\u5386', empty: '\u6682\u65e0\u6d3b\u52a8', noCalendar: '\u6682\u65e0\u65e5\u5386',
    loading: '\u6b63\u5728\u52a0\u8f7d\u65e5\u5386', live: '\u5b9e\u65f6\u540c\u6b65', connecting: '\u6b63\u5728\u8fde\u63a5',
    failed: '\u540c\u6b65\u5931\u8d25\uff0c\u8bf7\u4e0b\u62c9\u91cd\u8bd5\u3002',
    account: '\u521b\u5efa\u6216\u627e\u56de\u8d26\u6237', allDay: '\u5168\u5929',
    recurring: '\u91cd\u590d', noTime: '\u672a\u8bbe\u7f6e\u65f6\u95f4', readOnly: '家庭日历',
    noDate: '\u672a\u8bbe\u7f6e\u65e5\u671f', authFailed: '\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002',
    back: '\u8fd4\u56de\u6b22\u8fce\u9875', linkFailed: '\u65e0\u6cd5\u6253\u5f00 KidsSync\uff0c\u8bf7\u91cd\u8bd5\u3002',
    setupSaved: '设置选择已为此账户保存在此设备上。',
    setupFailed: '无法完成保存设置选择。', retrySetup: '重试保存选择',
    trialReady: '体验日程仍保存在此设备上。', trialSave: '将体验日历保存到账户', trialPersonalize: '让日历更适合你',
    trialSaved: '体验日历已单独保存在你的账户中。', trialSaving: '正在保存体验日历…', trialBack: '返回日历个人资料',
    trialSaveFailed: '无法将体验日历保存到账户。计划仍在此设备上，请联网后重试。',
    trialConflict: '账户日历已更改。请重试，在最新安排旁保存体验日历。',
    trialMarkFailed: '日历已保存到账户，但此设备无法标记为完成。可以安全重试，不会重复创建。',
    home: '首页', family: '家庭', account: '账户', accountSettings: '日历偏好', close: '关闭', signedInAs: '当前账户'
  }
};

function BottomNavigation({ language, active, onChange, familyPendingCount = 0 }) {
  const t = copy[language];
  return <View accessibilityRole="tablist" style={styles.bottomNav}>
    {[{ key: 'home', label: t.home, icon: Home }, { key: 'calendar', label: t.calendar, icon: CalendarDays },
      { key: 'family', label: t.family, icon: UsersRound, count: familyPendingCount }].map(item => {
      const Icon = item.icon, selected = active === item.key;
      return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label}
        onPress={() => onChange(item.key)} style={({ pressed }) => [styles.bottomTab, selected && styles.bottomTabSelected, pressed && { opacity: 0.55 }]}>
        <View style={styles.bottomIcon}>
          <Icon size={21} color={selected ? colors.blue : colors.muted} strokeWidth={selected ? 2.4 : 1.8} />
          {!!item.count && <View accessibilityLabel={`${item.count} pending`} style={styles.bottomBadge}><Text style={styles.bottomBadgeText}>{item.count > 9 ? '9+' : item.count}</Text></View>}
        </View>
        <Text style={[styles.bottomTabText, selected && styles.bottomTabTextSelected]}>{item.label}</Text>
      </Pressable>;
    })}
  </View>;
}

function Workspace() {
  const [language, setLanguage] = useDeviceLanguage();
  const t = copy[language];
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const authRequest = useRef(false);
  const [error, setError] = useState('');
  const [calendarId, setCalendarId] = useState(null);
  const [entryScreen, setEntryScreen] = useState('welcome');
  const [workspaceView, setWorkspaceView] = useState('home');
  const [familyPendingCount, setFamilyPendingCount] = useState(0);
  const [calendarFocusDate, setCalendarFocusDate] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [onboardingInitial, setOnboardingInitial] = useState(null);
  const [pendingSetup, setPendingSetup] = useState(null);
  const [preferencesUser, setPreferencesUser] = useState(null);
  const [preferenceError, setPreferenceError] = useState(false);
  const [preferenceAttempt, setPreferenceAttempt] = useState(0);
  const [accountPreferences, setAccountPreferences] = useState(null);
  const [guestPreferences, setGuestPreferences] = useState(preferences.DEFAULTS);
  const [accountSetup, setAccountSetup] = useState(false);
  const saveSetupDraft = useCallback(draft => session?.user.id && accountSetup
    ? preferenceStore.saveDraftForUser(session.user.id, draft) : preferenceStore.saveDraft(draft), [session?.user.id, accountSetup]);
  const trial = useNativeTrial(!booting && !session && entryScreen === 'trial');
  const [trialAuthIntent, setTrialAuthIntent] = useState(false), [trialSetupReturn, setTrialSetupReturn] = useState(false);
  const [trialSaving, setTrialSaving] = useState(false), [trialImportError, setTrialImportError] = useState('');
  const importRequest = useRef(false), accountScope = useRef(null);
  accountScope.current = session?.user.id || null;
  const ownerSync = useScheduleSync({ client: supabase, userId: session?.user.id });
  const ownerActivityActions = useMemo(() => ({
    ...mobileCalendar,
    saveActivity: (_client, _userId, id, event, { original } = {}) => ownerSync.saveActivity(id, event, { original }),
    deleteActivity: (_client, _userId, id, eventId, { original } = {}) => ownerSync.deleteActivity(id, eventId, { original }),
  }), [ownerSync.saveActivity, ownerSync.deleteActivity]);

  useEffect(() => {
    if (!session && entryScreen === 'trial' && trial.data?.elapsedMs >= nativeTrial.LIMIT_MS) setEntryScreen('personalize');
  }, [session, entryScreen, trial.data?.elapsedMs]);

  async function beginTrial({ personalize = false } = {}) {
    const data = await trial.start();
    try { setGuestPreferences(await preferenceStore.readPending() || preferences.DEFAULTS); }
    catch { setGuestPreferences(preferences.DEFAULTS); }
    if (!data) return;
    if (data.claimedBy || data.claimOwner) { await beginSignIn(); return; }
    setError(''); setTrialImportError(''); setTrialAuthIntent(false);
    setEntryScreen(personalize || data.elapsedMs >= nativeTrial.LIMIT_MS ? 'personalize' : 'trial');
  }

  async function configureTrial(profile) {
    if (!await trial.saveProfile(profile, false)) return;
    setTrialSetupReturn(true);
    await beginSetup();
  }

  async function returnFromPersonalize(profile) {
    if (!await trial.saveProfileDraft(profile)) return;
    setTrialAuthIntent(false);
    setEntryScreen(session || trial.data.elapsedMs >= nativeTrial.LIMIT_MS ? 'welcome' : 'trial');
  }

  async function continueTrial(view, profile) {
    const data = await trial.saveProfile(profile, view === 'signup');
    if (!data) return false;
    if (session) return saveTrialToAccount(data);
    setTrialAuthIntent(true);
    if (view === 'signin') await beginSignIn();
    else await beginCreateAccount();
    return true;
  }

  async function saveTrialToAccount(data = trial.data) {
    const userId = session?.user.id;
    if (!userId || !data || importRequest.current) return false;
    importRequest.current = true; setTrialSaving(true); setTrialImportError('');
    try {
      const reserved = await trial.reserveClaim(userId);
      if (!reserved || accountScope.current !== userId) return false;
      const result = await trialImport.claimNativeTrial(supabase, userId, reserved);
      // Bind the local backup even if the signed-in account changed while the
      // successful request was in flight. UI changes still require the old scope.
      const marked = await trial.markClaimed(userId, result.calendarId);
      if (accountScope.current !== userId) return false;
      await ownerSync.acceptConfirmed(result);
      setCalendarId(result.calendarId);
      void ownerSync.refresh();
      if (!marked) { setTrialImportError(t.trialMarkFailed); return false; }
      setTrialAuthIntent(false); setEntryScreen('welcome');
      return true;
    } catch (failure) {
      if (accountScope.current === userId) setTrialImportError(failure.code === 'CONFLICT' ? t.trialConflict : t.trialSaveFailed);
      return false;
    } finally { importRequest.current = false; setTrialSaving(false); }
  }

  useEffect(() => {
    let active = true;
    let authChanged = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authChanged = true;
      if (active) {
        if (accountScope.current && accountScope.current !== next?.user.id) {
          setAccountSetup(false); setTrialSetupReturn(false); setOnboardingInitial(null); setEntryScreen('welcome');
        }
        setSession(next); setBooting(false); if (!next) { setPendingSetup(null); setAccountSetup(false); } }
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
    setPreferencesUser(null); setAccountPreferences(null); setPreferenceError(false);
    if (!userId) return;
    (async () => {
      try {
        const saved = pendingSetup ? await preferenceStore.adoptPending(userId, pendingSetup) : await preferenceStore.readForUser(userId);
        if (!active) return;
        setPreferencesUser(saved ? userId : null);
        setAccountPreferences({ userId, value: saved || preferences.DEFAULTS });
        if (pendingSetup) setPendingSetup(null);
      } catch { if (active) setPreferenceError(true); }
    })();
    return () => { active = false; };
  }, [session?.user.id, pendingSetup, preferenceAttempt]);

  async function beginAccountSetup() {
    const userId = session?.user.id;
    if (!userId) return;
    const draft = await preferenceStore.readDraftForUser(userId);
    const saved = draft ? null : await preferenceStore.readForUser(userId);
    if (accountScope.current !== userId) return;
    const answers = saved || preferences.DEFAULTS;
    setOnboardingInitial(draft || { answers, step: 4, review: true, choice: answers.reminders });
    setAccountSetup(true); setTrialSetupReturn(false); setError(''); setEntryScreen('onboarding');
  }

  async function openAccountPreferences() {
    try { await beginAccountSetup(); }
    catch { setPreferenceError(true); }
  }

  async function beginSetup() {
    setAccountSetup(false);
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
    setPassword(''); setError(''); setEntryScreen('signin');
  }

  async function beginCreateAccount() {
    try { setPendingSetup(await preferenceStore.readPending()); }
    catch { setPendingSetup(null); }
    setPassword(''); setError(''); setEntryScreen('signup');
  }

  async function completeSetup(answers) {
    if (accountSetup && session?.user.id) {
      const userId = session.user.id;
      await preferenceStore.saveForUser(userId, answers);
      if (accountScope.current !== userId) return;
      setAccountPreferences({ userId, value: preferences.normalizePreferences(answers) });
      setPreferencesUser(userId); setPreferenceError(false); setAccountSetup(false); setEntryScreen('welcome');
      return;
    }
    await preferenceStore.savePending(answers);
    setGuestPreferences(preferences.normalizePreferences(answers));
    if (trialSetupReturn) {
      setTrialSetupReturn(false); setPendingSetup(answers); setEntryScreen('personalize');
      return;
    }
    setPendingSetup(answers); setPassword(''); setError(''); setEntryScreen('signup');
  }

  useEffect(() => {
    setCalendarId(null);
    setWorkspaceView('home');
    setFamilyPendingCount(0);
    setCalendarFocusDate(null);
    setAccountOpen(false);
    setError('');
    if (!session?.user.id) { supabase.auth.stopAutoRefresh(); return; }
    setEntryScreen('welcome');
    const foreground = next => {
      if (next === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    foreground(AppState.currentState);
    const listener = AppState.addEventListener('change', foreground);
    return () => {
      listener.remove();
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

  async function createAccount(newPassword, confirmation) {
    if (authRequest.current) return null;
    authRequest.current = true;
    setBusy(true); setError('');
    try {
      return await signUpHelpers.createAccount(supabase, email, newPassword, confirmation);
    } catch (authError) {
      setError(signUpCopy[language][signUpHelpers.signUpErrorKey(authError)]);
      return null;
    } finally { authRequest.current = false; setBusy(false); }
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

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) { setError(signOutError.message); return false; }
    setAccountOpen(false);
    return true;
  }

  const syncCurrent = ownerSync.userId === session?.user.id;
  const snapshot = syncCurrent ? ownerSync.row?.schedule : null;
  const loaded = syncCurrent && ownerSync.loaded;
  const status = syncCurrent ? ownerSync.status : 'CONNECTING';
  const syncError = syncCurrent && ownerSync.error ? t.failed : '';
  const calendars = schedules.calendarEntries(snapshot);
  const calendar = calendars.find(item => item.id === calendarId) || calendars[0];
  const activePreferences = preferences.forAccount(accountPreferences, session?.user.id);

  return <SafeAreaView style={styles.page}>
    <View style={styles.appHeader}>
      <View style={styles.brand}>
        <Image source={require('../../assets/kidssync-app-icon-192.png')} style={styles.logo} />
        <Text style={styles.title}>KidsSync</Text>
      </View>
      <View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel={language === 'en' ? 'Switch to Chinese' : 'Switch to English'}
          onPress={() => setLanguage(language === 'en' ? 'zh' : 'en')} style={styles.languageButton}>
          <Text style={styles.languageText}>{language === 'en' ? '\u4e2d\u6587' : 'EN'}</Text>
        </Pressable>
        {session && <Pressable accessibilityRole="button" accessibilityLabel={t.account} onPress={() => setAccountOpen(true)} style={({ pressed }) => [styles.avatarButton, pressed && { opacity: 0.55 }]}>
          <Text style={styles.avatarText}>{session.user.email?.trim()?.[0]?.toUpperCase() || 'K'}</Text>
        </Pressable>}</View>
    </View>
    {booting ? <ActivityIndicator accessibilityLabel={t.loading} style={styles.loader} /> : entryScreen === 'personalize' && trial.data && !trial.data.claimedBy ?
      <PersonalizeCalendarScreen language={language} data={trial.data} signedIn={!!session} error={trial.error || (trialImportError ? 'saveFailed' : '')}
        onContinue={continueTrial} onPreferences={configureTrial} onBack={returnFromPersonalize} /> : !session && entryScreen === 'trial' && trial.data ?
      <TrialCalendarScreen language={language} data={trial.data} preferences={guestPreferences} error={trial.error} onSave={trial.saveEvent} onDraft={trial.saveDraft}
        onDelete={trial.removeEvent} onRetry={trial.reload} onPersonalize={() => setEntryScreen('personalize')} onBack={() => setEntryScreen('welcome')} /> : !session && entryScreen === 'welcome' ?
      <WelcomeScreen language={language} onSignIn={beginSignIn}
        onGetStarted={() => beginTrial()} onPersonalize={() => beginTrial({ personalize: true })} onOpenWebsite={openWebsite}
        error={error || (trial.error ? trialCopy[language][trial.error] || trialCopy[language].saveFailed : '')} /> : entryScreen === 'onboarding' && (!session || trialSetupReturn || accountSetup) ?
      <OnboardingScreen language={language} initialDraft={onboardingInitial} onDraftChange={saveSetupDraft} onComplete={completeSetup} returnToCalendar={trialSetupReturn || accountSetup}
        onBack={() => { setEntryScreen(trialSetupReturn ? 'personalize' : 'welcome'); setTrialSetupReturn(false); setAccountSetup(false); }} /> : !session && entryScreen === 'signup' ?
      <SignUpScreen language={language} email={email} hasPreferences={!!pendingSetup} busy={busy} error={error} backLabel={trialAuthIntent ? t.trialBack : undefined}
        onEmailChange={value => { setEmail(value); setError(''); }} onCreateAccount={createAccount}
        onSignIn={beginSignIn} onBack={trialAuthIntent ? () => setEntryScreen('personalize') : pendingSetup ? beginSetup : beginSignIn} /> : !session ?
      <SignInScreen language={language} email={email} password={password} busy={busy} error={error} backLabel={trialAuthIntent ? t.trialBack : undefined}
        onEmailChange={value => { setEmail(value); setError(''); }}
        onPasswordChange={value => { setPassword(value); setError(''); }}
        onSignIn={signIn} onCreateAccount={beginCreateAccount} onGetStarted={beginSetup} onOpenWebsite={openWebsite} onRecover={recoverPassword}
        onBack={() => { setError(''); setPassword(''); setEntryScreen(trialAuthIntent ? 'personalize' : 'welcome'); }} /> : <View style={styles.content}>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error === 'sync' ? t.failed : error}</Text>}
        <SyncStatus key={session.user.id} sync={ownerSync} language={language} />
        {trial.data && (!trial.data.claimOwner || trial.data.claimOwner === session.user.id) && (!trial.data.claimedBy || trial.data.claimedBy === session.user.id) && <View style={styles.trialNotice}>
          <Text style={styles.secondary}>{trial.data.claimedBy ? t.trialSaved : t.trialReady}</Text>
          {!trial.data.claimedBy && <Pressable accessibilityRole="button" disabled={trialSaving} style={styles.button}
            onPress={() => { if (trial.data.profile.calendarName) saveTrialToAccount(); else setEntryScreen('personalize'); }}>
            <Text style={styles.link}>{trialSaving ? t.trialSaving : trial.data.profile.calendarName ? t.trialSave : t.trialPersonalize}</Text>
          </Pressable>}
          {!!trialImportError && <Text accessibilityRole="alert" style={styles.error}>{trialImportError}</Text>}
        </View>}
        {preferenceError && <View style={{ paddingHorizontal: 16 }}><Text accessibilityRole="alert" style={styles.error}>{t.setupFailed}</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setPreferenceAttempt(value => value + 1)}><Text style={styles.link}>{t.retrySetup}</Text></Pressable></View>}
        <View style={styles.workspace}>
          <View style={[styles.workspaceScreen, workspaceView !== 'home' && styles.hiddenScreen]}>
            <HomeScreen language={language} calendars={calendars} calendar={calendar} loading={!loaded}
              error={syncError} onRefresh={ownerSync.refresh}
              onSelectCalendar={setCalendarId} onPreferences={openAccountPreferences}
              onOpenCalendar={() => setWorkspaceView('calendar')} onOpenDate={date => { setCalendarFocusDate(date); setWorkspaceView('calendar'); }} />
          </View>
          <View style={[styles.workspaceScreen, workspaceView !== 'calendar' && styles.hiddenScreen]}>
            <CalendarScreen key={session.user.id} language={language} userId={session.user.id} client={supabase}
              calendars={calendars} calendarId={calendar?.id || null} preferences={activePreferences} loading={!loaded}
              focusDate={calendarFocusDate} syncStatus={status} error={syncError} onRefresh={ownerSync.refresh}
              onSelectCalendar={setCalendarId} onPreferences={openAccountPreferences}
              activityActions={ownerActivityActions}
              onSchedule={async row => {
                if (accountScope.current !== session.user.id) return;
                if (!row?.pending) await ownerSync.acceptConfirmed(row);
                void ownerSync.refresh();
              }} />
          </View>
          <View style={[styles.workspaceScreen, workspaceView !== 'family' && styles.hiddenScreen]}>
            <FamilyScreen key={session.user.id} language={language} client={supabase} user={session.user}
              calendars={calendars} calendar={calendar} onSelectCalendar={setCalendarId}
              onOpenWebsite={openWebsite} onPendingCount={setFamilyPendingCount} />
          </View>
        </View>
        <BottomNavigation language={language} active={workspaceView} onChange={setWorkspaceView} familyPendingCount={familyPendingCount} />
      </View>}
    {session && accountOpen && <AccountSettings language={language} email={session.user.email || ''} onClose={() => setAccountOpen(false)}
      onPreferences={() => { setAccountOpen(false); openAccountPreferences(); }} onSignOut={signOut} onLanguage={setLanguage} onWebsite={openWebsite} />}
  </SafeAreaView>;
}

function PhoneWorkspace() {
  const window = useWindowDimensions();
  const screen = Dimensions.get('screen');
  const [language, setLanguage] = useDeviceLanguage(), [linkFailed, setLinkFailed] = useState(false);
  const browser = Platform.OS === 'web' ? globalThis.navigator : null;
  const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
  const developmentPreviewRequested = Platform.OS === 'web' && isDevelopment
    && new URLSearchParams(globalThis.location?.search || '').get('phonePreview') === '1';
  const access = phoneAccess.getPhoneAccess({ platform: Platform.OS, screen, window,
    isPad: Platform.OS === 'ios' ? Platform.isPad : undefined,
    interfaceIdiom: Platform.isTV ? 'tv' : Platform.isVision ? 'vision' : undefined,
    userAgent: browser?.userAgent, maxTouchPoints: browser?.maxTouchPoints,
    userAgentMobile: browser?.userAgentData?.mobile,
    pointerCoarse: Platform.OS === 'web' && globalThis.matchMedia?.('(pointer: coarse)').matches,
    isDevelopment, developmentPreviewRequested });
  if (access.canAccess) return <Workspace />;
  const zh = language === 'zh';
  return <SafeAreaView style={[styles.page, styles.phoneGate]}>
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => setLanguage(zh ? 'en' : 'zh')}>
      <Text style={styles.link}>{zh ? 'EN' : '中文'}</Text>
    </Pressable>
    <Image source={require('../../assets/kidssync-app-icon-192.png')} style={{ width: 52, height: 52 }} />
    <Text accessibilityRole="header" style={styles.heading}>{zh ? '在手机上打开 KidsSync' : 'Open KidsSync on your phone'}</Text>
    <Text style={styles.secondary}>{zh ? '此应用体验适用于 iPhone 和 Android 手机。请在其他设备上使用网页日历。' : 'This app experience is for iPhone and Android phones. Use the web calendar on other devices.'}</Text>
    <Pressable accessibilityRole="link" style={styles.gatePrimary} onPress={async () => {
      try { await Linking.openURL('https://kid-sync-delta.vercel.app/'); setLinkFailed(false); }
      catch { setLinkFailed(true); }
    }}><Text style={{ color: '#ffffff', fontSize: 16 }}>{zh ? '打开网页日历' : 'Open web calendar'}</Text></Pressable>
    {linkFailed && <Text accessibilityRole="alert" style={styles.error}>{zh ? '无法打开网页，请重试。' : 'Could not open the website. Please try again.'}</Text>}
    {isDevelopment && Platform.OS === 'web' && <Text style={styles.secondary}>{zh ? '开发预览：在地址后添加 ?phonePreview=1，并使用手机宽度的窗口。' : 'Development preview: add ?phonePreview=1 to the address and use a phone-width window.'}</Text>}
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider style={styles.previewCanvas}><PhoneWorkspace /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  // Keep browser previews at a phone width; native screens use the full device width.
  phoneGate: { padding: 24, gap: 20, justifyContent: 'center', alignItems: 'flex-start' },
  gatePrimary: { minHeight: 48, borderRadius: 9, backgroundColor: '#235b47', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  previewCanvas: Platform.select({ web: { backgroundColor: '#e8eef1' }, default: {} }),
  page: { flex: 1, backgroundColor: '#f7fafb', ...Platform.select({
    web: { width: '100%', maxWidth: 390, alignSelf: 'center' }
  }) },
  appHeader: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8, gap: 10, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#dce6e8' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 34, height: 34 },
  title: { fontSize: 20, fontWeight: '700', color: '#172b3a' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  languageButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  languageText: { color: '#17649b', fontSize: 14, fontWeight: '600' },
  avatarButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eaf3fa', borderWidth: 1, borderColor: '#c7ddea', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#1f6898', fontSize: 15, fontWeight: '700' },
  heading: { fontSize: 24, fontWeight: '700', color: '#172b3a' },
  label: { fontSize: 16, color: '#172b3a' },
  button: { minHeight: 44, minWidth: 44, padding: 10, justifyContent: 'center' },
  link: { color: '#17649b', fontSize: 16 },
  error: { color: '#a12632', paddingHorizontal: 16, fontSize: 16 },
  loader: { margin: 32 },
  content: { flex: 1 },
  workspace: { flex: 1 }, workspaceScreen: { flex: 1 }, hiddenScreen: { display: 'none' },
  bottomNav: { minHeight: 62, flexDirection: 'row', alignItems: 'stretch', borderTopWidth: 1, borderTopColor: '#dce6e8', backgroundColor: '#ffffff', paddingHorizontal: 18, paddingTop: 5 },
  bottomTab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 3, borderTopWidth: 2, borderTopColor: 'transparent' },
  bottomIcon: { minWidth: 28, minHeight: 23, alignItems: 'center', justifyContent: 'center' },
  bottomBadge: { position: 'absolute', top: -5, right: -8, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b42332', borderWidth: 2, borderColor: '#ffffff' },
  bottomBadgeText: { color: '#ffffff', fontSize: 9, lineHeight: 11, fontWeight: '700' },
  bottomTabSelected: { borderTopColor: '#1f6898' }, bottomTabText: { color: '#617680', fontSize: 11, fontWeight: '600' }, bottomTabTextSelected: { color: '#1f6898' },
  trialNotice: { padding: 14, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#cfe0d4', borderRadius: 10, backgroundColor: '#f0f7f1' },
  flex: { flexShrink: 1, gap: 4 },
  secondary: { color: '#4c626e', fontSize: 15, lineHeight: 22 },
  calendars: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
  calendar: { minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#c5d2da' },
  selected: { backgroundColor: '#dceefa', borderColor: '#17649b' },
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  event: { paddingVertical: 16, gap: 4, borderBottomWidth: 1, borderBottomColor: '#d7e1e7' },
  eventTitle: { fontSize: 18, fontWeight: '600', color: '#172b3a' }
});
