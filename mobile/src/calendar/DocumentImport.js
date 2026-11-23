import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import documentParser from '../../../shared/document/parse-document';
import { Button, Field, Sheet, useCalendarUi } from './ui';
import { useThemeStyles } from '../ui/AppearanceContext';

export const documentCopy = {
  en: {
    title: 'Import document text', close: 'Close', source: 'Document text',
    hint: 'Paste text from a flyer, email, or document. For a photo, select and copy its text in Photos, then paste it here.',
    placeholder: 'Soccer practice\nDate: November 28, 2026\nTime: 4–5 PM\nResponsible adult: Coach Chen\nBring: Water and cleats',
    parse: 'Find event details', preview: 'Check extracted details', edit: 'Edit source text',
    review: 'Review in event editor', opening: 'Opening editor…',
    reviewHint: 'Review dates, people, and repeat settings in the event editor before saving. The source text is kept in Notes.',
    noDetails: 'No event details found. Add a title, date, or time to the text.',
    empty: 'Paste document text first.', tooLong: 'Use 20,000 characters or fewer.',
    failed: 'Could not read this text. Check it and try again.',
    openFailed: 'Could not open the editor. Your text is still here. Try again.',
    fields: { title: 'Activity', startDate: 'Date', endDate: 'End date', start: 'Starts', end: 'Ends', location: 'Location',
      responsible: 'Responsible adult', items: 'What to bring', child: 'Who’s going', eventType: 'Event type',
      recurrence: 'Repeats', repeatInterval: 'Repeat interval', repeatUntil: 'Repeat until', repeatDays: 'Weekdays',
      status: 'Status', importance: 'Importance', travelMinutes: 'Travel minutes' },
    allDay: 'All day', family: 'Everyone',
    values: { activity: 'Activity', holiday: 'Holiday', birthday: 'Birthday', deadline: 'Deadline', trip: 'Trip',
      none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
      tentative: 'Tentative', confirmed: 'Confirmed', cancelled: 'Cancelled', high: 'High', low: 'Low', normal: 'Normal' },
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    warnings: {
      multipleEvents: 'Several dates were found. This creates one activity. Review the source for additional events.',
      titleReview: 'Check the activity title.', dateReview: 'Choose the date in the editor.',
      timeReview: 'Check the start and end times in the editor.',
      dateInferred: 'The date was inferred from a weekday. Confirm it in the editor.',
      estimatedEnd: 'The end time was estimated. Confirm the duration.',
      numericDateReview: 'A numeric date was interpreted as month/day. Confirm the date.',
      timezoneReview: 'A time zone was mentioned. Times have not been converted. Confirm your local time.',
      overnight: 'The time range crosses midnight. Set the end date and times in the editor.',
      repeatReview: 'The repeat end date needs review.',
    },
  },
  zh: {
    title: '导入文档文字', close: '关闭', source: '文档文字',
    hint: '粘贴传单、邮件或文档中的文字。照片可在“照片”中选择并复制文字，再粘贴到这里。',
    placeholder: '足球训练\n日期：2026年11月28日\n时间：下午4点至5点\n负责人：陈教练\n携带物品：水壶和球鞋',
    parse: '提取活动详情', preview: '核对提取的详情', edit: '编辑原文',
    review: '在活动编辑器中核对', opening: '正在打开编辑器…',
    reviewHint: '保存前请在活动编辑器中核对日期、参与者与重复设置。原文会保留在备注中。',
    noDetails: '未找到活动详情。请在文字中添加标题、日期或时间。',
    empty: '请先粘贴文档文字。', tooLong: '请使用不超过 20,000 个字符。',
    failed: '无法识别这些文字，请检查后重试。', openFailed: '无法打开编辑器，原文已保留，请重试。',
    fields: { title: '活动', startDate: '日期', endDate: '结束日期', start: '开始', end: '结束', location: '地点',
      responsible: '负责人', items: '携带物品', child: '参与家人', eventType: '活动类型',
      recurrence: '重复', repeatInterval: '重复间隔', repeatUntil: '重复截止日期', repeatDays: '每周日期',
      status: '状态', importance: '重要程度', travelMinutes: '交通时间（分钟）' },
    allDay: '全天', family: '所有人',
    values: { activity: '活动', holiday: '节假日', birthday: '生日', deadline: '截止日期', trip: '旅行',
      none: '不重复', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年',
      tentative: '暂定', confirmed: '已确认', cancelled: '已取消', high: '高', low: '低', normal: '普通' },
    days: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    warnings: {
      multipleEvents: '找到多个日期。本次创建一项活动，请核对原文中的其他日程。',
      titleReview: '请核对活动标题。', dateReview: '请在编辑器中选择日期。', timeReview: '请在编辑器中核对开始和结束时间。',
      dateInferred: '日期由星期推算，请在编辑器中确认。', estimatedEnd: '结束时间为估算值，请确认时长。',
      numericDateReview: '数字日期按月／日识别，请确认日期。', timezoneReview: '原文提到时区，时间尚未换算，请确认本地时间。',
      overnight: '活动跨越午夜，请在编辑器中设置结束日期与时间。', repeatReview: '请核对重复截止日期。',
    },
  },
};

