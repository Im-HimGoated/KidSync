import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import calendar from '../lib/calendar';
import model from './model';
import getCopy from './copy';
import weekLayout from './week-layout';
import { personColor } from './ui';
import { useAppearance } from '../ui/AppearanceContext';

function useViewStyles() {
  const { colors, palettes } = useAppearance();
  const s = useMemo(() => createStyles(colors), [colors]);
  return { colors, palettes, s };
}

const HOUR_HEIGHT = 64;
const GUTTER = weekLayout.GUTTER_WIDTH;
const ownDate = value => value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
const text = value => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const firstDayValue = value => value === 0 || value === 'sunday' ? 0 : 1;
const locale = language => String(language).startsWith('zh') ? 'zh-CN' : 'en-US';
const formatDate = (value, language, options) => value.toLocaleDateString(locale(language), options);

function viewCopy(language) {
  const copy = getCopy(language) || {};
  const zh = String(language).startsWith('zh');
  return {
    allDay: copy.allDay || (zh ? '全天' : 'All day'),
    untimed: copy.untimed || (zh ? '时间待定' : 'Time not set'),
    family: copy.familyTime || copy.everyone || (zh ? '全家' : 'Family'),
    activity: copy.activity || copy.calendar || (zh ? '活动' : 'Activity'),
    cancelled: copy.cancelled || (zh ? '已取消' : 'Cancelled'),
    details: zh ? '打开活动详情' : 'Opens activity details',
    adult: copy.pickup || (zh ? '接送人' : 'Pickup'),
    continuesBefore: copy.continuesBefore, continuesAfter: copy.continuesAfter,
    openDay: zh ? '打开当天时间轴' : 'Opens the Day timeline',
    overlap: count => zh ? `另有 ${count} 项时间重叠的活动` : `${count} more overlapping ${count === 1 ? 'activity' : 'activities'}`,
    now: zh ? '当前时间' : 'Current time',
    important: zh ? '高重要性' : 'High importance',
    activities: count => zh ? `${count} 项活动` : `${count} ${count === 1 ? 'activity' : 'activities'}`,
    fullCalendar: zh ? '完整月历' : 'Full calendar',
    back: zh ? '返回日历' : 'Back to calendar',
    previousMonth: zh ? '上个月' : 'Previous month',
    nextMonth: zh ? '下个月' : 'Next month',
    today: zh ? '今天' : 'Today',
    add: zh ? '添加活动' : 'Add activity',
    viewDay: zh ? '查看当天' : 'View day',
    noActivities: zh ? '这一天还没有安排。' : 'Nothing planned for this day.',
    more: count => `+${count}`,
  };
}

function colorFor(event, kids, palettes, colors) {
  const value = personColor(event, kids, palettes) || {};
  return { soft: value.soft || colors.primarySoft, ink: value.ink || colors.ink, line: value.line || colors.primary };
}

function attendee(event, kids, t) {
  if (!event.child || event.child === '__family__') return t.family;
  const people = calendar.kidsForEvent(event, kids).map(kid => text(kid.name)).filter(Boolean);
  return people.length ? people.join(', ') : Array.isArray(event.child) ? event.child.map(text).filter(Boolean).join(', ') : text(event.child);
}

function eventLabel(event, date, kids, language, t, occurrenceStartDate) {
  const start = calendar.formatTime(event.start, language);
  const end = calendar.formatTime(event.end, language);
  const segment = calendar.daySegment(event, date, occurrenceStartDate);
  return [
    event.status === 'cancelled' ? t.cancelled : '',
    text(event.title) || t.activity,
    formatDate(date, language, { weekday: 'long', month: 'long', day: 'numeric' }),
    event.allDay ? t.allDay : start ? `${start}${end ? ` – ${end}` : ''}` : t.untimed,
    segment?.continuesBefore ? t.continuesBefore : '', segment?.continuesAfter ? t.continuesAfter : '',
    attendee(event, kids, t), text(event.location), event.responsible ? `${t.adult}: ${text(event.responsible)}` : '',
  ].filter(Boolean).join(', ');
}

function usePhoneWidth(minimum) {
  const { width } = useWindowDimensions();
  return Math.max(minimum, Math.min(width, 640) - 32);
}

function useRevealSelectedDay(scroll, width, index) {
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    if (!viewport) return;
    const x = Math.max(0, Math.min(width - viewport, (index + 0.5) * width / 7 - viewport / 2));
    scroll.current?.scrollTo({ x, animated: false });
  }, [width, index, viewport]);
  return event => setViewport(event.nativeEvent.layout.width);
}

