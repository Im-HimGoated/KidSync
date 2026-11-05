import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Switch, Text, View
} from 'react-native';
import {
  Bell, CalendarDays, Flag, MapPin, NotebookPen, Package,
  Pencil, Repeat2, Trash2, UserRound, Users
} from 'lucide-react-native';
import calendar from '../lib/calendar';
import model from './model';
import { Button, Field } from './ui';
import { useAppearance } from '../ui/AppearanceContext';

function useEditorStyles() {
  const { colors } = useAppearance();
  const s = useMemo(() => createStyles(colors), [colors]);
  return { colors, s };
}

const COPY = {
  en: {
    title: 'Activity title', titleHint: 'For example, soccer practice', person: 'Who’s going?', family: 'Everyone',
    date: 'Start date', endDate: 'End date (optional)', dateHint: 'YYYY-MM-DD', allDay: 'All day', start: 'Starts', end: 'Ends',
    timeHint: 'Use 24-hour times, for example 15:30.', location: 'Location', placeHint: 'Address or place name',
    responsible: 'Pickup / responsible adult', adultHint: 'For example, Dad', items: 'What to bring', itemsHint: 'Water bottle, cleats, or anything else',
    notes: 'Notes', notesHint: 'Anything else to remember', importance: 'Importance', low: 'Low', normal: 'Normal', high: 'High',
    reminder: 'Reminder preference', noReminder: 'None', atStart: 'At the start', before10: '10 min before', before30: '30 min before',
    reminderHint: 'Reminder preferences are saved with this activity. Phone notifications depend on your settings and permission.',
    repeats: 'Repeats', none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
    every: 'Every', dayUnit: 'days', weekUnit: 'weeks', monthUnit: 'months', yearUnit: 'years', through: 'Through',
    interval: 'Repeat every', intervalHint: '1–12', weekdays: 'Days of the week', until: 'Repeat until (optional)',
    seriesHint: 'Changes apply to the whole repeating activity.', cancel: 'Cancel', save: 'Save activity', saving: 'Saving…',
    occurrenceHint: 'You’re editing one occurrence. Other dates in this repeating activity stay as planned.',
    overlapping: 'More than one occurrence covers this date. Choose the occurrence to change after tapping Edit or Delete.',
    edit: 'Edit activity', delete: 'Delete activity', deleting: 'Deleting…', deleteTitle: 'Delete this activity?',
    deleteBody: 'This removes the entire activity and its repeating dates. Other activities are kept.', keep: 'Keep activity',
    confirmDelete: 'Yes, delete activity', readOnly: 'This activity is managed by its source and can’t be edited here.',
    noTime: 'Time not set', noDate: 'Date not set', cancelled: 'Cancelled', when: 'When', seriesStart: 'Repeating series starts',
    where: 'Where', who: 'Who’s going', adult: 'Responsible adult', notAssigned: 'Not assigned', supplies: 'What to bring',
    validation: 'Please check the highlighted details.', failed: 'Could not save. Please try again.', deleteFailed: 'Could not delete. Please try again.',
    errors: {
      titleRequired: 'Enter an activity title.', dateRequired: 'Choose a start date.', dateInvalid: 'Use a valid date as YYYY-MM-DD.',
      endDateInvalid: 'Use a valid end date as YYYY-MM-DD.', endDateBeforeStart: 'End date must be on or after the start date.',
      endDateRequired: 'Choose an end date for this activity.', startTimeRequired: 'Enter a start time.', startTimeInvalid: 'Use a valid 24-hour time, such as 09:00.',
      endTimeRequired: 'Enter an end time.', endTimeInvalid: 'Use a valid 24-hour time, such as 10:00.', endAfterStart: 'End time must follow the start time.',
      childInvalid: 'Choose a family member.', recurrenceInvalid: 'Choose a repeat option.', repeatIntervalInvalid: 'Use a whole number from 1 to 12.',
      repeatUntilInvalid: 'Use a valid date as YYYY-MM-DD.', repeatUntilBeforeStart: 'Repeat-until date must be on or after the start date.',
      repeatDaysRequired: 'Choose at least one weekday.', eventReadOnly: 'This source activity can’t be edited here.',
      responsibleTooLong: 'Use 60 characters or fewer.', responsibleInvalid: 'Use 60 characters or fewer.',
      itemsTooLong: 'Use 160 characters or fewer.', itemsInvalid: 'Use 160 characters or fewer.',
      importanceInvalid: 'Choose low, normal, or high importance.', reminderInvalid: 'Choose a reminder option.'
    }
  },
  zh: {
    title: '活动标题', titleHint: '例如：足球练习', person: '参与家人', family: '所有人',
    date: '开始日期', endDate: '结束日期（可选）', dateHint: 'YYYY-MM-DD', allDay: '全天', start: '开始时间', end: '结束时间',
    timeHint: '请使用 24 小时制，例如 15:30。', location: '地点', placeHint: '地址或地点名称',
    responsible: '接送／负责人', adultHint: '例如：爸爸', items: '需要携带', itemsHint: '水壶、球鞋或其他物品',
    notes: '备注', notesHint: '补充活动详情', importance: '重要程度', low: '低', normal: '普通', high: '高',
    reminder: '提醒偏好', noReminder: '无', atStart: '开始时', before10: '提前 10 分钟', before30: '提前 30 分钟',
    reminderHint: '提醒偏好会随此活动保存。手机通知取决于你的设置与授权。',
    repeats: '重复', none: '不重复', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年',
    every: '每', dayUnit: '天', weekUnit: '周', monthUnit: '个月', yearUnit: '年', through: '截止',
    interval: '重复间隔', intervalHint: '1–12', weekdays: '每周日期', until: '重复截止日期（可选）',
    seriesHint: '修改将应用于整项重复活动。', cancel: '取消', save: '保存活动', saving: '保存中…',
    occurrenceHint: '你正在编辑单次活动，重复活动的其他日期保持原安排。',
    overlapping: '此日期有多次重叠的重复活动。点击编辑或删除后，请选择要修改的那一次。',
    edit: '编辑活动', delete: '删除活动', deleting: '删除中…', deleteTitle: '删除这项活动？',
    deleteBody: '将删除整项活动及其重复日期，保留其他活动。', keep: '保留活动',
    confirmDelete: '确认删除活动', readOnly: '这项活动由来源管理，无法在此编辑。',
    noTime: '时间待定', noDate: '日期待定', cancelled: '已取消', when: '时间', seriesStart: '重复活动开始日期',
    where: '地点', who: '参与家人', adult: '负责人', notAssigned: '尚未安排', supplies: '需要携带',
    validation: '请检查标出的活动详情。', failed: '保存失败，请重试。', deleteFailed: '删除失败，请重试。',
    errors: {
      titleRequired: '请填写活动标题。', dateRequired: '请选择开始日期。', dateInvalid: '请输入有效日期，格式为 YYYY-MM-DD。',
      endDateInvalid: '请输入有效的结束日期，格式为 YYYY-MM-DD。', endDateBeforeStart: '结束日期不能早于开始日期。',
      endDateRequired: '请填写这项活动的结束日期。', startTimeRequired: '请填写开始时间。', startTimeInvalid: '请输入有效的 24 小时时间，例如 09:00。',
      endTimeRequired: '请填写结束时间。', endTimeInvalid: '请输入有效的 24 小时时间，例如 10:00。', endAfterStart: '结束时间须晚于开始时间。',
      childInvalid: '请选择参与家人。', recurrenceInvalid: '请选择重复选项。', repeatIntervalInvalid: '请输入 1 至 12 的整数。',
      repeatUntilInvalid: '请输入有效日期，格式为 YYYY-MM-DD。', repeatUntilBeforeStart: '截止日期不能早于开始日期。',
      repeatDaysRequired: '请至少选择一天。', eventReadOnly: '无法在此编辑来自其他来源的活动。',
      responsibleTooLong: '请使用不超过 60 个字符。', responsibleInvalid: '请使用不超过 60 个字符。',
      itemsTooLong: '请使用不超过 160 个字符。', itemsInvalid: '请使用不超过 160 个字符。',
      importanceInvalid: '请选择低、普通或高重要程度。', reminderInvalid: '请选择提醒选项。'
    }
  }
};

