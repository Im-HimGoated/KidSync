import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check, ChevronLeft, CircleHelp } from 'lucide-react-native';
import preferences from '../lib/preferences';

export const onboardingCopy = {
  en: {
    eyebrow: 'MAKE IT YOURS', step: 'of 5', back: 'Back', next: 'Continue', skip: 'Skip this question', why: 'Why these questions?',
    explanation: 'These optional answers save how you prefer to plan. You can review and edit each answer before saving. Calendar views and notifications are being added separately.',
    review: 'Review your preferences', reviewIntro: 'A quick check before you continue.', reviewAction: 'Review my choices', edit: 'Edit', editLabel: 'Edit {name}', saveAnswer: 'Save answer', cancel: 'Cancel',
    save: 'Save & continue', saving: 'Saving…', note: 'Next: create your account, or sign in. Your answers stay saved on this device.', draftFailed: 'Draft could not be saved on this device. Keep this screen open and try Save & continue when finished.', failed: 'Could not save your choices. Your answers are still here. Please try again.',
    labels: ['Planning for', 'Opening view', 'Week starts on', 'Hours shown first', 'Default reminder'],
    questions: [
      ['Who are you planning for?', 'You can add family names later.', [['myself', 'Just me', 'A little more room for my plans.'], ['children', 'My children', 'School, activities and the in-between.'], ['family', 'The whole family', 'One place for everyone’s week.']]],
      ['How do you like to see your plans?', 'Save your preferred calendar view.', [['today', 'Today', 'One day at a time · recommended for phones'], ['week', 'This week', 'See how the whole week fits together.'], ['month', 'This month', 'Keep the bigger picture in view.']]],
      ['When does your week begin?', 'Choose the order you prefer for the calendar.', [['monday', 'Monday', 'Start with the school and work week.'], ['sunday', 'Sunday', 'Start with the weekend.']]],
      ['Which hours should we show first?', 'Save the hours you’d like to see first.', [['morning', 'Morning', '6 AM–12 PM'], ['afternoon', 'Afternoon', '12–6 PM'], ['evening', 'Evening', '6–10 PM'], ['daytime', 'The whole day', 'Start around 8 AM']]],
      ['Want a heads-up before plans?', 'Save a default for future event reminders. Notification permission is not requested during setup.', [['none', 'No reminders yet', 'I’ll choose them later.'], ['start', 'At the start', 'When it’s time.'], ['10', '10 minutes before', 'A little time to get ready.'], ['30', '30 minutes before', 'Time to prepare and head out.']]]
    ]
  },
  zh: {
    eyebrow: '个性化设置', step: '/ 5', back: '返回', next: '继续', skip: '跳过此问题', why: '为什么需要这些问题？',
    explanation: '这些可选答案记录你的日程偏好。保存前，你可以核对和编辑每个答案。日历视图和通知功能将另外添加。',
    review: '核对你的偏好', reviewIntro: '继续之前，快速核对一下。', reviewAction: '核对我的选择', edit: '编辑', editLabel: '编辑{name}', saveAnswer: '保存答案', cancel: '取消',
    save: '保存并继续', saving: '正在保存…', note: '下一步：创建账户或登录。答案会保留在此设备上。', draftFailed: '无法在此设备上保存草稿。请保持页面打开，完成后尝试保存并继续。', failed: '无法保存选择。答案仍保留在此，请重试。',
    labels: ['为谁安排', '默认视图', '每周开始于', '优先显示时段', '默认提醒'],
    questions: [
      ['你想为谁安排日程？', '以后可以添加家人的姓名。', [['myself', '我自己', '给自己的计划留些空间。'], ['children', '我的孩子', '学校、活动及日常安排。'], ['family', '全家人', '一起安排每个人的一周。']]],
      ['你喜欢如何查看计划？', '保存你偏好的日历视图。', [['today', '今天', '专注每一天 · 推荐手机使用'], ['week', '本周', '一起查看一整周的安排。'], ['month', '本月', '了解更长远的计划。']]],
      ['你的一周从哪天开始？', '选择你习惯的日历顺序。', [['monday', '星期一', '从上学和工作的一周开始。'], ['sunday', '星期日', '从周末开始。']]],
      ['你想优先查看哪个时段？', '保存你想优先查看的时段。', [['morning', '上午', '6:00–12:00'], ['afternoon', '下午', '12:00–18:00'], ['evening', '晚上', '18:00–22:00'], ['daytime', '全天', '从早上 8 点左右开始']]],
      ['你想提前收到提醒吗？', '为未来日程保存默认提醒。设置期间不会请求通知权限。', [['none', '暂不提醒', '以后再选择。'], ['start', '开始时', '到时间时提醒。'], ['10', '提前 10 分钟', '留一点准备时间。'], ['30', '提前 30 分钟', '留出准备和出发时间。']]]
    ]
  }
};
const keys = ['people', 'view', 'week', 'hours', 'reminders'];
export default function OnboardingScreen({ language, initialDraft, onDraftChange, onBack, onComplete }) {
  const t = onboardingCopy[language] || onboardingCopy.en;
  const [answers, setAnswers] = useState(() => preferences.normalizePreferences(initialDraft?.answers));
  const [step, setStep] = useState(initialDraft?.step || 0), [review, setReview] = useState(initialDraft?.review || false), [editing, setEditing] = useState(initialDraft?.editing || false);
  const [choice, setChoice] = useState(initialDraft?.choice || null);
  const [whyOpen, setWhyOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false), scroll = useRef(null);
  const [draftFailed, setDraftFailed] = useState(false);
  useEffect(() => {
    let active = true;
    onDraftChange({ answers, step, review, editing, choice }).then(() => {
      if (active) setDraftFailed(false);
    }).catch(() => { if (active) setDraftFailed(true); });
    return () => { active = false; };
  }, [answers, step, review, editing, choice, onDraftChange]);
  function move(index, edit = false) {
    setStep(index); setChoice(answers[keys[index]]); setEditing(edit); setReview(false); setWhyOpen(false); setError(''); scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function advance(skip = false) {
    const value = skip ? preferences.DEFAULTS[keys[step]] : choice;
    if (!value || busy) return;
    const next = { ...answers, [keys[step]]: value }; setAnswers(next); setError(''); setWhyOpen(false);
    if (editing || step === 4) { setReview(true); setEditing(false); }
    else { setStep(step + 1); setChoice(next[keys[step + 1]]); }
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  async function save() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await onComplete(preferences.normalizePreferences(answers)); }
    catch { setError(t.failed); }
    finally { saving.current = false; setBusy(false); }
  }
  const current = t.questions[step];
  return <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
    <View style={styles.inner}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={editing ? t.cancel : t.back} disabled={busy} style={styles.back}
          onPress={() => { if (editing) { setReview(true); setEditing(false); } else if (review) move(4); else if (step) move(step - 1); else onBack(); }}>
          <ChevronLeft size={18} color="#17649b" /><Text style={styles.link}>{editing ? t.cancel : t.back}</Text>
        </Pressable>
        {!review && <Text style={styles.muted}>{step + 1} {t.step}</Text>}
      </View>
      {!review && <View accessible accessibilityRole="progressbar" accessibilityLabel={`${step + 1} ${t.step}`}
        accessibilityValue={{ min: 0, max: 5, now: step + 1 }} style={styles.progress}>
        {keys.map((key, index) => <View key={key} style={[styles.segment, index <= step && styles.segmentActive]} />)}
      </View>}
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{t.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.heading}>{review ? t.review : current[0]}</Text>
        <Text style={styles.description}>{review ? t.reviewIntro : current[1]}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: whyOpen }} onPress={() => setWhyOpen(value => !value)} style={styles.why}>
          <CircleHelp size={15} color="#17649b" /><Text style={styles.whyText}>{t.why}</Text>
        </Pressable>
        {whyOpen && <Text style={styles.explanation}>{t.explanation}</Text>}
        {review ? <View style={styles.review}>
          {keys.map((key, index) => <View key={key} style={[styles.reviewRow, index > 0 && styles.divider]}>
            <View style={styles.answer}><Text style={styles.answerLabel}>{t.labels[index]}</Text>
              <Text style={styles.answerValue}>{t.questions[index][2].find(option => option[0] === answers[key])?.[1]}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={t.editLabel.replace('{name}', t.labels[index])} disabled={busy}
              onPress={() => move(index, true)} style={styles.edit}><Text style={styles.link}>{t.edit}</Text></Pressable>
          </View>)}
        </View> : <View style={styles.options}>
          {current[2].map(option => <Pressable key={option[0]} accessibilityRole="radio" accessibilityState={{ checked: choice === option[0] }}
            onPress={() => setChoice(option[0])} style={[styles.option, choice === option[0] && styles.selected]}>
            <View style={styles.answer}><Text style={styles.optionTitle}>{option[1]}</Text><Text style={styles.optionDescription}>{option[2]}</Text></View>
            <View style={[styles.radio, choice === option[0] && styles.radioSelected]}>{choice === option[0] && <Check size={14} color="#ffffff" />}</View>
          </Pressable>)}
        </View>}
      </View>
      <View style={styles.footer}>
        {draftFailed && <Text accessibilityRole="alert" style={styles.error}>{t.draftFailed}</Text>}
        {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy || (!review && !choice)} accessibilityState={{ disabled: busy || (!review && !choice), busy }}
          onPress={review ? save : () => advance()} style={[styles.primary, (busy || (!review && !choice)) && styles.disabled]}>
          {busy ? <ActivityIndicator color="#ffffff" accessibilityLabel={t.saving} /> : <><Text style={styles.primaryText}>{review ? t.save : editing ? t.saveAnswer : step === 4 ? t.reviewAction : t.next}</Text><ArrowRight size={18} color="#ffffff" /></>}
        </Pressable>
        {review ? <Text style={styles.note}>{t.note}</Text> : <Pressable accessibilityRole="button" style={styles.skip}
          onPress={() => { if (editing) { setReview(true); setEditing(false); } else advance(true); }}><Text style={styles.muted}>{editing ? t.cancel : t.skip}</Text></Pressable>}
      </View>
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', backgroundColor: '#f5f8fb' },
  inner: { width: '100%', maxWidth: 420, flexGrow: 1, paddingHorizontal: 22, paddingBottom: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  link: { color: '#17649b', fontSize: 14, fontWeight: '500' }, muted: { color: '#526a7a', fontSize: 13 },
  progress: { flexDirection: 'row', gap: 5, marginVertical: 10 }, segment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: '#dce5eb' }, segmentActive: { backgroundColor: '#17649b' },
  content: { paddingTop: 22, paddingBottom: 20 }, eyebrow: { color: '#17649b', fontSize: 12, letterSpacing: 1, fontWeight: '600', marginBottom: 12 },
  heading: { color: '#203e52', fontSize: 27, lineHeight: 33, fontWeight: '600', marginBottom: 12 },
  description: { color: '#526a7a', fontSize: 14, lineHeight: 22 },
  why: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginVertical: 6 }, whyText: { color: '#17649b', fontSize: 13 },
  explanation: { padding: 12, backgroundColor: '#e9f3fb', color: '#203e52', fontSize: 13, lineHeight: 20, borderRadius: 10, marginBottom: 14 },
  options: { gap: 10 }, option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, padding: 14, borderWidth: 1, borderColor: '#d0dde5', backgroundColor: '#ffffff', borderRadius: 12 },
  selected: { backgroundColor: '#e9f3fb', borderColor: '#17649b' }, answer: { flex: 1, minWidth: 0 }, optionTitle: { color: '#203e52', fontSize: 16, fontWeight: '600' }, optionDescription: { color: '#526a7a', fontSize: 12, lineHeight: 19, marginTop: 4 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1, borderColor: '#adc2d0', alignItems: 'center', justifyContent: 'center' }, radioSelected: { backgroundColor: '#17649b', borderColor: '#17649b' },
  review: { borderWidth: 1, borderColor: '#d0dde5', backgroundColor: '#ffffff', borderRadius: 14, overflow: 'hidden' }, reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }, divider: { borderTopWidth: 1, borderTopColor: '#dce5eb' },
  answerLabel: { color: '#526a7a', fontSize: 12, marginBottom: 4 }, answerValue: { color: '#203e52', fontSize: 16, fontWeight: '600' }, edit: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  footer: { marginTop: 'auto', paddingTop: 16 }, primary: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14, backgroundColor: '#17649b', borderRadius: 10 }, primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '600', flexShrink: 1 },
  disabled: { opacity: 0.5 }, skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 7 }, note: { color: '#526a7a', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 12 }, error: { color: '#a12632', fontSize: 14, lineHeight: 21, marginBottom: 12 }
});
