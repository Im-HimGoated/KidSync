import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Button, ChoiceRow } from '../calendar/ui';
import settings from '../../../shared/backend/mobile-settings';
import schedules from '../../../shared/backend/schedules';
import { useAppearance, useThemeStyles } from './AppearanceContext';

export const calendarDisplayCopy = {
  en: {
    title: 'Calendar display', shared: 'Saved choices sync with the website for this calendar.',
    view: 'Opening view', today: 'Day', four: '4 days', week: 'Week', month: 'Month',
    deviceView: 'Until you choose a shared opening view, this phone uses your setup choice.',
    duration: 'New event length', minutes: 'min', weekends: 'Show weekends in Week view',
    durationHint: 'Applies to new plans. Existing plans keep their times.',
    unavailable: 'Connect and finish syncing this calendar before saving display settings.',
    noCalendar: 'Choose a calendar you own to change its shared display settings.',
    save: 'Save changes', saving: 'Saving…', saved: 'Display settings saved.',
    failed: 'Could not save. Your choices are still here; reconnect and retry.',
    conflict: 'These settings changed elsewhere. Load the saved choices, then review your changes.',
    reload: 'Load saved choices', scope: 'This calendar is no longer open. Reopen its settings to continue.'
  },
  zh: {
    title: '日历显示', shared: '保存的选择会与此日历的网页设置同步。',
    view: '打开时的视图', today: '日', four: '4 天', week: '周', month: '月',
    deviceView: '选择共享的默认视图前，此手机会使用你的设置选择。',
    duration: '新活动时长', minutes: '分钟', weekends: '在周视图中显示周末',
    durationHint: '仅用于新活动，已有活动的时间保持不变。',
    unavailable: '请联网并完成此日历的同步后，再保存显示设置。',
    noCalendar: '请选择你拥有的日历，以更改其共享显示设置。',
    save: '保存更改', saving: '正在保存…', saved: '已保存显示设置。',
    failed: '无法保存。你的选择仍在此处，请联网后重试。',
    conflict: '这些设置已在其他地方更改。请加载已保存的选择，再核对更改。',
    reload: '加载已保存的选择', scope: '此日历已关闭，请重新打开其设置后继续。'
  }
};

const durations = [30, 45, 60, 90, 120];
const views = ['today', 'four', 'week', 'month'];
function valuesFor(data, preferences) {
  const merged = settings.mergeDisplayPreferences(preferences, data);
  return {
    defaultView: merged.view === 'day' ? 'today' : ['four', 'week', 'month'].includes(merged.view) ? merged.view : '',
    defaultEventDuration: durations.includes(merged.defaultEventDuration) ? merged.defaultEventDuration : 60,
    showWeekends: typeof merged.showWeekends === 'boolean' ? merged.showWeekends : true,
  };
}
function reviewFor(data, preferences) {
  return { original: settings.readDisplaySettings(data), values: valuesFor(data, preferences) };
}

