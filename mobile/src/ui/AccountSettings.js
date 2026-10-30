import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Bell, Palette, Globe2, LogOut, Settings2, ShieldCheck } from 'lucide-react-native';
import { Button, Sheet } from '../calendar/ui';
import AppearanceSettings, { appearanceCopy } from './AppearanceSettings';
import { useAppearance, useThemeStyles } from './AppearanceContext';

export const accountCopy = {
  en: {
    title: 'Account & settings', close: 'Close', back: 'Back to account', signedIn: 'Signed in as',
    appearance: 'Appearance', reminders: 'Phone reminders', reminderHint: 'Local reminders · off until you enable them',
    remindersHelp: 'Enable phone reminders in Account & settings. Local reminders use saved event lead times and refresh on app reopen. Push and email are not provided.',
    preferences: 'Calendar preferences', preferencesHint: 'Opening view, week start, hours and reminder defaults',
    language: 'App language', languageHint: 'English or Chinese · saved on this device',
    help: 'Help & how it works', helpHint: 'Straightforward answers about your family calendar',
    web: 'Open web calendar', webHint: 'Advanced connections and calendar tools on the website',
    privacy: 'Your plans, your choice', privacyBody: 'The same KidsSync account works on the website and phone. Guest preview plans stay on this device until you explicitly save them to your account.',
    signOut: 'Sign out', confirm: 'Sign out of KidsSync?', confirmBody: 'Your saved account calendars stay safe. You’ll need to sign in again to view or change them.', stay: 'Stay signed in', signingOut: 'Signing out…', signOutFailed: 'Could not sign out. Check your connection and try again.',
    helpIntro: 'A quick guide to your pocket-sized family planner.',
    faqs: [
      ['Add and edit an activity', 'Open Calendar, choose the day, then tap +. Add a title, person and time. Tap any saved activity to see details, edit it or delete it with confirmation.'],
      ['Find a plan or change the view', 'Choose Today, Week or Month. Tap a date to see that day’s plans. Search by activity, person, location or pickup adult. Person filters include whole-family events. Clear filters to see everything again.'],
      ['What happens after the trial?', 'The preview counts ten foreground minutes and keeps plans and unfinished event drafts on this device. Make your calendar yours is available early. After signing in, Save preview to my account creates a separate calendar without replacing existing plans.'],
      ['Why did a save fail?', 'For your own calendar, saved offline changes stay on this device until synced. If a conflict appears, review your version and the latest version before retrying or discarding. Shared changes need an online confirmation; unfinished forms still need Save.'],
      ['Will my phone send reminders?', 'Not yet. Reminder choices are saved as event preferences, but native push and email notifications are not scheduled by this app.'],
      ['How do I share with my family?', 'Open Family to invite people, set Viewer, Commenter or Editor access, comment, and coordinate pickups. Available shared tools depend on your role and calendar setup. Advanced connections are available on the website.']
    ]
  },
  zh: {
    title: '账户与设置', close: '关闭', back: '返回账户', signedIn: '当前账户',
    appearance: '外观', reminders: '手机提醒', reminderHint: '本地提醒 · 需手动开启',
    remindersHelp: '在“账户与设置”中开启手机提醒。本地提醒使用已保存的提前时间，并在重新打开应用时刷新。暂不提供推送或邮件通知。',
    preferences: '日历偏好', preferencesHint: '默认视图、每周起始、显示时段与提醒偏好',
    language: '应用语言', languageHint: '英文或中文 · 保存在此设备上',
    help: '帮助与使用说明', helpHint: '简明了解家庭日历的使用方式',
    web: '打开网页日历', webHint: '高级日历连接与工具请使用网页',
    privacy: '你的计划，由你决定', privacyBody: '网页与手机使用同一个 KidsSync 账户。访客体验日程仅保存在此设备上，直到你明确选择保存到账户。',
    signOut: '退出登录', confirm: '退出 KidsSync？', confirmBody: '账户中已保存的日历不会丢失。再次查看或修改时需要重新登录。', stay: '保持登录', signingOut: '正在退出…', signOutFailed: '无法退出登录，请检查网络后重试。',
    helpIntro: '随身家庭日历的简明指南。',
    faqs: [
      ['添加和编辑活动', '打开日历、选择日期并点击 +。填写标题、参与者与时间。点击已保存的活动可查看、编辑或确认删除。'],
      ['查找安排与切换视图', '选择今天、周或月，点击日期查看当天安排。可按活动、参与者、地点或接送人搜索。参与者筛选也包含全家活动，清除筛选即可查看全部。'],
      ['体验结束后怎么办？', '体验只计算前台使用的十分钟，计划和未完成的日程草稿保留在此设备上。可提前打开个性化设置。登录后选择将体验日历保存到账户，会新建独立日历，不替换已有计划。'],
      ['为什么保存失败？', '自己的日历在离线保存后，会将修改保留在此设备上等待同步。如有冲突，请先核对你的版本和最新版本，再重试或放弃。共享修改需要在线确认；未完成的表单仍需点击保存。'],
      ['手机会发送提醒吗？', '暂时不会。提醒选项会作为活动偏好保存，但本应用尚不安排推送或电子邮件通知。'],
      ['如何与家人共享？', '打开“家庭”，即可邀请成员、设置查看者/评论者/编辑者权限、评论并安排接送。可用的共享工具取决于你的权限和日历设置，高级外部连接可使用网页。']
    ]
  }
};