const text = value => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const repeated = model.isRecurringActivity;
const readOnlyEvent = event => !!(event?.externalSource || event?.isBuiltInHoliday);
const reminderKey = value => value == null ? 'none' : String(value);
const reminderNumber = value => value === 'none' ? null : Number(value);

function FormChoices({ label, options, value, onChange, disabled, error, onLayout }) {
  const { colors, s } = useEditorStyles();
  return <View onLayout={onLayout} style={s.choiceGroup}>
    <Text style={s.label}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceList} keyboardShouldPersistTaps="handled">
      {options.map(option => <Pressable key={String(option.value)} accessibilityRole="button" accessibilityLabel={`${label}: ${option.label}`}
        accessibilityState={{ selected: value === option.value, disabled: !!disabled }} disabled={disabled} onPress={() => onChange(option.value)}
        style={({ pressed }) => [s.choice, value === option.value && s.choiceSelected, (pressed || disabled) && s.dim]}>
        <Text style={[s.choiceText, value === option.value && s.choiceSelectedText]}>{option.label}</Text>
      </Pressable>)}
    </ScrollView>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}

function dateText(value, language, fallback) {
  const date = value instanceof Date ? value : calendar.parseDateKey(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
  }) : fallback;
}

function dateIdentity(value) { return value instanceof Date ? calendar.dateKey(value) : text(value); }