export function CalendarViewPicker({ view, language, onChange, fourDays = false }) {
  const { s } = useViewStyles();
  const t = getCopy(language);
  return <View style={s.views}>
    {(fourDays ? ['agenda', 'day', 'week', 'four', 'month'] : ['agenda', 'day', 'week', 'month']).map(value => <Pressable key={value} accessibilityRole="button"
      accessibilityState={{ selected: value === view }} onPress={() => onChange(value)}
      style={[s.viewButton, value === view && s.selectedDay]}>
      <Text style={[s.viewLabel, value === view && s.selectedText]}>{t[value]}</Text>
    </Pressable>)}
  </View>;
}

/** A full seven-day strip; narrow phones scroll instead of shrinking targets. */
export function DateStrip({ date, firstDay = 1, events = [], kids = [], language = 'en', onDate, compact = false }) {
  const { colors, palettes, s } = useViewStyles();
  const selected = ownDate(date), first = model.startOfDisplayWeek(selected, firstDayValue(firstDay));
  const width = usePhoneWidth(7 * (compact ? 40 : 44));
  const t = viewCopy(language), scroll = useRef(null);
  const selectedIndex = (selected.getDay() - firstDayValue(firstDay) + 7) % 7;
  const onLayout = useRevealSelectedDay(scroll, width, selectedIndex);
  const today = calendar.dateKey(new Date());
  const dates = Array.from({ length: 7 }, (_, index) => {
      const day = calendar.addDays(first, index), key = calendar.dateKey(day);
      const chosen = key === calendar.dateKey(selected), items = calendar.eventsForDate(events, day);
      return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: chosen }}
        accessibilityLabel={`${formatDate(day, language, { weekday: 'long', month: 'long', day: 'numeric' })}, ${t.activities(items.length)}`}
        onPress={() => onDate?.(day)} style={[s.stripDay, compact && s.compactStripDay, chosen && s.selectedDay]}>
        <Text style={[s.weekday, chosen && s.selectedText]}>{formatDate(day, language, { weekday: 'short' }).replace('周', '')}</Text>
        <Text style={[s.dateNumber, key === today && s.todayNumber, chosen && s.selectedText]}>{day.getDate()}</Text>
        {compact ? <Text style={[s.stripCount, chosen && s.selectedText]}>{items.length || '–'}</Text>
          : <View accessible={false} style={s.dots}>{items.slice(0, 3).map((event, i) => <View key={i}
            style={[s.dot, { backgroundColor: chosen ? colors.onPrimary : colorFor(event, kids, palettes, colors).line }]} />)}</View>}
      </Pressable>;
    });
  if (compact) return <View style={[s.strip, s.compactStrip]}>{dates}</View>;
  return <ScrollView horizontal ref={scroll} onLayout={onLayout} style={s.stripScroll} showsHorizontalScrollIndicator={false}
    contentContainerStyle={[s.strip, { width }]}>
    {dates}
  </ScrollView>;
}

/** A 42-date grid using the account's saved first weekday. */
export function MonthGrid({ date, firstDay = 1, events = [], kids = [], language = 'en', onDate }) {
  const { colors, palettes, s } = useViewStyles();
  const selected = ownDate(date), start = model.startOfDisplayWeek(selected, firstDayValue(firstDay));
  const days = model.displayMonthDays(selected, firstDayValue(firstDay));
  const width = usePhoneWidth(7 * 40), cell = width / 7;
  const today = calendar.dateKey(new Date()), selectedKey = calendar.dateKey(selected), t = viewCopy(language);
  const scroll = useRef(null), selectedIndex = (selected.getDay() - firstDayValue(firstDay) + 7) % 7;
  const onLayout = useRevealSelectedDay(scroll, width, selectedIndex);
  return <ScrollView horizontal ref={scroll} onLayout={onLayout} style={s.monthScroll} showsHorizontalScrollIndicator={false}>
    <View style={[s.month, { width }]}>
      <View style={s.weekdays}>{Array.from({ length: 7 }, (_, i) => <Text key={i}
        style={[s.monthWeekday, { width: cell }]}>{formatDate(calendar.addDays(start, i), language, { weekday: 'short' }).replace('周', '')}</Text>)}</View>
      <View style={s.monthGrid}>{days.map((day, index) => {
        const key = calendar.dateKey(day), chosen = key === selectedKey, items = calendar.eventsForDate(events, day);
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: chosen }}
          accessibilityLabel={`${formatDate(day, language, { weekday: 'long', month: 'long', day: 'numeric' })}, ${t.activities(items.length)}`}
          onPress={() => onDate?.(day)} style={[s.monthCell, { width: cell }, index >= 7 && s.monthCellRow,
            index % 7 !== 6 && s.monthCellColumn, chosen && s.monthCellSelected]}>
          <View style={[s.monthDate, chosen && s.selectedDay]}>
            <Text style={[s.monthNumber, day.getMonth() !== selected.getMonth() && s.outsideMonth,
              key === today && s.todayNumber, chosen && s.selectedText]}>{day.getDate()}</Text>
            <View accessible={false} style={s.dots}>{items.slice(0, 3).map((event, i) => <View key={i}
              style={[s.dot, { backgroundColor: chosen ? colors.onPrimary : colorFor(event, kids, palettes, colors).line }]} />)}</View>
          </View>
        </Pressable>;
      })}</View>
    </View>
  </ScrollView>;
}