function Row({ icon: Icon, title, detail, onPress, danger }) {
  const { colors } = useAppearance(), s = useThemeStyles(createStyles);
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.65 }]}>
    <View style={[s.icon, danger && s.dangerIcon]}><Icon size={20} color={danger ? colors.error : colors.primary} /></View><View style={s.flex}><Text style={[s.rowTitle, danger && { color: colors.error }]}>{title}</Text>{!!detail && <Text style={s.body}>{detail}</Text>}</View><ChevronRight size={18} color={colors.muted} />
  </Pressable>;
}

export default function AccountSettings({ language, email, onClose, onPreferences, onSignOut, onLanguage, onWebsite, onReminders, reminderHint }) {
  const t = accountCopy[language] || accountCopy.en;
  const { colors, settings } = useAppearance(), s = useThemeStyles(createStyles);
  const appearanceText = appearanceCopy[language] || appearanceCopy.en;
  const [page, setPage] = useState('account'), [question, setQuestion] = useState(0), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const request = useRef(false);
  async function signOut() {
    if (request.current) return;
    request.current = true; setBusy(true); setFailure('');
    try { const result = await onSignOut(); if (result === false || result?.error) throw new Error('SIGN_OUT_FAILED'); }
    catch { setFailure(t.signOutFailed); }
    finally { request.current = false; setBusy(false); }
  }
  return <Sheet title={page === 'appearance' ? t.appearance : page === 'help' ? t.help : page === 'language' ? t.language : page === 'signout' ? t.confirm : t.title} closeLabel={t.close} busy={busy} onClose={onClose}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {page !== 'account' && <Pressable accessibilityRole="button" onPress={() => { setPage('account'); setFailure(''); }} disabled={busy} style={s.back}><ChevronLeft size={18} color={colors.primary} /><Text style={s.link}>{t.back}</Text></Pressable>}
      {page === 'account' ? <>
        <View style={s.identity}><Text style={s.eyebrow}>{t.signedIn}</Text><Text accessibilityLabel={email} numberOfLines={2} ellipsizeMode="middle" style={s.email}>{email}</Text></View>
        <View style={s.group}><Row icon={Palette} title={t.appearance} detail={`${appearanceText[settings.mode]} · ${appearanceText[settings.accent]}`} onPress={() => setPage('appearance')} />{onReminders && <Row icon={Bell} title={t.reminders} detail={reminderHint || t.reminderHint} onPress={onReminders} />}<Row icon={Settings2} title={t.preferences} detail={t.preferencesHint} onPress={onPreferences} />{onLanguage && <Row icon={Globe2} title={t.language} detail={t.languageHint} onPress={() => setPage('language')} />}</View>
        <View style={s.group}><Row icon={CircleHelp} title={t.help} detail={t.helpHint} onPress={() => setPage('help')} />{onWebsite && <Row icon={Globe2} title={t.web} detail={t.webHint} onPress={onWebsite} />}</View>
        <View style={s.privacy}><ShieldCheck size={22} color={colors.success} /><View style={s.flex}><Text style={s.rowTitle}>{t.privacy}</Text><Text style={s.body}>{t.privacyBody}</Text></View></View>
        <Button secondary danger icon={LogOut} onPress={() => { setFailure(''); setPage('signout'); }}>{t.signOut}</Button>
      </> : page === 'appearance' ? <AppearanceSettings language={language} /> : page === 'help' ? <><Text style={s.body}>{t.helpIntro}</Text>{t.faqs.map(([title, originalAnswer], index) => <View key={index} style={s.faq}><Pressable accessibilityRole="button" accessibilityState={{ expanded: question === index }} onPress={() => setQuestion(question === index ? -1 : index)} style={s.question}><Text style={[s.rowTitle, s.flex]}>{title}</Text><ChevronDown size={18} color={colors.muted} /></Pressable>{question === index && <Text style={s.answer}>{index === 4 && onReminders ? t.remindersHelp : originalAnswer}</Text>}</View>)}</> : page === 'language' ? [['en', 'English'], ['zh', '中文']].map(([value, label]) => <Pressable key={value} accessibilityRole="radio" aria-checked={language === value} accessibilityLabel={label} accessibilityState={{ checked: language === value }} onPress={() => onLanguage(value)} style={s.language}><Text style={[s.rowTitle, s.flex]}>{label}</Text>{language === value && <Check size={20} color={colors.primary} />}</Pressable>) : <>
        <Text style={s.answer}>{t.confirmBody}</Text>{!!failure && <Text accessibilityRole="alert" style={s.error}>{failure}</Text>}<Button secondary onPress={() => { setFailure(''); setPage('account'); }} disabled={busy}>{t.stay}</Button><Button danger onPress={signOut} disabled={busy}>{busy ? t.signingOut : t.signOut}</Button>
      </>}
    </ScrollView>
  </Sheet>;
}

