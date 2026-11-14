import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Home, MapPin, MessageCircle, Plus, RefreshCw, Repeat2, Search, Settings2, SlidersHorizontal, Undo2, UserPlus, UserRound, X } from 'lucide-react-native';
import scheduleReader from '../../../shared/backend/schedules';
import calendar from '../lib/calendar';
import model from './model';
import { ActivityDetails, ActivityEditor } from './ActivityEditor';
import { CalendarViewPicker, DateStrip, FullMonthPage, WeekGrid } from './CalendarViews';
import { Button, ChoiceRow, Field, IconButton, personColor, Sheet, useCalendarUi } from './ui';
import getCopy, { dateLabel } from './copy';
import { useAppearance } from '../ui/AppearanceContext';
import PlanningTools, { planningCopy } from './PlanningTools';
import CalendarToolbox, { toolboxCopy } from '../ui/CalendarToolbox';
import CalendarComments, { calendarCommentsCopy } from '../ui/CalendarComments';
import focus from './focus';
import planning from './planning';
import eventOptions from './event-options';
import holidays from './holidays';
import ActivityLists from './ActivityLists';
import CalendarRecords from './CalendarRecords';
import QuickAdd from './QuickAdd';
import FamilyPoll from './FamilyPoll';
import FamilyTime from './FamilyTime';
import CalendarFiles, { calendarFilesAvailable } from './CalendarFiles';
import websiteTools from '../lib/website-tools';

const planningModes = { 'open-time': 'gaps', 'compare-days': 'compare', 'day-notes': 'notes', 'share-week': 'share', 'saved-views': 'views', 'find-events': 'find' };
const nativeTools = Object.fromEntries(Object.keys(planningModes).map(id => [id, true]));