export function ActivityEditor(props) {
  return <EditorBody key={`${props.event?.id ?? 'new'}:${dateIdentity(props.date)}`} {...props} />;
}

function EditorBody({ event = null, date, initialDraft, kids = [], preferences, language = 'en', busy, disabled = false, error, onSave, onCancel, onDirtyChange, scope }) {
  const { colors, s } = useEditorStyles();
  const t = COPY[language] || COPY.en;
  const [form, setForm] = useState(() => {
    const seed = !event && initialDraft && typeof initialDraft === 'object' && !Array.isArray(initialDraft) ? initialDraft : null;
    const seededDate = typeof seed?.startDate === 'string' && Number.isFinite(calendar.parseDateKey(seed.startDate).getTime()) ? seed.startDate : date;
    const initial = model.initialEventForm(event, seededDate, preferences);
    // A proposed window seeds a new form; it is never an existing activity or
    // a source of IDs, recurrence or other activity metadata.
    if (seed) for (const [source, target] of [['startDate', 'date'], ['endDate', 'endDate'], ['start', 'start'], ['end', 'end']]) {
      if (typeof seed[source] === 'string') initial[target] = seed[source];
    }
    return initial;
  });
  const initialForm = useRef(form);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const touched = useRef(new Set());
  const draftIdentity = useRef(null);
  const active = useRef(true), request = useRef(false), scroll = useRef(null);
  const inputs = useRef({}), positions = useRef({});
  const readOnly = readOnlyEvent(event), locked = !!busy || saving || readOnly || disabled;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { onDirtyChange?.(model.eventFormChanged(initialForm.current, form)); }, [form, onDirtyChange]);

  const profiles = (Array.isArray(kids) ? kids : []).filter(kid => kid && typeof kid.name === 'string' && kid.name.trim());
  const matched = profiles.find(kid => kid.name === form.child || String(kid.id) === String(form.child));
  const childValue = matched?.name || form.child || '__family__';
  const people = [{ value: '__family__', label: t.family }, ...profiles.map(kid => ({ value: kid.name, label: kid.name }))];
  if (!people.some(option => option.value === childValue)) people.push({ value: childValue, label: text(childValue) });
  const weekNames = language === 'zh' ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const importance = ['low', 'normal', 'high'].map(value => ({ value, label: t[value] }));
  if (form.importance && !importance.some(option => option.value === form.importance)) importance.push({ value: form.importance, label: text(form.importance) });
  const reminderOptions = [{ value: 'none', label: t.noReminder }, { value: '0', label: t.atStart }, { value: '10', label: t.before10 }, { value: '30', label: t.before30 }];
  const currentReminder = reminderKey(form.reminderMinutes);
  if (!reminderOptions.some(option => option.value === currentReminder)) reminderOptions.push({ value: currentReminder, label: language === 'zh' ? `提前 ${currentReminder} 分钟` : `${currentReminder} min before` });
  const fieldError = key => errors[key] ? t.errors[errors[key]] || t.validation : '';
  const position = key => layout => { positions.current[key] = layout.nativeEvent.layout.y; };
  const field = key => ({ inputRef: input => { inputs.current[key] = input; }, onLayout: position(key) });

  function revealError(nextErrors) {
    const first = ['title', 'child', 'date', 'endDate', 'start', 'end', 'location', 'responsible', 'items', 'notes',
      'importance', 'reminderMinutes', 'recurrence', 'repeatInterval', 'repeatDays', 'repeatUntil'].find(key => nextErrors[key]);
    const reveal = () => {
      if (!active.current) return;
      scroll.current?.scrollTo({ y: Math.max(0, (positions.current[first] || 0) - 12), animated: true });
      inputs.current[first]?.focus();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
    else reveal();
  }

  function change(key, value) {
    if (locked) return;
    touched.current.add(key);
    setForm(previous => ({ ...previous, [key]: value }));
    setErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
    setFailure('');
  }

  function changeRecurrence(value) {
    if (locked) return;
    const anchor = calendar.parseDateKey(form.date);
    change('recurrence', value);
    if (value === 'weekly' && !form.repeatDays?.length && Number.isFinite(anchor.getTime())) change('repeatDays', [anchor.getDay()]);
  }

  async function save() {
    if (locked || request.current || typeof onSave !== 'function') return;
    request.current = true;
    const submission = { ...form };
    if (!event && draftIdentity.current !== null) submission.id = draftIdentity.current;
    if (scope === 'occurrence') Object.assign(submission, { recurrence: 'none', repeatInterval: 1, repeatDays: [], repeatUntil: '' });
    // Preserve existing metadata, including legacy values the current choices do
    // not expose. The model receives only metadata the person actually changed.
    if (event) for (const key of ['responsible', 'items', 'importance', 'reminderMinutes']) {
      if (!touched.current.has(key) || form[key] === initialForm.current[key]) delete submission[key];
    }
    if (form.endDate && (!event?.eventType || event.eventType === 'activity')) submission.eventType = 'trip';
    else if (!form.endDate && event?.eventType === 'trip') submission.eventType = 'activity';
    let result;
    try { result = model.buildCalendarEvent(event, submission, kids, preferences); }
    catch { result = { event: null, errors: { event: 'eventReadOnly' } }; }
    setErrors(result.errors || {});
    if (!result.event) {
      request.current = false;
      revealError(result.errors || {});
      return;
    }
    if (!event && draftIdentity.current === null) draftIdentity.current = result.event.id;
    setSaving(true); setFailure('');
    try {
      const saved = await onSave(result.event, { original: event });
      if (active.current && saved === false) setFailure(t.failed);
    } catch { if (active.current) setFailure(t.failed); }
    finally { request.current = false; if (active.current) setSaving(false); }
  }

  const inputProps = { editable: !locked, autoCorrect: false };
  return <View style={s.panel}>
    <ScrollView ref={scroll} style={s.scroll} contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {(repeated(event) || scope === 'occurrence') && <View style={s.notice}><Repeat2 color={colors.primary} size={18} /><Text style={s.noticeText}>{scope === 'occurrence' ? t.occurrenceHint : t.seriesHint}</Text></View>}
      {readOnly && <Text accessibilityRole="alert" style={s.error}>{t.readOnly}</Text>}
      {!!(Object.keys(errors).length > 0 || error || failure) && <View style={s.errorBox}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error || failure || t.validation}</Text></View>}
      <Field label={t.title} value={text(form.title)} onChangeText={value => change('title', value)} error={fieldError('title')} placeholder={t.titleHint} autoCapitalize="sentences" {...field('title')} {...inputProps} />
      <FormChoices label={t.person} options={people} value={childValue} disabled={locked} error={fieldError('child')} onChange={value => change('child', value)} onLayout={position('child')} />
      <Field label={t.date} value={text(form.date)} onChangeText={value => change('date', value)} error={fieldError('date')} placeholder={t.dateHint} maxLength={10} autoCapitalize="none" {...field('date')} {...inputProps} />
      <Field label={t.endDate} value={text(form.endDate)} onChangeText={value => change('endDate', value)} error={fieldError('endDate')} placeholder={t.dateHint} maxLength={10} autoCapitalize="none" {...field('endDate')} {...inputProps} />
      <View style={s.toggleRow}><Text style={s.toggleLabel}>{t.allDay}</Text><Switch accessibilityLabel={t.allDay} value={!!form.allDay} disabled={locked} onValueChange={value => change('allDay', value)} trackColor={{ false: colors.line, true: colors.primary }} thumbColor={colors.onPrimary} /></View>
      {!form.allDay && <><View style={s.timeRow} onLayout={layout => { position('start')(layout); position('end')(layout); }}><View style={s.flex}><Field label={t.start} value={text(form.start)} onChangeText={value => change('start', value)} error={fieldError('start')} placeholder="09:00" maxLength={5} inputRef={input => { inputs.current.start = input; }} {...inputProps} /></View><View style={s.flex}><Field label={t.end} value={text(form.end)} onChangeText={value => change('end', value)} error={fieldError('end')} placeholder="10:00" maxLength={5} inputRef={input => { inputs.current.end = input; }} {...inputProps} /></View></View><Text style={s.hint}>{t.timeHint}</Text></>}
      <Field label={t.location} value={text(form.location)} onChangeText={value => change('location', value)} placeholder={t.placeHint} {...field('location')} {...inputProps} />
      <Field label={t.responsible} value={text(form.responsible)} onChangeText={value => change('responsible', value)} error={fieldError('responsible')} placeholder={t.adultHint} maxLength={60} {...field('responsible')} {...inputProps} />
      <Field label={t.items} value={text(form.items)} onChangeText={value => change('items', value)} error={fieldError('items')} placeholder={t.itemsHint} maxLength={160} {...field('items')} {...inputProps} />
      <Field label={t.notes} value={text(form.notes)} onChangeText={value => change('notes', value)} multiline placeholder={t.notesHint} {...field('notes')} {...inputProps} />
      <FormChoices label={t.importance} options={importance} value={form.importance || 'normal'} disabled={locked} error={fieldError('importance')} onChange={value => change('importance', value)} onLayout={position('importance')} />
      <FormChoices label={t.reminder} options={reminderOptions} value={currentReminder} disabled={locked} error={fieldError('reminderMinutes')} onChange={value => change('reminderMinutes', reminderNumber(value))} onLayout={position('reminderMinutes')} />
      <Text style={s.hint}>{t.reminderHint}</Text>
      {scope !== 'occurrence' && <FormChoices label={t.repeats} options={['none', 'daily', 'weekly', 'monthly', 'yearly'].map(value => ({ value, label: t[value] }))} value={form.recurrence || 'none'} disabled={locked} error={fieldError('recurrence')} onChange={changeRecurrence} onLayout={position('recurrence')} />}
      {scope !== 'occurrence' && form.recurrence && form.recurrence !== 'none' && <>
        <Field label={t.interval} value={text(form.repeatInterval)} onChangeText={value => change('repeatInterval', value)} error={fieldError('repeatInterval')} keyboardType="number-pad" maxLength={2} placeholder={t.intervalHint} {...field('repeatInterval')} {...inputProps} />
        {form.recurrence === 'weekly' && <View style={s.choiceGroup} onLayout={position('repeatDays')}><Text style={s.label}>{t.weekdays}</Text><View style={s.weekdays}>{[1, 2, 3, 4, 5, 6, 0].map(day => {
          const selected = Array.isArray(form.repeatDays) && form.repeatDays.includes(day);
          return <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={weekNames[day]} accessibilityState={{ checked: selected, disabled: locked }} disabled={locked}
            onPress={() => change('repeatDays', selected ? form.repeatDays.filter(value => value !== day) : [...(form.repeatDays || []), day])} style={[s.weekday, selected && s.choiceSelected]}>
            <Text style={[s.choiceText, selected && s.choiceSelectedText]}>{weekNames[day]}</Text>
          </Pressable>;
        })}</View>{!!errors.repeatDays && <Text accessibilityRole="alert" style={s.error}>{fieldError('repeatDays')}</Text>}</View>}
        <Field label={t.until} value={text(form.repeatUntil)} onChangeText={value => change('repeatUntil', value)} error={fieldError('repeatUntil')} placeholder={t.dateHint} maxLength={10} autoCapitalize="none" {...field('repeatUntil')} {...inputProps} />
      </>}
    </ScrollView>
    <View style={s.footer}><Button secondary disabled={!!busy || saving} onPress={onCancel} style={s.cancelButton}>{t.cancel}</Button><Button disabled={locked || typeof onSave !== 'function'} onPress={save} style={s.saveButton}>{saving || busy ? t.saving : t.save}</Button></View>
  </View>;
}

