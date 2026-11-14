import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Bell, Palette, Globe2, LogOut, Settings2 } from 'lucide-react-native';
import { Button, Sheet } from '../calendar/ui';
import AppearanceSettings, { appearanceCopy } from './AppearanceSettings';
import ReminderSettings, { reminderCopy } from './ReminderSettings';
import { useAppearance, useThemeStyles } from './AppearanceContext';

export const accountCopy = {
  en: {
    title: 'You & settings', close: 'Close', back: 'Back to settings', signedIn: 'Signed in as',
    preferencesSection: 'Preferences', supportSection: 'Help', accountSection: 'Account',
    appearance: 'Appearance',
    remindersHelp: 'Open You & settings, then Phone reminders, for confirmed calendars you own. Calendars shared with you do not schedule reminders here. Reminder times refresh when the app reopens. Push and email are not provided.',
    preferences: 'Calendar preferences', preferencesHint: 'Edit your setup answers',
    opening: 'Opening…', openFailed: 'Could not open this. Tap again to retry.',
    language: 'App language',
    help: 'How to use KidsSync', web: 'Open web calendar',
    signOut: 'Sign out', confirm: 'Sign out of KidsSync?', confirmBody: 'Your calendars stay in your account. Sign in again to view or change them.', stay: 'Stay signed in', signingOut: 'Signing out…', signOutFailed: 'Could not sign out. Check your connection and try again.',
    faqs: [
      ['Add and edit an activity', 'Open Calendar, choose the day, then tap +. Add a title, person and time. Tap any saved activity to see details, edit it or delete it with confirmation.'],
      ['Find a plan or change the view', 'In Calendar, choose Agenda, Day, Week, or Month. Tap a date to see its plans. Search by activity, person, location, or pickup adult. Person filters also show whole-family events.'],
      ['What happens after the trial?', 'The preview counts ten foreground minutes and keeps plans and unfinished event drafts on this device. Make your calendar yours is available early. After signing in, Save preview to my account creates a separate calendar without replacing existing plans.'],
      ['Why did a save fail?', 'For your own calendar, saved offline changes stay on this device until synced. If a conflict appears, review your version and the latest version before retrying or discarding. Shared changes need an online confirmation; unfinished forms still need Save.'],
      ['Will my phone send reminders?', 'Not yet. Reminder choices are saved as event preferences, but native push and email notifications are not scheduled by this app.'],
      ['How do I share with my family?', 'Open Family to invite people, set Viewer, Commenter or Editor access, comment, and coordinate pickups. Available shared tools depend on your role and calendar setup. Advanced connections are available on the website.']
    ]
  },
  zh: {
    title: '个人与设置', close: '关闭', back: '返回设置', signedIn: '当前账户',
    preferencesSection: '偏好设置', supportSection: '帮助', accountSection: '账户',
    appearance: '外观',
    remindersHelp: '在“个人与设置”中打开“手机提醒”，为你拥有且已确认的日历开启提醒。他人共享给你的日历不会在此安排提醒。重新打开应用时会刷新提醒时间。暂不提供推送或邮件通知。',
    preferences: '日历偏好', preferencesHint: '修改设置答案',
    opening: '正在打开…', openFailed: '无法打开，请再次点击重试。',
    language: '应用语言',
    help: 'KidsSync 使用说明', web: '打开网页日历',
    signOut: '退出登录', confirm: '退出 KidsSync？', confirmBody: '日历会保留在你的账户中。重新登录后即可查看或修改。', stay: '保持登录', signingOut: '正在退出…', signOutFailed: '无法退出登录，请检查网络后重试。',
    faqs: [
      ['添加和编辑活动', '打开日历、选择日期并点击 +。填写标题、参与者与时间。点击已保存的活动可查看、编辑或确认删除。'],
      ['查找安排与切换视图', '在日历中选择日程、日、周或月。点击日期查看当天安排。可按活动、参与者、地点或接送人搜索。按参与者筛选时也会显示全家活动。'],
      ['体验结束后怎么办？', '体验只计算前台使用的十分钟，计划和未完成的日程草稿保留在此设备上。可提前打开个性化设置。登录后选择将体验日历保存到账户，会新建独立日历，不替换已有计划。'],
      ['为什么保存失败？', '自己的日历在离线保存后，会将修改保留在此设备上等待同步。如有冲突，请先核对你的版本和最新版本，再重试或放弃。共享修改需要在线确认；未完成的表单仍需点击保存。'],
      ['手机会发送提醒吗？', '暂时不会。提醒选项会作为活动偏好保存，但本应用尚不安排推送或电子邮件通知。'],
      ['如何与家人共享？', '打开“家庭”，即可邀请成员、设置查看者/评论者/编辑者权限、评论并安排接送。可用的共享工具取决于你的权限和日历设置，高级外部连接可使用网页。']
    ]
  }
};

