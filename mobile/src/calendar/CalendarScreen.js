import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Home, MapPin, Plus, RefreshCw, Repeat2, Search, Settings2, UserPlus, UserRound, X } from 'lucide-react-native';
import scheduleReader from '../../../shared/backend/schedules';
import calendar from '../lib/calendar';
import model from './model';
import { ActivityDetails, ActivityEditor } from './ActivityEditor';
import { DateStrip, MonthGrid, WeekGrid } from './CalendarViews';
import { Button, ChoiceRow, colors, Field, IconButton, personColor, Sheet, u } from './ui';
import getCopy, { dateLabel } from './copy';

/**
 * Signed-in native calendar, with no auth/session or storage ownership.
 * Required write integration: client, userId, onSchedule(row).
 * onSchedule receives the confirmed {schedule, updated_at, calendarId?} row.
 * App owns account header, sign out, device gating and navigation.
 * Controlled selection: calendarId + onSelectCalendar(id).
 * Optional: snapshot instead of calendars; onOpenDashboard, onPreferences,
 * onShareCalendar(calendar), readOnly, initialDate (for deterministic previews).
 */
export default function CalendarScreen(props) {
  const userId = props.userId || props.user?.id || '';
  return <CalendarAccount key={userId || 'signed-out'} {...props} userId={userId} />;
}

const eventsIn = data => (Array.isArray(data?.activities) ? data.activities : []).filter(event => event && typeof event === 'object');
const kidsIn = data => (Array.isArray(data?.kids) ? data.kids : []).filter(kid => kid && typeof kid.name === 'string' && kid.name.trim());
const isFamily = event => !event.child || event.child === '__family__';
const validDate = date => date instanceof Date && Number.isFinite(date.getTime());