export default function DocumentImport({ language = 'en', kids = [], defaultDuration = 30,
  onReview, onClose, embedded = false, onDirtyChange }) {
  const t = documentCopy[String(language).startsWith('zh') ? 'zh' : 'en'];
  const { colors, u } = useCalendarUi(), s = useThemeStyles(createStyles);
  const [source, setSource] = useState(''), [result, setResult] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const opening = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { onDirtyChange?.(!!source.trim()); }, [source, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function parse() {
    setError('');
    try {
      const parsed = documentParser.parseDocumentText(source, { kids, defaultDuration });
      if (!parsed.draft.title && !parsed.draft.startDate && !parsed.draft.start && !parsed.draft.allDay) {
        setError(t.noDetails);
        return;
      }
      setResult(parsed);
    } catch (failure) {
      setError(failure.message === 'DOCUMENT_EMPTY' ? t.empty : failure.message === 'DOCUMENT_TOO_LONG' ? t.tooLong : t.failed);
    }
  }

  async function review() {
    if (!result || !onReview || opening.current) return;
    opening.current = true;
    setBusy(true); setError('');
    try {
      if (await onReview(result.draft) === false && alive.current) setError(t.openFailed);
    } catch {
      if (alive.current) setError(t.openFailed);
    } finally {
      opening.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function display(field, value) {
    if (field === 'child') return value === '__family__' ? t.family
      : kids.find(kid => String(kid.id ?? kid.name) === value)?.name || value;
    if (field === 'repeatDays') return value.map(day => t.days[day]).join(', ');
    if (['eventType', 'recurrence', 'status', 'importance'].includes(field)
      && Object.prototype.hasOwnProperty.call(t.values, value)) return t.values[value];
    return String(value);
  }

  const content = <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {!result ? <>
      <View style={s.hint}><FileText size={21} color={colors.primary} /><Text style={[u.body, s.flex]}>{t.hint}</Text></View>
      <Field label={t.source} value={source} onChangeText={value => { setSource(value); setError(''); }}
        placeholder={t.placeholder} multiline autoCapitalize="sentences" editable={!busy} />
      <Button disabled={busy || !source.trim()} onPress={parse}>{t.parse}</Button>
    </> : <>
      <Text accessibilityRole="header" style={u.heading}>{t.preview}</Text>
      <View style={s.details}>{Object.entries(t.fields).map(([field, label]) => {
        const value = result.draft[field];
        if (value == null || value === '' || Array.isArray(value) && !value.length) return null;
        return <View key={field} style={s.row}><Text style={u.label}>{label}</Text><Text selectable style={u.body}>{display(field, value)}</Text></View>;
      })}{result.draft.allDay && <Text style={u.label}>{t.allDay}</Text>}</View>
      {result.warnings.map(warning => <Text key={warning} style={s.warning}>{t.warnings[warning] || t.failed}</Text>)}
      <Text style={u.body}>{t.reviewHint}</Text>
      <Button disabled={busy || typeof onReview !== 'function'} onPress={review}>{busy ? t.opening : t.review}</Button>
      <Button secondary disabled={busy} onPress={() => { setResult(null); setError(''); }}>{t.edit}</Button>
    </>}
    {!!error && <Text accessibilityRole="alert" style={u.error}>{error}</Text>}
  </ScrollView>;
  return embedded ? content : <Sheet title={t.title} closeLabel={t.close} onClose={onClose} busy={busy}>{content}</Sheet>;
}

function createStyles(colors) {
  return StyleSheet.create({
    scroll: { minHeight: 0, flexShrink: 1 },
    content: { padding: 18, paddingBottom: 28, gap: 14 },
    hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    flex: { flex: 1 },
    details: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, gap: 12 },
    row: { gap: 3 },
    warning: { color: colors.warning, backgroundColor: colors.warningSoft, padding: 12, borderRadius: 10, fontSize: 14, lineHeight: 21 },
  });
}
