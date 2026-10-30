import React, { useRef, useState } from 'react';
import { useAppearance, useThemeStyles } from '../ui/AppearanceContext';
import {
  ActivityIndicator, ImageBackground, Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions
} from 'react-native';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, ExternalLink, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react-native';
import signIn from '../lib/sign-in';

export const signInCopy = {
  en: {
    heading: 'Welcome back', eyebrow: 'Your family, in sync',
    photo: 'A child doing homework while a parent prepares food in the kitchen',
    email: 'Email address', password: 'Password', signIn: 'Sign in', signingIn: 'Signing in…',
    emailRequired: 'Enter your email address.', emailInvalid: 'Enter a valid email address.',
    passwordRequired: 'Enter your password.', show: 'Show password', hide: 'Hide password',
    back: 'Back to welcome', forgot: 'Forgot password?', newHere: 'New to KidsSync?',
    getStarted: 'Get started', createAccount: 'Create account', explore: 'Explore the web calendar',
    opensWebsite: 'Opens the KidsSync website', footer: 'One family. One shared week.',
    sendingReset: 'Sending reset link…', resetSent: 'Reset link sent. Check your email to continue on the KidsSync website.',
    invalidCredentials: 'The email or password is incorrect.', emailNotConfirmed: 'Confirm your email address before signing in.',
    rateLimited: 'Too many attempts. Please wait a little and try again.', connectionFailed: 'Could not connect. Check your internet connection and try again.',
    authFailed: 'Something went wrong. Please try again.', assurance: 'Same account. Same family calendar.'
  },
  zh: {
    heading: '\u6b22\u8fce\u56de\u6765', eyebrow: '\u5bb6\u4eba\u7684\u65f6\u5149\uff0c\u4e00\u8d77\u5b89\u6392',
    photo: '\u5b69\u5b50\u5728\u5199\u4f5c\u4e1a\uff0c\u5bb6\u957f\u5728\u53a8\u623f\u51c6\u5907\u98df\u7269',
    email: '\u90ae\u7bb1\u5730\u5740', password: '\u5bc6\u7801', signIn: '\u767b\u5f55', signingIn: '\u6b63\u5728\u767b\u5f55\u2026',
    emailRequired: '\u8bf7\u8f93\u5165\u90ae\u7bb1\u5730\u5740\u3002', emailInvalid: '\u8bf7\u8f93\u5165\u6709\u6548\u7684\u90ae\u7bb1\u5730\u5740\u3002',
    passwordRequired: '\u8bf7\u8f93\u5165\u5bc6\u7801\u3002', show: '\u663e\u793a\u5bc6\u7801', hide: '\u9690\u85cf\u5bc6\u7801',
    back: '\u8fd4\u56de\u6b22\u8fce\u9875', forgot: '\u5fd8\u8bb0\u5bc6\u7801\uff1f', newHere: '\u521d\u6b21\u4f7f\u7528 KidsSync\uff1f',
    getStarted: '\u5f00\u59cb\u4f7f\u7528', createAccount: '创建账户', explore: '\u6d4f\u89c8\u7f51\u9875\u65e5\u5386',
    opensWebsite: '\u6253\u5f00 KidsSync \u7f51\u7ad9', footer: '\u4e00\u4e2a\u5bb6\uff0c\u4e00\u8d77\u5b89\u6392\u6bcf\u4e00\u5468\u3002',
    sendingReset: '\u6b63\u5728\u53d1\u9001\u91cd\u7f6e\u94fe\u63a5\u2026', resetSent: '\u91cd\u7f6e\u94fe\u63a5\u5df2\u53d1\u9001\u3002\u8bf7\u67e5\u6536\u90ae\u4ef6\uff0c\u5728 KidsSync \u7f51\u7ad9\u7ee7\u7eed\u3002',
    invalidCredentials: '\u90ae\u7bb1\u6216\u5bc6\u7801\u4e0d\u6b63\u786e\u3002', emailNotConfirmed: '\u8bf7\u5148\u786e\u8ba4\u90ae\u7bb1\u5730\u5740\uff0c\u518d\u767b\u5f55\u3002',
    rateLimited: '\u5c1d\u8bd5\u6b21\u6570\u8fc7\u591a\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002', connectionFailed: '\u65e0\u6cd5\u8fde\u63a5\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002',
    authFailed: '\u51fa\u73b0\u95ee\u9898\uff0c\u8bf7\u91cd\u8bd5\u3002', assurance: '同一个账户，同一份家庭日历。'
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
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(null);
  const [touched, setTouched] = useState({});
  const [recovering, setRecovering] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const errors = signIn.validateSignIn(email, password);
  const emailError = touched.email && errors.email;
  const passwordError = touched.password && errors.password;

  function submit() {
    if (busy) return;
    setTouched({ email: true, password: true });
    if (errors.email) { emailRef.current?.focus(); return; }
    if (errors.password) { passwordRef.current?.focus(); return; }
    Keyboard.dismiss();
    onSignIn();
  }

  async function recover() {
    if (busy || recovering) return;
    setTouched(value => ({ ...value, email: true }));
    if (errors.email) { emailRef.current?.focus(); return; }
    setRecoverySent(false);
    Keyboard.dismiss();
    setRecovering(true);
    try { if (await onRecover()) setRecoverySent(true); }
    finally { setRecovering(false); }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={styles.scroll}>
      <View style={styles.inner}>
        <ImageBackground source={require('../../../assets/kidssync-auth-family-signin.jpg')}
          accessible={false} resizeMode="cover" style={[styles.hero, height < 700 && styles.compactHero]} imageStyle={styles.heroImage}>
          <View accessible accessibilityRole="image" accessibilityLabel={t.photo} pointerEvents="none" style={StyleSheet.absoluteFillObject} />
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel || t.back} disabled={busy}
            onPress={onBack} style={styles.back}>
            <ArrowLeft size={21} color={colors.photoText} aria-hidden={true} />
          </Pressable>
          <View style={styles.caption}>
            <Text style={styles.eyebrow}>{t.eyebrow}</Text>
            <Text accessibilityRole="header" style={styles.heading}>{t.heading}</Text>
          </View>
        </ImageBackground>
        <View style={styles.form}>
          <View style={styles.assurance}><ShieldCheck size={16} color={colors.primary} /><Text style={styles.assuranceText}>{t.assurance}</Text></View>
          <View style={styles.field}>
            <Text style={styles.label}>{t.email}</Text>
            <View style={[styles.inputRow, focused === 'email' && styles.focused, emailError && styles.invalid]}>
              <Mail size={18} color={colors.muted} aria-hidden={true} />
              <TextInput placeholderTextColor={colors.muted} selectionColor={colors.primary} ref={emailRef} accessibilityLabel={t.email} accessibilityHint={emailError ? t[emailError] : undefined}
                value={email} onChangeText={value => { setRecoverySent(false); onEmailChange(value); }} keyboardType="email-address" editable={!busy}
                autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
                returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()}
                onFocus={() => setFocused('email')} onBlur={() => { setFocused(null); setTouched(value => ({ ...value, email: true })); }}
                style={styles.input} />
            </View>
            {!!emailError && <Text accessibilityRole="alert" style={styles.fieldError}>{t[emailError]}</Text>}
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t.password}</Text>
            <View style={[styles.inputRow, focused === 'password' && styles.focused, passwordError && styles.invalid]}>
              <LockKeyhole size={18} color={colors.muted} aria-hidden={true} />
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
            <Pressable accessibilityRole="button" onPress={recover} disabled={busy || recovering} accessibilityState={{ busy: recovering, disabled: busy || recovering }} style={styles.forgot}>
              <Text style={styles.link}>{recovering ? t.sendingReset : t.forgot}</Text>
            </Pressable>
          </View>
          {recoverySent && <View accessibilityLiveRegion="polite" style={styles.successRow}>
            <CheckCircle2 size={18} color={colors.success} aria-hidden={true} />
            <Text style={styles.successText}>{t.resetSent}</Text>
          </View>}
          {!!error && <View accessibilityRole="alert" style={styles.errorRow}>
            <CircleAlert size={18} color={colors.error} aria-hidden={true} />
            <Text style={styles.error}>{error}</Text>
          </View>}
          <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy}
            onPress={submit} style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}>
            <Text style={styles.primaryText}>{busy && !recovering ? t.signingIn : t.signIn}</Text>
            {busy && !recovering ? <ActivityIndicator color={colors.onPrimary} /> : <ArrowRight size={19} color={colors.onPrimary} aria-hidden={true} />}
          </Pressable>
          <View style={styles.newAccount}>
            <Text style={styles.secondary}>{t.newHere}</Text>
            <Pressable accessibilityRole="button" onPress={onGetStarted} disabled={busy} style={styles.textButton}>
              <Text style={styles.linkStrong}>{t.getStarted}</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={onCreateAccount} disabled={busy} style={styles.explore}>
            <Text style={styles.link}>{t.createAccount}</Text>
          </Pressable>
          <View style={styles.footer}>
            <Pressable accessibilityRole="link" onPress={onOpenWebsite} disabled={busy} style={styles.explore}>
              <Text style={styles.secondary}>{t.explore}</Text>
              <ExternalLink size={14} color={colors.muted} aria-hidden={true} />
            </Pressable>
            <Text style={styles.footerText}>{t.footer}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function createStyles(colors, palettes) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, alignItems: 'center', paddingBottom: 20 },
  inner: { width: '100%', maxWidth: 560, flexGrow: 1 },
  hero: { width: '100%', aspectRatio: 2, minHeight: 170, maxHeight: 210, justifyContent: 'flex-end', overflow: 'hidden', flexShrink: 0 },
  compactHero: { minHeight: 135, maxHeight: 145, aspectRatio: 2.6 },
  heroImage: { width: '100%', height: '100%' },
  back: { position: 'absolute', top: 12, left: 16, width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photoOverlay },
  caption: { backgroundColor: colors.photoOverlay, paddingHorizontal: 24, paddingVertical: 12 },
  eyebrow: { fontSize: 13, lineHeight: 18, color: colors.photoMuted, marginBottom: 4 },
  heading: { fontSize: 24, lineHeight: 31, color: colors.photoText, fontWeight: '600' },
  form: { paddingHorizontal: 22, paddingTop: 18, gap: 16, flexGrow: 1 },
  assurance: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.primarySoft, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9 }, assuranceText: { flex: 1, fontSize: 12, lineHeight: 19, color: colors.primary },
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
  footer: { marginTop: 'auto', borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, gap: 8 },
  explore: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' },
  footerText: { fontSize: 12, lineHeight: 20, color: colors.muted, textAlign: 'center' }
}); }
