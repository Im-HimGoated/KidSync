import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Home, MapPin, Plus, RefreshCw, Repeat2, Search, Settings2, Undo2, UserPlus, UserRound, X } from 'lucide-react-native';
import scheduleReader from '../../../shared/backend/schedules';
import calendar from '../lib/calendar';
import model from './model';
import { ActivityDetails, ActivityEditor } from './ActivityEditor';
import { DateStrip, MonthGrid, WeekGrid } from './CalendarViews';
import { Button, ChoiceRow, Field, IconButton, personColor, Sheet, useCalendarUi } from './ui';
import getCopy, { dateLabel } from './copy';
import { useAppearance } from '../ui/AppearanceContext';

/**
 * Signed-in native calendar, with no auth/session or storage ownership.
 * Required write integration: client, userId, onSchedule(row).
 * onSchedule receives the confirmed {schedule, updated_at, calendarId?} row.
 * App owns account header, sign out, device gating and navigation.
 * Controlled selection: calendarId + onSelectCalendar(id).
 * Optional: snapshot instead of calendars; onOpenDashboard, onPreferences,
 * onShareCalendar(calendar), readOnly, initialDate (for deterministic previews).
 * Shared calendars require sharedAccess + sharedActivityActions + onSharedSchedule.
 * onSharedRefresh refreshes only shared data; owner callbacks never receive it.
 * calendarOwnerId disambiguates equal IDs from different owners. Selection sends
 * onSelectCalendar(id, entry), preserving one-argument owner integrations.
 */
export default function CalendarScreen(props) {
  const userId = props.userId || props.user?.id || '';
  return <CalendarAccount key={userId || 'signed-out'} {...props} userId={userId} />;
}

const eventsIn = data => (Array.isArray(data?.activities) ? data.activities : []).filter(event => event && typeof event === 'object');
const kidsIn = data => (Array.isArray(data?.kids) ? data.kids : []).filter(kid => kid && typeof kid.name === 'string' && kid.name.trim());
const isFamily = event => !event.child || event.child === '__family__';
const validDate = date => date instanceof Date && Number.isFinite(date.getTime());
const repeated = model.isRecurringActivity;
const displayText = value => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

