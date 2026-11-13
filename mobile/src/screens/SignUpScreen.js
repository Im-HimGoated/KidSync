import React, { useRef, useState } from 'react';
import { useAppearance, useThemeStyles } from '../ui/AppearanceContext';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, ArrowRight, CircleAlert, Eye, EyeOff } from 'lucide-react-native';
import signUp from '../lib/sign-up';

export const signUpCopy = {
  en: {
    review: 'Review answers', back: 'Back to sign in', saved: 'Setup answers saved on this device.', preview: 'Preview the calendar first', previewHint: '10 minutes without an account',
    heading: 'Create your account',
    email: 'Email address', emailPlaceholder: 'name@example.com', password: 'Password', passwordPlaceholder: 'Create a password',
    confirmation: 'Confirm password', confirmationPlaceholder: 'Re-enter your password', passwordHint: 'Use at least 8 characters.',
    create: 'Create account', creating: 'Creating account…',
    returning: 'Already have an account?', signIn: 'Sign in', show: 'Show password', hide: 'Hide password',
    showConfirmation: 'Show confirmation password', hideConfirmation: 'Hide confirmation password',
    emailRequired: 'Enter your email address.', emailInvalid: 'Enter a valid email address.', passwordRequired: 'Create a password.',
    passwordShort: 'Use at least 8 characters.', confirmationRequired: 'Re-enter your password.', passwordMismatch: 'The passwords do not match.',
    weakPassword: 'Choose a stronger password. Try a longer password with letters, numbers and symbols.',
    alreadyRegistered: 'This email is already registered. Sign in below, or use Forgot password on the sign-in screen.',
    signupDisabled: 'Account creation is currently unavailable. Please try again later.',
    rateLimited: 'Too many attempts. Please wait a little and try again.', connectionFailed: 'Could not connect. Check your internet connection and try again.',
    authFailed: 'Could not create your account. Please try again.',
    checkEmail: 'Check your email', confirmationIntro: 'Check your inbox for a confirmation link. Open it, then return to this app and sign in.',
    confirmationExisting: 'If the email doesn’t arrive, check spam. Already registered? Sign in below or use Forgot password.',
    changeEmail: 'Use a different email'
  },
  zh: {
    review: '核对答案', back: '返回登录', saved: '设置答案已保存在此设备上。', preview: '先体验日历', previewHint: '无需账户，体验 10 分钟',
    heading: '创建你的账户',
    email: '邮箱地址', emailPlaceholder: 'name@example.com', password: '密码', passwordPlaceholder: '创建密码',
    confirmation: '确认密码', confirmationPlaceholder: '再次输入密码', passwordHint: '请至少使用 8 个字符。',
    create: '创建账户', creating: '正在创建账户…',
    returning: '已有账户？', signIn: '登录', show: '显示密码', hide: '隐藏密码',
    showConfirmation: '显示确认密码', hideConfirmation: '隐藏确认密码',
    emailRequired: '请输入邮箱地址。', emailInvalid: '请输入有效的邮箱地址。', passwordRequired: '请创建密码。',
    passwordShort: '请至少使用 8 个字符。', confirmationRequired: '请再次输入密码。', passwordMismatch: '两次输入的密码不一致。',
    weakPassword: '请选择更强的密码，尝试使用更长的字母、数字和符号组合。',
    alreadyRegistered: '此邮箱已注册，请在下方登录，或在登录页面选择忘记密码。',
    signupDisabled: '暂时无法创建账户，请稍后重试。',
    rateLimited: '尝试次数过多，请稍后重试。', connectionFailed: '无法连接，请检查网络后重试。',
    authFailed: '无法创建账户，请重试。',
    checkEmail: '请查收邮件', confirmationIntro: '请在收件箱中找到确认链接。打开链接后，返回此应用并登录。',
    confirmationExisting: '如果未收到邮件，请检查垃圾邮件。已注册？可在下方登录或选择忘记密码。',
    changeEmail: '使用其他邮箱'
  }
};