/** Dedicated full-month page with readable event labels on phone screens. */
export function FullMonthPage({ date, firstDay = 1, events = [], kids = [], language = 'en', calendarName,
  canWrite = false, onBack, onMonth, onDate, onOpenDay, onEvent, onAdd }) {
  const { colors, palettes, s } = useViewStyles();
  const { width } = useWindowDimensions();
  const selected = ownDate(date), first = model.startOfDisplayWeek(selected, firstDayValue(firstDay));
  const fullDays = model.displayMonthDays(selected, firstDayValue(firstDay));
  const days = fullDays.slice(35).some(day => day.getMonth() === selected.getMonth()) ? fullDays : fullDays.slice(0, 35);
  const gridWidth = Math.max(280, Math.min(width, 640) - 24), cellWidth = gridWidth / 7;
  const cellHeight = Math.max(64, Math.min(72, cellWidth * 1.25));
  const maxItems = 2;
  const today = calendar.dateKey(new Date()), selectedKey = calendar.dateKey(selected), t = viewCopy(language);
  const monthLabel = formatDate(selected, language, { month: 'long', year: 'numeric' });
  const selectedLabel = formatDate(selected, language, { weekday: 'long', month: 'long', day: 'numeric' });
  const selectedEvents = model.sortAgenda(calendar.eventsForDate(events, selected), selected);
  const move = amount => onMonth?.(model.movePeriod(selected, 'month', amount));

  return <View style={s.fullPage}>
    <View style={s.fullHeader}>
      <View style={s.fullTitleRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.back} onPress={onBack} style={s.fullIconButton}>
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
        <View style={s.fullTitleCopy}>
          {!!calendarName && <Text numberOfLines={1} style={s.fullEyebrow}>{text(calendarName)}</Text>}
          <Text accessibilityRole="header" style={s.fullTitle}>{monthLabel}</Text>
        </View>
        {canWrite ? <Pressable accessibilityRole="button" accessibilityLabel={t.add} onPress={onAdd} style={[s.fullIconButton, s.fullAdd]}>
          <Plus size={22} color={colors.onPrimary} />
        </Pressable> : <View style={s.fullIconButton} />}
      </View>
      <View style={s.fullNavigation}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.previousMonth} onPress={() => move(-1)} style={s.fullNavButton}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t.today} onPress={() => onMonth?.(new Date())} style={s.fullToday}>
          <Text style={s.fullTodayText}>{t.today}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t.nextMonth} onPress={() => move(1)} style={s.fullNavButton}>
          <ChevronRight size={20} color={colors.ink} />
        </Pressable>
      </View>
    </View>
    <ScrollView style={s.fullScroll} contentContainerStyle={s.fullScrollContent} showsVerticalScrollIndicator={false}>
      <View style={[s.fullCalendar, { width: gridWidth }]}>
        <View style={s.fullWeekdays}>{Array.from({ length: 7 }, (_, index) => <Text key={index}
          style={[s.fullWeekday, { width: cellWidth }]}>{formatDate(calendar.addDays(first, index), language, { weekday: 'narrow' }).replace('周', '')}</Text>)}</View>
        <View style={s.fullGrid}>{days.map(day => {
          const key = calendar.dateKey(day), chosen = key === selectedKey, isToday = key === today;
          const outside = day.getMonth() !== selected.getMonth(), items = calendar.eventsForDate(events, day);
          return <View key={key} style={[s.fullCell, { width: cellWidth, height: cellHeight }, chosen && s.fullCellSelected]}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: chosen }}
              accessibilityLabel={`${formatDate(day, language, { weekday: 'long', month: 'long', day: 'numeric' })}, ${t.activities(items.length)}`}
              onPress={() => onDate?.(day)} style={StyleSheet.absoluteFillObject} />
            <View pointerEvents="none" style={s.fullDateRow}>
              <View style={[s.fullDateBadge, isToday && s.fullTodayBadge, chosen && s.fullSelectedBadge]}>
                <Text style={[s.fullDateText, outside && s.fullOutsideDate, isToday && s.fullTodayDateText, chosen && s.fullSelectedDateText]}>{day.getDate()}</Text>
              </View>
            </View>
            <View style={s.fullEvents}>{items.slice(0, maxItems).map((event, index) => {
              const palette = colorFor(event, kids, palettes, colors), cancelled = event.status === 'cancelled';
              return <Pressable key={`${event.id ?? 'event'}:${index}`} accessibilityRole="button"
                accessibilityLabel={eventLabel(event, day, kids, language, t)} onPress={() => onEvent?.(event, day)}
                style={({ pressed }) => [s.fullEvent, { backgroundColor: palette.soft, borderLeftColor: palette.line }, (pressed || cancelled) && { opacity: 0.58 }]}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={[s.fullEventText, { color: palette.ink }, cancelled && s.cancelled]}>{text(event.title) || t.activity}</Text>
              </Pressable>;
            })}
            {items.length > maxItems && <Text pointerEvents="none" style={s.fullMore}>{t.more(items.length - maxItems)}</Text>}
            </View>
          </View>;
        })}</View>
      </View>
      <View style={[s.fullAgenda, { width: gridWidth }]}>
        <View style={s.fullAgendaHeader}>
          <View style={s.fullAgendaHeading}>
            <Text accessibilityRole="header" numberOfLines={2} style={s.fullAgendaTitle}>{selectedLabel}</Text>
            <Text style={s.fullAgendaCount}>{t.activities(selectedEvents.length)}</Text>
          </View>
          {!!onOpenDay && <Pressable accessibilityRole="button" accessibilityLabel={`${t.viewDay}: ${selectedLabel}`}
            onPress={() => onOpenDay(selected)} style={s.fullViewDay}>
            <Text style={s.fullViewDayText}>{t.viewDay}</Text><ChevronRight size={16} color={colors.primary} />
          </Pressable>}
        </View>
        {selectedEvents.length ? selectedEvents.map((event, index) => {
          const palette = colorFor(event, kids, palettes, colors);
          const start = calendar.formatTime(event.start, language), end = calendar.formatTime(event.end, language);
          const time = event.allDay ? t.allDay : start ? `${start}${end ? ` – ${end}` : ''}` : t.untimed;
          return <Pressable key={`${event.id ?? 'event'}:${index}`} accessibilityRole="button"
            accessibilityLabel={eventLabel(event, selected, kids, language, t)} onPress={() => onEvent?.(event, selected)}
            style={({ pressed }) => [s.fullAgendaEvent, pressed && s.fullAgendaEventPressed]}>
            <View style={[s.fullAgendaDot, { backgroundColor: palette.line }]} />
            <View style={s.fullAgendaEventCopy}>
              <Text style={s.fullAgendaTime}>{time}</Text>
              <Text numberOfLines={2} style={s.fullAgendaEventTitle}>{text(event.title) || t.activity}</Text>
              <Text numberOfLines={1} style={s.fullAgendaPerson}>{attendee(event, kids, t)}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>;
        }) : <Text style={s.fullAgendaEmpty}>{t.noActivities}</Text>}
      </View>
    </ScrollView>
  </View>;
}

