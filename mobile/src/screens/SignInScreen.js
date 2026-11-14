import React, { useEffect, useRef, useState } from 'react';
import { useAppearance, useThemeStyles } from '../ui/AppearanceContext';
import {
  AccessibilityInfo, ActivityIndicator, AppState, ImageBackground, Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions
} from 'react-native';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, CircleAlert, ExternalLink, Eye, EyeOff, Pause, Play } from 'lucide-react-native';
import signIn from '../lib/sign-in';

const signInPhotos = [
  require('../../../assets/kidssync-family-hero.jpg'),
  require('../../assets/kidssync-family-entryway-signin.jpg'),
  require('../../assets/kidssync-family-park-signin.jpg'),
  require('../../assets/kidssync-family-table-signin.jpg'),
];

export const signInCopy = {
  en: {
    heading: 'Sign in', more: 'More options',
    photo: 'Family planning, school days, and time together',
    showPhoto: 'Show photo', pausePhotos: 'Pause photos', resumePhotos: 'Resume photos',
    email: 'Email address', password: 'Password', signIn: 'Sign in', signingIn: 'Signing in…',
    emailRequired: 'Enter your email address.', emailInvalid: 'Enter a valid email address.',
    passwordRequired: 'Enter your password.', show: 'Show password', hide: 'Hide password',
    back: 'Back to welcome', backToCreate: 'Back to create account', backToSignIn: 'Back to sign in',
    forgot: 'Forgot password?', newHere: 'New to KidsSync?',
    resetHeading: 'Reset your password', resetHelp: 'Enter your account email to get a password reset link.',
    sendReset: 'Send reset link',
    getStarted: 'Set up my calendar', createAccount: 'Create account', explore: 'Open the web calendar',
    sendingReset: 'Sending reset link…', resetSent: 'Reset link sent if this email has a KidsSync account. Check your inbox and spam folder.',
    invalidCredentials: 'The email or password is incorrect.', emailNotConfirmed: 'Confirm your email address before signing in.',
    rateLimited: 'Too many attempts. Please wait a little and try again.', connectionFailed: 'Could not connect. Check your internet connection and try again.',
    authFailed: 'Something went wrong. Please try again.'
  },
  zh: {
    heading: '登录', more: '更多选项',
    photo: '家庭计划、校园生活与相聚时光',
    showPhoto: '显示照片', pausePhotos: '暂停切换照片', resumePhotos: '继续切换照片',
    email: '\u90ae\u7bb1\u5730\u5740', password: '\u5bc6\u7801', signIn: '\u767b\u5f55', signingIn: '\u6b63\u5728\u767b\u5f55\u2026',
    emailRequired: '\u8bf7\u8f93\u5165\u90ae\u7bb1\u5730\u5740\u3002', emailInvalid: '\u8bf7\u8f93\u5165\u6709\u6548\u7684\u90ae\u7bb1\u5730\u5740\u3002',
    passwordRequired: '\u8bf7\u8f93\u5165\u5bc6\u7801\u3002', show: '\u663e\u793a\u5bc6\u7801', hide: '\u9690\u85cf\u5bc6\u7801',
    back: '\u8fd4\u56de\u6b22\u8fce\u9875', backToCreate: '返回创建账户', backToSignIn: '返回登录',
    forgot: '\u5fd8\u8bb0\u5bc6\u7801\uff1f', newHere: '\u521d\u6b21\u4f7f\u7528 KidsSync\uff1f',
    resetHeading: '重置密码', resetHelp: '输入账户邮箱，即可获取密码重置链接。', sendReset: '发送重置链接',
    getStarted: '设置我的日历', createAccount: '创建账户', explore: '打开网页日历',
    sendingReset: '\u6b63\u5728\u53d1\u9001\u91cd\u7f6e\u94fe\u63a5\u2026', resetSent: '如果此邮箱关联了 KidsSync 账户，重置链接已发送。请查看收件箱和垃圾邮件。',
    invalidCredentials: '\u90ae\u7bb1\u6216\u5bc6\u7801\u4e0d\u6b63\u786e\u3002', emailNotConfirmed: '\u8bf7\u5148\u786e\u8ba4\u90ae\u7bb1\u5730\u5740\uff0c\u518d\u767b\u5f55\u3002',
    rateLimited: '\u5c1d\u8bd5\u6b21\u6570\u8fc7\u591a\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002', connectionFailed: '\u65e0\u6cd5\u8fde\u63a5\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002',
    authFailed: '\u51fa\u73b0\u95ee\u9898\uff0c\u8bf7\u91cd\u8bd5\u3002'
  }
};