function CalendarAccount({ userId, client, calendars, snapshot, calendarId, calendarOwnerId, activeCalendarId, language = 'en', preferences,
  loading = false, syncStatus, status, error, onSchedule, onSelectCalendar, onRefresh, onOpenDashboard, onPreferences,
  onShareCalendar, readOnly = false, initialDate, focusDate, activityActions,
  sharedAccess, sharedActivityActions, onSharedSchedule, onSharedRefresh }) {
  const { colors, palettes } = useAppearance();
  const { u } = useCalendarUi();
  const s = useMemo(() => createStyles(colors), [colors]);
  const t = getCopy(language), display = model.normalizeDisplayPreferences(preferences);
  const initial = initialDate instanceof Date ? initialDate : calendar.parseDateKey(initialDate);
  const [date, setDate] = useState(() => validDate(initial) ? new Date(initial) : new Date());
  const [view, setView] = useState(display.view), [person, setPerson] = useState('all'), [query, setQuery] = useState('');
  const [localId, setLocalId] = useState(null), [sheet, setSheet] = useState(null), [busy, setBusy] = useState(false);
  const [localOwnerId, setLocalOwnerId] = useState(null);
  const [refreshing, setRefreshing] = useState(false), [message, setMessage] = useState(''), [notice, setNotice] = useState('');
  const [conflicted, setConflicted] = useState(false), [name, setName] = useState(''), [jump, setJump] = useState('');
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [undo, setUndo] = useState(null);
  const [sharedBlocked, setSharedBlocked] = useState(null);
  const draftDirty = useRef(false), onDirtyChange = useCallback(value => { draftDirty.current = value; }, []);
  const mounted = useRef(true), mutation = useRef(false), refreshingRef = useRef(false), calendarScope = useRef(null);
  const viewPreference = useRef(display.view);
  const rowSnapshot = snapshot?.schedule || snapshot;
  const entries = Array.isArray(calendars) ? calendars : scheduleReader.calendarEntries(rowSnapshot);
  const selectedId = calendarId ?? activeCalendarId ?? localId ?? rowSnapshot?.activeCalendarId;
  const selectedOwnerId = calendarOwnerId ?? localOwnerId;
  const active = entries.find(item => item.id === selectedId && (!selectedOwnerId || (item.ownerId || userId) === selectedOwnerId)) || entries[0];
  const scopeId = JSON.stringify([userId, active?.ownerId || userId, active?.id || '']);
  calendarScope.current = scopeId;
  const events = eventsIn(active?.data), kids = kidsIn(active?.data);
  const filtered = model.filterActivities(events, kids, { person, query });
  const dayEvents = model.sortAgenda(calendar.eventsForDate(filtered, date), date);
  const searchActive = !!query.trim(), filtersActive = searchActive || person !== 'all';
  const shownEvents = searchActive ? model.sortAgenda(filtered).sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || ''))) : dayEvents;
  const access = model.calendarAccess({ userId, client, calendar: active, onSchedule, readOnly, sharedAccess, sharedActivityActions, onSharedSchedule });
  const isShared = access.shared, blocked = sharedBlocked?.scopeId === scopeId;
  const canWrite = access.canWrite && !blocked;
  const canCreate = canWrite && !isShared;
  const writePermission = useRef(canWrite);
  writePermission.current = canWrite;
  const writableEvent = event => canWrite && !event?.externalSource && !event?.isBuiltInHoliday;

  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (viewPreference.current !== display.view) { viewPreference.current = display.view; setView(display.view); }
  }, [display.view]);
  useEffect(() => {
    const focused = calendar.parseDateKey(focusDate);
    if (validDate(focused)) setDate(focused);
  }, [focusDate]);
  useEffect(() => { setPerson('all'); setQuery(''); setSheet(null); setMessage(''); setUndo(null); setSharedBlocked(null); setDiscardConfirm(false); draftDirty.current = false; }, [active?.id, active?.ownerId]);
  useEffect(() => { if (isShared && !canWrite) setUndo(null); }, [isShared, canWrite]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);

  const actions = useMemo(() => model.createCalendarActions({
    client, userId, onSchedule: isShared ? onSharedSchedule : onSchedule,
    activityActions: isShared ? sharedActivityActions : activityActions,
    sharedScope: isShared ? { ownerId: active.ownerId, calendarId: active.id } : null,
    onSelectCalendar: id => { setLocalId(id); onSelectCalendar?.(id); },
    isCurrent: () => mounted.current && calendarScope.current === scopeId && (!isShared || writePermission.current),
  }), [client, userId, onSchedule, onSelectCalendar, scopeId, activityActions, isShared, sharedActivityActions, onSharedSchedule]);

  function describeError(failure) {
    if (failure?.code === 'CONFLICT') return t.conflict;
    if (failure?.code === 'SYNC_CONFLICT') return t.syncConflict;
    if (failure?.code === 'QUEUE_FULL') return t.queueFull;
    if (['STORAGE_ERROR', 'STORAGE_FULL', 'CACHE_INVALID'].includes(failure?.code)) return t.storageFailed;
    if (failure?.code === 'FORBIDDEN') return t.permission;
    if (failure?.code === 'SETUP_REQUIRED') return t.sharedSetup;
    return t.saveFailed;
  }
  async function mutate(work, success) {
    if (!canWrite || mutation.current) return false;
    mutation.current = true; setBusy(true); setMessage(''); setConflicted(false);
    try {
      const row = await work();
      if (!mounted.current || calendarScope.current !== scopeId) return false;
      success?.(row);
      return true;
    } catch (failure) {
      if (failure?.code === 'STALE_SCOPE') return false;
      if (mounted.current && calendarScope.current === scopeId) {
        if (isShared && ['FORBIDDEN', 'SETUP_REQUIRED'].includes(failure?.code)) { setSharedBlocked({ scopeId, code: failure.code }); setUndo(null); }
        setMessage(describeError(failure)); setConflicted(failure?.code === 'CONFLICT');
      }
      return false;
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function refresh() {
    if (refreshingRef.current || busy || !userId) return;
    const refreshScope = calendarScope.current;
    refreshingRef.current = true; setRefreshing(true);
    try {
      if (isShared) {
        if (typeof onSharedRefresh !== 'function') throw new Error('Shared refresh is unavailable');
        const result = await onSharedRefresh();
        if (result && mounted.current && calendarScope.current === refreshScope) {
          model.checkedSharedResult(result, { ownerId: active.ownerId, calendarId: active.id });
          await onSharedSchedule?.(result);
        }
        if (mounted.current && calendarScope.current === refreshScope) setSharedBlocked(null);
      } else if (onRefresh) await onRefresh();
      else if (client) { const row = await scheduleReader.readSchedule(client, userId); if (mounted.current && calendarScope.current === refreshScope && row) onSchedule?.(row); }
      if (mounted.current && calendarScope.current === refreshScope && !conflicted) setMessage('');
    } catch (failure) {
      if (mounted.current && calendarScope.current === refreshScope) {
        if (isShared && ['FORBIDDEN', 'SETUP_REQUIRED'].includes(failure?.code)) {
          setSharedBlocked({ scopeId, code: failure.code }); setUndo(null); setMessage(describeError(failure));
        } else setMessage(t.loadFailed);
      }
    }
    finally { refreshingRef.current = false; if (mounted.current) setRefreshing(false); }
  }
  function closeSheet() { setSheet(null); setMessage(''); setConflicted(false); setDiscardConfirm(false); draftDirty.current = false; }
  function requestClose() {
    if (busy) return;
    if (discardConfirm) { setDiscardConfirm(false); return; }
    if (['new', 'edit'].includes(sheet?.type) && draftDirty.current) { setDiscardConfirm(true); return; }
    closeSheet();
  }
  function open(type, extra = {}) { if (busy) return; setMessage(''); setConflicted(false); setDiscardConfirm(false); draftDirty.current = false; setSheet({ type, ...extra }); }
  function selectCalendar(item) { if (busy) return; setLocalId(item.id); setLocalOwnerId(item.ownerId || userId); onSelectCalendar?.(item.id, item); setSheet(null); }
  function showEvent(event, occurrence = date, occurrenceStartDate) { open('details', { event, occurrenceDate: calendar.dateKey(occurrence), occurrenceStartDate }); }
  function chooseScope(operation, event, occurrenceDate = sheet?.occurrenceDate || calendar.dateKey(date)) {
    if (!writableEvent(event)) return;
    if (!repeated(event)) {
      if (operation === 'edit') open('edit', { event, occurrenceDate });
      else open('delete', { event, occurrenceDate, scope: 'series' });
      return;
    }
    open('scope', { event, occurrenceDate, occurrenceStartDate: sheet?.occurrenceStartDate, operation });
  }
  function chooseOccurrence(startDate) {
    if (!sheet?.event || busy) return;
    const original = sheet.event;
    const occurrence = calendar.occurrencesForDate(original, sheet.occurrenceDate).find(item => item.startDate === startDate);
    if (!occurrence) { setMessage(t.occurrenceUnavailable); return; }
    if (sheet.operation === 'delete') open('delete', { event: original, occurrenceDate: sheet.occurrenceDate, occurrenceStartDate: startDate, occurrenceEndDate: occurrence.endDate, scope: 'occurrence' });
    else {
      try { open('edit', { event: model.occurrenceDraft(original, startDate), seriesOriginal: original, occurrenceDate: sheet.occurrenceDate, occurrenceStartDate: startDate, scope: 'occurrence' }); }
      catch { setMessage(t.occurrenceUnavailable); }
    }
  }
  function chooseSeries() {
    if (!sheet?.event || busy) return;
    open(sheet.operation === 'delete' ? 'delete' : 'edit', { event: sheet.event, occurrenceDate: sheet.occurrenceDate, scope: 'series' });
  }
  function selectDate(value) { if (validDate(value)) { setDate(new Date(value)); setQuery(''); } }
  function resetFilters() { setPerson('all'); setQuery(''); }
  async function saveActivity(event, options) {
    if (!active || !writableEvent(options?.original)) return false;
    return mutate(() => sheet?.scope === 'occurrence'
      ? actions.saveOccurrence(active.id, sheet.seriesOriginal, sheet.occurrenceStartDate, event)
      : actions.save(active.id, event, options?.original), row => {
      selectDate(calendar.parseDateKey(event.startDate)); resetFilters(); closeSheet(); setNotice(row.pending ? t.pendingSaved : t.saved);
    });
  }
  async function deleteActivity(event, options = {}) {
    if (!active || !writableEvent(event)) return false;
    const deletedScope = scopeId, deletedCalendarId = active.id;
    return mutate(() => options.scope === 'occurrence'
      ? actions.removeOccurrence(active.id, event, options.occurrenceStartDate)
      : actions.remove(active.id, event.id, event), row => {
      closeSheet(); setNotice(row.pending ? t.pendingSaved : t.removed);
      setUndo(!row.pending && row.undoToken ? { token: row.undoToken, scopeId: deletedScope, calendarId: deletedCalendarId } : null);
    });
  }
  async function undoDelete() {
    if (!undo || undo.scopeId !== scopeId) return;
    return mutate(() => actions.restore(undo.calendarId, undo.token), () => { setUndo(null); setNotice(t.restored); });
  }
  async function createCalendar() {
    if (!canCreate) return false;
    const value = name.trim();
    if (!value || value.length > 100) { setMessage(t.invalidName); return; }
    return mutate(() => actions.create(value), () => { setName(''); setSheet(null); setNotice(t.created); });
  }
  function jumpToDate() {
    const value = calendar.parseDateKey(jump.trim());
    if (!validDate(value)) { setMessage(t.invalidDate); return; }
    selectDate(value); setSheet(null); setMessage('');
  }

  const headerDate = dateLabel(date, language, { weekday: 'long', month: 'short', day: 'numeric' });
  const sheetTitle = { calendars: t.calendars, create: t.createCalendar, date: t.datePicker, new: t.add, edit: t.edit, details: t.details, scope: sheet?.operation === 'delete' ? t.deleteScope : t.editScope, delete: t.deleteTitle }[sheet?.type];
  const occurrences = sheet?.type === 'scope' ? calendar.occurrencesForDate(sheet.event, sheet.occurrenceDate)
    .filter(item => !sheet.occurrenceStartDate || item.startDate === sheet.occurrenceStartDate) : [];
  const occurrenceLabel = item => {
    const start = dateLabel(calendar.parseDateKey(item.startDate), language, { month: 'short', day: 'numeric', year: 'numeric' });
    return item.endDate && item.endDate !== item.startDate ? `${start} – ${dateLabel(calendar.parseDateKey(item.endDate), language, { month: 'short', day: 'numeric', year: 'numeric' })}` : start;
  };
  const filters = [{ value: 'all', label: t.everyone }, ...kids.map(kid => ({ value: kid.name, label: kid.name, color: personColor({ child: kid.name }, kids, palettes).line }))];
  const pending = loading && !active;

  return <View style={s.page}>
    <View style={s.controls}>
      <View style={s.calendarRow}>
        {onOpenDashboard && <IconButton icon={Home} label={t.dashboard} onPress={onOpenDashboard} />}
        <Pressable accessibilityRole="button" accessibilityLabel={t.calendars} onPress={() => open('calendars')} disabled={busy} style={s.calendarSelector}>
          <CalendarDays size={20} color={colors.primary} /><Text numberOfLines={1} style={s.calendarName}>{displayText(active?.name) || t.calendars}</Text><ChevronDown size={17} color={colors.muted} />
        </Pressable>
        {!!onShareCalendar && <Button secondary icon={UserPlus} onPress={() => onShareCalendar(active)} disabled={!active || busy} style={{ paddingHorizontal: 12 }}>{t.share}</Button>}
        {!!active && canWrite && <IconButton icon={Plus} label={t.add} onPress={() => open('new')} disabled={busy} />}
        {!!onPreferences && <IconButton icon={Settings2} label={t.openPreferences} onPress={onPreferences} />}
      </View>
      <View style={s.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.datePicker} onPress={() => { setJump(calendar.dateKey(date)); open('date'); }} style={s.dateButton}>
          <Text style={s.period}>{dateLabel(date, language, { month: 'long', year: 'numeric' })}</Text><ChevronDown size={15} color={colors.muted} />
        </Pressable>
        <View style={u.row}><IconButton icon={ChevronLeft} label={t.previousPeriod[view]} onPress={() => selectDate(model.movePeriod(date, view, -1))} /><Pressable accessibilityRole="button" accessibilityLabel={t.goToday} onPress={() => selectDate(new Date())} style={s.today}><Text style={s.todayText}>{t.today}</Text></Pressable><IconButton icon={ChevronRight} label={t.nextPeriod[view]} onPress={() => selectDate(model.movePeriod(date, view, 1))} /></View>
      </View>
      <View style={s.views}>{['agenda', 'week', 'month'].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: view === value }} onPress={() => { setView(value); setQuery(''); }} style={[s.viewButton, view === value && s.viewSelected]}><Text style={[s.viewText, view === value && { color: colors.onPrimary }]}>{t[value]}</Text></Pressable>)}</View>
    </View>
    {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
    {!!undo && undo.scopeId === scopeId && <View style={s.undoBanner}><Text style={[u.body, { flex: 1 }]}>{t.deletedUndo}</Text><Button secondary icon={Undo2} disabled={busy} onPress={undoDelete}>{t.undo}</Button><IconButton icon={X} label={t.dismissUndo} disabled={busy} onPress={() => setUndo(null)} /></View>}
    {!!error && <Pressable accessibilityRole="button" accessibilityLabel={`${t.loadFailed} ${t.refresh}`} accessibilityState={{ disabled: refreshing || busy }} disabled={refreshing || busy} onPress={refresh} style={s.errorBanner}><Text style={[u.error, { flex: 1 }]}>{t.loadFailed}</Text><RefreshCw size={18} color={colors.error} /></Pressable>}
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
      <View style={s.search}><Search size={18} color={colors.muted} /><TextInput accessibilityLabel={t.search} value={query} onChangeText={setQuery} placeholder={t.searchPlaceholder} placeholderTextColor={colors.muted} style={s.searchInput} autoCorrect={false} returnKeyType="search" />{!!query && <IconButton icon={X} label={t.clear} onPress={() => setQuery('')} />}</View>
      <Text style={s.planning}>{isShared ? t.sharedOnline : t.planning[display.people]}</Text>
      {searchActive && <Text style={s.searchScope}>{t.searchScope}</Text>}
      {!!kids.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 14 }}><ChoiceRow options={filters} value={person} onChange={setPerson} label={t.everyone} /></ScrollView>}
      {pending ? <View style={u.empty}><ActivityIndicator color={colors.primary} accessibilityLabel={t.loading} /><Text style={u.body}>{t.loading}</Text></View> : !active ? <View style={u.empty}><CalendarDays size={36} color={colors.primary} /><Text style={[u.heading, s.center]}>{t.noCalendar}</Text><Text style={[u.body, s.center]}>{t.noCalendarBody}</Text>{canCreate && <Button icon={Plus} onPress={() => open('create')}>{t.createCalendar}</Button>}</View> : <>
        {view === 'agenda' && <DateStrip date={date} firstDay={display.firstDay} events={filtered} kids={kids} language={language} onDate={selectDate} />}
        {view === 'month' && <MonthGrid date={date} firstDay={display.firstDay} events={filtered} kids={kids} language={language} onDate={selectDate} />}
        {view === 'week' && <WeekGrid date={date} firstDay={display.firstDay} initialHour={display.initialHour} events={filtered} kids={kids} language={language} onDate={selectDate} onEvent={showEvent} />}
        <View style={s.agendaHeading}><Text accessibilityRole="header" style={s.agendaTitle}>{searchActive ? t.searchResults : headerDate}</Text><View style={s.count}><Text style={s.countText}>{shownEvents.length}</Text></View></View>
        {shownEvents.length ? shownEvents.map((event, index) => <ActivityCard key={`${event.id ?? 'activity'}:${index}`} event={event} date={date} kids={kids} language={language} showDate={searchActive} onPress={() => showEvent(event, searchActive && validDate(calendar.parseDateKey(event.startDate)) ? calendar.parseDateKey(event.startDate) : date)} />) : <View style={u.empty}><CalendarDays size={28} color={colors.success} /><Text style={[u.heading, s.center]}>{filtersActive ? t.noResults : t.empty}</Text><Text style={[u.body, s.center]}>{filtersActive ? t.filteredBody : t.emptyBody}</Text>{filtersActive ? <Button secondary icon={X} onPress={resetFilters}>{t.resetFilters}</Button> : canWrite && <Button secondary icon={Plus} onPress={() => open('new')}>{t.add}</Button>}</View>}
        <View style={s.syncRow}><Text style={s.syncText}>{refreshing ? t.refreshing : t.refresh}</Text><IconButton icon={RefreshCw} label={t.refresh} onPress={refresh} disabled={refreshing || busy} color={colors.muted} /></View>
        {!canWrite && <Text style={[u.body, s.center]}>{isShared && sharedAccess?.stale ? t.sharedStale
          : isShared && (access.setupRequired || sharedBlocked?.code === 'SETUP_REQUIRED') ? t.sharedSetup : t.readOnly}</Text>}
      </>}
    </ScrollView>
    {!!sheet && <Sheet title={sheetTitle} closeLabel={t.close} busy={busy} onClose={requestClose}>
      {discardConfirm && <View style={s.discardConfirm}>
        <Text accessibilityRole="header" style={u.heading}>{t.discardTitle}</Text><Text style={u.body}>{t.discardBody}</Text>
        <Button onPress={() => setDiscardConfirm(false)}>{t.keepEditing}</Button><Button danger onPress={closeSheet}>{t.discardChanges}</Button>
      </View>}
      {!!message && <View style={s.sheetFeedback}><Text accessibilityRole="alert" style={u.error}>{message}</Text>{conflicted && <Button secondary icon={RefreshCw} onPress={refresh} disabled={refreshing}>{t.conflictRefresh}</Button>}</View>}
      {sheet.type === 'details' && <ActivityDetails event={sheet.event} occurrenceDate={sheet.occurrenceDate} occurrenceStartDate={sheet.occurrenceStartDate} kids={kids} language={language} canEdit={writableEvent(sheet.event)} busy={busy} onEdit={event => chooseScope('edit', event)} onDelete={deleteActivity} onDeleteRequest={repeated(sheet.event) ? event => chooseScope('delete', event) : undefined} />}
      {['new', 'edit'].includes(sheet.type) && (canWrite || isShared) && <View accessibilityElementsHidden={discardConfirm} importantForAccessibility={discardConfirm ? 'no-hide-descendants' : 'auto'} style={{ flexShrink: 1, display: discardConfirm ? 'none' : 'flex' }}>
        <ActivityEditor event={sheet.type === 'edit' ? sheet.event : null} date={date} kids={kids} preferences={preferences} language={language} busy={busy} disabled={!canWrite} error={message} onSave={saveActivity} onCancel={requestClose} onDirtyChange={onDirtyChange} scope={sheet.scope} />
      </View>}
      {sheet.type === 'scope' && <ScrollView contentContainerStyle={[s.sheetContent, s.scopeContent]}>
        <Text style={u.heading}>{displayText(sheet.event.title) || t.calendar}</Text><Text style={u.body}>{t.scopeBody}</Text>
        {occurrences.length > 1 && <Text style={u.body}>{t.overlappingOccurrences}</Text>}
        {occurrences.map(item => <Button key={item.startDate} secondary onPress={() => chooseOccurrence(item.startDate)} label={`${t.thisEvent}: ${occurrenceLabel(item)}`}>{t.thisEvent}{'\n'}{occurrenceLabel(item)}</Button>)}
        {!occurrences.length && <Text style={u.body}>{t.occurrenceUnavailable}</Text>}
        <Button secondary icon={Repeat2} onPress={chooseSeries}>{t.entireSeries}</Button><Button secondary onPress={() => showEvent(sheet.event, calendar.parseDateKey(sheet.occurrenceDate), sheet.occurrenceStartDate)}>{t.cancel}</Button>
      </ScrollView>}
      {sheet.type === 'delete' && <ScrollView contentContainerStyle={[s.sheetContent, s.scopeContent]}>
        <Text style={u.heading}>{displayText(sheet.event.title) || t.calendar}</Text><Text style={u.body}>{sheet.scope === 'occurrence' ? t.deleteOccurrenceBody : t.deleteSeriesBody}</Text>
        {sheet.scope === 'occurrence' && <Text style={u.label}>{occurrenceLabel({ startDate: sheet.occurrenceStartDate, endDate: sheet.occurrenceEndDate })}</Text>}
        <Button secondary disabled={busy} onPress={() => showEvent(sheet.event, calendar.parseDateKey(sheet.occurrenceDate), sheet.occurrenceStartDate)}>{t.keepActivity}</Button>
        <Button danger disabled={busy} onPress={() => deleteActivity(sheet.event, sheet)}>{busy ? t.deleting : sheet.scope === 'occurrence' ? t.deleteThisEvent : t.deleteEntireSeries}</Button>
      </ScrollView>}
      {sheet.type === 'calendars' && <ScrollView contentContainerStyle={s.sheetContent}>{entries.map(item => <Pressable key={JSON.stringify([item.ownerId || userId, item.id])} accessibilityRole="button" accessibilityState={{ selected: item === active }} onPress={() => selectCalendar(item)} style={s.calendarOption}><CalendarDays size={21} color={colors.primary} /><Text style={[u.label, { flex: 1 }]}>{displayText(item.name) || t.calendar}</Text>{item === active && <Check size={19} color={colors.primary} />}</Pressable>)}{canCreate && <Button secondary icon={Plus} onPress={() => { setName(''); open('create'); }}>{t.createCalendar}</Button>}</ScrollView>}
      {sheet.type === 'create' && <View style={s.sheetContent}><Field label={t.calendarName} value={name} onChangeText={setName} maxLength={100} autoFocus editable={!busy} onSubmitEditing={createCalendar} /><Button disabled={busy || !name.trim()} onPress={createCalendar}>{busy ? t.refreshing : t.createCalendar}</Button></View>}
      {sheet.type === 'date' && <View style={s.sheetContent}><Field label={t.date} value={jump} onChangeText={value => { setJump(value); setMessage(''); }} placeholder={t.dateHint} maxLength={10} autoFocus autoCapitalize="none" keyboardType="numbers-and-punctuation" returnKeyType="go" onSubmitEditing={jumpToDate} /><Button onPress={jumpToDate}>{t.jump}</Button></View>}
    </Sheet>}
    {!sheet && !!message && <View style={s.inlineError}><Text accessibilityRole="alert" style={u.error}>{message}</Text></View>}
  </View>;
}

