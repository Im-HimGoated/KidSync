import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check, ChevronLeft, ChevronRight, Plus, Save, Search, Share2, Trash2 } from 'lucide-react-native';
import { Button, ChoiceRow, Field, IconButton, Sheet, useCalendarUi } from './ui';
import { useAppearance, useThemeStyles } from '../ui/AppearanceContext';
import calendar from '../lib/calendar';
import planning from './planning';

export const planningCopy = {
  en: {
    title: 'Planning tools', close: 'Close', modes: ['Open time', 'Compare days', 'Day note', 'Share week', 'Saved views', 'Find events'],
    date: 'Date', start: 'Window starts', end: 'Window ends', duration: 'Minutes', plan: 'Plan here', allDay: 'All day',
    scope: 'All people in this calendar; cancelled plans excluded.', openHint: 'Includes travel and buffers. All-day plans block the window; holidays do not. Check other calendars before booking.',
    empty: 'Nothing scheduled', noGaps: 'No matching open time', previous: 'Previous day', next: 'Next day',
    second: 'Compare with', events: 'plans', minutes: 'timed minutes', note: 'Private day note',
    privacy: 'Notes and saved views stay on this device, separately for this account and calendar. Notes are never shared or added to agendas.',
    save: 'Save note', saved: 'Saved on this device', failed: 'Could not complete this action. Your text has been kept; retry.',
    invalid: 'Check the dates and time window.', loading: 'Loading personal tools…', details: 'Include event notes and packing items',
    share: 'Share agenda', shareHint: 'Review before sharing. Includes all seven days and everyone in this calendar.',
    viewName: 'View name', saveView: 'Save current view', apply: 'Open view', remove: 'Remove saved view', noViews: 'No saved views',
    viewHint: 'Saves this date, view, search and person filter. Up to eight named views.', limit: 'Up to eight views and 730 day notes can be saved.',
    find: 'Search', query: 'Activity, person, place or notes', from: 'From', through: 'Through', more: 'Show 20 more', retry: 'Retry', viewLabels: { agenda: 'Agenda', week: 'Week', month: 'Month' },
    discard: 'Discard unsaved note?', discardBody: 'Your unsaved note changes will be lost.', keep: 'Keep editing', discardButton: 'Discard', show: 'Show day', clearNote: 'Save an empty note to remove it.'
  },
  zh: {
    title: '规划工具', close: '关闭', modes: ['空闲时间', '比较日期', '每日笔记', '分享本周', '已存视图', '查找日程'],
    date: '日期', start: '开始时间', end: '结束时间', duration: '分钟', plan: '在此安排', allDay: '全天',
    scope: '包括当前日历所有成员，不含已取消的安排。', openHint: '包含交通及缓冲时间。全天活动占用整个时段，节假日除外。预约前请核对其他日历。',
    empty: '暂无安排', noGaps: '没有符合条件的空闲时间', previous: '前一天', next: '后一天',
    second: '比较日期', events: '项安排', minutes: '分钟占用', note: '私人每日笔记',
    privacy: '笔记和已存视图仅在此设备保存，并按账户及日历区分。笔记不会共享或加入周安排。',
    save: '保存笔记', saved: '已在此设备保存', failed: '操作失败，文字仍保留，请重试。',
    invalid: '请检查日期和时间范围。', loading: '正在加载个人工具…', details: '包含日程备注及携带物品',
    share: '分享安排', shareHint: '分享前请核对，包含此日历一周七天及所有成员。',
    viewName: '视图名称', saveView: '保存当前视图', apply: '打开视图', remove: '移除已存视图', noViews: '暂无已存视图',
    viewHint: '保存当前日期、视图、搜索及成员筛选。最多八个命名视图。', limit: '最多保存八个视图和 730 天的笔记。',
    find: '搜索', query: '活动、成员、地点或备注', from: '从', through: '至', more: '再显示 20 项', retry: '重试', viewLabels: { agenda: '日程', week: '周', month: '月' },
    discard: '放弃未保存的笔记？', discardBody: '未保存的笔记更改将丢失。', keep: '继续编辑', discardButton: '放弃', show: '查看当天', clearNote: '保存空白笔记即可移除。'
  }
};
const modeIds = ['gaps', 'compare', 'notes', 'share', 'views', 'find'];
export default function PlanningTools({ userId, ownerId, calendarId, events, kids, date, language = 'en', firstDay = 1, selectedView, initialMode = 'gaps',
  canWrite, onPlan, onShowDate, onApplyView, onClose, embedded = false, onDirtyChange, onBusyChange }) {
  const t = planningCopy[language] || planningCopy.en, { colors } = useAppearance(), { u } = useCalendarUi();
  const s = useThemeStyles(createStyles), initial = calendar.dateKey(date);
  const store = useMemo(() => planning.createPlanningStore(AsyncStorage, { userId, ownerId, calendarId }), [userId, ownerId, calendarId]);
  const [mode, setMode] = useState(modeIds.includes(initialMode) ? initialMode : 'gaps'), [day, setDay] = useState(initial), [second, setSecond] = useState(calendar.dateKey(calendar.addDays(date, 1)));
  const [start, setStart] = useState('08:00'), [end, setEnd] = useState('20:00'), [duration, setDuration] = useState(30);
  const [data, setData] = useState(null), [note, setNote] = useState(''), [savedNote, setSavedNote] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [name, setName] = useState(''), [details, setDetails] = useState(false), [discard, setDiscard] = useState(false);
  const [query, setQuery] = useState(''), [through, setThrough] = useState(calendar.dateKey(calendar.addDays(date, 30))), [limit, setLimit] = useState(20);
  const alive = useRef(true), saving = useRef(false), dirty = note !== savedNote;
  const selectedDay = useRef(day);
  selectedDay.current = day;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onDirtyChange?.(false); onBusyChange?.(false); }, [onDirtyChange, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    store.read().then(value => { if (alive.current) { setData(value); setNote(value.notes[selectedDay.current] || ''); setSavedNote(value.notes[selectedDay.current] || ''); } }).catch(() => { if (alive.current) setMessage(t.failed); });
    return () => { alive.current = false; };
  }, [store]);
  async function action(work, success, status = t.saved) {
    if (saving.current) return; saving.current = true; setBusy(true); setMessage('');
    try { const result = await work(); if (alive.current) { success?.(result); setMessage(status); } }
    catch (error) { if (alive.current) setMessage(['VIEW_LIMIT', 'NOTE_LIMIT'].includes(error.message) ? t.limit : t.failed); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  }
  function close() { if (busy) return; if (dirty) setDiscard(true); else onClose(); }
  function changeDay(value) { if (dirty) return; setDay(value); setNote(data?.notes[value] || ''); setSavedNote(data?.notes[value] || ''); setMessage(''); }
  const validDay = Number.isFinite(calendar.parseDateKey(day).getTime());
  let gaps = [], compared = [], agenda = '', found = [], invalid = mode !== 'views' && !validDay;
  try {
    if (mode === 'gaps') gaps = planning.openTime(events, { date: day, start, end, duration });
    if (mode === 'compare') compared = [day, second].map(value => ({ date: value, ...planning.compareDay(events, value) }));
    if (mode === 'share') agenda = planning.weekAgenda(events, day, { language, firstDay, kids, includeDetails: details });
    if (mode === 'find') found = planning.findEvents(events, day, through, query);
  } catch { invalid = true; }
  const dateField = <View style={s.dateRow}><IconButton icon={ChevronLeft} label={t.previous} disabled={busy || dirty || !validDay} onPress={() => changeDay(calendar.dateKey(calendar.addDays(calendar.parseDateKey(day), -1)))} />
    <Field label={t.date} value={day} onChangeText={changeDay} placeholder="YYYY-MM-DD" maxLength={10} editable={!busy && !dirty} keyboardType="numbers-and-punctuation" style={s.flex} />
    <IconButton icon={ChevronRight} label={t.next} disabled={busy || dirty || !validDay} onPress={() => changeDay(calendar.dateKey(calendar.addDays(calendar.parseDateKey(day), 1)))} /></View>;
  const content = <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {discard ? <><Text style={u.heading}>{t.discard}</Text><Button onPress={() => setDiscard(false)}>{t.keep}</Button><Button danger onPress={onClose}>{t.discardButton}</Button></> : <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}><ChoiceRow options={modeIds.map((value, i) => ({ value, label: t.modes[i] }))} value={mode} disabled={busy || dirty} onChange={value => { setMode(value); setMessage(''); }} label={t.title} /></ScrollView>
        <Text style={u.body}>{t.scope}</Text>{mode !== 'views' && dateField}
        {mode === 'gaps' && <><View style={s.row}><Field label={t.start} value={start} onChangeText={setStart} placeholder="08:00" maxLength={5} keyboardType="numbers-and-punctuation" style={s.flex} /><Field label={t.end} value={end} onChangeText={setEnd} placeholder="20:00" maxLength={5} keyboardType="numbers-and-punctuation" style={s.flex} /></View>
          <ChoiceRow label={t.duration} value={duration} onChange={setDuration} options={[15, 30, 60, 90, 120].map(value => ({ value, label: `${value} ${t.duration}` }))} /><Text style={u.body}>{t.openHint}</Text>
          {gaps.map(gap => <View key={gap.start} style={s.item}><Text style={u.label}>{gap.start}–{gap.end} · {gap.minutes} {t.duration}</Text>{canWrite && <Button secondary icon={Plus} onPress={() => onPlan(gap.draft)}>{t.plan}</Button>}</View>)}{!invalid && !gaps.length && <Text style={u.body}>{t.noGaps}</Text>}
        </>}
        {mode === 'compare' && <><Field label={t.second} value={second} onChangeText={setSecond} maxLength={10} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />{compared.map((value, index) => <View key={`${index}:${value.date}`} style={s.item}><Text style={u.heading}>{value.date}</Text><Text style={u.body}>{value.count} {t.events} · {value.minutes} {t.minutes}</Text>{value.events.map((event, i) => <Text key={i} style={u.body}>{typeof event.title === 'string' ? event.title : ''}</Text>)}<Button secondary onPress={() => onShowDate(value.date)}>{t.show}</Button></View>)}</>}
        {mode === 'notes' && <><Text style={u.body}>{t.privacy}</Text>{!data && !message && <Text style={u.body}>{t.loading}</Text>}<Field label={t.note} value={note} onChangeText={setNote} multiline maxLength={2000} editable={!!data && !busy && validDay} /><Text style={u.body}>{note.length}/2000 · {t.clearNote}</Text><Button icon={Save} disabled={!data || busy || !dirty || !validDay} onPress={() => action(() => store.saveNote(day, note), value => { setData(value); setSavedNote(note); })}>{t.save}</Button></>}
        {mode === 'share' && <><Text style={u.body}>{t.shareHint}</Text><View style={s.row}><Text style={[u.label, s.flex]}>{t.details}</Text><Switch accessibilityLabel={t.details} value={details} onValueChange={setDetails} trackColor={{ false: colors.line, true: colors.primary }} thumbColor={details ? colors.onPrimary : colors.surface} /></View><Text selectable style={u.body}>{agenda}</Text><Button icon={Share2} disabled={invalid || busy} onPress={() => action(() => Share.share({ message: agenda }), undefined, '')}>{t.share}</Button></>}
        {mode === 'views' && <><Text style={u.body}>{t.privacy}</Text><Text style={u.body}>{t.viewHint}</Text><Field label={t.viewName} value={name} onChangeText={setName} maxLength={40} editable={!busy} /><Button icon={Save} disabled={!data || busy || !name.trim()} onPress={() => action(() => store.saveView(name, selectedView), value => { setData(value); setName(''); })}>{t.saveView}</Button>{data?.views.map(value => <View key={value.name} style={s.item}><Text style={u.label}>{value.name}</Text><Text style={u.body}>{value.date} · {t.viewLabels[value.view]}</Text><View style={s.row}><Button secondary icon={Check} disabled={busy} style={s.flex} onPress={() => onApplyView(value)}>{t.apply}</Button><IconButton icon={Trash2} label={`${t.remove}: ${value.name}`} disabled={busy} onPress={() => action(() => store.removeView(value.name), setData)} /></View></View>)}{data && !data.views.length && <Text style={u.body}>{t.noViews}</Text>}</>}
        {mode === 'find' && <><Field label={t.query} value={query} onChangeText={value => { setQuery(value); setLimit(20); }} maxLength={120} /><Field label={t.through} value={through} onChangeText={setThrough} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" />{found.slice(0, limit).map((event, i) => <View key={`${event.id}:${event.occurrenceDate}:${i}`} style={s.item}><Text style={u.label}>{typeof event.title === 'string' ? event.title : ''}</Text><Text style={u.body}>{event.occurrenceDate} · {event.allDay === true ? t.allDay : typeof event.start === 'string' ? event.start : ''}</Text><Button secondary icon={Search} onPress={() => onShowDate(event.occurrenceDate)}>{t.show}</Button></View>)}{!invalid && !found.length && <Text style={u.body}>{t.empty}</Text>}{found.length > limit && <Button secondary onPress={() => setLimit(value => value + 20)}>{t.more}</Button>}</>}
        {invalid && <Text accessibilityRole="alert" style={u.error}>{t.invalid}</Text>}{!!message && <Text accessibilityRole="alert" style={u.body}>{message}</Text>}
        {!data && !!message && <Button secondary disabled={busy} onPress={() => action(() => store.read(), value => { setData(value); setNote(value.notes[day] || ''); setSavedNote(value.notes[day] || ''); }, '')}>{t.retry}</Button>}
      </>}
    </ScrollView>;
  return embedded ? content : <Sheet title={t.title} closeLabel={t.close} busy={busy} onClose={close}>{content}</Sheet>;
}
function createStyles(colors) { return StyleSheet.create({ content: { padding: 18, paddingBottom: 30, gap: 15, backgroundColor: colors.surface }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, flex: { flex: 1, minWidth: 0 }, item: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 14, gap: 9 } }); }