function createStyles(colors) { return StyleSheet.create({
  error: { color: colors.error, fontSize: 13, lineHeight: 21 }, content: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 28, gap: 17 }, flex: { flex: 1, minWidth: 0 }, identity: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.line, borderRadius: 17, padding: 17, gap: 7 }, eyebrow: { color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' }, email: { color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: '600' }, group: { borderWidth: 1, borderColor: colors.line, borderRadius: 17, overflow: 'hidden' }, row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 13, minHeight: 75, borderBottomWidth: 1, borderColor: colors.line }, rowTitle: { fontSize: 14, lineHeight: 21, color: colors.ink, fontWeight: '600' }, body: { color: colors.muted, fontSize: 12, lineHeight: 19 }, icon: { height: 36, width: 36, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, dangerIcon: { backgroundColor: colors.errorSoft }, privacy: { flexDirection: 'row', gap: 12, padding: 2 }, back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, link: { color: colors.primary, fontSize: 13, fontWeight: '600' }, faq: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 3, gap: 5 }, question: { minHeight: 52, flexDirection: 'row', gap: 8, alignItems: 'center' }, answer: { color: colors.muted, fontSize: 14, lineHeight: 23, paddingBottom: 5 }, language: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: 1, borderColor: colors.line, paddingHorizontal: 8 }
}); }