function EventBlock({ event, date, kids, language, t, onEvent, style, compact = false, narrow = false, occurrenceStartDate, time, overlapCount = 0 }) {
  const { colors, palettes, s } = useViewStyles();
  const palette = colorFor(event, kids, palettes, colors), cancelled = event.status === 'cancelled';
  const segment = calendar.daySegment(event, date, occurrenceStartDate);
  const important = event.importance === 'high' && !cancelled;
  const label = [eventLabel(event, date, kids, language, t, occurrenceStartDate),
    important && t.important, overlapCount > 0 && t.overlap(overlapCount)].filter(Boolean).join(', ');
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityHint={overlapCount ? t.openDay : t.details} onPress={() => onEvent?.(event, date, occurrenceStartDate)}
    style={({ pressed }) => [s.eventBlock, { backgroundColor: palette.soft, borderLeftColor: palette.line },
      compact && s.compactBlock, style, (pressed || cancelled) && { opacity: 0.6 }]}>
    <Text style={[s.blockTitle, narrow && s.narrowBlockTitle, { color: palette.ink }, cancelled && s.cancelled]}
      numberOfLines={narrow || time || overlapCount ? 1 : 2} ellipsizeMode="tail">
      {important ? '★ ' : ''}{segment?.continuesBefore ? '← ' : ''}{text(event.title) || t.activity}{segment?.continuesAfter ? ' →' : ''}
    </Text>
    {!!(time || overlapCount) && <View style={s.blockMeta}>
      {!!time && <Text numberOfLines={1} style={[s.blockTime, { color: palette.ink }]}>{time}</Text>}
      {!!overlapCount && <Text style={[s.overlapCount, { color: palette.ink }]}>+{overlapCount}</Text>}
    </View>}
  </Pressable>;
}