/**
 * Signed-in native calendar, with no auth/session or storage ownership.
 * Required write integration: client, userId, onSchedule(row).
 * onSchedule receives the confirmed {schedule, updated_at, calendarId?} row.
 * App owns account header, sign out, device gating and navigation.
 * Controlled selection: calendarId + onSelectCalendar(id).
 * Optional: snapshot instead of calendars; onOpenDashboard, onPreferences,
 * onShareCalendar(calendar), readOnly, initialDate (for deterministic previews).
 * Increment focusRequest to revisit the same focusDate/focusTime after manual navigation.
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

function CalendarAccount({ userId, account, client, calendars, snapshot, calendarId, calendarOwnerId, activeCalendarId, language = 'en', preferences, commentsRequest, actionRequest,
  loading = false, syncStatus, status, error, onSchedule, onSelectCalendar, onRefresh, onOpenDashboard, onPreferences,
  onShareCalendar, onRestoreSnapshot, onSavePreset, onRenameCalendar, onDeleteCalendar, onImportActivities, readOnly = false, initialDate, focusDate, focusTime, focusRequest, activityActions,
  sharedAccess, sharedActivityActions, onSharedSchedule, onSharedRefresh }) {
  const { colors, palettes } = useAppearance();
  const { u } = useCalendarUi();
  const s = useMemo(() => createStyles(colors), [colors]);
  const t = getCopy(language), display = model.normalizeDisplayPreferences(preferences);
  const commentsCopy = calendarCommentsCopy[String(language).startsWith('zh') ? 'zh' : 'en'];
  const initial = initialDate instanceof Date ? initialDate : calendar.parseDateKey(initialDate);
  const [date, setDate] = useState(() => validDate(initial) ? new Date(initial) : new Date());
  const [view, setView] = useState(display.view), [person, setPerson] = useState('all'), [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState('all');
  const [hideWeekends, setHideWeekends] = useState(false);
  const [fullMonthOpen, setFullMonthOpen] = useState(display.view === 'month');
  const [localId, setLocalId] = useState(null), [sheet, setSheet] = useState(null), [busy, setBusy] = useState(false);
  const [localOwnerId, setLocalOwnerId] = useState(null);
  const [refreshing, setRefreshing] = useState(false), [message, setMessage] = useState(''), [notice, setNotice] = useState('');
  const [conflicted, setConflicted] = useState(false), [name, setName] = useState(''), [jump, setJump] = useState('');
  const [discardConfirm, setDiscardConfirm] = useState(false), [planningBusy, setPlanningBusy] = useState(false);
  const [undo, setUndo] = useState(null);
  const [sharedBlocked, setSharedBlocked] = useState(null);
  const [focusedHour, setFocusedHour] = useState(display.initialHour), [acceptedFocusRequest, setAcceptedFocusRequest] = useState(0);
  const draftDirty = useRef(false), onDirtyChange = useCallback(value => { draftDirty.current = value; }, []);
  const mounted = useRef(true), mutation = useRef(false), refreshingRef = useRef(false), calendarScope = useRef(null);
  const sheetVersion = useRef(0);
  const handledCommentsRequest = useRef(0);
  const handledActionRequest = useRef(0);
  const viewPreference = useRef(display.view);
  const monthReturnView = useRef(display.view === 'month' ? 'agenda' : display.view);
  const rowSnapshot = snapshot?.schedule || snapshot;
  const entries = Array.isArray(calendars) ? calendars : scheduleReader.calendarEntries(rowSnapshot);
  const selectedId = calendarId ?? activeCalendarId ?? localId ?? rowSnapshot?.activeCalendarId;
  const selectedOwnerId = calendarOwnerId ?? localOwnerId;
  const active = entries.find(item => item.id === selectedId && (!selectedOwnerId || (item.ownerId || userId) === selectedOwnerId)) || entries[0];
  const activeId = active?.id ?? null;
  const scopeId = JSON.stringify([userId, active?.ownerId || userId, active?.id || '']);
  calendarScope.current = scopeId;
  const events = eventsIn(active?.data), kids = kidsIn(active?.data);
  const year = date.getFullYear();
  const builtIns = useMemo(() => [year - 1, year, year + 1].flatMap(value => holidays.builtInHolidays(value, language)), [year, language]);
  const filtered = model.filterActivities([...events, ...builtIns].filter(event => holidays.matchesCategory(event, category)), kids, { person, query });
  const dayEvents = model.sortAgenda(calendar.eventsForDate(filtered, date), date);
  const searchActive = !!query.trim();
  const activeFilterCount = Number(searchActive) + Number(person !== 'all') + Number(category !== 'all');
  const filtersActive = activeFilterCount > 0;
  let shownEvents = dayEvents;
  if (searchActive) {
    const from = calendar.dateKey(calendar.addDays(date, -30));
    const through = calendar.dateKey(calendar.addDays(date, 335));
    try {
      shownEvents = planning.findEvents(filtered, from, through, '').map(event => ({
        event: filtered.find(item => String(item.id) === String(event.id)) || event,
        occurrenceDate: event.occurrenceDate,
      }));
    } catch { shownEvents = []; }
  }
  const access = model.calendarAccess({ userId, client, calendar: active, onSchedule, readOnly, sharedAccess, sharedActivityActions, onSharedSchedule });
  const isShared = access.shared, blocked = sharedBlocked?.scopeId === scopeId;
  const canWrite = access.canWrite && !blocked;
  const canCreate = canWrite && !isShared;
  const commentRole = isShared ? sharedAccess?.role || active?.role || 'viewer' : 'owner';
  const commentsAvailable = !!active && account?.id === userId && typeof account?.email === 'string' && !!account.email.trim();
  const writePermission = useRef(canWrite);
  writePermission.current = canWrite;
  const writableEvent = event => canWrite && !event?.externalSource && !event?.isBuiltInHoliday;

  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (viewPreference.current !== display.view) {
      viewPreference.current = display.view;
      if (display.view === 'month') { monthReturnView.current = 'agenda'; setView('month'); setFullMonthOpen(true); }
      else { monthReturnView.current = display.view; setView(display.view); setFullMonthOpen(false); }
    }
    setFocusedHour(display.initialHour);
  }, [display.view, display.initialHour]);
  useEffect(() => {
    const focused = calendar.parseDateKey(focusDate);
    if (validDate(focused)) {
      setDate(focused); setQuery(''); setPerson('all'); setFiltersOpen(false);
      setFocusedHour(focus.hourForTime(focusTime, display.initialHour));
      if (typeof focusTime === 'string' && focusTime) { setFullMonthOpen(false); setView('day'); }
      setAcceptedFocusRequest(value => value + 1);
    }
  }, [focusDate, focusTime, focusRequest]);
  useEffect(() => { setPerson('all'); setQuery(''); setCategory('all'); setFiltersOpen(false); setSheet(null); setMessage(''); setUndo(null); setSharedBlocked(null); setDiscardConfirm(false); draftDirty.current = false; }, [active?.id, active?.ownerId]);
  useEffect(() => {
    if (!actionRequest || actionRequest.id <= handledActionRequest.current || sheet || busy || planningBusy || loading
      || actionRequest.ownerId !== userId || isShared || actionRequest.calendarId !== activeId) return;
    handledActionRequest.current = actionRequest.id;
    if (actionRequest.type === 'create' && canCreate && activeId === null) {
      setName('');
      open('create');
    } else if (actionRequest.type === 'new' && canWrite && activeId !== null) {
      open('new');
    } else if (actionRequest.type === 'history' && activeId !== null) {
      open('records', { mode: 'activity' });
    } else if (actionRequest.type === 'details' && activeId !== null) {
      const targetDate = calendar.parseDateKey(actionRequest.date);
      const event = calendar.eventsForDate(events, targetDate).find(item => String(item.id) === String(actionRequest.eventId))
        || (validDate(targetDate) && holidays.builtInHolidays(targetDate.getFullYear(), language).find(item => item.id === actionRequest.eventId));
      if (event) showEvent(event, targetDate);
    }
  }, [actionRequest, activeId, active?.data, busy, canCreate, canWrite, isShared, language, loading, planningBusy, sheet, userId]);
  useEffect(() => {
    const id = Number(commentsRequest?.id);
    if (!commentsAvailable || !Number.isFinite(id) || id <= handledCommentsRequest.current || sheet || busy || planningBusy
      || commentsRequest.ownerId !== (active.ownerId || userId) || commentsRequest.calendarId !== active.id) return;
    handledCommentsRequest.current = id; open('comments');
  }, [commentsRequest, commentsAvailable, active?.ownerId, active?.id, userId, sheet, busy, planningBusy]);
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
  function closeSheet() { sheetVersion.current++; setSheet(null); setMessage(''); setConflicted(false); setDiscardConfirm(false); draftDirty.current = false; }
  function requestClose() {
    if (busy || planningBusy) return;
    if (discardConfirm) { setDiscardConfirm(false); return; }
    if (['new', 'edit', 'planning', 'comments'].includes(sheet?.type) && draftDirty.current) { setDiscardConfirm(true); return; }
    closeSheet();
  }
  function open(type, extra = {}) { if (busy) return; sheetVersion.current++; setMessage(''); setConflicted(false); setDiscardConfirm(false); draftDirty.current = false; setSheet({ type, ...extra }); }
  function selectCalendar(item) { if (busy) return; setLocalId(item.id); setLocalOwnerId(item.ownerId || userId); onSelectCalendar?.(item.id, item); setSheet(null); }
  function showEvent(event, occurrence = date, occurrenceStartDate) { open('details', { event, occurrenceDate: calendar.dateKey(occurrence), occurrenceStartDate }); }
  function openProposedEvent(draft) {
    if (!canWrite) return;
    selectDate(calendar.parseDateKey(draft.startDate));
    open('new', { copyDraft: draft });
  }
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
  function goToday() {
    const now = new Date();
    selectDate(now);
    setFocusedHour(now.getHours() + now.getMinutes() / 60);
    setAcceptedFocusRequest(value => value + 1);
  }
  function changeView(value) {
    if (value === 'month') { openFullMonth(); return; }
    setFullMonthOpen(false);
    setView(value);
    setQuery('');
  }
  function openDay(value, hour = focusedHour) {
    selectDate(value);
    setFocusedHour(hour);
    changeView('day');
  }
  function openFullMonth() {
    if (busy) return;
    monthReturnView.current = view === 'month' ? 'agenda' : view;
    setQuery(''); setFiltersOpen(false); setSheet(null); setView('month'); setFullMonthOpen(true);
  }
  function closeFullMonth() { setFullMonthOpen(false); setView(monthReturnView.current === 'month' ? 'agenda' : monthReturnView.current); }
  function openMonthDay(value) {
    if (!validDate(value)) return;
    openDay(value);
  }
  function addFromMonth() { setView('agenda'); setFullMonthOpen(false); open('new'); }
  function resetFilters() { setPerson('all'); setQuery(''); setCategory('all'); setFiltersOpen(false); }
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
  const toolsCopy = toolboxCopy[language] || toolboxCopy.en;
  const renameLabel = language === 'zh' ? '重命名日历' : 'Rename calendar';
  const saveLabel = language === 'zh' ? '保存名称' : 'Save name';
  const deleteCalendarLabel = language === 'zh' ? '删除日历' : 'Delete calendar';
  const canDeleteCalendar = canWrite && !isShared && !!onDeleteCalendar && entries.filter(item => !item.ownerId || item.ownerId === userId).length > 1;
  const canRestore = !isShared && !!onRestoreSnapshot && canWrite;
  const sheetTitle = { comments: commentsCopy.title, tools: toolsCopy.title, lists: toolsCopy.lists, quick: toolsCopy.quickAdd, poll: toolsCopy.poll, familyTime: toolsCopy.familyTime, files: toolsCopy.export,
    records: sheet?.mode === 'activity' ? toolsCopy.activityHistory : sheet?.mode === 'presets' ? toolsCopy.presets : toolsCopy.versionHistory,
    planning: (planningCopy[language] || planningCopy.en).title, calendars: t.calendars, create: t.createCalendar, rename: renameLabel, deleteCalendar: deleteCalendarLabel,
    date: t.datePicker, new: t.add, edit: t.edit, details: t.details, scope: sheet?.operation === 'delete' ? t.deleteScope : t.editScope, delete: t.deleteTitle }[sheet?.type];
  const occurrences = sheet?.type === 'scope' ? calendar.occurrencesForDate(sheet.event, sheet.occurrenceDate)
    .filter(item => !sheet.occurrenceStartDate || item.startDate === sheet.occurrenceStartDate) : [];
  const occurrenceLabel = item => {
    const start = dateLabel(calendar.parseDateKey(item.startDate), language, { month: 'short', day: 'numeric', year: 'numeric' });
    return item.endDate && item.endDate !== item.startDate ? `${start} – ${dateLabel(calendar.parseDateKey(item.endDate), language, { month: 'short', day: 'numeric', year: 'numeric' })}` : start;
  };
  const filters = [{ value: 'all', label: t.everyone }, ...kids.map(kid => ({ value: kid.name, label: kid.name, color: personColor({ child: kid.name }, kids, palettes).line }))];
  const pending = loading && !active;
  const showingFullMonth = fullMonthOpen && !!active;

  return <View style={s.page}>
    {!showingFullMonth && <View style={s.controls}>
      <View style={s.calendarRow}>
        {onOpenDashboard && <IconButton icon={Home} label={t.dashboard} onPress={onOpenDashboard} />}
        <Pressable accessibilityRole="button" accessibilityLabel={t.calendars} accessibilityHint={displayText(active?.name)} onPress={() => open('calendars')} disabled={busy} style={s.calendarSelector}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={s.calendarName}>{displayText(active?.name) || t.calendars}</Text>
          <ChevronDown size={17} color={colors.muted} />
        </Pressable>
        {!!onShareCalendar && <IconButton icon={UserPlus} label={t.share} color={colors.primary} onPress={() => onShareCalendar(active)} disabled={!active || busy} style={s.toolbarAction} />}
        {!!active && canWrite && <IconButton icon={Plus} label={t.add} color={colors.onPrimary} onPress={() => open('new')} disabled={busy} style={s.addAction} />}
        {!!active && <IconButton icon={SlidersHorizontal} label={language === 'zh' ? '日历工具' : 'Calendar tools'} disabled={busy} onPress={() => open('tools')} />}
        {!active && !!onPreferences && <IconButton icon={Settings2} label={t.openPreferences} onPress={onPreferences} />}
      </View>
      <View style={s.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.datePicker} onPress={() => { setJump(calendar.dateKey(date)); open('date'); }} style={s.dateButton}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={s.period}>{dateLabel(date, language, { month: 'short', year: 'numeric' })}</Text><ChevronDown size={15} color={colors.muted} />
        </Pressable>
        <View style={u.row}><IconButton icon={ChevronLeft} label={t.previousPeriod[view]} onPress={() => selectDate(model.movePeriod(date, view, -1))} /><Pressable accessibilityRole="button" accessibilityLabel={t.goToday} onPress={goToday} style={s.today}><Text style={s.todayText}>{t.today}</Text></Pressable><IconButton icon={ChevronRight} label={t.nextPeriod[view]} onPress={() => selectDate(model.movePeriod(date, view, 1))} /></View>
      </View>
      <CalendarViewPicker view={view} language={language} onChange={changeView} fourDays />
    </View>}
    {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
    {!!undo && undo.scopeId === scopeId && <View style={s.undoBanner}><Text style={[u.body, { flex: 1 }]}>{t.deletedUndo}</Text><Button secondary icon={Undo2} disabled={busy} onPress={undoDelete}>{t.undo}</Button><IconButton icon={X} label={t.dismissUndo} disabled={busy} onPress={() => setUndo(null)} /></View>}
    {!!error && <Pressable accessibilityRole="button" accessibilityLabel={`${t.loadFailed} ${t.refresh}`} accessibilityState={{ disabled: refreshing || busy }} disabled={refreshing || busy} onPress={refresh} style={s.errorBanner}><Text style={[u.error, { flex: 1 }]}>{t.loadFailed}</Text><RefreshCw size={18} color={colors.error} /></Pressable>}
    {showingFullMonth ? <FullMonthPage date={date} firstDay={display.firstDay} events={filtered} kids={kids} language={language}
      calendarName={displayText(active?.name) || t.calendar} canWrite={canWrite} onBack={closeFullMonth} onMonth={selectDate}
      onDate={selectDate} onOpenDay={openMonthDay} onEvent={showEvent} onAdd={addFromMonth} /> : <ScrollView nestedScrollEnabled style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
      <View style={s.filterBlock}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: filtersOpen }} accessibilityHint={t.findFilterHint}
          onPress={() => setFiltersOpen(value => !value)} style={s.filterToggle}>
          <Search size={19} color={colors.primary} />
          <View style={s.filterCopy}><Text style={s.filterTitle}>{t.findFilter}</Text><Text style={s.filterHint}>{filtersActive ? t.filtersOn : t.findFilterHint}</Text></View>
          {!!activeFilterCount && <View style={s.filterCount}><Text style={s.filterCountText}>{activeFilterCount}</Text></View>}
          <ChevronDown size={18} color={colors.muted} style={filtersOpen && s.filterExpanded} />
        </Pressable>
        {filtersOpen && <View style={s.filterPanel}>
          <View style={s.search}><Search size={18} color={colors.muted} /><TextInput accessibilityLabel={t.search} value={query} onChangeText={setQuery} placeholder={t.searchPlaceholder} placeholderTextColor={colors.muted} style={s.searchInput} autoCorrect={false} returnKeyType="search" />{!!query && <IconButton icon={X} label={t.clear} onPress={() => setQuery('')} />}</View>
          <ChoiceRow label={language === 'zh' ? '活动类别' : 'Event category'} value={category} onChange={setCategory}
            options={['all', 'holidays', 'special'].map((value, index) => ({ value,
              label: (language === 'zh' ? ['所有活动', '节日', '特别日期'] : ['All events', 'Holidays', 'Special days'])[index] }))} />
          {view === 'week' && <View style={u.row}><Text style={u.label}>{language === 'zh' ? '隐藏周末' : 'Hide weekends'}</Text>
            <Switch accessibilityLabel={language === 'zh' ? '隐藏周末' : 'Hide weekends'} value={hideWeekends} onValueChange={setHideWeekends} /></View>}
          {searchActive && <Text style={s.searchScope}>{t.searchScope}</Text>}
          {!!kids.length && <ScrollView horizontal showsHorizontalScrollIndicator={false}><ChoiceRow options={filters} value={person} onChange={setPerson} label={t.everyone} /></ScrollView>}
        </View>}
      </View>
      {pending ? <View style={u.empty}><ActivityIndicator color={colors.primary} accessibilityLabel={t.loading} /><Text style={u.body}>{t.loading}</Text></View> : !active ? <View style={u.empty}><CalendarDays size={36} color={colors.primary} /><Text style={[u.heading, s.center]}>{t.noCalendar}</Text><Text style={[u.body, s.center]}>{t.noCalendarBody}</Text>{canCreate && <Button icon={Plus} onPress={() => open('create')}>{t.createCalendar}</Button>}</View> : <>
        {!searchActive && view !== 'week' && view !== 'four' && <DateStrip date={date} firstDay={display.firstDay} events={filtered} kids={kids}
          language={language} onDate={selectDate} compact={view !== 'agenda'} />}
        {!searchActive && ['week', 'day', 'four'].includes(view) && <WeekGrid key={`focus:${acceptedFocusRequest}`}
          date={date} dayOnly={view === 'day'} fourDays={view === 'four'} hideWeekends={hideWeekends} firstDay={display.firstDay} initialHour={focusedHour} events={filtered} kids={kids}
          language={language} onDate={selectDate} onOpenDay={openDay} onEvent={showEvent}
          onAddAtTime={canWrite && !busy ? (day, hour) => {
            selectDate(day);
            const startDate = calendar.dateKey(day);
            open('new', { initialDraft: { startDate, start: `${String(hour).padStart(2, '0')}:00`,
              end: `${String((hour + 1) % 24).padStart(2, '0')}:00`, endDate: hour === 23 ? calendar.dateKey(calendar.addDays(day, 1)) : '' } });
          } : undefined} />}
        <View style={s.agendaHeading}><Text accessibilityRole="header" style={s.agendaTitle}>{searchActive ? t.searchResults : headerDate}</Text><View style={s.agendaActions}><View style={s.count}><Text style={s.countText}>{shownEvents.length}</Text></View>{commentsAvailable && <IconButton icon={MessageCircle} label={commentsCopy.title} disabled={busy || planningBusy} onPress={() => open('comments')} />}</View></View>
        {shownEvents.length ? shownEvents.map((item, index) => {
          const event = searchActive ? item.event : item;
          const occurrence = searchActive ? calendar.parseDateKey(item.occurrenceDate) : date;
          return <ActivityCard key={`${event.id ?? 'activity'}:${searchActive ? item.occurrenceDate : index}`} event={event} date={occurrence} occurrenceDate={searchActive ? item.occurrenceDate : ''}
            kids={kids} language={language} showDate={searchActive} onPress={() => showEvent(event, occurrence)} />;
        }) : <View style={u.empty}><CalendarDays size={28} color={colors.success} /><Text style={[u.heading, s.center]}>{filtersActive ? t.noResults : t.empty}</Text><Text style={[u.body, s.center]}>{filtersActive ? t.filteredBody : t.emptyBody}</Text>{filtersActive ? <Button secondary icon={X} onPress={resetFilters}>{t.resetFilters}</Button> : canWrite && <Button secondary icon={Plus} onPress={() => open('new')}>{t.add}</Button>}</View>}
        <View style={s.syncRow}><Text style={s.syncText}>{refreshing ? t.refreshing : t.refresh}</Text><IconButton icon={RefreshCw} label={t.refresh} onPress={refresh} disabled={refreshing || busy} color={colors.muted} /></View>
        {!canWrite && <Text style={[u.body, s.center]}>{isShared && sharedAccess?.stale ? t.sharedStale
          : isShared && (access.setupRequired || sharedBlocked?.code === 'SETUP_REQUIRED') ? t.sharedSetup : t.readOnly}</Text>}
      </>}
    </ScrollView>}
    <Sheet visible={!!sheet} title={sheetTitle} closeLabel={t.close} busy={busy || planningBusy} onClose={requestClose}>
    {!!sheet && <>
      {discardConfirm && <View style={s.discardConfirm}>
        <Text accessibilityRole="header" style={u.heading}>{sheet.type === 'comments' ? commentsCopy.discardTitle : sheet.type === 'planning' ? (planningCopy[language] || planningCopy.en).discard : t.discardTitle}</Text><Text style={u.body}>{sheet.type === 'comments' ? commentsCopy.discardBody : sheet.type === 'planning' ? (planningCopy[language] || planningCopy.en).discardBody : t.discardBody}</Text>
        <Button onPress={() => setDiscardConfirm(false)}>{t.keepEditing}</Button><Button danger onPress={closeSheet}>{t.discardChanges}</Button>
      </View>}
    {sheet.type === 'comments' && commentsAvailable && <View accessibilityElementsHidden={discardConfirm} importantForAccessibility={discardConfirm ? 'no-hide-descendants' : 'auto'} style={{ flexShrink: 1, display: discardConfirm ? 'none' : 'flex' }}><CalendarComments key={scopeId} client={client} account={account}
      calendar={{ id: active.id, ownerId: active.ownerId || userId, name: active.name }} role={commentRole} stale={!!sharedAccess?.stale}
      language={language} onDirtyChange={onDirtyChange} onBusyChange={setPlanningBusy} /></View>}
    {sheet.type === 'tools' && <CalendarToolbox embedded language={language} onClose={closeSheet}
      nativeAvailability={{ ...nativeTools, 'quick-add': canWrite, 'family-poll': true, 'family-time': true, 'activity-lists': true, 'activity-history': true, 'version-history': canRestore, presets: canRestore,
        'export-calendar': calendarFilesAvailable, 'print-schedule': calendarFilesAvailable }}
      onPlanning={id => open('planning', { mode: planningModes[id] || 'gaps' })}
      onTool={id => {
        if (id === 'activity-lists') open('lists');
        else if (id === 'quick-add') open('quick');
        else if (id === 'family-poll') open('poll');
        else if (id === 'family-time') open('familyTime');
        else if (id === 'export-calendar' || id === 'print-schedule') open('files', { mode: id === 'print-schedule' ? 'print' : 'export' });
        else open('records', { mode: id === 'presets' ? 'presets' : id === 'version-history' ? 'versions' : 'activity' });
      }}
      onPreferences={onPreferences ? () => { closeSheet(); onPreferences(); } : undefined}
      onWebsite={!isShared ? async id => {
        const request = sheetVersion.current;
        const url = websiteTools.toolUrl(id, !isShared ? active?.id : null);
        if (!url) return false;
        await Linking.openURL(url);
        if (mounted.current && calendarScope.current === scopeId && sheetVersion.current === request) closeSheet();
        return true;
      } : undefined} />}
    {sheet.type === 'quick' && <QuickAdd language={language} date={date} onDraft={draft => {
      selectDate(calendar.parseDateKey(draft.startDate));
      open('new', { copyDraft: { ...draft, start: draft.start ?? '', end: draft.end ?? '' } });
    }} />}
    {sheet.type === 'poll' && <FamilyPoll key={scopeId} scope={scopeId} language={language} initialDate={calendar.dateKey(date)}
      kids={kids} events={events} canWrite={canWrite} onDraft={openProposedEvent} />}
    {sheet.type === 'familyTime' && <FamilyTime date={date} kids={kids} events={events} language={language}
      canWrite={canWrite} onDraft={openProposedEvent} />}
    {sheet.type === 'files' && active && <CalendarFiles key={scopeId} language={language} active={active} date={date} kids={kids} events={events}
      firstDay={display.firstDay} initialMode={sheet.mode} onBusyChange={setPlanningBusy}
      onImport={!isShared && canWrite && onImportActivities ? imported => onImportActivities(active.id, imported) : undefined} />}
    {sheet.type === 'lists' && <ActivityLists key={scopeId} events={events} language={language} onOpen={(id, day) => {
      const event = events.find(item => String(item.id) === String(id));
      if (event) { selectDate(day); showEvent(event, day); }
    }} />}
    {sheet.type === 'records' && active && <CalendarRecords key={scopeId} client={client} userId={userId} ownerId={active.ownerId || userId} calendarId={active.id}
      data={active.data || {}} initialMode={sheet.mode} onRefresh={refresh} busy={busy} language={language}
      onSavePreset={canRestore && onSavePreset ? async request => {
        if (mutation.current) throw new Error('Calendar is busy');
        mutation.current = true; setBusy(true);
        try { await onSavePreset(active.id, request); }
        finally { mutation.current = false; if (mounted.current) setBusy(false); }
      } : undefined}
      onRestore={canRestore ? async request => {
        if (mutation.current) throw new Error('Calendar is busy');
        mutation.current = true; setBusy(true);
        try { await onRestoreSnapshot(active.id, request); }
        finally { mutation.current = false; if (mounted.current) setBusy(false); }
      } : undefined} />}
    {sheet.type === 'planning' && !!active && <View accessibilityElementsHidden={discardConfirm} importantForAccessibility={discardConfirm ? 'no-hide-descendants' : 'auto'} style={{ flexShrink: 1, display: discardConfirm ? 'none' : 'flex' }}><PlanningTools key={scopeId} embedded onDirtyChange={onDirtyChange} onBusyChange={setPlanningBusy} initialMode={sheet.mode} userId={userId} ownerId={active.ownerId || userId} calendarId={active.id}
      events={events} kids={kids} date={date} language={language} firstDay={display.firstDay} canWrite={canWrite}
      selectedView={{ view, date: calendar.dateKey(date), query, person }} onClose={closeSheet}
      onPlan={draft => { setDate(calendar.parseDateKey(draft.startDate)); open('new', { initialDraft: draft }); }}
      onShowDate={value => { setDate(calendar.parseDateKey(value)); setFullMonthOpen(false); setView('agenda'); setQuery(''); setPerson('all'); setFiltersOpen(false); closeSheet(); }}
      onApplyView={value => { const nextPerson = filters.some(item => item.value === value.person) ? value.person : 'all'; setDate(calendar.parseDateKey(value.date)); setQuery(value.query); setPerson(nextPerson); setFiltersOpen(!!value.query?.trim() || nextPerson !== 'all'); closeSheet();
        if (value.view === 'month') { monthReturnView.current = 'agenda'; setView('month'); setFullMonthOpen(true); }
        else { monthReturnView.current = value.view; setFullMonthOpen(false); setView(value.view); } }} /></View>}
      {!!message && <View style={s.sheetFeedback}><Text accessibilityRole="alert" style={u.error}>{message}</Text>{conflicted && <Button secondary icon={RefreshCw} onPress={refresh} disabled={refreshing}>{t.conflictRefresh}</Button>}</View>}
      {sheet.type === 'details' && <ActivityDetails event={sheet.event} occurrenceDate={sheet.occurrenceDate} occurrenceStartDate={sheet.occurrenceStartDate} kids={kids} language={language} canEdit={writableEvent(sheet.event)} busy={busy} onEdit={event => chooseScope('edit', event)}
        onDuplicate={event => {
          const occurrence = calendar.parseDateKey(sheet.occurrenceStartDate || sheet.occurrenceDate);
          open('new', { copyDraft: eventOptions.duplicateDraft(event, validDate(occurrence) ? occurrence : date) });
        }} onDelete={deleteActivity} onDeleteRequest={repeated(sheet.event) ? event => chooseScope('delete', event) : undefined} />}
      {['new', 'edit'].includes(sheet.type) && (canWrite || isShared) && <View accessibilityElementsHidden={discardConfirm} importantForAccessibility={discardConfirm ? 'no-hide-descendants' : 'auto'} style={{ flexShrink: 1, display: discardConfirm ? 'none' : 'flex' }}>
        <ActivityEditor event={sheet.type === 'edit' ? sheet.event : null} initialDraft={sheet.type === 'new' ? sheet.initialDraft : undefined} copyDraft={sheet.copyDraft} date={date} kids={kids} events={events} preferences={preferences} language={language} busy={busy} disabled={!canWrite} error={message} onSave={saveActivity} onCancel={requestClose} onDirtyChange={onDirtyChange} scope={sheet.scope} />
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
      {sheet.type === 'calendars' && <ScrollView contentContainerStyle={s.sheetContent}>{entries.map(item => <Pressable key={JSON.stringify([item.ownerId || userId, item.id])} accessibilityRole="button" accessibilityState={{ selected: item === active }} onPress={() => selectCalendar(item)} style={s.calendarOption}><CalendarDays size={21} color={colors.primary} /><Text style={[u.label, { flex: 1 }]}>{displayText(item.name) || t.calendar}</Text>{item === active && <Check size={19} color={colors.primary} />}</Pressable>)}
        {canCreate && <Button secondary icon={Plus} onPress={() => { setName(''); open('create'); }}>{t.createCalendar}</Button>}
        {canCreate && active && !!onRenameCalendar && <Button secondary onPress={() => { setName(active.name); open('rename', { originalName: active.name }); }}>{renameLabel}</Button>}
        {canDeleteCalendar && active && <Button danger secondary onPress={() => open('deleteCalendar', { baseline: { name: active.name, data: active.data } })}>{deleteCalendarLabel}</Button>}
      </ScrollView>}
      {sheet.type === 'rename' && <View style={s.sheetContent}>
        <Field label={t.calendarName} value={name} onChangeText={setName} maxLength={40} autoFocus editable={!busy} />
        <Button disabled={busy || !name.trim() || name.trim() === sheet.originalName} onPress={() => mutate(
          () => onRenameCalendar(active.id, { originalName: sheet.originalName, name }), closeSheet)}>{saveLabel}</Button>
      </View>}
      {sheet.type === 'deleteCalendar' && <View style={s.sheetContent}>
        <Text style={u.heading}>{displayText(sheet.baseline.name)}</Text>
        <Text style={u.body}>{language === 'zh' ? '此日历中的所有活动将被删除，共享成员将失去访问权限。' : 'This permanently deletes the events in this calendar. Shared members will lose access.'}</Text>
        <Button secondary disabled={busy} onPress={() => open('calendars')}>{t.cancel}</Button>
        <Button danger disabled={busy || !canDeleteCalendar} onPress={() => mutate(
          () => onDeleteCalendar(active.id, sheet.baseline), closeSheet)}>{busy ? t.deleting : deleteCalendarLabel}</Button>
      </View>}
      {sheet.type === 'create' && <View style={s.sheetContent}><Field label={t.calendarName} value={name} onChangeText={setName} maxLength={100} autoFocus editable={!busy} onSubmitEditing={createCalendar} /><Button disabled={busy || !name.trim()} onPress={createCalendar}>{busy ? t.refreshing : t.createCalendar}</Button></View>}
      {sheet.type === 'date' && <View style={s.sheetContent}><Field label={t.date} value={jump} onChangeText={value => { setJump(value); setMessage(''); }} placeholder={t.dateHint} maxLength={10} autoFocus autoCapitalize="none" keyboardType="numbers-and-punctuation" returnKeyType="go" onSubmitEditing={jumpToDate} /><Button onPress={jumpToDate}>{t.jump}</Button></View>}
    </>}
    </Sheet>
    {!sheet && !!message && <View style={s.inlineError}><Text accessibilityRole="alert" style={u.error}>{message}</Text></View>}
  </View>;
}

function ActivityCard({ event, date, kids, language, onPress, showDate, occurrenceDate }) {
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
  const visibleDate = displayText(occurrenceDate) || displayText(event.startDate) || t.noDate;
  const label = [cancelled && t.cancelled, title, showDate && visibleDate, time, person, location, responsible].filter(Boolean).join(', ');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.activity, { borderLeftColor: palette.line }, (pressed || cancelled) && { opacity: 0.6 }]}>
    <View style={s.cardTop}><Text numberOfLines={2} style={[s.activityTitle, cancelled && { textDecorationLine: 'line-through' }]}>{displayText(event.icon) || '📅'}  {title}</Text>{event.importance === 'high' && <Text style={s.important}>!</Text>}<ChevronRight size={17} color={colors.muted} /></View>
    {!!showDate && <Text style={s.meta}>{visibleDate}</Text>}
    <View style={s.eventSummary}><Text numberOfLines={1} style={[s.time, { color: palette.ink }]}>{time}</Text><View style={[s.dot, { backgroundColor: palette.line }]} /><Text numberOfLines={1} style={[s.person, { color: palette.ink }]}>{person}</Text>{cancelled && <Text style={{ color: colors.error, fontSize: 12 }}>{t.cancelled}</Text>}</View>
    {!!location && <View style={u.row}><MapPin size={14} color={colors.muted} /><Text style={s.meta}>{location}</Text></View>}
    {(!!responsible || (!!event.recurrence && event.recurrence !== 'none')) && <View style={s.cardFooter}>{!!responsible && <><UserRound size={14} color={colors.muted} /><Text numberOfLines={1} style={[s.meta, { flex: 1 }]}>{t.pickup}: {responsible}</Text></>}{!!event.recurrence && event.recurrence !== 'none' && <Repeat2 size={15} color={colors.muted} />}</View>}
  </Pressable>;
}

const createStyles = colors => StyleSheet.create({
  toolbarAction: { backgroundColor: colors.primarySoft },
  addAction: { backgroundColor: colors.primary },
  scopeContent: { gap: 14 }, undoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.successSoft },
  searchScope: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }, discardConfirm: { padding: 20, paddingTop: 8, gap: 12, backgroundColor: colors.warningSoft, borderBottomWidth: 1, borderBottomColor: colors.line },
  page: { flex: 1, backgroundColor: colors.page }, controls: { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line }, calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 }, calendarSelector: { flex: 1, minWidth: 0, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 12, backgroundColor: colors.surface }, calendarName: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700' }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 9 }, dateButton: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }, period: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '700', color: colors.ink }, today: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12 }, todayText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 32 }, filterBlock: { borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.surface, overflow: 'hidden', marginBottom: 12 }, filterToggle: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13 }, filterCopy: { flex: 1, minWidth: 0 }, filterTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '700' }, filterHint: { color: colors.muted, fontSize: 11, lineHeight: 15 }, filterCount: { minWidth: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, filterCountText: { color: colors.primary, fontSize: 11, fontWeight: '700' }, filterExpanded: { transform: [{ rotate: '180deg' }] }, filterPanel: { padding: 12, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 }, search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.line, borderRadius: 11, paddingLeft: 12, paddingRight: 3 }, searchInput: { flex: 1, minWidth: 0, minHeight: 46, fontSize: 14, color: colors.ink }, agendaHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, marginBottom: 11 }, agendaTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', flex: 1 }, agendaActions: { flexDirection: 'row', alignItems: 'center', gap: 4 }, count: { minWidth: 25, minHeight: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, countText: { color: colors.muted, fontSize: 12, fontWeight: '600' }, center: { textAlign: 'center' }, activity: { borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderRadius: 14, backgroundColor: colors.surface, padding: 14, marginBottom: 10, gap: 8 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, eventSummary: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }, time: { maxWidth: '56%', fontSize: 13, fontWeight: '700' }, important: { color: colors.error, fontSize: 17, fontWeight: '800' }, activityTitle: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 23 }, dot: { width: 7, height: 7, borderRadius: 4 }, person: { minWidth: 0, fontSize: 13, fontWeight: '600', flexShrink: 1 }, meta: { color: colors.muted, fontSize: 13, lineHeight: 20, flexShrink: 1 }, cardFooter: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 7 }, syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, syncText: { fontSize: 12, color: colors.muted },
  notice: { backgroundColor: colors.successSoft, padding: 12, color: colors.success, fontSize: 13 }, errorBanner: { backgroundColor: colors.errorSoft, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, sheetFeedback: { paddingHorizontal: 20, paddingBottom: 12, gap: 9 }, sheetContent: { padding: 20, paddingTop: 10, paddingBottom: 26 }, calendarOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 15, marginBottom: 10 }, inlineError: { padding: 12, backgroundColor: colors.errorSoft },
});
