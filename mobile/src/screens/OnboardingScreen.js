import React, { useEffect, useRef, useState } from 'react';
import { useAppearance, useThemeStyles } from '../ui/AppearanceContext';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import preferences from '../lib/preferences';

export const onboardingCopy = {
  en: {
    step: 'Question {current} of {total}', defaultOption: 'Default',
    back: 'Back', next: 'Continue', reviewNow: 'Review choices now', why: 'Why we ask', edit: 'Edit',
    reasons: [
      'Your answer helps tailor planning suggestions.',
      'We use this choice when you open your calendar.',
      'This keeps the layout consistent with how you plan your week.',
      'This brings the hours you use most into view first.',
      'This saves you a step when you add plans with similar reminders.',
    ],
    review: 'Review your calendar setup', reviewIntro: 'Tap a preference to change it. You can also change these later in Account & settings.',
    reviewAction: 'Review choices', editLabel: 'Edit {name}. Current choice is {answer}.', saveAnswer: 'Apply choice', cancel: 'Cancel',
    save: 'Save & continue', saveReturn: 'Save preferences', saving: 'Saving…',
    note: 'Next, create an account or sign in.', draftFailed: 'Your draft couldn’t be saved on this device. You can still review your choices and try saving again.', failed: 'Could not save your choices. Your answers are still here. Please try again.',
    labels: ['Planning for', 'Opening view', 'First day of the week', 'Timeline starts at', 'Reminder for new plans'],
    questions: [
      ['Who are you planning for?', 'This helps KidsSync choose clear defaults. You can add names later.', [['myself', 'Just me', 'My own plans and appointments.'], ['children', 'My children', 'School, activities and pickups.'], ['family', 'The whole family', 'Plans for kids and adults.']]],
      ['What do you want to see first?', 'Choose how Calendar opens. You can switch views anytime.', [['today', 'Agenda', 'A list of plans for one day.'], ['day', 'Day', 'One day on an hourly timeline.'], ['week', 'Week', 'See three days side by side and swipe through the week.'], ['month', 'Month', 'A grid for the whole month.']]],
      ['Which day starts your week?', 'This sets the first column in the Week and Month views.', [['monday', 'Monday', 'Put Saturday and Sunday at the end.'], ['sunday', 'Sunday', 'Put Sunday in the first column.']]],
      ['What time should the timeline open at?', 'Day and Week start at this hour. You can scroll to see earlier or later plans.', [['morning', '6 AM', 'Early mornings and school drop-offs.'], ['afternoon', 'Noon', 'Afternoon activities and pickups.'], ['evening', '6 PM', 'Dinner and evening plans.'], ['daytime', '8 AM', 'The start of a typical day.']]],
      ['When should new plans remind you?', 'This sets the timing for new plans. You can turn on phone alerts in Account & settings.', [['none', 'No default reminder', 'Choose a reminder for each plan if you need one.'], ['start', 'At the start', 'At the plan’s start time.'], ['10', '10 minutes before', 'A little time to get ready.'], ['30', '30 minutes before', 'Time to prepare and head out.']]]
    ]
  },
  zh: {
    step: '第 {current} 题，共 {total} 题', defaultOption: '默认',
    back: '返回', next: '继续', reviewNow: '现在核对选择', why: '为什么问这个？', edit: '编辑',
    reasons: [
      '你的答案会帮助我们提供更合适的日程建议。',
      '打开日历时会使用你选择的视图。',
      '这会让日历布局符合你安排一周的习惯。',
      '这样可以先看到你最常用的时间段。',
      '添加提醒时间相似的日程时，可以少操作一步。',
    ],
    review: '核对你的日历设置', reviewIntro: '点按任意一项即可修改。以后也可以在“账户与设置”中更改。',
    reviewAction: '核对选择', editLabel: '编辑{name}。当前选项是{answer}。', saveAnswer: '应用选择', cancel: '取消',
    save: '保存并继续', saveReturn: '保存偏好', saving: '正在保存…',
    note: '下一步，创建账户或登录。', draftFailed: '无法在此设备上保存草稿。你仍可核对选择并再次尝试保存。', failed: '无法保存选择。答案仍保留在此，请重试。',
    labels: ['计划对象', '默认视图', '每周第一天', '时间轴的起始时间', '新计划的提醒时间'],
    questions: [
      ['你想为谁安排日程？', '这会帮助 KidsSync 选择清晰的默认设置。你可以稍后添加姓名。', [['myself', '我自己', '自己的计划和预约。'], ['children', '我的孩子', '上学、活动和接送。'], ['family', '全家人', '孩子和大人的安排。']]],
      ['打开日历时想先看什么？', '选择日历的默认视图。之后可以随时切换。', [['today', '日程', '用列表查看一天的计划。'], ['day', '日视图', '按时间查看一天的计划。'], ['week', '周视图', '并排查看三天，左右滑动查看整周。'], ['month', '月视图', '查看整个月的日历。']]],
      ['你的一周从哪天开始？', '这决定周视图和月视图的第一列。', [['monday', '星期一', '把星期六和星期日放在最后。'], ['sunday', '星期日', '把星期日放在第一列。']]],
      ['时间轴打开时从几点显示？', '日视图和周视图从这个时间开始显示。可滚动查看更早或更晚的安排。', [['morning', '早上 6 点', '早间活动和送孩子上学。'], ['afternoon', '中午 12 点', '下午活动和接孩子。'], ['evening', '晚上 6 点', '晚餐和晚间安排。'], ['daytime', '早上 8 点', '从日常作息的开始时间看起。']]],
      ['新计划应在什么时候提醒？', '这会设置新计划的提醒时间。你可以在“账户与设置”中开启手机提醒。', [['none', '无默认提醒', '有需要时，可以为每个计划单独设置。'], ['start', '开始时', '在计划开始时提醒。'], ['10', '提前 10 分钟', '留一点准备时间。'], ['30', '提前 30 分钟', '留出准备和出发时间。']]]
    ]
  }
};
const keys = Object.keys(preferences.OPTIONS);
export default function OnboardingScreen({ language, initialDraft, onDraftChange, onBack, onComplete, returnToCalendar = false }) {
  const t = onboardingCopy[language] || onboardingCopy.en;
  const { colors } = useAppearance(), styles = useThemeStyles(createStyles);
  const [draft, setDraft] = useState(() => preferences.normalizeDraft(initialDraft));
  const { answers, step, review, editing } = draft;
  const key = keys[step];
  const choice = draft.choice ?? answers[key];
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [whyOpen, setWhyOpen] = useState(false);
  const saving = useRef(false), scroll = useRef(null);
  const [draftFailed, setDraftFailed] = useState(false);
  useEffect(() => {
    let active = true;
    onDraftChange(draft).then(() => {
      if (active) setDraftFailed(false);
    }).catch(() => { if (active) setDraftFailed(true); });
    return () => { active = false; };
  }, [draft, onDraftChange]);
  function navigate(next) {
    setDraft(next);
    setError('');
    setWhyOpen(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function openQuestion(index, nextAnswers = answers, edit = false) {
    navigate({ answers: nextAnswers, step: index, choice: null, review: false, editing: edit });
  }
  function showReview(nextAnswers = answers) {
    navigate({ answers: nextAnswers, step, choice: null, review: true, editing: false });
  }
  function back() {
    if (editing) showReview();
    else if (review && !returnToCalendar) openQuestion(step);
    else if (!review && step > 0) openQuestion(step - 1, { ...answers, [key]: choice });
    else onBack();
  }
  const lastQuestion = step === keys.length - 1;
  function advance(reviewNow = false) {
    const nextAnswers = { ...answers, [key]: choice };
    if (editing || lastQuestion || reviewNow) showReview(nextAnswers);
    else openQuestion(step + 1, nextAnswers);
  }
  async function save() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await onComplete(preferences.normalizePreferences(answers)); }
    catch { setError(t.failed); }
    finally { saving.current = false; setBusy(false); }
  }
  const current = t.questions[step];
  const progressLabel = t.step.replace('{current}', step + 1).replace('{total}', keys.length);
  const showProgress = !review && !editing;
  return <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
    <View style={styles.inner}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={editing ? t.cancel : t.back} disabled={busy} style={styles.back} onPress={back}>
          <ChevronLeft size={18} color={colors.primary} aria-hidden /><Text style={styles.link}>{editing ? t.cancel : t.back}</Text>
        </Pressable>
        {showProgress && <Text accessibilityLiveRegion="polite" style={styles.step}>{progressLabel}</Text>}
      </View>
      {showProgress && <View accessible={false} style={styles.progress}>
        {keys.map((item, index) => <View key={item} style={[styles.progressSegment, index <= step && styles.progressActive]} />)}
      </View>}
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.heading}>{review ? t.review : current[0]}</Text>
        <Text style={styles.description}>{review ? t.reviewIntro : current[1]}</Text>
        {!review && <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: whyOpen }} style={styles.why}
            onPress={() => setWhyOpen(value => !value)}><Text style={styles.whyText}>{t.why}</Text></Pressable>
          {whyOpen && <Text accessibilityLiveRegion="polite" style={styles.reason}>{t.reasons[step]}</Text>}
        </>}
        {review ? <View style={styles.review}>
          {keys.map((key, index) => {
            const title = t.labels[index], value = t.questions[index][2].find(option => option[0] === answers[key])?.[1];
            return <Pressable key={key} accessibilityRole="button" accessibilityLabel={t.editLabel.replace('{name}', title).replace('{answer}', value)} disabled={busy}
              onPress={() => openQuestion(index, answers, true)} style={({ pressed }) => [styles.reviewRow, index > 0 && styles.divider, pressed && styles.selected]}>
              <View style={styles.answer}><Text style={styles.answerLabel}>{title}</Text><Text style={styles.answerValue}>{value}</Text></View>
              <View style={styles.edit}><Text style={styles.whyText}>{t.edit}</Text><ChevronRight size={16} color={colors.primary} aria-hidden /></View>
            </Pressable>;
          })}
        </View> : <View style={styles.options}>
          {current[2].map(([value, label, description]) => {
            const selected = choice === value;
            const title = value === preferences.DEFAULTS[key] ? `${label} · ${t.defaultOption}` : label;
            return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={description}
              disabled={busy} accessibilityState={{ checked: selected, disabled: busy }}
              onPress={() => setDraft(previous => ({ ...previous, choice: value }))} style={[styles.option, selected && styles.selected]}>
              <View style={styles.answer}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionDescription}>{description}</Text></View>
              <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <Check size={14} color={colors.onPrimary} aria-hidden />}</View>
            </Pressable>;
          })}
        </View>}
      </View>
      <View style={styles.footer}>
        {draftFailed && <Text accessibilityRole="alert" style={styles.error}>{t.draftFailed}</Text>}
        {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy, busy }}
          onPress={review ? save : () => advance()} style={[styles.primary, busy && styles.disabled]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} accessibilityLabel={t.saving} /> : <><Text style={styles.primaryText}>{review ? (returnToCalendar ? t.saveReturn : t.save) : editing ? t.saveAnswer : lastQuestion ? t.reviewAction : t.next}</Text><ArrowRight size={18} color={colors.onPrimary} aria-hidden /></>}
        </Pressable>
        {review && !returnToCalendar && <Text style={styles.note}>{t.note}</Text>}
        {!review && !editing && !lastQuestion && <Pressable accessibilityRole="button" disabled={busy} style={styles.reviewShortcut}
          onPress={() => advance(true)}><Text style={styles.link}>{t.reviewNow}</Text></Pressable>}
      </View>
    </View>
  </ScrollView>;
}
function createStyles(colors) { return StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', backgroundColor: colors.page },
  inner: { width: '100%', maxWidth: 420, flexGrow: 1, paddingHorizontal: 22, paddingBottom: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingRight: 8 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600' }, step: { color: colors.muted, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  progress: { flexDirection: 'row', gap: 5, paddingTop: 4 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  progressActive: { backgroundColor: colors.primary },
  content: { paddingTop: 16, paddingBottom: 16 },
  heading: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: '700', marginBottom: 8 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  why: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  whyText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  reason: { color: colors.ink, backgroundColor: colors.primarySoft, padding: 10, borderRadius: 9, fontSize: 13, lineHeight: 19 },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  options: { gap: 8, marginTop: 18 }, option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12 },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary }, answer: { flex: 1, minWidth: 0 }, optionTitle: { color: colors.ink, fontSize: 16, fontWeight: '600' }, optionDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1, borderColor: colors.strongLine, alignItems: 'center', justifyContent: 'center' }, radioSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  review: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', marginTop: 16 }, reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64 }, divider: { borderTopWidth: 1, borderTopColor: colors.line },
  answerLabel: { color: colors.muted, fontSize: 13, marginBottom: 4 }, answerValue: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  footer: { marginTop: 'auto', paddingTop: 16 }, primary: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14, backgroundColor: colors.primary, borderRadius: 10 }, primaryText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  disabled: { opacity: 0.5 }, reviewShortcut: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingHorizontal: 8 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12 }, error: { color: colors.error, fontSize: 14, lineHeight: 21, marginBottom: 12 }
}); }
