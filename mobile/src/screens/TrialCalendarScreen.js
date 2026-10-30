import React, { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import trial from '../lib/native-trial';
import trialEditor from '../lib/trial-editor';
import { Button } from '../calendar/ui';

export const trialCopy = {
  en: {
    title: 'Your calendar', preview: 'Device-only preview', left: 'left', back: 'Back to welcome', today: 'Today',
    previous: 'Previous day', next: 'Next day', add: 'Add event', edit: 'Edit event', empty: 'A little room for your first plan.',
    emptyBody: 'Add an activity, pickup, or early flight. This calendar starts blank—no example plans to delete.',
    personalize: 'Make your calendar yours', local: 'Saved on this device · Not shared or synced yet',
    titleLabel: 'Event name', date: 'Date (YYYY-MM-DD)', start: 'Start time (HH:MM)', end: 'End time (HH:MM)',
    allDay: 'All day', person: 'For (optional)', family: 'Whole family', location: 'Location (optional)', pickup: 'Pickup adult (optional)', pickupDetail: 'Pickup', bringDetail: 'Bring',
    bring: 'What to bring (optional)', save: 'Save event', saving: 'Saving…', cancel: 'Close event editor', remove: 'Delete event',
    confirmDelete: 'Delete this event?', keep: 'Keep event', deleteYes: 'Yes, delete', resume: 'Resume unfinished event',
    titleRequired: 'Give this event a name.', dateInvalid: 'Enter a real date, such as 2026-10-23.',
    timeInvalid: 'Use 24-hour time, such as 01:30 or 15:00.', endInvalid: 'End time must be after start time. For an overnight plan, add a separate event for the next day.',
    saveFailed: 'Could not save on this device. Your draft is still here; please retry.', loadFailed: 'Could not load your saved preview. Retry without clearing your device data.',
    eventLimit: 'This preview supports up to 100 events.', eventMissing: 'This event is no longer available. Close the editor and try again.',
    expired: 'Your preview is complete. Make this calendar yours to keep your plans.', alreadyClaimed: 'Sign in to the account that saved this preview.',
    clockFailed: 'Could not save the timer. Your plans are safe; continue with personalization.', retry: 'Retry', draftNote: 'Edits are kept as a draft when you close this form.', dateHint: 'All 24 hours are available, including early-morning plans.',
    unfinished: 'Keep your unfinished event?', unfinishedBody: 'You have an event draft. Resume it, or replace it to start the event you selected.',
    replaceDraft: 'Replace draft', keepDraft: 'Keep draft and go back', validation: 'Check the highlighted event details.', opening: 'Opening event…'
  },
  zh: {
    title: '你的日历', preview: '仅此设备上的体验', left: '剩余', back: '返回欢迎页', today: '今天',
    previous: '前一天', next: '后一天', add: '添加日程', edit: '编辑日程', empty: '给第一个计划留点空间。',
    emptyBody: '添加活动、接送或清晨航班。日历从空白开始，无需删除示例。',
    personalize: '让日历更适合你', local: '已保存在此设备 · 尚未共享或同步',
    titleLabel: '日程名称', date: '日期（YYYY-MM-DD）', start: '开始时间（HH:MM）', end: '结束时间（HH:MM）',
    allDay: '全天', person: '参与者（选填）', family: '全家人', location: '地点（选填）', pickup: '接送成人（选填）', pickupDetail: '接送', bringDetail: '携带',
    bring: '携带物品（选填）', save: '保存日程', saving: '正在保存…', cancel: '关闭日程编辑', remove: '删除日程',
    confirmDelete: '删除此日程？', keep: '保留日程', deleteYes: '确认删除', resume: '继续未完成的日程',
    titleRequired: '请填写日程名称。', dateInvalid: '请输入真实日期，例如 2026-10-23。',
    timeInvalid: '请使用 24 小时格式，例如 01:30 或 15:00。', endInvalid: '结束时间应晚于开始时间。跨夜计划请为第二天另加一项日程。',
    saveFailed: '无法保存在此设备上，草稿仍保留，请重试。', loadFailed: '无法加载已保存的体验日程，请重试，不要清除此设备的数据。',
    eventLimit: '体验最多支持 100 项日程。', eventMissing: '此日程已不可用，请关闭编辑后重试。',
    expired: '体验已完成。让这个日历属于你，保留你的计划。', alreadyClaimed: '请登录保存此体验日历的账户。',
    clockFailed: '无法保存计时。计划仍在，请继续个性化设置。', retry: '重试', draftNote: '关闭表单时，修改会作为草稿保留。', dateHint: '支持全天 24 小时，包括清晨的计划。',
    unfinished: '保留未完成的日程？', unfinishedBody: '你有一份日程草稿。可以继续编辑，或用刚才选择的日程替换它。',
    replaceDraft: '替换草稿', keepDraft: '保留草稿并返回', validation: '请检查标出的日程详情。', opening: '正在打开日程…'
  }
};

function moveDay(key, amount) {
  const [year, month, day] = key.split('-').map(Number);
  return trial.dateKey(new Date(year, month - 1, day + amount));
}
function displayDate(key, language) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', weekday: 'short' });
}