function ActivityCard({ event, date, kids, language, onPress, showDate }) {
  const { colors, palettes } = useAppearance();
  const { u } = useCalendarUi();
  const s = useMemo(() => createStyles(colors), [colors]);
  const t = getCopy(language), palette = personColor(event, kids, palettes), cancelled = event.status === 'cancelled';
  const people = calendar.kidsForEvent(event, kids).map(kid => displayText(kid.name)).filter(Boolean).join(', ');
  const person = isFamily(event) ? t.family : people || displayText(event.child) || t.family;
  const title = displayText(event.title) || t.calendar, location = displayText(event.location), responsible = displayText(event.responsible);
  const segment = showDate ? null : calendar.daySegment(event, date);
  const overlapping = (segment?.occurrences.length || 0) > 1;
  const startTime = !overlapping && segment?.continuesBefore ? t.continuesBefore : calendar.formatTime(event.start, language) || t.untimed;
  const endTime = !overlapping && segment?.continuesAfter ? t.continuesAfter : calendar.formatTime(event.end, language);
  const time = overlapping ? t.multipleOccurrences : event.allDay ? t.allDay : `${startTime}${endTime ? ` – ${endTime}` : ''}`;
  const label = [cancelled && t.cancelled, title, showDate && (displayText(event.startDate) || t.noDate), time, person, location, responsible].filter(Boolean).join(', ');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.activity, { borderLeftColor: palette.line }, (pressed || cancelled) && { opacity: 0.6 }]}>
    <View style={s.cardTop}><Text style={[s.time, { color: palette.ink }]}>{time}</Text>{event.importance === 'high' && <Text style={s.important}>!</Text>}<ChevronRight size={17} color={colors.muted} /></View>
    {!!showDate && <Text style={s.meta}>{displayText(event.startDate) || t.noDate}</Text>}
    <Text style={[s.activityTitle, cancelled && { textDecorationLine: 'line-through' }]}>{displayText(event.icon) || '📅'}  {title}</Text>
    <View style={u.row}><View style={[s.dot, { backgroundColor: palette.line }]} /><Text style={[s.person, { color: palette.ink }]}>{person}</Text>{cancelled && <Text style={{ color: colors.error, fontSize: 12 }}>{t.cancelled}</Text>}</View>
    {!!location && <View style={u.row}><MapPin size={14} color={colors.muted} /><Text style={s.meta}>{location}</Text></View>}
    <View style={s.cardFooter}><UserRound size={14} color={colors.muted} /><Text style={[s.meta, { flex: 1 }]}>{t.pickup}: {responsible || t.noAdult}</Text>{!!event.recurrence && event.recurrence !== 'none' && <Repeat2 size={15} color={colors.muted} />}</View>
  </Pressable>;
}