function NonTimedRow({ label, rows, dates, colWidth, scrollRef, scrollProps, kids, language, t, onEvent, onOpenDay }) {
  const { s } = useViewStyles();
  const rowHeight = items => items.length > 2 && onOpenDay ? 2 * 47 + 44 : items.length * 47;
  const height = Math.max(44, ...rows.map(rowHeight)) + 5;
  return <View style={[s.nonTimed, { minHeight: height }]}>
    <View style={[s.nonTimedGutter, { height }]}><Text style={s.nonTimedLabel}>{label}</Text></View>
    <ScrollView ref={scrollRef} horizontal {...scrollProps} scrollEnabled={dates.length > 1} nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator={false} style={s.daysViewport}>
      <View style={[s.nonTimedDays, { width: colWidth * dates.length, minHeight: height }]}>{rows.map((items, index) =>
        <View key={calendar.dateKey(dates[index])} style={[s.nonTimedColumn, { width: colWidth }]}>
          {(onOpenDay ? items.slice(0, 2) : items).map((event, j) => <EventBlock key={`${event.id ?? 'event'}:${j}`} event={event} date={dates[index]}
            kids={kids} language={language} t={t} onEvent={onEvent} compact />)}
          {!!onOpenDay && items.length > 2 && <Pressable accessibilityRole="button"
            accessibilityLabel={t.activities(items.length - 2)} accessibilityHint={t.openDay}
            onPress={() => onOpenDay(dates[index])} style={s.moreActivities}>
            <Text style={s.moreText}>+{items.length - 2}</Text>
          </Pressable>}
        </View>)}
      </View>
    </ScrollView>
  </View>;
}

/**
 * Compact week overview. The parent also renders a full-width selected-day
 * agenda so narrow overlap lanes are not the only way to reach an activity.
 */