export default function TrialCalendarScreen({ language, data, preferences, error, onSave, onDraft, onDelete, onRetry, onPersonalize, onBack }) {
  const t = trialCopy[language] || trialCopy.en;
  const [date, setDate] = useState(trial.dateKey());
  const [editor, setEditor] = useState(null), [saving, setSaving] = useState(false), [deleting, setDeleting] = useState(null);
  const [pendingEditor, setPendingEditor] = useState(null), [opening, setOpening] = useState(false), [localError, setLocalError] = useState(false);
  const savingRef = useRef(false), openingRef = useRef(false);
  const events = data.events.filter(event => event.startDate === date).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  const expired = data.elapsedMs >= trial.LIMIT_MS;
  const locked = saving || opening || expired;
  async function persistEditor(values) {
    if (savingRef.current || openingRef.current || expired) return;
    openingRef.current = true; setOpening(true); setLocalError(false);
    try { if (await onDraft(values)) { setEditor(values); setPendingEditor(null); } }
    catch { setLocalError(true); }
    finally { openingRef.current = false; setOpening(false); }
  }
  async function openEditor(event = null) {
    if (savingRef.current || openingRef.current || expired) return;
    const request = trialEditor.editorRequest(data.draft, event, date, preferences);
    if (request.mode === 'resume') { setEditor(request.values); return; }
    if (request.mode === 'confirm') { setPendingEditor(request.values); return; }
    await persistEditor(request.values);
  }
  async function save(values) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setLocalError(false);
    try { if (await onSave(values, values.id || undefined)) { setDate(values.startDate); setEditor(null); } }
    catch { setLocalError(true); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function remove(id) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setLocalError(false);
    try { if (await onDelete(id)) setDeleting(null); }
    catch { setLocalError(true); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <View style={styles.screen}>
    <View style={styles.top}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.back} disabled={saving || opening} onPress={onBack} style={styles.iconButton}><ArrowLeft size={20} color="#235b47" /></Pressable>
      <View style={styles.flex}><Text accessibilityRole="header" style={styles.heading}>{data.profile.calendarName ? `${data.profile.icon} ${data.profile.calendarName}` : t.title}</Text><Text style={styles.caption}>{t.preview}</Text></View>
      <Text style={styles.clock}>{trial.remainingLabel(data.elapsedMs)} {t.left}</Text>
    </View>
    <View style={styles.dateNav}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.previous} onPress={() => setDate(moveDay(date, -1))} style={styles.iconButton}><ChevronLeft size={20} color="#235b47" /></Pressable>
      <View style={styles.flex}><Text style={styles.date}>{displayDate(date, language)}</Text></View>
      <Pressable accessibilityRole="button" onPress={() => setDate(trial.dateKey())} style={styles.textButton}><Text style={styles.link}>{t.today}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t.next} onPress={() => setDate(moveDay(date, 1))} style={styles.iconButton}><ChevronRight size={20} color="#235b47" /></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.list} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
      {!!(error || localError) && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{t[error] || t.saveFailed}</Text><Pressable accessibilityRole="button" disabled={saving || opening} onPress={() => { setLocalError(false); onRetry(); }} style={styles.textButton}><Text style={styles.link}>{t.retry}</Text></Pressable></View>}
      {data.draft && <Pressable accessibilityRole="button" disabled={locked} onPress={() => setEditor(data.draft)} style={styles.resume}><Pencil size={16} color="#235b47" /><Text style={styles.link}>{t.resume}</Text></Pressable>}
      {!events.length && <View style={styles.empty}><CalendarDays size={36} color="#498366" /><Text style={styles.emptyTitle}>{t.empty}</Text><Text style={styles.secondary}>{t.emptyBody}</Text></View>}
      {events.map(event => <View key={event.id} style={[styles.event, event.child && styles.childEvent]}>
        <View style={styles.eventTop}><View style={styles.flex}><Text style={styles.time}>{event.allDay ? t.allDay : `${event.start}–${event.end}`}</Text><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.secondary}>{event.child || t.family}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.edit}: ${event.title}`} disabled={locked} onPress={() => openEditor(event)} style={styles.iconButton}><Pencil size={18} color="#235b47" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.remove}: ${event.title}`} disabled={locked} onPress={() => setDeleting(event.id)} style={styles.iconButton}><Trash2 size={18} color="#a13640" /></Pressable></View>
        {!!event.location && <Text style={styles.detail}>{event.location}</Text>}
        {!!event.responsible && <Text style={styles.detail}>{t.pickupDetail}: {event.responsible}</Text>}
        {!!event.items && <Text style={styles.detail}>{t.bringDetail}: {event.items}</Text>}
        {deleting === event.id && <View style={styles.deleteConfirm}><Text style={styles.error}>{t.confirmDelete}</Text><View style={styles.row}><Pressable accessibilityRole="button" disabled={saving} onPress={() => setDeleting(null)} style={styles.textButton}><Text style={styles.link}>{t.keep}</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={() => remove(event.id)} style={styles.textButton}><Text style={styles.error}>{t.deleteYes}</Text></Pressable></View></View>}
      </View>)}
      <Text style={styles.local}>{t.local}</Text>
    </ScrollView>
    <View style={styles.footer}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: locked, busy: opening }} disabled={locked} onPress={() => openEditor()} style={[styles.primary, locked && { opacity: 0.5 }]}>{opening ? <ActivityIndicator color="#fff" /> : <Plus size={19} color="#fff" />}<Text style={styles.primaryText}>{opening ? t.opening : t.add}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={saving || opening} onPress={onPersonalize} style={styles.personalize}><Text style={styles.link}>{t.personalize}</Text><ArrowRight size={17} color="#235b47" /></Pressable>
    </View>
    {!!(pendingEditor || editor) && <Modal visible animationType="none" onRequestClose={() => {
      if (!savingRef.current && !openingRef.current) { setPendingEditor(null); setEditor(null); }
    }}><SafeAreaView accessibilityViewIsModal style={styles.screen}>
      {pendingEditor ? <>
        <View style={styles.top}><Text accessibilityRole="header" style={[styles.heading, styles.flex]}>{t.unfinished}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t.keepDraft} disabled={opening} style={styles.iconButton} onPress={() => setPendingEditor(null)}><X size={22} color="#235b47" /></Pressable></View>
        <ScrollView contentContainerStyle={styles.form}><Text style={styles.secondary}>{t.unfinishedBody}</Text>
          {!!data.draft?.title && <Text style={styles.eventTitle}>{data.draft.title}</Text>}
          {!!(error || localError) && <Text accessibilityRole="alert" style={styles.error}>{t[error] || t.saveFailed}</Text>}
          <Button disabled={opening || expired} onPress={() => { setEditor(data.draft); setPendingEditor(null); }}>{t.resume}</Button>
          <Button secondary danger disabled={opening || expired} onPress={() => persistEditor(pendingEditor)}>{t.replaceDraft}</Button>
          <Button secondary disabled={opening} onPress={() => setPendingEditor(null)}>{t.keepDraft}</Button>
        </ScrollView>
      </> : <EventEditor key={editor.id || 'new'} language={language} initial={editor} busy={saving} error={error || (localError ? 'saveFailed' : '')} onChange={onDraft} onSave={save} onClose={() => { if (!savingRef.current) setEditor(null); }} />}
    </SafeAreaView></Modal>}
  </View>;
}