function Row({ icon: Icon, title, detail, onPress, danger, disabled, opening, error }) {
  const { colors } = useAppearance(), s = useThemeStyles(createStyles);
  return <Pressable accessibilityRole="button" accessibilityHint={error || detail} disabled={disabled} aria-disabled={!!disabled} accessibilityState={{ disabled: !!disabled, busy: !!opening }} onPress={onPress} style={({ pressed }) => [s.row, (pressed || disabled) && { opacity: 0.65 }]}>
    <Icon size={19} color={danger ? colors.error : colors.primary} aria-hidden={true} /><View style={s.flex}><Text style={[s.rowTitle, danger && { color: colors.error }]}>{title}</Text>{!!(error || detail) && <Text accessibilityRole={error ? 'alert' : 'text'} accessibilityLiveRegion={error ? 'polite' : undefined} style={error ? s.error : s.body}>{error || detail}</Text>}</View>{opening ? <ActivityIndicator size="small" color={colors.primary} /> : <ChevronRight size={18} color={colors.muted} aria-hidden={true} />}
  </Pressable>;
}

export default function AccountSettings({ language, email, onClose, onPreferences, onSignOut, onLanguage, onWebsite, reminders }) {
  const t = accountCopy[language] || accountCopy.en;
  const { colors, settings } = useAppearance(), s = useThemeStyles(createStyles);
  const appearanceText = appearanceCopy[language] || appearanceCopy.en;
  const reminderText = reminderCopy[language] || reminderCopy.en;
  const reminderStatus = reminders?.state.status;
  const reminderHint = reminderStatus === 'scheduled'
    ? `${reminderText.scheduled} · ${reminders.state.scheduled || 0}`
    : reminderText[reminderStatus] || reminderText.waiting;
  const [page, setPage] = useState('account'), [question, setQuestion] = useState(-1), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const [opening, setOpening] = useState(''), [navigationFailure, setNavigationFailure] = useState('');
  const request = useRef(false), navigationRequest = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function navigate(name, callback) {
    if (request.current || navigationRequest.current || typeof callback !== 'function') return;
    navigationRequest.current = true; setOpening(name); setNavigationFailure('');
    try { const result = await callback(); if (result === false || result?.error) throw new Error('OPEN_FAILED'); }
    catch { if (mounted.current) setNavigationFailure(name); }
    finally { navigationRequest.current = false; if (mounted.current) setOpening(''); }
  }
  async function signOut() {
    if (request.current) return;
    request.current = true; setBusy(true); setFailure('');
    try { const result = await onSignOut(); if (result === false || result?.error) throw new Error('SIGN_OUT_FAILED'); }
    catch { setFailure(t.signOutFailed); }
    finally { request.current = false; if (mounted.current) setBusy(false); }
  }
  const pageTitle = { appearance: t.appearance, reminders: reminderText.title, help: t.help, language: t.language, signout: t.confirm };
  const sheetBusy = busy || opening === 'preferences' || (page === 'reminders' && reminderStatus === 'configuring');
  return <Sheet title={pageTitle[page] || t.title} closeLabel={t.close} busy={sheetBusy} onClose={onClose}>
    <ScrollView key={page} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {page !== 'account' && <Pressable accessibilityRole="button" onPress={() => { setPage('account'); setFailure(''); setNavigationFailure(''); }} disabled={sheetBusy} style={s.back}><ChevronLeft size={18} color={colors.primary} /><Text style={s.link}>{t.back}</Text></Pressable>}
      {page === 'account' ? <>
        <View style={s.identity}>
          <Text style={s.body}>{t.signedIn}</Text>
          <Text accessibilityLabel={email} numberOfLines={2} ellipsizeMode="middle" style={s.email}>{email}</Text>
        </View>
        <Text style={s.sectionLabel}>{t.preferencesSection}</Text>
        <View style={s.group}>
          <Row icon={Palette} title={t.appearance} detail={`${appearanceText[settings.mode]} · ${appearanceText[settings.accent]}`} disabled={!!opening} onPress={() => setPage('appearance')} />
          {reminders && <Row icon={Bell} title={reminderText.title} detail={reminderHint}
            disabled={!!opening} onPress={() => setPage('reminders')} />}
          <Row icon={Settings2} title={t.preferences} detail={opening === 'preferences' ? t.opening : t.preferencesHint}
            disabled={!!opening || typeof onPreferences !== 'function'} opening={opening === 'preferences'} error={navigationFailure === 'preferences' ? t.openFailed : ''} onPress={() => navigate('preferences', onPreferences)} />
          {onLanguage && <Row icon={Globe2} title={t.language} detail={language === 'zh' ? '中文' : 'English'} disabled={!!opening} onPress={() => setPage('language')} />}
        </View>
        <Text style={s.sectionLabel}>{t.supportSection}</Text>
        <View style={s.group}>
          <Row icon={CircleHelp} title={t.help} disabled={!!opening} onPress={() => { setQuestion(-1); setPage('help'); }} />
          {onWebsite && <Row icon={Globe2} title={t.web} detail={opening === 'web' ? t.opening : undefined}
            disabled={!!opening} opening={opening === 'web'} error={navigationFailure === 'web' ? t.openFailed : ''} onPress={() => navigate('web', onWebsite)} />}
        </View>
        <Text style={s.sectionLabel}>{t.accountSection}</Text>
        <View style={s.group}><Row icon={LogOut} title={t.signOut} danger disabled={!!opening} onPress={() => { setFailure(''); setPage('signout'); }} /></View>
      </> : page === 'appearance' ? <AppearanceSettings language={language} /> : page === 'reminders' ? <ReminderSettings language={language} reminders={reminders} /> : page === 'help' ? t.faqs.map(([title, originalAnswer], index) => <View key={index} style={s.faq}><Pressable accessibilityRole="button" accessibilityState={{ expanded: question === index }} onPress={() => setQuestion(question === index ? -1 : index)} style={s.question}><Text style={[s.rowTitle, s.flex]}>{title}</Text><ChevronDown size={18} color={colors.muted} /></Pressable>{question === index && <Text style={s.answer}>{index === 4 && reminders ? t.remindersHelp : originalAnswer}</Text>}</View>) : page === 'language' ? [['en', 'English'], ['zh', '中文']].map(([value, label]) => <Pressable key={value} accessibilityRole="radio" aria-checked={language === value} accessibilityLabel={label} accessibilityState={{ checked: language === value }} onPress={() => onLanguage(value)} style={s.language}><Text style={[s.rowTitle, s.flex]}>{label}</Text>{language === value && <Check size={20} color={colors.primary} />}</Pressable>) : <>
        <Text style={s.answer}>{t.confirmBody}</Text>{!!failure && <Text accessibilityRole="alert" style={s.error}>{failure}</Text>}<Button secondary onPress={() => { setFailure(''); setPage('account'); }} disabled={busy}>{t.stay}</Button><Button danger onPress={signOut} disabled={busy}>{busy ? t.signingOut : t.signOut}</Button>
      </>}
    </ScrollView>
  </Sheet>;
}

function createStyles(colors) { return StyleSheet.create({
  error: { color: colors.error, fontSize: 13, lineHeight: 21 }, content: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 34, gap: 12 }, flex: { flex: 1, minWidth: 0 },
  identity: { paddingHorizontal: 3, paddingBottom: 8, gap: 2 },
  email: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  sectionLabel: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 5, paddingHorizontal: 3 },
  group: { borderTopWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 6, paddingVertical: 10, minHeight: 52, borderBottomWidth: 1, borderColor: colors.line },
  rowTitle: { fontSize: 14, lineHeight: 21, color: colors.ink, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  link: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  faq: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 3, gap: 5 },
  question: { minHeight: 52, flexDirection: 'row', gap: 8, alignItems: 'center' },
  answer: { color: colors.muted, fontSize: 14, lineHeight: 23, paddingBottom: 5 },
  language: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: 1, borderColor: colors.line, paddingHorizontal: 8 }
}); }
