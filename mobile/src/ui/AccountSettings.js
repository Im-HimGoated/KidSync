import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Bell, Palette, Globe2, LogOut, Settings2, CalendarDays, Trash2 } from 'lucide-react-native';
import { Button, Field, Sheet } from '../calendar/ui';
import AppearanceSettings, { appearanceCopy } from './AppearanceSettings';
import ReminderSettings, { reminderCopy } from './ReminderSettings';
import CalendarDisplaySettings, { calendarDisplayCopy } from './CalendarDisplaySettings';
import { useAppearance, useThemeStyles } from './AppearanceContext';

export const accountCopy = {
  en: {
    title: 'You & settings', close: 'Close', back: 'Back to settings', signedIn: 'Signed in as',
    preferencesSection: 'Preferences', supportSection: 'Help', accountSection: 'Account',
    appearance: 'Appearance',
    deleteAccount: 'Delete account', deletionTitle: 'Delete your KidsSync account?',
    deletionBody: 'This permanently deletes your account, the calendars you own and their family profiles on KidsSync and the website. Your comments and sharing access are removed. Other people’s calendars are kept.',
    deletionLocal: 'Unsynced changes and account data on this phone will also be removed. You can export a backup from Calendar files before continuing.',
    deletionPassword: 'Current password', deletionConfirm: 'I understand that this cannot be undone.',
    checkingDeletion: 'Checking account deletion…', deletionUnavailable: 'Account deletion is not available on this connection. Check your connection and try again.',
    retryDeletion: 'Check again', deleting: 'Deleting account…', deletionFailed: 'Deletion was not confirmed. Check your connection before trying again.',
    wrongDeletionPassword: 'The password was not accepted. Try again.', deletionAuth: 'Sign in again before deleting your account.',
    deletionScope: 'This account changed. Close settings and reopen them for the account you want to delete.',
    deletionMfa: 'This account needs additional sign-in verification before deletion.',
    deletedTitle: 'Account deleted', deletedBody: 'The requested KidsSync account and its owned calendars have been deleted.',
    cleanupFailed: 'The account was deleted, but some data or reminders on this phone could not be cleared. Retry device cleanup.',
    retryCleanup: 'Retry device cleanup', cleaningUp: 'Clearing device data…', done: 'Done',
    discardDisplay: 'Discard display changes?', discardDisplayBody: 'Your unsaved calendar display choices will be lost.', keepEditing: 'Keep editing', discardChanges: 'Discard changes',
    remindersHelp: 'Open You & settings, then Phone reminders, for confirmed calendars you own. Calendars shared with you do not schedule reminders here. Reminder times refresh when the app reopens. Push and email are not provided.',
    preferences: 'Calendar preferences', preferencesHint: 'Edit your setup answers',
    opening: 'Opening…', openFailed: 'Could not open this. Tap again to retry.',
    language: 'App language',
    help: 'How to use KidsSync', web: 'Open web calendar', privacy: 'Privacy & your data',
    privacyDetails: [
      'Your account and synced calendars use the same KidsSync account as the website. Supabase stores this account and calendar data. Sharing follows the access and links you enable.',
      'Adults manage child profiles. Invite only trusted caregivers and choose Viewer, Commenter or Editor access for each calendar.',
      'Private day notes, saved views, polls, pins and packing progress stay on this device. Private notes are excluded from shared agendas.',
      'Phone reminders are opt-in and keep lock-screen text generic. Remote push and automatic email delivery are not included.',
      'Account deletion removes your owned calendars on the app and website. Other people’s calendars remain; your attribution in their activity history is anonymized.'
    ],
    signOut: 'Sign out', confirm: 'Sign out of KidsSync?', confirmBody: 'Your calendars stay in your account. Sign in again to view or change them.', stay: 'Stay signed in', signingOut: 'Signing out…', signOutFailed: 'Could not sign out. Check your connection and try again.',
    faqs: [
      ['Add and edit an activity', 'Open Calendar, choose the day, then tap +. Add a title, person and time. Tap any saved activity to see details, edit it or delete it with confirmation.'],
      ['Find a plan or change the view', 'In Calendar, choose Agenda, Day, Week, or Month. Tap a date to see its plans. Search by activity, person, location, or pickup adult. Person filters also show whole-family events.'],
      ['What happens after the trial?', 'The preview counts ten foreground minutes and keeps plans and unfinished event drafts on this device. Make your calendar yours is available early. After signing in, Save preview to my account creates a separate calendar without replacing existing plans.'],
      ['Why did a save fail?', 'For your own calendar, saved offline changes stay on this device until synced. If a conflict appears, review your version and the latest version before retrying or discarding. Shared changes need an online confirmation; unfinished forms still need Save.'],
      ['Will my phone send reminders?', 'Enable Phone reminders for confirmed calendars you own. Local reminders refresh when the app reconnects. Shared calendars, remote push and email alerts are not included.'],
      ['How do I share with my family?', 'Open Family to invite people, set Viewer, Commenter or Editor access, comment, and coordinate pickups. Available shared tools depend on your role and calendar setup. Advanced connections are available on the website.']
    ]
  },
  zh: {
    title: '个人与设置', close: '关闭', back: '返回设置', signedIn: '当前账户',
    preferencesSection: '偏好设置', supportSection: '帮助', accountSection: '账户',
    appearance: '外观',
    deleteAccount: '删除账户', deletionTitle: '删除你的 KidsSync 账户？',
    deletionBody: '这会永久删除 KidsSync 应用和网站上的账户、你拥有的日历及家庭资料。你的评论和共享权限也会移除。其他人拥有的日历会保留。',
    deletionLocal: '此手机上尚未同步的更改和账户数据也会移除。继续前，可在“日历文件”中导出备份。',
    deletionPassword: '当前密码', deletionConfirm: '我了解此操作无法撤销。',
    checkingDeletion: '正在检查账户删除功能…', deletionUnavailable: '当前连接无法使用账户删除功能，请检查连接后重试。',
    retryDeletion: '重新检查', deleting: '正在删除账户…', deletionFailed: '尚未确认删除结果，请检查连接后再试。',
    wrongDeletionPassword: '密码未通过验证，请重试。', deletionAuth: '请重新登录后再删除账户。',
    deletionScope: '当前账户已更改。请关闭设置，再为要删除的账户重新打开设置。',
    deletionMfa: '此账户需要完成额外的登录验证后才能删除。',
    deletedTitle: '账户已删除', deletedBody: '要删除的 KidsSync 账户及其拥有的日历已删除。',
    cleanupFailed: '账户已删除，但此手机上的部分数据或提醒尚未清除。请重试设备清理。',
    retryCleanup: '重试设备清理', cleaningUp: '正在清理设备数据…', done: '完成',
    discardDisplay: '放弃显示更改？', discardDisplayBody: '未保存的日历显示选项将丢失。', keepEditing: '继续编辑', discardChanges: '放弃更改',
    remindersHelp: '在“个人与设置”中打开“手机提醒”，为你拥有且已确认的日历开启提醒。他人共享给你的日历不会在此安排提醒。重新打开应用时会刷新提醒时间。暂不提供推送或邮件通知。',
    preferences: '日历偏好', preferencesHint: '修改设置答案',
    opening: '正在打开…', openFailed: '无法打开，请再次点击重试。',
    language: '应用语言',
    help: 'KidsSync 使用说明', web: '打开网页日历', privacy: '隐私与个人数据',
    privacyDetails: [
      '应用和网站使用同一个 KidsSync 账户。Supabase 存储账户及同步的日历数据，共享取决于你启用的权限和链接。',
      '孩子的资料由成人管理。仅邀请信任的照护者，并为每个日历选择查看者、评论者或编辑者权限。',
      '私人日记、已存视图、投票、收藏和打包进度保留在此设备上。共享周安排不会包含私人日记。',
      '手机提醒需要主动开启，锁屏内容保持通用。暂不提供远程推送或自动邮件通知。',
      '删除账户会移除应用和网站上你拥有的日历。其他人拥有的日历会保留，其中活动历史里的你的身份信息会匿名化。'
    ],
    signOut: '退出登录', confirm: '退出 KidsSync？', confirmBody: '日历会保留在你的账户中。重新登录后即可查看或修改。', stay: '保持登录', signingOut: '正在退出…', signOutFailed: '无法退出登录，请检查网络后重试。',
    faqs: [
      ['添加和编辑活动', '打开日历、选择日期并点击 +。填写标题、参与者与时间。点击已保存的活动可查看、编辑或确认删除。'],
      ['查找安排与切换视图', '在日历中选择日程、日、周或月。点击日期查看当天安排。可按活动、参与者、地点或接送人搜索。按参与者筛选时也会显示全家活动。'],
      ['体验结束后怎么办？', '体验只计算前台使用的十分钟，计划和未完成的日程草稿保留在此设备上。可提前打开个性化设置。登录后选择将体验日历保存到账户，会新建独立日历，不替换已有计划。'],
      ['为什么保存失败？', '自己的日历在离线保存后，会将修改保留在此设备上等待同步。如有冲突，请先核对你的版本和最新版本，再重试或放弃。共享修改需要在线确认；未完成的表单仍需点击保存。'],
      ['手机会发送提醒吗？', '可为你拥有且已确认的日历开启“手机提醒”。应用重新连接时会刷新本地提醒。不包括他人共享的日历、远程推送或邮件提醒。'],
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

export default function AccountSettings({ language, email, onClose, onPreferences, onSignOut, onLanguage, onWebsite, reminders, calendarDisplay, onCheckDeletion, onDeleteAccount }) {
  const t = accountCopy[language] || accountCopy.en;
  const { colors, settings } = useAppearance(), s = useThemeStyles(createStyles);
  const appearanceText = appearanceCopy[language] || appearanceCopy.en;
  const reminderText = reminderCopy[language] || reminderCopy.en;
  const displayText = calendarDisplayCopy[language] || calendarDisplayCopy.en;
  const reminderStatus = reminders?.state.status;
  const reminderHint = reminderStatus === 'scheduled'
    ? `${reminderText.scheduled} · ${reminders.state.scheduled || 0}`
    : reminderText[reminderStatus] || reminderText.waiting;
  const [page, setPage] = useState('account'), [question, setQuestion] = useState(-1), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const [opening, setOpening] = useState(''), [navigationFailure, setNavigationFailure] = useState('');
  const [displayBusy, setDisplayBusy] = useState(false);
  const [displayDirty, setDisplayDirty] = useState(false), [pendingLeave, setPendingLeave] = useState('');
  const [deletionAvailability, setDeletionAvailability] = useState(''), [deletionPassword, setDeletionPassword] = useState(''), [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const deletionTicket = useRef(0);
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
  async function checkDeletion() {
    const ticket = ++deletionTicket.current;
    setPage('delete'); setDeletionAvailability('checking'); setFailure('');
    try {
      if (typeof onCheckDeletion !== 'function' || await onCheckDeletion() !== true) throw new Error('UNAVAILABLE');
      if (mounted.current && deletionTicket.current === ticket) setDeletionAvailability('ready');
    } catch { if (mounted.current && deletionTicket.current === ticket) setDeletionAvailability('unavailable'); }
  }
  async function deleteAccount() {
    if (request.current || deletionAvailability !== 'ready' || !deletionPassword || !deletionConfirmed || typeof onDeleteAccount !== 'function') return;
    request.current = true; setBusy(true); setFailure('');
    try {
      const result = await onDeleteAccount({ password: deletionPassword, confirmationEmail: email });
      if (result?.deleted !== true) throw new Error('DELETE_FAILED');
    } catch (error) {
      if (mounted.current) setFailure(({ REAUTH_FAILED: t.wrongDeletionPassword, AUTH_REQUIRED: t.deletionAuth,
        STALE_SCOPE: t.deletionScope, ADDITIONAL_VERIFICATION_REQUIRED: t.deletionMfa,
        NOT_CONFIGURED: t.deletionUnavailable })[error?.code] || t.deletionFailed);
    } finally { request.current = false; if (mounted.current) { setBusy(false); setDeletionPassword(''); } }
  }
  const pageTitle = { appearance: t.appearance, display: displayText.title, reminders: reminderText.title, help: t.help, privacy: t.privacy, language: t.language, signout: t.confirm, delete: t.deletionTitle };
  const sheetBusy = busy || displayBusy || opening === 'preferences' || (page === 'reminders' && reminderStatus === 'configuring');
  function leave(destination) {
    deletionTicket.current++; setDeletionPassword(''); setDeletionConfirmed(false); setDeletionAvailability('');
    setPendingLeave(''); setDisplayDirty(false);
    if (destination === 'close') onClose();
    else { setPage('account'); setFailure(''); setNavigationFailure(''); }
  }
  function requestLeave(destination) {
    if (sheetBusy) return;
    if (page === 'display' && displayDirty) setPendingLeave(destination);
    else leave(destination);
  }
  return <Sheet title={pendingLeave ? t.discardDisplay : pageTitle[page] || t.title} closeLabel={t.close} busy={sheetBusy} onClose={() => requestLeave('close')}>
    {!!pendingLeave && <View style={s.content}>
      <Text style={s.answer}>{t.discardDisplayBody}</Text>
      <Button onPress={() => setPendingLeave('')}>{t.keepEditing}</Button>
      <Button danger onPress={() => leave(pendingLeave)}>{t.discardChanges}</Button>
    </View>}
    <View accessibilityElementsHidden={!!pendingLeave} importantForAccessibility={pendingLeave ? 'no-hide-descendants' : 'auto'} style={{ flexShrink: 1, display: pendingLeave ? 'none' : 'flex' }}>
    <ScrollView key={page} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {page !== 'account' && <Pressable accessibilityRole="button" onPress={() => requestLeave('account')} disabled={sheetBusy} style={s.back}><ChevronLeft size={18} color={colors.primary} /><Text style={s.link}>{t.back}</Text></Pressable>}
      {page === 'account' ? <>
        <View style={s.identity}>
          <Text style={s.body}>{t.signedIn}</Text>
          <Text accessibilityLabel={email} numberOfLines={2} ellipsizeMode="middle" style={s.email}>{email}</Text>
        </View>
        <Text style={s.sectionLabel}>{t.preferencesSection}</Text>
        <View style={s.group}>
          {calendarDisplay && <Row icon={CalendarDays} title={displayText.title} detail={calendarDisplay.calendar?.name || displayText.noCalendar} disabled={!!opening} onPress={() => setPage('display')} />}
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
          <Row icon={CircleHelp} title={t.privacy} disabled={!!opening} onPress={() => setPage('privacy')} />
          {onWebsite && <Row icon={Globe2} title={t.web} detail={opening === 'web' ? t.opening : undefined}
            disabled={!!opening} opening={opening === 'web'} error={navigationFailure === 'web' ? t.openFailed : ''} onPress={() => navigate('web', onWebsite)} />}
        </View>
        <Text style={s.sectionLabel}>{t.accountSection}</Text>
        <View style={s.group}><Row icon={LogOut} title={t.signOut} danger disabled={!!opening} onPress={() => { setFailure(''); setPage('signout'); }} />
          {!!onDeleteAccount && <Row icon={Trash2} title={t.deleteAccount} danger disabled={!!opening} onPress={checkDeletion} />}
        </View>
      </> : page === 'privacy' ? t.privacyDetails.map(paragraph => <Text key={paragraph} style={s.answer}>{paragraph}</Text>) : page === 'delete' ? <>
        <Text style={s.answer}>{t.deletionBody}</Text><Text style={s.answer}>{t.deletionLocal}</Text>
        <Text style={s.email}>{email}</Text>
        {deletionAvailability === 'checking' && <Text accessibilityLiveRegion="polite" style={s.body}>{t.checkingDeletion}</Text>}
        {deletionAvailability === 'unavailable' && <><Text accessibilityRole="alert" style={s.error}>{t.deletionUnavailable}</Text><Button secondary onPress={checkDeletion}>{t.retryDeletion}</Button></>}
        {deletionAvailability === 'ready' && <>
          <Field label={t.deletionPassword} value={deletionPassword} onChangeText={setDeletionPassword} secureTextEntry
            autoCapitalize="none" autoCorrect={false} autoComplete="current-password" maxLength={1024} editable={!busy} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: deletionConfirmed, disabled: busy }} disabled={busy}
            onPress={() => setDeletionConfirmed(value => !value)} style={s.deletionConfirmation}>
            <Text style={s.rowTitle}>{deletionConfirmed ? '☑' : '☐'}</Text><Text style={[s.answer, s.flex]}>{t.deletionConfirm}</Text>
          </Pressable>
          {!!failure && <Text accessibilityRole="alert" style={s.error}>{failure}</Text>}
          <Button danger disabled={busy || !deletionPassword || !deletionConfirmed} onPress={deleteAccount}>{busy ? t.deleting : t.deleteAccount}</Button>
        </>}
      </> : page === 'display' && calendarDisplay ? <CalendarDisplaySettings key={calendarDisplay.scope} language={language} {...calendarDisplay} onBusyChange={setDisplayBusy} onDirtyChange={setDisplayDirty} /> : page === 'appearance' ? <AppearanceSettings language={language} /> : page === 'reminders' ? <ReminderSettings language={language} reminders={reminders} /> : page === 'help' ? t.faqs.map(([title, originalAnswer], index) => <View key={index} style={s.faq}><Pressable accessibilityRole="button" accessibilityState={{ expanded: question === index }} onPress={() => setQuestion(question === index ? -1 : index)} style={s.question}><Text style={[s.rowTitle, s.flex]}>{title}</Text><ChevronDown size={18} color={colors.muted} /></Pressable>{question === index && <Text style={s.answer}>{index === 4 && reminders ? t.remindersHelp : originalAnswer}</Text>}</View>) : page === 'language' ? [['en', 'English'], ['zh', '中文']].map(([value, label]) => <Pressable key={value} accessibilityRole="radio" aria-checked={language === value} accessibilityLabel={label} accessibilityState={{ checked: language === value }} onPress={() => onLanguage(value)} style={s.language}><Text style={[s.rowTitle, s.flex]}>{label}</Text>{language === value && <Check size={20} color={colors.primary} />}</Pressable>) : <>
        <Text style={s.answer}>{t.confirmBody}</Text>{!!failure && <Text accessibilityRole="alert" style={s.error}>{failure}</Text>}<Button secondary onPress={() => { setFailure(''); setPage('account'); }} disabled={busy}>{t.stay}</Button><Button danger onPress={signOut} disabled={busy}>{busy ? t.signingOut : t.signOut}</Button>
      </>}
    </ScrollView>
    </View>
  </Sheet>;
}

export function AccountDeletionReceipt({ language, busy, needsCleanup, onRetry, onClose }) {
  const t = accountCopy[language] || accountCopy.en, s = useThemeStyles(createStyles);
  return <ScrollView contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={s.email}>{t.deletedTitle}</Text><Text style={s.answer}>{t.deletedBody}</Text>
      {needsCleanup && <><Text accessibilityRole="alert" style={s.error}>{t.cleanupFailed}</Text><Button disabled={busy} onPress={onRetry}>{busy ? t.cleaningUp : t.retryCleanup}</Button></>}
      <Button secondary disabled={busy} onPress={onClose}>{t.done}</Button>
  </ScrollView>;
}

function createStyles(colors) { return StyleSheet.create({
  error: { color: colors.error, fontSize: 13, lineHeight: 21 }, content: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 34, gap: 12 }, flex: { flex: 1, minWidth: 0 },
  deletionConfirmation: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
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