function CalendarAccount({ userId, client, calendars, snapshot, calendarId, activeCalendarId, language = 'en', preferences,
  loading = false, syncStatus, status, error, onSchedule, onSelectCalendar, onRefresh, onOpenDashboard, onPreferences,
  onShareCalendar, readOnly = false, initialDate }) {
  const t = getCopy(language), display = model.normalizeDisplayPreferences(preferences);
  const initial = initialDate instanceof Date ? initialDate : calendar.parseDateKey(initialDate);
  const [date, setDate] = useState(() => validDate(initial) ? new Date(initial) : new Date());
  const [view, setView] = useState(display.view), [person, setPerson] = useState('all'), [query, setQuery] = useState('');
  const [localId, setLocalId] = useState(null), [sheet, setSheet] = useState(null), [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false), [message, setMessage] = useState(''), [notice, setNotice] = useState('');
  const [conflicted, setConflicted] = useState(false), [name, setName] = useState(''), [jump, setJump] = useState('');
  const mounted = useRef(true), mutation = useRef(false), refreshingRef = useRef(false), calendarScope = useRef(null);
  const viewPreference = useRef(display.view);
  const rowSnapshot = snapshot?.schedule || snapshot;
  const entries = Array.isArray(calendars) ? calendars : scheduleReader.calendarEntries(rowSnapshot);
  const selectedId = calendarId ?? activeCalendarId ?? localId ?? rowSnapshot?.activeCalendarId;
  const active = entries.find(item => item.id === selectedId) || entries[0];
  const scopeId = `${userId}:${active?.ownerId || userId}:${active?.id || ''}`;
  calendarScope.current = scopeId;
  const events = eventsIn(active?.data), kids = kidsIn(active?.data);
  const filtered = model.filterActivities(events, kids, { person, query });
  const dayEvents = model.sortAgenda(calendar.eventsForDate(filtered, date));
  const searchActive = !!query.trim();
  const shownEvents = searchActive ? model.sortAgenda(filtered).sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || ''))) : dayEvents;
  const canWrite = !!userId && !!client && typeof onSchedule === 'function' && !readOnly && (!active?.ownerId || active.ownerId === userId);
  const writableEvent = event => canWrite && !event?.externalSource && !event?.isBuiltInHoliday;

  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (viewPreference.current !== display.view) { viewPreference.current = display.view; setView(display.view); }
  }, [display.view]);
  useEffect(() => { setPerson('all'); setQuery(''); setSheet(null); setMessage(''); }, [active?.id, active?.ownerId]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);

  const actions = useMemo(() => model.createCalendarActions({
    client, userId, onSchedule,
    onSelectCalendar: id => { setLocalId(id); onSelectCalendar?.(id); },
    isCurrent: () => mounted.current && calendarScope.current === scopeId,
  }), [client, userId, onSchedule, onSelectCalendar, scopeId]);

  function describeError(failure) {
    if (failure?.code === 'CONFLICT') return t.conflict;
    if (failure?.code === 'FORBIDDEN') return t.permission;
    return t.saveFailed;
  }
  async function mutate(work, success) {
    if (!canWrite || mutation.current) return false;
    mutation.current = true; setBusy(true); setMessage(''); setConflicted(false);
    try {
      const row = await work();
      if (!mounted.current) return false;
      success?.(row);
      return true;
    } catch (failure) {
      if (failure?.code === 'STALE_SCOPE') return false;
      if (mounted.current) { setMessage(describeError(failure)); setConflicted(failure?.code === 'CONFLICT'); }
      return false;
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function refresh() {
    if (refreshingRef.current || busy || !userId) return;
    refreshingRef.current = true; setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
      else if (client) { const row = await scheduleReader.readSchedule(client, userId); if (mounted.current && row) onSchedule?.(row); }
    } catch { if (mounted.current) setMessage(t.loadFailed); }
    finally { refreshingRef.current = false; if (mounted.current) setRefreshing(false); }
  }
  function open(type, extra = {}) { if (busy) return; setMessage(''); setConflicted(false); setSheet({ type, ...extra }); }
  function selectCalendar(id) { if (busy) return; setLocalId(id); onSelectCalendar?.(id); setSheet(null); }
  function showEvent(event, occurrence = date) { open('details', { event, occurrenceDate: calendar.dateKey(occurrence) }); }
  function selectDate(value) { if (validDate(value)) setDate(new Date(value)); }
  async function saveActivity(event, options) {
    if (!active || !writableEvent(options?.original)) return false;
    return mutate(() => actions.save(active.id, event, options?.original), () => {
      selectDate(calendar.parseDateKey(event.startDate)); setSheet(null); setNotice(t.saved);
    });
  }
  async function deleteActivity(event) {
    if (!active || !writableEvent(event)) return false;
    return mutate(() => actions.remove(active.id, event.id, event), () => { setSheet(null); setNotice(t.removed); });
  }
  async function createCalendar() {
    const value = name.trim();
    if (!value || value.length > 100) { setMessage(t.invalidName); return; }
    return mutate(() => actions.create(value), () => { setName(''); setSheet(null); setNotice(t.created); });
  }

  const headerDate = dateLabel(date, language, { weekday: 'long', month: 'short', day: 'numeric' });
  const sheetTitle = { calendars: t.calendars, create: t.createCalendar, date: t.datePicker, new: t.add, edit: t.edit, details: t.details }[sheet?.type];
  const filters = [{ value: 'all', label: t.everyone }, ...kids.map(kid => ({ value: kid.name, label: kid.name, color: personColor({ child: kid.name }, kids).line }))];
  const pending = loading && !active;

  return <View style={s.page}>
    <View style={s.controls}>
      <View style={s.calendarRow}>
        {onOpenDashboard && <IconButton icon={Home} label={t.dashboard} onPress={onOpenDashboard} />}
        <Pressable accessibilityRole="button" accessibilityLabel={t.calendars} onPress={() => open('calendars')} disabled={busy} style={s.calendarSelector}>
          <CalendarDays size={20} color={colors.blue} /><Text numberOfLines={1} style={s.calendarName}>{active?.name || t.calendars}</Text><ChevronDown size={17} color={colors.muted} />
        </Pressable>
        {!!onShareCalendar && <Button secondary icon={UserPlus} onPress={() => onShareCalendar(active)} disabled={!active || busy} style={{ paddingHorizontal: 12 }}>{t.share}</Button>}
        {!!onPreferences && <IconButton icon={Settings2} label={t.openPreferences} onPress={onPreferences} />}
      </View>
      <View style={s.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.datePicker} onPress={() => { setJump(calendar.dateKey(date)); open('date'); }} style={s.dateButton}>
          <Text style={s.period}>{dateLabel(date, language, { month: 'long', year: 'numeric' })}</Text><ChevronDown size={15} color={colors.muted} />
        </Pressable>
        <View style={u.row}><IconButton icon={ChevronLeft} label={t.previous} onPress={() => selectDate(model.movePeriod(date, view, -1))} /><Pressable accessibilityRole="button" onPress={() => setDate(new Date())} style={s.today}><Text style={s.todayText}>{t.today}</Text></Pressable><IconButton icon={ChevronRight} label={t.next} onPress={() => selectDate(model.movePeriod(date, view, 1))} /></View>
      </View>
      <View style={s.views}>{['agenda', 'week', 'month'].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: view === value }} onPress={() => setView(value)} style={[s.viewButton, view === value && s.viewSelected]}><Text style={[s.viewText, view === value && { color: colors.white }]}>{t[value]}</Text></Pressable>)}</View>
    </View>
    {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
    {!!error && <Pressable accessibilityRole="button" accessibilityLabel={t.refresh} onPress={refresh} style={s.errorBanner}><Text style={[u.error, { flex: 1 }]}>{t.loadFailed}</Text><RefreshCw size={18} color={colors.red} /></Pressable>}
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />}>
      <View style={s.search}><Search size={18} color={colors.muted} /><TextInput accessibilityLabel={t.search} value={query} onChangeText={setQuery} placeholder={t.searchPlaceholder} placeholderTextColor="#85969E" style={s.searchInput} autoCorrect={false} returnKeyType="search" />{!!query && <IconButton icon={X} label={t.clear} onPress={() => setQuery('')} />}</View>
      <Text style={s.planning}>{t.planning[display.people]}</Text>
      {!!kids.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 14 }}><ChoiceRow options={filters} value={person} onChange={setPerson} label={t.everyone} /></ScrollView>}
      {pending ? <View style={u.empty}><ActivityIndicator color={colors.blue} accessibilityLabel={t.loading} /><Text style={u.body}>{t.loading}</Text></View> : !active ? <View style={u.empty}><CalendarDays size={36} color={colors.blue} /><Text style={[u.heading, s.center]}>{t.noCalendar}</Text><Text style={[u.body, s.center]}>{t.noCalendarBody}</Text>{canWrite && <Button icon={Plus} onPress={() => open('create')}>{t.createCalendar}</Button>}</View> : <>
        {view === 'agenda' && <DateStrip date={date} firstDay={display.firstDay} events={filtered} kids={kids} language={language} onDate={selectDate} />}
        {view === 'month' && <MonthGrid date={date} firstDay={display.firstDay} events={filtered} kids={kids} language={language} onDate={selectDate} />}
        {view === 'week' && <WeekGrid date={date} firstDay={display.firstDay} initialHour={display.initialHour} events={filtered} kids={kids} language={language} onDate={selectDate} onEvent={showEvent} />}
        <View style={s.agendaHeading}><Text accessibilityRole="header" style={s.agendaTitle}>{searchActive ? t.searchResults : headerDate}</Text><View style={s.count}><Text style={s.countText}>{shownEvents.length}</Text></View></View>
        {shownEvents.length ? shownEvents.map((event, index) => <ActivityCard key={`${event.id ?? 'activity'}:${index}`} event={event} kids={kids} language={language} showDate={searchActive} onPress={() => showEvent(event, searchActive && validDate(calendar.parseDateKey(event.startDate)) ? calendar.parseDateKey(event.startDate) : date)} />) : <View style={u.empty}><CalendarDays size={28} color={colors.green} /><Text style={[u.heading, s.center]}>{query.trim() || person !== 'all' ? t.noResults : t.empty}</Text><Text style={[u.body, s.center]}>{t.emptyBody}</Text>{canWrite && <Button secondary icon={Plus} onPress={() => open('new')}>{t.add}</Button>}</View>}
        <View style={s.syncRow}><Text style={s.syncText}>{refreshing ? t.refreshing : (syncStatus || status) === 'SUBSCRIBED' ? t.live : t.connecting}</Text><IconButton icon={RefreshCw} label={t.refresh} onPress={refresh} disabled={refreshing || busy} color={colors.muted} /></View>
        {!canWrite && <Text style={[u.body, s.center]}>{t.readOnly}</Text>}
      </>}
    </ScrollView>
    {!!active && canWrite && <Pressable accessibilityRole="button" accessibilityLabel={t.add} onPress={() => open('new')} disabled={busy} style={({ pressed }) => [s.add, pressed && { opacity: 0.6 }]}><Plus size={28} color={colors.white} /></Pressable>}
    {!!sheet && <Sheet title={sheetTitle} closeLabel={t.close} busy={busy} onClose={() => { setSheet(null); setMessage(''); setConflicted(false); }}>
      {!!message && <View style={s.sheetFeedback}><Text accessibilityRole="alert" style={u.error}>{message}</Text>{conflicted && <Button secondary icon={RefreshCw} onPress={refresh} disabled={refreshing}>{t.conflictRefresh}</Button>}</View>}
      {sheet.type === 'details' && <ActivityDetails event={sheet.event} occurrenceDate={sheet.occurrenceDate} kids={kids} language={language} canEdit={writableEvent(sheet.event)} busy={busy} onEdit={() => open('edit', { event: sheet.event })} onDelete={deleteActivity} />}
      {['new', 'edit'].includes(sheet.type) && canWrite && <ActivityEditor event={sheet.type === 'edit' ? sheet.event : null} date={date} kids={kids} preferences={preferences} language={language} busy={busy} error={message} onSave={saveActivity} onCancel={() => { if (!busy) { setSheet(null); setMessage(''); } }} />}
      {sheet.type === 'calendars' && <ScrollView contentContainerStyle={s.sheetContent}>{entries.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === active?.id }} onPress={() => selectCalendar(item.id)} style={s.calendarOption}><CalendarDays size={21} color={colors.blue} /><Text style={[u.label, { flex: 1 }]}>{item.name}</Text>{item.id === active?.id && <Check size={19} color={colors.blue} />}</Pressable>)}{canWrite && <Button secondary icon={Plus} onPress={() => { setName(''); open('create'); }}>{t.createCalendar}</Button>}</ScrollView>}
      {sheet.type === 'create' && <View style={s.sheetContent}><Field label={t.calendarName} value={name} onChangeText={setName} maxLength={100} autoFocus editable={!busy} onSubmitEditing={createCalendar} /><Button disabled={busy || !name.trim()} onPress={createCalendar}>{busy ? t.refreshing : t.createCalendar}</Button></View>}
      {sheet.type === 'date' && <View style={s.sheetContent}><Field label={t.date} value={jump} onChangeText={setJump} placeholder={t.dateHint} maxLength={10} autoCapitalize="none" keyboardType="numbers-and-punctuation" /><Button onPress={() => { const value = calendar.parseDateKey(jump.trim()); if (!validDate(value)) { setMessage(t.invalidDate); return; } selectDate(value); setSheet(null); }}>{t.jump}</Button></View>}
    </Sheet>}
    {!sheet && !!message && <View style={s.inlineError}><Text accessibilityRole="alert" style={u.error}>{message}</Text></View>}
  </View>;
}

