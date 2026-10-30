import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Settings2 } from 'lucide-react-native';
import trial from '../lib/native-trial';

export const personalizeCopy = {
  en: {
    back: 'Back', title: 'Make your calendar yours', early: 'Your family. Your way.', complete: '10-minute preview complete',
    intro: 'Keep the plans you made. Add your name, name your calendar, and choose an icon.',
    plans: 'plans kept', onePlan: 'plan kept', people: 'people in your plans', onePerson: 'person in your plans', name: 'Your name', calendar: 'Calendar name',
    description: 'A little about you (optional)', icon: 'Choose a profile icon', iconNames: ['Person', 'Smile', 'Woman', 'Man', 'Teacher', 'Star'],
    create: 'Save & create account', signIn: 'I already have an account', saving: 'Saving…',
    saveAccount: 'Save preview to my account',
    privacy: 'Your preview stays on this device through sign-up or sign-in. Afterward, choose Save preview to my account. It creates a separate calendar without replacing existing plans.',
    nameRequired: 'Enter your name to create your profile.', calendarRequired: 'Give your calendar a name.',
    preferences: 'Calendar preferences', draft: 'An unfinished event draft is also kept on this device.',
    saveFailed: 'Could not save your profile on this device. Your plans are still here. Please retry.',
    loadFailed: 'Could not load your preview. Return and retry without clearing device data.', alreadyClaimed: 'Sign in to the account that saved this preview.',
    defaultCalendar: 'Family', signedInName: 'Already have an account? You can sign in without entering a new profile name.'
  },
  zh: {
    back: '返回', title: '让日历更适合你', early: '你的家庭，你的安排。', complete: '10 分钟体验已完成',
    intro: '保留你刚刚创建的计划。填写姓名、为日历命名，再选一个图标。',
    plans: '项计划已保留', onePlan: '项计划已保留', people: '位日程参与者', onePerson: '位日程参与者', name: '你的姓名', calendar: '日历名称',
    description: '简单介绍自己（选填）', icon: '选择个人图标', iconNames: ['个人', '笑脸', '女士', '男士', '老师', '星星'],
    create: '保存并创建账户', signIn: '我已有账户', saving: '正在保存…',
    saveAccount: '将体验日历保存到账户',
    privacy: '注册或登录期间，体验日程会保留在此设备上。之后点击“将体验日历保存到账户”，创建一个单独的日历，不会替换原有计划。',
    nameRequired: '请填写姓名以创建个人资料。', calendarRequired: '请为日历命名。',
    preferences: '日历偏好', draft: '未完成的日程草稿也保留在此设备上。',
    saveFailed: '无法将个人资料保存在此设备上。计划仍在，请重试。',
    loadFailed: '无法加载体验日程，请返回重试，不要清除设备数据。', alreadyClaimed: '请登录保存此体验日历的账户。',
    defaultCalendar: '家庭', signedInName: '已有账户？无需填写新的个人姓名即可登录。'
  }
};