function DetailRow({ icon: Icon, label, children }) {
  const { colors, s } = useEditorStyles();
  return <View style={s.detailRow}><View style={s.detailIcon}><Icon size={20} color={colors.primary} /></View><View style={s.detailCopy}><Text style={s.detailLabel}>{label}</Text>{typeof children === 'string' ? <Text style={s.detailValue}>{children}</Text> : children}</View></View>;
}

export function ActivityDetails({ event, occurrenceDate, occurrenceStartDate, kids = [], language = 'en', canEdit, busy, onEdit, onDelete, onDeleteRequest }) {
  const { colors, s } = useEditorStyles();
  const t = COPY[language] || COPY.en;
  const activity = event || {}, editable = !!canEdit && !readOnlyEvent(activity);
  const [confirmDelete, setConfirmDelete] = useState(false), [deleting, setDeleting] = useState(false), [failure, setFailure] = useState('');
  const scroll = useRef(null), active = useRef(true), deletingRequest = useRef(false), identity = useRef(activity.id);
  identity.current = activity.id;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setConfirmDelete(false); setFailure(''); }, [activity.id]);
  const profiles = calendar.kidsForEvent(activity, kids);
  const family = !activity.child || activity.child === '__family__';
  const childLabel = family ? t.family : profiles.map(kid => text(kid.name)).filter(Boolean).join(' · ') || text(activity.child) || t.family;
  const time = activity.allDay ? t.allDay : calendar.formatTime(activity.start, language)
    ? `${calendar.formatTime(activity.start, language)}${calendar.formatTime(activity.end, language) ? ` – ${calendar.formatTime(activity.end, language)}` : ''}` : t.noTime;
  const chosenDate = occurrenceDate || activity.startDate;
  const occurrences = calendar.occurrencesForDate(activity, chosenDate).filter(item => !occurrenceStartDate || item.startDate === occurrenceStartDate);
  const occurrence = occurrences.length === 1 ? occurrences[0] : null;
  const reminder = text(activity.reminderMinutes);
  const reminderLabel = !reminder ? t.noReminder : Number(reminder) === 0 ? t.atStart
    : language === 'zh' ? `提前 ${reminder} 分钟` : `${reminder} min before`;
  const weekdayNames = language === 'zh' ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const repeatInterval = Number(activity.repeatInterval) || 1;
  const repeatUnit = ({ daily: t.dayUnit, weekly: t.weekUnit, monthly: t.monthUnit, yearly: t.yearUnit })[activity.recurrence];
  const recurrenceLabel = repeatInterval > 1 && repeatUnit
    ? `${t.every} ${repeatInterval} ${repeatUnit}` : ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(activity.recurrence)
      ? t[activity.recurrence] : text(activity.day) ? t.weekly : text(activity.recurrence);
  const repeatDays = Array.isArray(activity.repeatDays) ? [...new Set(activity.repeatDays.map(Number))]
    .filter(day => Number.isInteger(day) && day >= 0 && day < 7).map(day => weekdayNames[day]).join(' · ') : '';

  async function remove() {
    if (deletingRequest.current || busy || !editable || typeof onDelete !== 'function') return;
    deletingRequest.current = true; setDeleting(true); setFailure('');
    const id = activity.id;
    try { const result = await onDelete(activity); if (active.current && identity.current === id && result === false) setFailure(t.deleteFailed); }
    catch { if (active.current && identity.current === id) setFailure(t.deleteFailed); }
    finally { deletingRequest.current = false; if (active.current && identity.current === id) setDeleting(false); }
  }

  return <View style={s.panel}>
    <ScrollView ref={scroll} style={s.scroll} contentContainerStyle={s.detailContent}>
      <View style={s.detailHeading}><Text style={s.eventIcon} accessible={false}>{text(activity.icon) || '📅'}</Text><View style={s.flex}><Text style={s.detailPerson}>{childLabel}</Text><Text accessibilityRole="header" style={s.eventTitle}>{text(activity.title) || t.title}</Text></View></View>
      {activity.status === 'cancelled' && <View style={s.cancelled}><Text style={s.cancelledText}>{t.cancelled}</Text></View>}
      <DetailRow icon={CalendarDays} label={t.when}><Text style={s.detailValue}>{dateText(occurrence?.startDate || chosenDate, language, t.noDate)}</Text>{!!(occurrence?.endDate || (!repeated(activity) && activity.endDate)) && (occurrence?.endDate || activity.endDate) !== (occurrence?.startDate || activity.startDate) && <Text style={s.detailSecondary}>– {dateText(occurrence?.endDate || activity.endDate, language, t.noDate)}</Text>}<Text style={s.detailSecondary}>{time}</Text>{occurrences.length > 1 && <Text style={s.detailSecondary}>{t.overlapping}</Text>}</DetailRow>
      {repeated(activity) && !!activity.startDate && !!chosenDate && chosenDate !== activity.startDate && <Text style={s.seriesDate}>{t.seriesStart}: {dateText(activity.startDate, language, t.noDate)}</Text>}
      <DetailRow icon={Users} label={t.who}>{childLabel}</DetailRow>
      {!!text(activity.location) && <DetailRow icon={MapPin} label={t.where}>{text(activity.location)}</DetailRow>}
      <DetailRow icon={UserRound} label={t.adult}>{text(activity.responsible) || t.notAssigned}</DetailRow>
      {!!text(activity.items) && <DetailRow icon={Package} label={t.supplies}>{text(activity.items)}</DetailRow>}
      <DetailRow icon={Flag} label={t.importance}>{['low', 'normal', 'high'].includes(activity.importance) ? t[activity.importance] : text(activity.importance) || t.normal}</DetailRow>
      {repeated(activity) && <DetailRow icon={Repeat2} label={t.repeats}><Text style={s.detailValue}>{recurrenceLabel}</Text>
        {activity.recurrence === 'weekly' && !!repeatDays && <Text style={s.detailSecondary}>{repeatDays}</Text>}
        {!!activity.repeatUntil && <Text style={s.detailSecondary}>{t.through}: {dateText(activity.repeatUntil, language, t.noDate)}</Text>}
      </DetailRow>}
      {Object.prototype.hasOwnProperty.call(activity, 'reminderMinutes') && <DetailRow icon={Bell} label={t.reminder}><Text style={s.detailValue}>{reminderLabel}</Text><Text style={s.detailSecondary}>{t.reminderHint}</Text></DetailRow>}
      {!!text(activity.notes) && <DetailRow icon={NotebookPen} label={t.notes}>{text(activity.notes)}</DetailRow>}
      {readOnlyEvent(activity) && <Text style={s.detailSecondary}>{t.readOnly}</Text>}
      {!!failure && <Text accessibilityRole="alert" style={s.error}>{failure}</Text>}
      {editable && confirmDelete && <View style={s.deleteConfirm} onLayout={() => scroll.current?.scrollToEnd({ animated: true })}>
        <Text style={s.deleteTitle}>{t.deleteTitle}</Text><Text style={s.detailSecondary}>{t.deleteBody}</Text>
        <Button secondary disabled={!!busy || deleting} onPress={() => setConfirmDelete(false)}>{t.keep}</Button>
        <Button danger disabled={!!busy || deleting} onPress={remove}>{deleting || busy ? t.deleting : t.confirmDelete}</Button>
      </View>}
    </ScrollView>
    {editable && <View style={s.footer}><Button secondary icon={Pencil} disabled={!!busy || deleting || typeof onEdit !== 'function'} onPress={() => onEdit(activity)} style={s.saveButton}>{t.edit}</Button><Button danger icon={Trash2} disabled={!!busy || deleting || typeof onDelete !== 'function'} onPress={() => onDeleteRequest ? onDeleteRequest(activity) : setConfirmDelete(true)} style={s.saveButton}>{t.delete}</Button></View>}
  </View>;
}

