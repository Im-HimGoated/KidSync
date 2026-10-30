import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Globe2, LogOut, Settings2, ShieldCheck } from 'lucide-react-native';
import { Button, colors, Sheet, u } from '../calendar/ui';

export const accountCopy = {
  en: {
    title: 'Account & settings', close: 'Close', back: 'Back to account', signedIn: 'Signed in as',
    preferences: 'Calendar preferences', preferencesHint: 'Opening view, week start, hours and reminder defaults',
    language: 'App language', languageHint: 'English or Chinese · saved on this device',
    help: 'Help & how it works', helpHint: 'Straightforward answers about your family calendar',
    web: 'Open web calendar', webHint: 'Advanced calendar connections and shared editing on the website',
    privacy: 'Your plans, your choice', privacyBody: 'The same KidsSync account works on the website and phone. Guest preview plans stay on this device until you explicitly save them to your account.',
    signOut: 'Sign out', confirm: 'Sign out of KidsSync?', confirmBody: 'Your saved account calendars stay safe. You’ll need to sign in again to view or change them.', stay: 'Stay signed in', signingOut: 'Signing out…', signOutFailed: 'Could not sign out. Check your connection and try again.',
    helpIntro: 'A quick guide to your pocket-sized family planner.',
    faqs: [
      ['Add and edit an activity', 'Open Calendar, choose the day, then tap +. Add a title, person and time. Tap any saved activity to see details, edit it or delete it with confirmation.'],
      ['Find a plan or change the view', 'Choose Today, Week or Month. Tap a date to see that day’s plans. Search by activity, person, location or pickup adult. Person filters include whole-family events. Clear filters to see everything again.'],
      ['What happens after the trial?', 'The preview counts ten foreground minutes and keeps plans and unfinished event drafts on this device. Make your calendar yours is available early. After signing in, Save preview to my account creates a separate calendar without replacing existing plans.'],
      ['Why did a save fail?', 'Check your connection and retry. If someone changed the same calendar, keep a copy of your changes, refresh, and reopen the latest activity before saving again. Unsaved account edits are not an offline queue.'],
      ['Will my phone send reminders?', 'Not yet. Reminder choices are saved as event preferences, but native push and email notifications are not scheduled by this app.'],
      ['How do I share with my family?', 'Open Family to invite people, set Viewer, Commenter or Editor access, comment, and coordinate pickups. Shared event editing and connected-calendar tools still open on the website.']
    ]
  },
  zh: {
    title: '账户与设置', close: '关闭', back: '返回账户', signedIn: '当前账户',
    preferences: '日历偏好', preferencesHint: '默认视图、每周起始、显示时段与提醒偏好',
    language: '应用语言', languageHint: '英文或中文 · 保存在此设备上',
    help: '帮助与使用说明', helpHint: '简明了解家庭日历的使用方式',
    web: '打开网页日历', webHint: '高级日历连接和共享编辑请使用网页',
    privacy: '你的计划，由你决定', privacyBody: '网页与手机使用同一个 KidsSync 账户。访客体验日程仅保存在此设备上，直到你明确选择保存到账户。',
    signOut: '退出登录', confirm: '退出 KidsSync？', confirmBody: '账户中已保存的日历不会丢失。再次查看或修改时需要重新登录。', stay: '保持登录', signingOut: '正在退出…', signOutFailed: '无法退出登录，请检查网络后重试。',
    helpIntro: '随身家庭日历的简明指南。',
    faqs: [
      ['添加和编辑活动', '打开日历、选择日期并点击 +。填写标题、参与者与时间。点击已保存的活动可查看、编辑或确认删除。'],
      ['查找安排与切换视图', '选择今天、周或月，点击日期查看当天安排。可按活动、参与者、地点或接送人搜索。参与者筛选也包含全家活动，清除筛选即可查看全部。'],
      ['体验结束后怎么办？', '体验只计算前台使用的十分钟，计划和未完成的日程草稿保留在此设备上。可提前打开个性化设置。登录后选择将体验日历保存到账户，会新建独立日历，不替换已有计划。'],
      ['为什么保存失败？', '请检查网络后重试。如果他人修改了日历，请先记下修改、刷新并重新打开最新活动后再保存。账户中未保存的编辑不是离线队列。'],
      ['手机会发送提醒吗？', '暂时不会。提醒选项会作为活动偏好保存，但本应用尚不安排推送或电子邮件通知。'],
      ['如何与家人共享？', '打开“家庭”，即可邀请成员、设置查看者/评论者/编辑者权限、评论并安排接送。共享日程编辑和外部日历连接仍需使用网页。']
    ]
  }
};

function Row({ icon: Icon, title, detail, onPress, danger }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.65 }]}>
    <View style={[s.icon, danger && s.dangerIcon]}><Icon size={20} color={danger ? colors.red : '#235B47'} /></View><View style={s.flex}><Text style={[s.rowTitle, danger && { color: colors.red }]}>{title}</Text>{!!detail && <Text style={s.body}>{detail}</Text>}</View><ChevronRight size={18} color={colors.muted} />
  </Pressable>;
}