export default function PersonalizeCalendarScreen({ language, data, error, signedIn, onContinue, onPreferences, onBack }) {
  const t = personalizeCopy[language] || personalizeCopy.en;
  const [values, setValues] = useState({ ...data.profile, calendarName: data.profile.calendarName || t.defaultCalendar });
  const [touched, setTouched] = useState(false), [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const errors = trial.profileErrors(values);
  const people = new Set(data.events.map(event => event.child.trim().toLocaleLowerCase()).filter(Boolean));
  async function submit(view) {
    if (submitting.current) return;
    setTouched(view === 'signup');
    if (Object.keys(trial.profileErrors(values, view === 'signup')).length) { setTouched(true); return; }
    submitting.current = true; setBusy(true);
    try { await onContinue(view, values); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function configure() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true);
    try { await onPreferences({ ...values, calendarName: values.calendarName || t.defaultCalendar }); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable accessibilityRole="button" disabled={busy} onPress={() => onBack(values)} style={styles.back}><ArrowLeft size={18} color="#235b47" /><Text style={styles.link}>{t.back}</Text></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>{data.elapsedMs >= trial.LIMIT_MS ? t.complete : t.early}</Text>
        <Text accessibilityRole="header" style={styles.heading}>{t.title}</Text>
        <Text style={styles.description}>{t.intro}</Text>
        <View style={styles.summary}><CalendarDays size={22} color="#35634e" /><View style={styles.flex}><Text style={styles.summaryTitle}>{data.events.length} {data.events.length === 1 ? t.onePlan : t.plans}</Text><Text style={styles.small}>{people.size} {people.size === 1 ? t.onePerson : t.people}</Text></View><Check size={19} color="#35634e" /></View>
        {!!data.draft && <Text style={styles.small}>{t.draft}</Text>}
      </View>
      <View style={styles.form}>
        {[['name', t.name, 50], ['calendarName', t.calendar, 60], ['description', t.description, 160]].map(([key, label, maxLength]) => <View key={key} style={styles.field}>
          <Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={values[key]} maxLength={maxLength} editable={!busy}
            autoComplete={key === 'name' ? 'name' : 'off'} autoCapitalize="sentences" multiline={key === 'description'}
            onChangeText={value => setValues(current => ({ ...current, [key]: value }))} style={[styles.input, touched && errors[key] && styles.invalid]} />
          {touched && errors[key] && <Text accessibilityRole="alert" style={styles.error}>{t[errors[key]]}</Text>}
        </View>)}
        <Text style={styles.label}>{t.icon}</Text>
        <View style={styles.icons}>{trial.ICONS.map((icon, index) => <Pressable key={icon} accessibilityRole="radio" accessibilityLabel={`${t.icon}: ${t.iconNames[index]}`}
          accessibilityState={{ checked: values.icon === icon }} disabled={busy} onPress={() => setValues(current => ({ ...current, icon }))}
          style={[styles.icon, values.icon === icon && styles.selectedIcon]}><Text style={styles.emoji}>{icon}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" disabled={busy} onPress={configure} style={styles.preferences}><Settings2 size={18} color="#235b47" /><Text style={styles.link}>{t.preferences}</Text><ArrowRight size={17} color="#235b47" /></Pressable>
        <Text style={styles.small}>{t.privacy}</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{t[error] || t.saveFailed}</Text>}
      </View>
    </ScrollView>
    <View style={styles.footer}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => submit(signedIn ? 'account' : 'signup')} style={styles.primary}>{busy ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>{signedIn ? t.saveAccount : t.create}</Text><ArrowRight size={18} color="#fff" /></>}</Pressable>
      {!signedIn && <Pressable accessibilityRole="button" accessibilityHint={t.signedInName} disabled={busy} onPress={() => submit('signin')} style={styles.signIn}><Text style={styles.link}>{t.signIn}</Text></Pressable>}
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' }, header: { paddingHorizontal: 16 }, back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingRight: 10 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 22 }, intro: { gap: 12, paddingTop: 8 }, eyebrow: { color: '#4d795f', fontSize: 11, lineHeight: 18, fontWeight: '700' },
  heading: { color: '#203c38', fontSize: 30, lineHeight: 37, fontWeight: '700', letterSpacing: -0.6 }, description: { color: '#5c7066', fontSize: 15, lineHeight: 23 },
  summary: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#d4e4d9', backgroundColor: '#f0f7f1', flexDirection: 'row', gap: 12, alignItems: 'center' }, flex: { flex: 1 }, summaryTitle: { color: '#31583f', fontSize: 14, lineHeight: 21, fontWeight: '600' },
  small: { color: '#62776b', fontSize: 11, lineHeight: 18 }, form: { gap: 17 }, field: { gap: 7 }, label: { color: '#3c5748', fontSize: 14, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#c9d8cf', borderRadius: 8, padding: 12, fontSize: 16, lineHeight: 23, color: '#203c38', backgroundColor: '#fff' }, invalid: { borderColor: '#a13640' },
  error: { color: '#a13640', fontSize: 12, lineHeight: 19 }, icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, icon: { minWidth: 44, minHeight: 44, padding: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d4e1d8', borderRadius: 10 },
  selectedIcon: { backgroundColor: '#e8f3e9', borderColor: '#3c805a', borderWidth: 2 }, emoji: { fontSize: 22 }, preferences: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9, padding: 10, borderRadius: 8, backgroundColor: '#f0f6f2' },
  link: { color: '#245b48', fontSize: 13, fontWeight: '600' }, footer: { flexShrink: 0, borderTopWidth: 1, borderColor: '#dce7e1', paddingHorizontal: 16, paddingVertical: 10, gap: 3 },
  primary: { minHeight: 50, backgroundColor: '#235b47', padding: 12, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' }, signIn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }
});