export default function SignInScreen({
  language, email, password, onEmailChange, onPasswordChange, onSignIn,
  onBack, backLabel, onGetStarted, onCreateAccount, onOpenWebsite, onRecover, busy, error
}) {
  const t = signInCopy[language] || signInCopy.en;
  const { colors } = useAppearance(), styles = useThemeStyles(createStyles);
  const { height } = useWindowDimensions();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const scroll = useRef(null);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(null);
  const [touched, setTouched] = useState({});
  const [recovering, setRecovering] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photosPaused, setPhotosPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenActive, setScreenActive] = useState(true);
  const [photoCycle, setPhotoCycle] = useState(0);
  const errors = signIn.validateSignIn(email, password);
  const emailError = touched.email && errors.email;
  const passwordError = touched.password && errors.password;
  const pending = busy || recovering;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(!!value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => setReduceMotion(!!value));
    return () => { mounted = false; subscription?.remove?.(); };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value => setScreenActive(value === 'active'));
    const onVisibility = () => setScreenActive(!globalThis.document.hidden);
    if (Platform.OS === 'web') globalThis.document?.addEventListener('visibilitychange', onVisibility);
    return () => {
      subscription?.remove?.();
      if (Platform.OS === 'web') globalThis.document?.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  useEffect(() => {
    if (recoveryOpen || photosPaused || reduceMotion || !screenActive) return undefined;
    const timer = setInterval(() => setPhotoIndex(index => (index + 1) % signInPhotos.length), 6500);
    return () => clearInterval(timer);
  }, [recoveryOpen, photosPaused, reduceMotion, screenActive, photoCycle]);

  function selectPhoto(index) {
    setPhotoIndex(index);
    setPhotoCycle(value => value + 1);
  }

  function changeRecovery(open) {
    Keyboard.dismiss();
    setTouched({});
    setShowPassword(false);
    setRecoverySent(false);
    setRecoveryOpen(open);
    onPasswordChange('');
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function submit() {
    if (pending) return;
    setTouched({ email: true, password: true });
    if (errors.email) { emailRef.current?.focus(); return; }
    if (errors.password) { passwordRef.current?.focus(); return; }
    Keyboard.dismiss();
    onSignIn();
  }

  async function recover() {
    if (pending || recoverySent) return;
    setTouched(value => ({ ...value, email: true }));
    if (errors.email) { emailRef.current?.focus(); return; }
    setRecoverySent(false);
    Keyboard.dismiss();
    setRecovering(true);
    try { if (await onRecover()) setRecoverySent(true); }
    finally { setRecovering(false); }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={styles.scroll}>
      <View style={styles.inner}>
        {!recoveryOpen && <ImageBackground source={signInPhotos[photoIndex]}
          accessible={false} resizeMode="cover" style={[styles.hero, height < 700 && styles.compactHero]} imageStyle={styles.heroImage}>
          <View accessible accessibilityRole="image" accessibilityLabel={t.photo} pointerEvents="none" style={StyleSheet.absoluteFillObject} />
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel || t.back} disabled={pending}
            onPress={onBack} style={styles.back}>
            <ArrowLeft size={18} color={colors.photoText} aria-hidden={true} />
            <Text style={styles.photoBackText}>{backLabel || t.back}</Text>
          </Pressable>
          <View style={styles.photoControls} accessibilityRole="group">
            {signInPhotos.map((_, index) => <Pressable key={index} accessibilityRole="button"
              accessibilityLabel={`${t.showPhoto} ${index + 1}`} accessibilityState={{ selected: photoIndex === index }}
              onPress={() => selectPhoto(index)} style={styles.photoDotButton}>
              <View style={[styles.photoDot, photoIndex === index && styles.photoDotActive]} />
            </Pressable>)}
            {!reduceMotion && <Pressable accessibilityRole="button" accessibilityLabel={photosPaused ? t.resumePhotos : t.pausePhotos}
              accessibilityState={{ selected: photosPaused }} onPress={() => setPhotosPaused(value => !value)} style={styles.photoPause}>
              {photosPaused ? <Play size={17} color={colors.photoText} /> : <Pause size={17} color={colors.photoText} />}
            </Pressable>}
          </View>
        </ImageBackground>}
        <View style={styles.form}>
          {recoveryOpen && <Pressable accessibilityRole="button" disabled={pending} onPress={() => changeRecovery(false)} style={styles.recoveryBack}>
            <ArrowLeft size={18} color={colors.primary} aria-hidden={true} /><Text style={styles.linkStrong}>{t.backToSignIn}</Text>
          </Pressable>}
          <Text accessibilityRole="header" style={styles.heading}>{recoveryOpen ? t.resetHeading : t.heading}</Text>
          {recoveryOpen && <Text style={styles.secondary}>{t.resetHelp}</Text>}
          <View style={styles.field}>
            <Text style={styles.label}>{t.email}</Text>
            <View style={[styles.inputRow, focused === 'email' && styles.focused, emailError && styles.invalid]}>
              <TextInput placeholderTextColor={colors.muted} selectionColor={colors.primary} ref={emailRef} accessibilityLabel={t.email} accessibilityHint={emailError ? t[emailError] : undefined}
                value={email} onChangeText={value => { setRecoverySent(false); onEmailChange(value); }} keyboardType="email-address" editable={!pending}
                autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
                returnKeyType={recoveryOpen ? 'go' : 'next'} onSubmitEditing={recoveryOpen ? recover : () => passwordRef.current?.focus()}
                onFocus={() => setFocused('email')} onBlur={() => { setFocused(null); setTouched(value => ({ ...value, email: true })); }}
                style={styles.input} />
            </View>
            {!!emailError && <Text accessibilityRole="alert" style={styles.fieldError}>{t[emailError]}</Text>}
          </View>
          {!recoveryOpen && <View style={styles.field}>
            <Text style={styles.label}>{t.password}</Text>
            <View style={[styles.inputRow, focused === 'password' && styles.focused, passwordError && styles.invalid]}>
              <TextInput placeholderTextColor={colors.muted} selectionColor={colors.primary} ref={passwordRef} accessibilityLabel={t.password} accessibilityHint={passwordError ? t[passwordError] : undefined}
                value={password} onChangeText={onPasswordChange} secureTextEntry={!showPassword} editable={!busy}
                autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password"
                returnKeyType="go" onSubmitEditing={submit}
                onFocus={() => setFocused('password')} onBlur={() => { setFocused(null); setTouched(value => ({ ...value, password: true })); }}
                style={styles.input} />
              <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? t.hide : t.show}
                accessibilityState={{ selected: showPassword }} disabled={busy}
                onPress={() => setShowPassword(value => !value)} style={styles.eye}>
                {showPassword ? <EyeOff size={19} color={colors.muted} aria-hidden={true} /> : <Eye size={19} color={colors.muted} aria-hidden={true} />}
              </Pressable>
            </View>
            {!!passwordError && <Text accessibilityRole="alert" style={styles.fieldError}>{t[passwordError]}</Text>}
            <Pressable accessibilityRole="button" onPress={() => changeRecovery(true)} disabled={pending} style={styles.forgot}>
              <Text style={styles.link}>{t.forgot}</Text>
            </Pressable>
          </View>}
          {recoveryOpen && recoverySent && <View accessibilityLiveRegion="polite" style={styles.successRow}>
            <CheckCircle2 size={18} color={colors.success} aria-hidden={true} />
            <Text style={styles.successText}>{t.resetSent}</Text>
          </View>}
          {!!error && <View accessibilityRole="alert" style={styles.errorRow}>
            <CircleAlert size={18} color={colors.error} aria-hidden={true} />
            <Text style={styles.error}>{error}</Text>
          </View>}
          {!(recoveryOpen && recoverySent) && <Pressable accessibilityRole="button" accessibilityState={{ busy: pending, disabled: pending }} disabled={pending}
            onPress={recoveryOpen ? recover : submit} style={({ pressed }) => [styles.primary, (pressed || pending) && styles.pressed]}>
            <Text style={styles.primaryText}>{recoveryOpen ? (pending ? t.sendingReset : t.sendReset) : (pending ? t.signingIn : t.signIn)}</Text>
            {pending ? <ActivityIndicator color={colors.onPrimary} /> : <ArrowRight size={19} color={colors.onPrimary} aria-hidden={true} />}
          </Pressable>}
          {!recoveryOpen && !!onCreateAccount && <View style={styles.newAccount}>
            <Text style={styles.secondary}>{t.newHere}</Text>
            <Pressable accessibilityRole="button" onPress={onCreateAccount} disabled={busy} style={styles.textButton}>
              <Text style={styles.linkStrong}>{t.createAccount}</Text>
            </Pressable>
          </View>}
          {!recoveryOpen && !!(onGetStarted || onOpenWebsite) && <View style={styles.footer}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: optionsOpen }} disabled={busy}
              onPress={() => setOptionsOpen(value => !value)} style={styles.disclosure}>
              <Text style={styles.disclosureText}>{t.more}</Text>
              <ChevronDown size={17} color={colors.muted} style={optionsOpen && styles.expanded} />
            </Pressable>
            {optionsOpen && <>
              {!!onGetStarted && <Pressable accessibilityRole="button" onPress={onGetStarted} disabled={busy} style={styles.explore}>
                <Text style={styles.link}>{t.getStarted}</Text>
              </Pressable>}
              {!!onOpenWebsite && <Pressable accessibilityRole="link" onPress={onOpenWebsite} disabled={busy} style={styles.explore}>
                <Text style={styles.link}>{t.explore}</Text>
                <ExternalLink size={14} color={colors.muted} aria-hidden={true} />
              </Pressable>}
            </>}
          </View>}
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function createStyles(colors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, alignItems: 'center', paddingBottom: 20 },
  inner: { width: '100%', maxWidth: 560, flexGrow: 1 },
  hero: { width: '100%', aspectRatio: 2, minHeight: 170, maxHeight: 210, overflow: 'hidden', flexShrink: 0 },
  compactHero: { minHeight: 136, maxHeight: 160, aspectRatio: 2.3 },
  heroImage: { width: '100%', height: '100%' },
  photoControls: { position: 'absolute', right: 12, bottom: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, borderRadius: 24, backgroundColor: colors.photoOverlay },
  photoDotButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  photoDot: { width: 8, height: 8, borderRadius: 5, borderWidth: 1, borderColor: colors.photoText },
  photoDotActive: { width: 18, borderRadius: 9, backgroundColor: colors.photoText },
  photoPause: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', top: 12, left: 16, maxWidth: '88%', minHeight: 44, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: colors.photoOverlay },
  photoBackText: { color: colors.photoText, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  recoveryBack: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: 29, lineHeight: 36, color: colors.ink, fontWeight: '700' },
  form: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  field: { gap: 8 },
  label: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingLeft: 14, paddingRight: 4, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  focused: { borderColor: colors.primary, backgroundColor: colors.inputFocused },
  invalid: { borderColor: colors.error },
  input: { flex: 1, minWidth: 0, minHeight: 52, fontSize: 16, color: colors.ink, paddingVertical: 12, paddingHorizontal: 0 },
  eye: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  fieldError: { fontSize: 13, lineHeight: 19, color: colors.error },
  forgot: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', alignSelf: 'flex-end', paddingVertical: 8 },
  link: { fontSize: 14, lineHeight: 20, color: colors.primary },
  primary: { minHeight: 52, borderRadius: 13, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14 },
  primaryText: { fontSize: 17, lineHeight: 23, fontWeight: '600', color: colors.onPrimary, flexShrink: 1 },
  pressed: { opacity: 0.7 },
  errorRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  error: { color: colors.error, fontSize: 14, lineHeight: 21, flex: 1 },
  successRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  successText: { color: colors.success, fontSize: 14, lineHeight: 21, flex: 1 },
  newAccount: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', alignItems: 'center' },
  secondary: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  textButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkStrong: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  footer: { borderTopWidth: 1, borderColor: colors.line },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  disclosureText: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' },
  expanded: { transform: [{ rotate: '180deg' }] },
  explore: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }
}); }