function ActivityCard({ event, kids, language, onPress, showDate }) {
  const t = getCopy(language), palette = personColor(event, kids), cancelled = event.status === 'cancelled';
  const people = calendar.kidsForEvent(event, kids).map(kid => kid.name).join(', ');
  const person = isFamily(event) ? t.family : people || String(event.child || '');
  const time = event.allDay ? t.allDay : `${calendar.formatTime(event.start, language) || t.untimed}${calendar.formatTime(event.end, language) ? ` – ${calendar.formatTime(event.end, language)}` : ''}`;
  const label = [cancelled && t.cancelled, event.title, time, person, event.location, event.responsible].filter(Boolean).join(', ');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.activity, { borderLeftColor: palette.line }, (pressed || cancelled) && { opacity: 0.6 }]}>
    <View style={s.cardTop}><Text style={[s.time, { color: palette.ink }]}>{time}</Text>{event.importance === 'high' && <Text style={s.important}>!</Text>}<ChevronRight size={17} color={colors.muted} /></View>
    {!!showDate && <Text style={s.meta}>{event.startDate || t.noDate}</Text>}
    <Text style={[s.activityTitle, cancelled && { textDecorationLine: 'line-through' }]}>{event.icon || '📅'}  {event.title || t.calendar}</Text>
    <View style={u.row}><View style={[s.dot, { backgroundColor: palette.line }]} /><Text style={[s.person, { color: palette.ink }]}>{person}</Text>{cancelled && <Text style={{ color: colors.red, fontSize: 12 }}>{t.cancelled}</Text>}</View>
    {!!event.location && <View style={u.row}><MapPin size={14} color={colors.muted} /><Text style={s.meta}>{event.location}</Text></View>}
    <View style={s.cardFooter}><UserRound size={14} color={colors.muted} /><Text style={[s.meta, { flex: 1 }]}>{t.pickup}: {event.responsible || t.noAdult}</Text>{event.recurrence && event.recurrence !== 'none' && <Repeat2 size={15} color={colors.muted} />}</View>
  </Pressable>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page }, controls: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 12, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }, calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }, calendarSelector: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colors.white }, calendarName: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700' }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 11 }, dateButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }, period: { fontSize: 18, fontWeight: '700', color: colors.ink }, today: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12 }, todayText: { color: colors.blue, fontSize: 13, fontWeight: '600' }, views: { flexDirection: 'row', backgroundColor: '#EDF2F4', borderRadius: 13, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }, viewButton: { flex: 1, minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, viewSelected: { backgroundColor: colors.blue }, viewText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 88 }, planning: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }, search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingLeft: 12, paddingRight: 3, marginBottom: 13 }, searchInput: { flex: 1, minWidth: 0, minHeight: 46, fontSize: 14, color: colors.ink }, agendaHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 17, marginBottom: 13 }, agendaTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', flex: 1 }, count: { minWidth: 25, minHeight: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9F0EF' }, countText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, center: { textAlign: 'center' }, activity: { borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderRadius: 17, backgroundColor: colors.white, padding: 15, marginBottom: 12, gap: 9 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, time: { flex: 1, fontSize: 13, fontWeight: '600' }, important: { color: colors.red, fontSize: 17, fontWeight: '800' }, activityTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', lineHeight: 25 }, dot: { width: 7, height: 7, borderRadius: 4 }, person: { fontSize: 13, fontWeight: '600', flexShrink: 1 }, meta: { color: colors.muted, fontSize: 13, lineHeight: 20, flexShrink: 1 }, cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EDF1F2' }, syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, syncText: { fontSize: 12, color: colors.muted }, add: { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#173F58', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  notice: { backgroundColor: '#E8F3EB', padding: 12, color: colors.green, fontSize: 13 }, errorBanner: { backgroundColor: '#FFF1F2', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, sheetFeedback: { paddingHorizontal: 20, paddingBottom: 12, gap: 9 }, sheetContent: { padding: 20, paddingTop: 10, paddingBottom: 26 }, calendarOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 15, marginBottom: 10 }, inlineError: { padding: 12, backgroundColor: '#FFF1F2' },
});