const createStyles = colors => StyleSheet.create({
  panel: { flexShrink: 1 }, scroll: { flexShrink: 1 }, flex: { flex: 1, minWidth: 0 }, formContent: { paddingHorizontal: 20, paddingTop: 7, paddingBottom: 22 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' }, choiceGroup: { gap: 9, marginBottom: 19 }, choiceList: { flexDirection: 'row', gap: 8, paddingBottom: 3 },
  choice: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.input, justifyContent: 'center', alignItems: 'center' },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, choiceText: { color: colors.ink, fontSize: 13, fontWeight: '600' }, choiceSelectedText: { color: colors.onPrimary }, dim: { opacity: 0.5 },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.ink }, timeRow: { flexDirection: 'row', gap: 12 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: -7, marginBottom: 19 }, weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, weekday: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.input },
  footer: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, flexShrink: 0 }, cancelButton: { flex: 1 }, saveButton: { flex: 2 },
  notice: { flexDirection: 'row', gap: 9, borderRadius: 12, padding: 12, backgroundColor: colors.primarySoft, marginBottom: 16 }, noticeText: { flex: 1, color: colors.primary, fontSize: 13, lineHeight: 20 }, error: { color: colors.error, fontSize: 13, lineHeight: 20 }, errorBox: { padding: 12, backgroundColor: colors.errorSoft, borderRadius: 12, marginBottom: 17 },
  detailContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }, detailHeading: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 17, borderRadius: 17, backgroundColor: colors.primarySoft, marginBottom: 8 }, eventIcon: { fontSize: 31 }, detailPerson: { fontSize: 13, fontWeight: '600', color: colors.success, marginBottom: 5 }, eventTitle: { fontSize: 23, lineHeight: 30, fontWeight: '700', color: colors.ink },
  detailRow: { flexDirection: 'row', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line }, detailIcon: { width: 23, paddingTop: 2 }, detailCopy: { flex: 1, gap: 5 }, detailLabel: { color: colors.muted, fontSize: 13 }, detailValue: { color: colors.ink, fontSize: 15, lineHeight: 23 }, detailSecondary: { color: colors.muted, fontSize: 13, lineHeight: 21 }, seriesDate: { color: colors.primary, fontSize: 13, lineHeight: 20, paddingLeft: 35, marginTop: 8 },
  cancelled: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.errorSoft, marginTop: 9 }, cancelledText: { color: colors.error, fontSize: 13, fontWeight: '600' },
  deleteConfirm: { padding: 16, gap: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.errorSoft, marginTop: 20 }, deleteTitle: { fontSize: 17, fontWeight: '700', color: colors.error }
});