const createStyles = colors => StyleSheet.create({
  scopeContent: { gap: 14 }, undoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.successSoft },
  searchScope: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }, discardConfirm: { padding: 20, paddingTop: 8, gap: 12, backgroundColor: colors.warningSoft, borderBottomWidth: 1, borderBottomColor: colors.line },
  page: { flex: 1, backgroundColor: colors.page }, controls: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }, calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }, calendarSelector: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colors.surface }, calendarName: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700' }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 11 }, dateButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }, period: { fontSize: 18, fontWeight: '700', color: colors.ink }, today: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12 }, todayText: { color: colors.primary, fontSize: 13, fontWeight: '600' }, views: { flexDirection: 'row', backgroundColor: colors.input, borderRadius: 13, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }, viewButton: { flex: 1, minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, viewSelected: { backgroundColor: colors.primary }, viewText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 32 }, planning: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }, search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingLeft: 12, paddingRight: 3, marginBottom: 13 }, searchInput: { flex: 1, minWidth: 0, minHeight: 46, fontSize: 14, color: colors.ink }, agendaHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 17, marginBottom: 13 }, agendaTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', flex: 1 }, count: { minWidth: 25, minHeight: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, countText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, center: { textAlign: 'center' }, activity: { borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderRadius: 17, backgroundColor: colors.surface, padding: 15, marginBottom: 12, gap: 9 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, time: { flex: 1, fontSize: 13, fontWeight: '600' }, important: { color: colors.error, fontSize: 17, fontWeight: '800' }, activityTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', lineHeight: 25 }, dot: { width: 7, height: 7, borderRadius: 4 }, person: { fontSize: 13, fontWeight: '600', flexShrink: 1 }, meta: { color: colors.muted, fontSize: 13, lineHeight: 20, flexShrink: 1 }, cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }, syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, syncText: { fontSize: 12, color: colors.muted },
  notice: { backgroundColor: colors.successSoft, padding: 12, color: colors.success, fontSize: 13 }, errorBanner: { backgroundColor: colors.errorSoft, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, sheetFeedback: { paddingHorizontal: 20, paddingBottom: 12, gap: 9 }, sheetContent: { padding: 20, paddingTop: 10, paddingBottom: 26 }, calendarOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 15, marginBottom: 10 }, inlineError: { padding: 12, backgroundColor: colors.errorSoft },
});