export default function SignUpScreen({ language, email, onEmailChange, onCreateAccount, onSignIn, onPreview, onBack, backLabel, hasPreferences, busy, error }) {
  const t = signUpCopy[language] || signUpCopy.en;
  const { colors } = useAppearance(), styles = useThemeStyles(createStyles);
  const emailRef = useRef(null), passwordRef = useRef(null), confirmationRef = useRef(null), scroll = useRef(null), submitting = useRef(false);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false), [showConfirmation, setShowConfirmation] = useState(false);
  const [touched, setTouched] = useState({}), [focused, setFocused] = useState(null), [confirmationEmail, setConfirmationEmail] = useState(null);
  const errors = signUp.validateSignUp(email, password, confirmation);

  async function submit() {
    if (busy || submitting.current) return;
    setTouched({ email: true, password: true, confirmation: true });
    if (errors.email) { emailRef.current?.focus(); return; }
    if (errors.password) { passwordRef.current?.focus(); return; }
    if (errors.confirmation) { confirmationRef.current?.focus(); return; }
    Keyboard.dismiss();
    submitting.current = true;
    try {
      const result = await onCreateAccount(password, confirmation);
      if (result?.status === 'confirmation') {
        setConfirmationEmail(result.email); setPassword(''); setConfirmation('');
        setShowPassword(false); setShowConfirmation(false); setTouched({});
        scroll.current?.scrollTo({ y: 0, animated: false });
      }
    } finally { submitting.current = false; }
  }

  function fieldError(key) {
    return touched[key] && errors[key] ? <Text accessibilityRole="alert" style={styles.fieldError}>{t[errors[key]]}</Text> : null;
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} style={styles.scroller} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scroll}>
      <View style={styles.inner}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={styles.back}>
          <ArrowLeft size={18} color={colors.primary} aria-hidden={true} /><Text style={styles.link}>{backLabel || (hasPreferences ? t.review : t.back)}</Text>
        </Pressable>
        <View style={styles.main}>
          <Text accessibilityRole="header" style={styles.heading}>{confirmationEmail ? t.checkEmail : t.heading}</Text>
          {hasPreferences && <Text style={styles.savedText}>{t.saved}</Text>}
          {confirmationEmail ? <View style={styles.confirmation} accessibilityLiveRegion="polite">
            <Text style={styles.emailValue}>{confirmationEmail}</Text>
            <Text style={styles.secondary}>{t.confirmationIntro}</Text>
            <Text style={styles.secondary}>{t.confirmationExisting}</Text>
            <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => { setConfirmationEmail(null); onEmailChange(email); }}><Text style={styles.link}>{t.changeEmail}</Text></Pressable>
          </View> : <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>{t.email}</Text>
              <TextInput placeholderTextColor={colors.muted} selectionColor={colors.primary} ref={emailRef} value={email} onChangeText={onEmailChange} accessibilityLabel={t.email}
                accessibilityHint={touched.email && errors.email ? t[errors.email] : undefined}
                placeholder={t.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                autoComplete="email" textContentType="emailAddress" editable={!busy} returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()} onFocus={() => setFocused('email')}
                onBlur={() => { setFocused(null); setTouched(value => ({ ...value, email: true })); }}
                style={[styles.input, styles.emailInput, focused === 'email' && styles.focused, touched.email && errors.email && styles.invalid]} />
              {fieldError('email')}
            </View>
            {[['password', password, setPassword, passwordRef, showPassword, setShowPassword], ['confirmation', confirmation, setConfirmation, confirmationRef, showConfirmation, setShowConfirmation]].map(([key, value, update, ref, show, toggle]) => <View key={key} style={styles.field}>
              <Text style={styles.label}>{t[key]}</Text>
              <View style={[styles.inputRow, focused === key && styles.focused, touched[key] && errors[key] && styles.invalid]}>
                <TextInput placeholderTextColor={colors.muted} selectionColor={colors.primary} ref={ref} value={value} onChangeText={update} accessibilityLabel={t[key]}
                  accessibilityHint={touched[key] && errors[key] ? t[errors[key]] : key === 'password' ? t.passwordHint : undefined}
                  placeholder={key === 'password' ? t.passwordPlaceholder : t.confirmationPlaceholder}
                  secureTextEntry={!show} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} editable={!busy}
                  returnKeyType={key === 'password' ? 'next' : 'go'} onSubmitEditing={key === 'password' ? () => confirmationRef.current?.focus() : submit}
                  onFocus={() => setFocused(key)} onBlur={() => { setFocused(null); setTouched(previous => ({ ...previous, [key]: true })); }} style={styles.input} />
                <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ selected: show }}
                  accessibilityLabel={key === 'password' ? show ? t.hide : t.show : show ? t.hideConfirmation : t.showConfirmation}
                  onPress={() => toggle(previous => !previous)} style={styles.eye}>
                  {show ? <EyeOff size={20} color={colors.muted} aria-hidden={true} /> : <Eye size={20} color={colors.muted} aria-hidden={true} />}
                </Pressable>
              </View>
              {key === 'password' && !fieldError(key) && <Text style={styles.hint}>{t.passwordHint}</Text>}
              {fieldError(key)}
            </View>)}
            {!!error && <View accessibilityRole="alert" style={styles.errorRow}><CircleAlert size={18} color={colors.error} aria-hidden={true} /><Text style={styles.error}>{error}</Text></View>}
            <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy, busy }} onPress={submit}
              style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed]}>
              <Text style={styles.primaryText}>{busy ? t.creating : t.create}</Text>
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <ArrowRight size={20} color={colors.onPrimary} aria-hidden={true} />}
            </Pressable>
            {!!onPreview && <Pressable accessibilityRole="button" accessibilityLabel={t.preview} accessibilityHint={t.previewHint} disabled={busy} onPress={onPreview} style={styles.preview}><Text style={styles.link}>{t.preview}</Text><Text style={styles.note}>{t.previewHint}</Text></Pressable>}
          </View>}
        </View>
        <View style={styles.returning}>
          <Text style={styles.secondary}>{t.returning}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={onSignIn} style={styles.textButton}><Text style={styles.signIn}>{t.signIn}</Text></Pressable>
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function createStyles(colors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, scroller: { flex: 1 }, scroll: { flexGrow: 1, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 420, flexGrow: 1, paddingHorizontal: 24, paddingBottom: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  main: { paddingTop: 8, paddingBottom: 8 },
  savedText: { color: colors.success, fontSize: 13, lineHeight: 19, marginTop: 5 },
  heading: { fontSize: 29, lineHeight: 36, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  form: { marginTop: 18, gap: 14 }, field: { gap: 6 }, label: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  inputRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, minHeight: 50, color: colors.ink, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  emailInput: { flex: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 13 }, focused: { borderColor: colors.primary, backgroundColor: colors.inputFocused }, invalid: { borderColor: colors.error },
  eye: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  primary: { minHeight: 54, flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', padding: 14, backgroundColor: colors.primary, borderRadius: 13, marginTop: 6 },
  primaryText: { color: colors.onPrimary, fontSize: 17, lineHeight: 23, fontWeight: '600', flexShrink: 1 }, pressed: { opacity: 0.7 },
  preview: { minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'center' }, returning: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 4, justifyContent: 'center', alignItems: 'center' },
  textButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', paddingHorizontal: 3 }, link: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '500' },
  signIn: { color: colors.primary, fontSize: 15, lineHeight: 22, fontWeight: '600', textDecorationLine: 'underline' }, secondary: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  fieldError: { color: colors.error, fontSize: 13, lineHeight: 19 }, errorRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, error: { flex: 1, color: colors.error, fontSize: 14, lineHeight: 21 },
  confirmation: { marginTop: 18, gap: 10, alignItems: 'flex-start' }, emailValue: { fontSize: 17, lineHeight: 25, fontWeight: '600', color: colors.ink, alignSelf: 'stretch' }
}); }