/** onSave({original, changes}) returns a confirmed owner schedule row. */
export default function CalendarDisplaySettings({ language = 'en', calendar, preferences, available, onSave, onBusyChange, onDirtyChange }) {
  const t = calendarDisplayCopy[language] || calendarDisplayCopy.en;
  const { colors } = useAppearance(), s = useThemeStyles(createStyles);
  const [review, setReview] = useState(() => reviewFor(calendar?.data, preferences));
  const [draft, setDraft] = useState(() => review.values);
  const [touched, setTouched] = useState([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const request = useRef(false), mounted = useRef(true);
  const changed = key => draft[key] !== review.values[key]
    || (touched.includes(key) && (!Object.hasOwn(review.original, key) || review.original[key] !== draft[key]));
  const dirty = Object.keys(draft).some(changed);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const signature = JSON.stringify(reviewFor(calendar?.data, preferences));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusyChange?.(false); }; }, []);
  useEffect(() => {
    if (!dirty && !request.current) {
      const next = reviewFor(calendar?.data, preferences);
      setReview(next); setDraft(next.values); setTouched([]);
    }
  // A dirty form keeps its reviewed baseline when another device changes it.
  // Saving/reloading explicitly replaces that baseline; stale props cannot do so.
  }, [signature]);
  function change(key, value) {
    if (request.current || !available) return;
    setTouched(current => current.includes(key) ? current : [...current, key]);
    setDraft(current => ({ ...current, [key]: value })); setMessage('');
  }
  function reload() {
    if (request.current) return;
    const next = reviewFor(calendar?.data, preferences);
    setReview(next); setDraft(next.values); setTouched([]); setMessage('');
  }
  async function save() {
    if (request.current || !available || !calendar?.id || !dirty || typeof onSave !== 'function') return;
    request.current = true; setBusy(true); setMessage(''); onBusyChange?.(true);
    const changes = Object.fromEntries(Object.entries(draft).filter(([key]) => changed(key)));
    try {
      const row = await onSave({ original: review.original, changes });
      if (!row?.schedule) throw new Error('SAVE_FAILED');
      if (!mounted.current) return;
      const data = schedules.calendarEntries(row.schedule).find(item => item.id === calendar.id)?.data;
      if (!data) throw new Error('SAVE_FAILED');
      const next = reviewFor(data, preferences);
      setReview(next); setDraft(next.values); setTouched([]); setMessage('saved');
    } catch (error) {
      if (mounted.current) setMessage(error?.code === 'CONFLICT' ? 'conflict' : error?.code === 'STALE_SCOPE' ? 'scope' : 'failed');
    } finally {
      request.current = false;
      if (mounted.current) { setBusy(false); onBusyChange?.(false); }
    }
  }
  if (!calendar) return <Text style={s.body}>{t.noCalendar}</Text>;
  const disabled = busy || !available;
  return <View style={s.content}>
    <Text style={s.name}>{typeof calendar.name === 'string' ? calendar.name : ''}</Text>
    <Text style={s.body}>{t.shared}</Text>
    <View style={s.field}><Text style={s.label}>{t.view}</Text>
      <ChoiceRow label={t.view} value={draft.defaultView} disabled={disabled} onChange={value => change('defaultView', value)} options={views.map(value => ({ value, label: t[value] }))} />
      {!Object.hasOwn(review.original, 'defaultView') && <Text style={s.body}>{t.deviceView}</Text>}
    </View>
    <View style={s.field}><Text style={s.label}>{t.duration}</Text>
      <ChoiceRow label={t.duration} value={draft.defaultEventDuration} disabled={disabled} onChange={value => change('defaultEventDuration', value)} options={durations.map(value => ({ value, label: `${value} ${t.minutes}` }))} />
      <Text style={s.body}>{t.durationHint}</Text>
    </View>
    <View style={s.row}><Text style={[s.label, s.flex]}>{t.weekends}</Text>
      <Switch accessibilityLabel={t.weekends} accessibilityState={{ checked: draft.showWeekends, disabled }} value={draft.showWeekends} disabled={disabled} onValueChange={value => change('showWeekends', value)}
        trackColor={{ false: colors.line, true: colors.primary }} thumbColor={draft.showWeekends ? colors.onPrimary : colors.surface} ios_backgroundColor={colors.line} />
    </View>
    {!available && <Text style={s.body}>{t.unavailable}</Text>}
    {!!message && <Text accessibilityRole={message === 'saved' ? 'text' : 'alert'} accessibilityLiveRegion="polite" style={message === 'saved' ? s.body : s.error}>{t[message]}</Text>}
    <Button disabled={disabled || !dirty || typeof onSave !== 'function'} onPress={save}>{busy ? t.saving : t.save}</Button>
    {message === 'conflict' && <Button secondary disabled={busy} onPress={reload}>{t.reload}</Button>}
  </View>;
}

function createStyles(colors) { return StyleSheet.create({
  content: { gap: 16 }, field: { gap: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }, flex: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontWeight: '700', fontSize: 16, lineHeight: 24 }, label: { color: colors.ink, fontWeight: '600', fontSize: 14, lineHeight: 22 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 21 }, error: { color: colors.error, fontSize: 13, lineHeight: 21 }
}); }