export function WeekGrid({ date, firstDay = 1, initialHour = 8, events = [], kids = [], language = 'en', onDate, onEvent, onOpenDay, onAddAtTime,
  dayOnly = false, fourDays = false, hideWeekends = false }) {
  const { s } = useViewStyles();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const selected = ownDate(date), first = fourDays ? selected : model.startOfDisplayWeek(selected, firstDayValue(firstDay));
  const dates = dayOnly ? [selected] : Array.from({ length: fourDays ? 4 : 7 }, (_, i) => calendar.addDays(first, i))
    .filter(day => fourDays || !hideWeekends || (day.getDay() !== 0 && day.getDay() !== 6));
  const selectedColumn = dates.findIndex(day => calendar.dateKey(day) === calendar.dateKey(selected));
  const vertical = useRef(null), horizontal = useRef(null), headers = useRef(null), allDay = useRef(null), untimed = useRef(null);
  const horizontalSource = useRef(horizontal), [viewportWidth, setViewportWidth] = useState(0);
  const verticalOffset = useRef(0), lastInitial = useRef('');
  const t = viewCopy(language), estimatedWidth = Math.max(1, windowWidth - 34 - GUTTER);
  const colWidth = dayOnly ? viewportWidth || estimatedWidth : weekLayout.weekGeometry((viewportWidth || estimatedWidth) + GUTTER).dayWidth;
  const daysWidth = colWidth * dates.length;
  const dayEvents = dates.map(day => calendar.eventsForDate(events, day));
  const columns = dayEvents.map((items, index) => model.layoutDay(items, {
    date: dates[index], hourHeight: HOUR_HEIGHT, minHeight: 36, compact: !dayOnly && !!onOpenDay,
  }));
  const canvasHeight = Math.max(...columns.map(column => column.height)) + 4;
  const startHour = Number.isFinite(Number(initialHour)) ? Math.max(0, Math.min(24, Number(initialHour))) : 8;
  const scrollKey = `${dayOnly ? 'day' : calendar.dateKey(first)}:${startHour}`;
  const selectedKey = calendar.dateKey(selected);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const today = calendar.dateKey(now);
  const offset = -selected.getTimezoneOffset();
  const zone = `GMT${offset < 0 ? '−' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}${offset % 60 ? `:${String(Math.abs(offset) % 60).padStart(2, '0')}` : ''}`;
  const clock = minutes => calendar.formatTime(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, language);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const hasUntimed = columns.some(column => column.untimed.length);
  const timelineHeight = Math.max(360, Math.min(520, windowHeight - (dayOnly ? 300 : 330)));
  const daySwipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, { dx, dy, numberActiveTouches }) =>
      dayOnly && numberActiveTouches === 1 && Math.abs(dx) > 18 && Math.abs(dx) > 1.6 * Math.abs(dy),
    onPanResponderRelease: (_, { dx }) => {
      if (dayOnly && Math.abs(dx) > 42) onDate?.(calendar.addDays(selected, dx < 0 ? 1 : -1));
    },
  }), [dayOnly, onDate, selectedKey]);

  function syncHorizontal(event, source) {
    if (horizontalSource.current !== source) return;
    const x = event.nativeEvent.contentOffset.x;
    for (const ref of [horizontal, headers, allDay, untimed]) if (ref !== source) ref.current?.scrollTo({ x, animated: false });
  }
  function horizontalProps(source) {
    return { onScrollBeginDrag: () => { horizontalSource.current = source; }, onScroll: event => syncHorizontal(event, source),
      onMomentumScrollEnd: event => {
        if (dayOnly || fourDays || horizontalSource.current !== source || !viewportWidth) return;
        const x = event.nativeEvent.contentOffset.x;
        const index = Math.max(0, Math.min(dates.length - 1, Math.round((x + viewportWidth / 2) / colWidth - 0.5)));
        if (calendar.dateKey(dates[index]) !== selectedKey) onDate?.(dates[index]);
      },
      scrollEventThrottle: 16, snapToInterval: colWidth, decelerationRate: 'fast' };
  }
  function scrollInitially() {
    if (lastInitial.current === scrollKey || !vertical.current) return;
    verticalOffset.current = weekLayout.initialScrollOffset(startHour, HOUR_HEIGHT);
    vertical.current.scrollTo({ y: verticalOffset.current, animated: false });
    lastInitial.current = scrollKey;
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => { lastInitial.current = ''; scrollInitially(); });
    return () => cancelAnimationFrame(frame);
  }, [scrollKey]);
  useEffect(() => {
    if (!viewportWidth || dayOnly) return;
    const x = weekLayout.weekOffset(selectedColumn, colWidth, viewportWidth, dates.length);
    for (const ref of [horizontal, headers, allDay, untimed]) ref.current?.scrollTo({ x, animated: false });
  }, [selectedKey, selectedColumn, dates.length, colWidth, viewportWidth, hasUntimed, dayOnly]);

  function openDay(day) { onOpenDay?.(day, verticalOffset.current / HOUR_HEIGHT + 0.5); }

  return <View {...daySwipe.panHandlers} style={s.weekContainer}
    onLayout={event => setViewportWidth(Math.max(0, event.nativeEvent.layout.width - GUTTER - 2))}>
    {!dayOnly && <View style={s.dayHeaders}><View style={s.headerGutter}><Text style={s.zone}>{zone}</Text></View>
      <ScrollView horizontal ref={headers} {...horizontalProps(headers)} nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator={false} style={s.daysViewport}>
        <View style={[s.dayHeaderColumns, { width: daysWidth }]}>{dates.map((day, index) => {
          const key = calendar.dateKey(day), chosen = key === selectedKey;
          return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: chosen }}
            accessibilityLabel={`${formatDate(day, language, { weekday: 'long', month: 'long', day: 'numeric' })}, ${t.activities(dayEvents[index].length)}`}
            accessibilityHint={onOpenDay ? t.openDay : undefined}
            onPress={() => onOpenDay ? openDay(day) : onDate?.(day)} style={[s.gridDayHeader, { width: colWidth }, chosen && s.currentColumn]}>
            <Text style={s.weekday}>{formatDate(day, language, { weekday: 'short' }).replace('周', '')}</Text>
            <View style={[s.gridDate, chosen && s.selectedDay]}><Text style={[s.dateNumber, key === today && s.todayNumber, chosen && s.selectedText]}>{day.getDate()}</Text></View>
            <View accessible={false} style={[s.dayCount, chosen && s.dayCountSelected, !dayEvents[index].length && s.dayCountEmpty]}>
              {!!dayEvents[index].length && <Text style={[s.dayCountText, chosen && s.dayCountTextSelected]}>{dayEvents[index].length}</Text>}
            </View>
          </Pressable>;
        })}</View>
      </ScrollView>
    </View>}
    {dayOnly && <Text style={s.dayZone}>{zone}</Text>}
    <NonTimedRow label={t.allDay} rows={columns.map(column => column.allDay)} dates={dates} colWidth={colWidth}
      scrollRef={allDay} scrollProps={horizontalProps(allDay)} kids={kids} language={language} t={t} onEvent={onEvent} onOpenDay={!dayOnly && onOpenDay ? openDay : undefined} />
    {hasUntimed && <NonTimedRow label={t.untimed} rows={columns.map(column => column.untimed)} dates={dates} colWidth={colWidth}
      scrollRef={untimed} scrollProps={horizontalProps(untimed)} kids={kids} language={language} t={t} onEvent={onEvent} onOpenDay={!dayOnly && onOpenDay ? openDay : undefined} />}
    <ScrollView ref={vertical} style={[s.hoursViewport, { height: timelineHeight }]} nestedScrollEnabled directionalLockEnabled
      onScroll={event => { verticalOffset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
      onContentSizeChange={scrollInitially} showsVerticalScrollIndicator>
      <View style={[s.timeBody, { height: canvasHeight }]}>
        <View style={[s.timeGutter, { height: canvasHeight }]}>{Array.from({ length: 24 }, (_, hour) =>
          <Text key={hour} style={[s.hourLabel, { top: hour * HOUR_HEIGHT }]}>
            {calendar.formatTime(`${String(hour).padStart(2, '0')}:00`, language).replace(':00', '')}
          </Text>)}
        </View>
        <ScrollView ref={horizontal} horizontal nestedScrollEnabled {...horizontalProps(horizontal)} scrollEnabled={!dayOnly}
          showsHorizontalScrollIndicator={!dayOnly} directionalLockEnabled style={s.daysViewport}>
          <View style={{ width: daysWidth, height: canvasHeight }}>
            {!dayOnly && <View pointerEvents="none" style={[s.dayColumn, s.currentColumn, {
              left: dates.findIndex(day => calendar.dateKey(day) === selectedKey) * colWidth,
              width: colWidth, height: canvasHeight,
            }]} />}
            {Array.from({ length: 25 }, (_, hour) => <View accessible={false} pointerEvents="none" key={hour}
              style={[s.hourLine, { top: hour * HOUR_HEIGHT, width: daysWidth }]} />)}
            {dates.map((day, index) => <View key={calendar.dateKey(day)} pointerEvents="box-none"
              style={[s.dayColumn, { left: index * colWidth, width: colWidth, height: canvasHeight }]}>
              {!!onAddAtTime && Array.from({ length: 24 }, (_, hour) => <Pressable key={hour}
                accessibilityRole="button" accessibilityLabel={`${t.add}, ${formatDate(day, language, { month: 'short', day: 'numeric' })}, ${clock(hour * 60)}`}
                style={{ position: 'absolute', top: hour * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT }}
                onPress={() => onAddAtTime(day, hour)} />)}
              {columns[index].timed.map((item, j) => {
                const laneWidth = colWidth / Math.max(1, item.lanes);
                return <EventBlock key={`${item.event.id ?? 'event'}:${item.occurrenceStartDate || ''}:${j}`} event={item.event} date={day}
                  kids={kids} language={language} t={t} occurrenceStartDate={item.occurrenceStartDate} narrow={item.lanes > 1}
                  time={laneWidth >= 66 ? clock(item.start) : undefined} overlapCount={item.overlapCount}
                  onEvent={item.overlapCount ? () => onOpenDay(day, item.overlapStart / 60) : onEvent}
                  style={{ position: 'absolute', top: item.top, height: item.height,
                    left: item.lane * laneWidth + 1, width: Math.max(1, laneWidth - 2) }} />;
              })}
              {calendar.dateKey(day) === today && <View pointerEvents="none" accessible accessibilityLabel={`${t.now}, ${clock(nowMinutes)}`}
                style={[s.nowLine, { top: nowMinutes / 60 * HOUR_HEIGHT }]}><View style={s.nowDot} /></View>}
            </View>)}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  </View>;
}

const createStyles = colors => StyleSheet.create({
  views: { flexDirection: 'row', backgroundColor: colors.input, borderRadius: 13, borderWidth: 1, borderColor: colors.line },
  viewButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  viewLabel: { color: colors.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  fullPage: { flex: 1, minHeight: 0, backgroundColor: colors.page },
  fullHeader: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 8 },
  fullTitleRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fullTitleCopy: { flex: 1, minWidth: 0 }, fullEyebrow: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  fullTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '700' },
  fullIconButton: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, fullAdd: { backgroundColor: colors.primary },
  fullNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  fullNavButton: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  fullToday: { minHeight: 40, minWidth: 88, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primarySoft },
  fullTodayText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  fullScroll: { flex: 1 }, fullScrollContent: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 28 },
  fullCalendar: { overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, ...Platform.select({ web: { boxSizing: 'border-box' }, default: {} }) },
  fullWeekdays: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surfaceRaised },
  fullWeekday: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center', paddingVertical: 9 },
  fullGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  fullCell: { position: 'relative', overflow: 'hidden', borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingHorizontal: 3, paddingTop: 3, backgroundColor: colors.surface, ...Platform.select({ web: { boxSizing: 'border-box' }, default: {} }) },
  fullCellSelected: { backgroundColor: colors.primarySoft },
  fullDateRow: { minHeight: 27, alignItems: 'center', justifyContent: 'center' },
  fullDateBadge: { minWidth: 25, height: 25, borderRadius: 13, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  fullTodayBadge: { borderWidth: 1, borderColor: colors.primary }, fullSelectedBadge: { backgroundColor: colors.primary, borderColor: colors.primary },
  fullDateText: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '600' }, fullOutsideDate: { color: colors.muted, opacity: 0.66 },
  fullTodayDateText: { color: colors.primary, fontWeight: '800' }, fullSelectedDateText: { color: colors.onPrimary },
  fullEvents: { zIndex: 1, gap: 2, flex: 1, paddingTop: 2 },
  fullEvent: { minHeight: 14, borderLeftWidth: 2, borderRadius: 3, justifyContent: 'center', paddingHorizontal: 3, overflow: 'hidden' },
  fullEventText: { fontSize: 9, lineHeight: 12, fontWeight: '600' }, fullMore: { color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '700', paddingLeft: 3 },
  fullAgenda: { marginTop: 18 },
  fullAgendaHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 10 },
  fullAgendaHeading: { flex: 1, minWidth: 0 },
  fullAgendaTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  fullAgendaCount: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  fullViewDay: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8 },
  fullViewDayText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  fullAgendaEvent: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  fullAgendaEventPressed: { opacity: 0.6 },
  fullAgendaDot: { width: 9, height: 9, borderRadius: 5 },
  fullAgendaEventCopy: { flex: 1, minWidth: 0 },
  fullAgendaTime: { color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  fullAgendaEventTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  fullAgendaPerson: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  fullAgendaEmpty: { color: colors.muted, fontSize: 14, lineHeight: 20, paddingVertical: 20, borderTopWidth: 1, borderTopColor: colors.line },
  stripScroll: { flexGrow: 0, marginBottom: 14 }, strip: { flexDirection: 'row' },
  stripDay: { flex: 1, minWidth: 44, minHeight: 76, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 7 },
  weekday: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  dateNumber: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  selectedDay: { backgroundColor: colors.primary }, selectedText: { color: colors.onPrimary },
  dots: { flexDirection: 'row', gap: 2, minHeight: 4, justifyContent: 'center' }, dot: { width: 4, height: 4, borderRadius: 2 },
  monthScroll: { flexGrow: 0, marginBottom: 17 }, month: { backgroundColor: colors.surface, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: colors.line, borderRadius: 8, overflow: 'hidden' },
  weekdays: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surfaceRaised },
  monthWeekday: { color: colors.muted, fontSize: 12, paddingVertical: 9, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' }, monthCell: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  monthCellRow: { borderTopWidth: 1, borderTopColor: colors.line }, monthCellColumn: { borderRightWidth: 1, borderRightColor: colors.line },
  monthCellSelected: { backgroundColor: colors.primarySoft },
  monthDate: { width: 38, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 4 },
  monthNumber: { color: colors.ink, fontSize: 15, lineHeight: 20 }, outsideMonth: { color: colors.muted, opacity: 0.65 }, todayNumber: { color: colors.primary, fontWeight: '700' },
  weekContainer: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  dayHeaders: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  headerGutter: { width: GUTTER, backgroundColor: colors.surface }, daysViewport: { flex: 1 }, dayHeaderColumns: { flexDirection: 'row' },
  zone: { color: colors.muted, fontSize: 9, textAlign: 'center', marginTop: 8 },
  dayZone: { color: colors.muted, fontSize: 10, padding: 5, textAlign: 'left' },
  compactStrip: { marginBottom: 8 },
  compactStripDay: { minWidth: 0, minHeight: 60, gap: 1, borderRadius: 11 },
  stripCount: { color: colors.muted, fontSize: 11, fontVariant: ['tabular-nums'] },
  gridDayHeader: { height: 76, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 3, borderLeftWidth: 1, borderLeftColor: colors.line },
  gridDate: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, currentColumn: { backgroundColor: colors.primarySoft },
  dayCount: { minWidth: 22, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: colors.surfaceRaised }, dayCountSelected: { backgroundColor: colors.surface },
  dayCountEmpty: { opacity: 0 },
  dayCountText: { color: colors.muted, fontSize: 10, lineHeight: 13, fontWeight: '700' }, dayCountTextSelected: { color: colors.primary },
  nonTimed: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line }, nonTimedGutter: { width: GUTTER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  nonTimedLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, textAlign: 'center' }, nonTimedDays: { flexDirection: 'row' },
  nonTimedColumn: { paddingHorizontal: 2, paddingVertical: 3, gap: 3, borderLeftWidth: 1, borderLeftColor: colors.line },
  moreActivities: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.surfaceRaised },
  moreText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  hoursViewport: { flexGrow: 0 }, timeBody: { flexDirection: 'row' }, timeGutter: { width: GUTTER, backgroundColor: colors.surface },
  hourLabel: { position: 'absolute', left: 0, right: 0, color: colors.muted, fontSize: 10, lineHeight: 14, paddingTop: 4, paddingRight: 5, textAlign: 'right' },
  hourLine: { position: 'absolute', height: 1, backgroundColor: colors.line, left: 0 }, dayColumn: { position: 'absolute', top: 0, borderLeftWidth: 1, borderLeftColor: colors.line },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.error, zIndex: 2, justifyContent: 'center' },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
  eventBlock: { borderLeftWidth: 3, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 4, overflow: 'hidden' },
  compactBlock: { minHeight: 44, justifyContent: 'center' }, blockTitle: { fontSize: 12, lineHeight: 16, fontWeight: '600' }, narrowBlockTitle: { fontSize: 11, lineHeight: 15 },
  blockMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  blockTime: { fontSize: 10, lineHeight: 13, flexShrink: 1 },
  overlapCount: { fontSize: 10, lineHeight: 13, fontWeight: '800' },
  cancelled: { textDecorationLine: 'line-through' },
});