export default function AccountSettings({ language, email, onClose, onPreferences, onSignOut, onLanguage, onWebsite }) {
  const t = accountCopy[language] || accountCopy.en;
  const [page, setPage] = useState('account'), [question, setQuestion] = useState(0), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const request = useRef(false);
  async function signOut() {
    if (request.current) return;
    request.current = true; setBusy(true); setFailure('');
    try { const result = await onSignOut(); if (result === false || result?.error) throw new Error('SIGN_OUT_FAILED'); }
    catch { setFailure(t.signOutFailed); }
    finally { request.current = false; setBusy(false); }
  }
  return <Sheet title={page === 'help' ? t.help : page === 'language' ? t.language : page === 'signout' ? t.confirm : t.title} closeLabel={t.close} busy={busy} onClose={onClose}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {page !== 'account' && <Pressable accessibilityRole="button" onPress={() => { setPage('account'); setFailure(''); }} disabled={busy} style={s.back}><ChevronLeft size={18} color="#235B47" /><Text style={s.link}>{t.back}</Text></Pressable>}
      {page === 'account' ? <>
        <View style={s.identity}><Text style={s.eyebrow}>{t.signedIn}</Text><Text accessibilityLabel={email} numberOfLines={2} ellipsizeMode="middle" style={s.email}>{email}</Text></View>
        <View style={s.group}><Row icon={Settings2} title={t.preferences} detail={t.preferencesHint} onPress={onPreferences} />{onLanguage && <Row icon={Globe2} title={t.language} detail={t.languageHint} onPress={() => setPage('language')} />}</View>
        <View style={s.group}><Row icon={CircleHelp} title={t.help} detail={t.helpHint} onPress={() => setPage('help')} />{onWebsite && <Row icon={Globe2} title={t.web} detail={t.webHint} onPress={onWebsite} />}</View>
        <View style={s.privacy}><ShieldCheck size={22} color="#356D50" /><View style={s.flex}><Text style={s.rowTitle}>{t.privacy}</Text><Text style={s.body}>{t.privacyBody}</Text></View></View>
        <Button secondary danger icon={LogOut} onPress={() => { setFailure(''); setPage('signout'); }}>{t.signOut}</Button>
      </> : page === 'help' ? <><Text style={s.body}>{t.helpIntro}</Text>{t.faqs.map(([title, answer], index) => <View key={index} style={s.faq}><Pressable accessibilityRole="button" accessibilityState={{ expanded: question === index }} onPress={() => setQuestion(question === index ? -1 : index)} style={s.question}><Text style={[s.rowTitle, s.flex]}>{title}</Text><ChevronDown size={18} color={colors.muted} /></Pressable>{question === index && <Text style={s.answer}>{answer}</Text>}</View>)}</> : page === 'language' ? [['en', 'English'], ['zh', '中文']].map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: language === value }} onPress={() => onLanguage(value)} style={s.language}><Text style={[s.rowTitle, s.flex]}>{label}</Text>{language === value && <Check size={20} color="#235B47" />}</Pressable>) : <>
        <Text style={s.answer}>{t.confirmBody}</Text>{!!failure && <Text accessibilityRole="alert" style={u.error}>{failure}</Text>}<Button secondary onPress={() => { setFailure(''); setPage('account'); }} disabled={busy}>{t.stay}</Button><Button danger onPress={signOut} disabled={busy}>{busy ? t.signingOut : t.signOut}</Button>
      </>}
    </ScrollView>
  </Sheet>;
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 5, paddingBottom: 28, gap: 17 }, flex: { flex: 1, minWidth: 0 }, identity: { backgroundColor: '#EBF4EE', borderWidth: 1, borderColor: '#D8E4DC', borderRadius: 17, padding: 17, gap: 7 }, eyebrow: { color: '#546B60', fontSize: 11, lineHeight: 17, fontWeight: '600' }, email: { color: '#203C38', fontSize: 16, lineHeight: 24, fontWeight: '600' }, group: { borderWidth: 1, borderColor: '#D8E4DC', borderRadius: 17, overflow: 'hidden' }, row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 13, minHeight: 75, borderBottomWidth: 1, borderColor: '#E5EDE7' }, rowTitle: { fontSize: 14, lineHeight: 21, color: '#203C38', fontWeight: '600' }, body: { color: '#546B60', fontSize: 12, lineHeight: 19 }, icon: { height: 36, width: 36, borderRadius: 11, backgroundColor: '#EBF4EE', alignItems: 'center', justifyContent: 'center' }, dangerIcon: { backgroundColor: '#FFF1F3' }, privacy: { flexDirection: 'row', gap: 12, padding: 2 }, back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, link: { color: '#235B47', fontSize: 13, fontWeight: '600' }, faq: { borderTopWidth: 1, borderColor: '#D8E4DC', paddingTop: 3, gap: 5 }, question: { minHeight: 52, flexDirection: 'row', gap: 8, alignItems: 'center' }, answer: { color: '#546B60', fontSize: 14, lineHeight: 23, paddingBottom: 5 }, language: { flexDirection: 'row', alignItems: 'center', minHeight: 58, borderBottomWidth: 1, borderColor: '#D8E4DC', paddingHorizontal: 8 }
});