function EventEditor({ language, initial, busy, error, onChange, onSave, onClose }) {
  const t = trialCopy[language] || trialCopy.en;
  const [values, setValues] = useState(initial), [touched, setTouched] = useState(false);
  const fieldRefs = useRef({}), positions = useRef({}), scroll = useRef(null);
  const errors = trial.eventErrors(values);
  function update(key, value) { if (busy) return; const next = { ...values, [key]: value }; setValues(next); onChange(next); }
  function submit() {
    if (busy) return;
    setTouched(true);
    const first = Object.keys(errors)[0];
    if (first) { scroll.current?.scrollTo({ y: Math.max(0, (positions.current[first] || 0) - 12), animated: true }); fieldRefs.current[first]?.focus(); return; }
    Keyboard.dismiss(); onSave(values);
  }
  const fields = [['title', t.titleLabel, 100], ['startDate', t.date, 10], ...(!values.allDay ? [['start', t.start, 5], ['end', t.end, 5]] : []),
    ['child', t.person, 50], ['location', t.location, 160], ['responsible', t.pickup, 80], ['items', t.bring, 300]];
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.top}><Text accessibilityRole="header" style={[styles.heading, styles.flex]}>{initial.id ? t.edit : t.add}</Text><Pressable accessibilityRole="button" accessibilityLabel={t.cancel} disabled={busy} onPress={onClose} style={styles.iconButton}><X size={22} color="#235b47" /></Pressable></View>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.form}>
          <Text style={styles.secondary}>{t.dateHint}</Text>
          {touched && !!Object.keys(errors).length && <Text accessibilityRole="alert" style={styles.error}>{t.validation}</Text>}
          <View style={styles.switchRow}><Text style={styles.label}>{t.allDay}</Text><Switch accessibilityLabel={t.allDay} disabled={busy} value={values.allDay} onValueChange={value => update('allDay', value)} /></View>
          {fields.map(([key, label, maxLength], index) => <View key={key} style={styles.field} onLayout={event => { positions.current[key] = event.nativeEvent.layout.y; }}>
            <Text style={styles.label}>{label}</Text><TextInput ref={node => { fieldRefs.current[key] = node; }} accessibilityLabel={label} value={values[key] || ''} maxLength={maxLength}
              autoCapitalize={['startDate', 'start', 'end'].includes(key) ? 'none' : 'sentences'} autoCorrect={!['startDate', 'start', 'end'].includes(key)}
              keyboardType={['startDate', 'start', 'end'].includes(key) ? 'numbers-and-punctuation' : 'default'} returnKeyType={key === 'items' ? 'default' : 'next'}
              onSubmitEditing={() => fieldRefs.current[fields[index + 1]?.[0]]?.focus()} blurOnSubmit={false}
              onChangeText={value => update(key, value)} placeholder={key === 'child' ? t.family : undefined}
              multiline={key === 'items'} editable={!busy} style={[styles.input, touched && errors[key] && styles.invalid]} />
            {touched && errors[key] && <Text accessibilityRole="alert" style={styles.error}>{t[errors[key]]}</Text>}
          </View>)}
          <Text style={styles.local}>{t.draftNote}</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{t[error] || t.saveFailed}</Text>}
        </ScrollView>
        <View style={styles.footer}><Pressable accessibilityRole="button" accessibilityState={{ disabled: !!busy, busy: !!busy }} disabled={busy} onPress={submit} style={[styles.primary, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.save}</Text>}
        </Pressable></View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' }, top: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  flex: { flex: 1, minWidth: 0 }, heading: { color: '#203c38', fontSize: 22, lineHeight: 29, fontWeight: '700' }, caption: { color: '#65776e', fontSize: 11, lineHeight: 17 },
  clock: { color: '#3b614d', fontSize: 12, fontVariant: ['tabular-nums'], backgroundColor: '#edf5ef', padding: 9, borderRadius: 8 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, textButton: { minWidth: 44, minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  dateNav: { paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#e0e9e3', backgroundColor: '#f6faf7' }, date: { color: '#203c38', fontSize: 15, fontWeight: '600' },
  list: { padding: 16, gap: 12, flexGrow: 1 }, empty: { paddingVertical: 34, alignItems: 'center', gap: 14 }, emptyTitle: { textAlign: 'center', fontSize: 22, lineHeight: 29, color: '#294e3d', fontWeight: '600' },
  secondary: { color: '#5a6e66', fontSize: 14, lineHeight: 22 }, local: { fontSize: 11, lineHeight: 18, color: '#65776e', textAlign: 'center', marginTop: 10 },
  event: { borderWidth: 1, borderColor: '#d1e1d6', borderLeftWidth: 4, borderLeftColor: '#478363', borderRadius: 12, padding: 13, backgroundColor: '#f0f7f1', gap: 5 },
  childEvent: { backgroundColor: '#f0f5fa', borderColor: '#cfdfeb', borderLeftColor: '#33779c' }, eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 }, time: { color: '#315d48', fontSize: 12, fontWeight: '600' },
  eventTitle: { color: '#203c38', fontSize: 18, lineHeight: 24, fontWeight: '700', marginTop: 5 }, detail: { color: '#426052', fontSize: 12, lineHeight: 19 },
  footer: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 10, gap: 4, borderTopWidth: 1, borderColor: '#dce7e1', backgroundColor: '#fff' },
  primary: { minHeight: 50, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#235b47', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  personalize: { minHeight: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, link: { color: '#245b48', fontSize: 13, fontWeight: '600' },
  notice: { padding: 12, borderRadius: 8, backgroundColor: '#fff3ee' }, error: { color: '#a13640', fontSize: 12, lineHeight: 19 }, resume: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#c4d7ca', borderRadius: 8 },
  deleteConfirm: { marginTop: 8, borderTopWidth: 1, borderColor: '#d9c9c8', paddingTop: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  form: { padding: 20, gap: 18 }, field: { gap: 7 }, label: { fontSize: 14, color: '#3d5749', fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#c9d8cf', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, color: '#203c38', fontSize: 16, backgroundColor: '#fff' },
  invalid: { borderColor: '#a13640' }, switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }
});
