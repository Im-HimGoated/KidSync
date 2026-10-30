import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import calendar from '../lib/calendar';
import model from './model';
import getCopy from './copy';
import { colors, personColor } from './ui';

const HOUR_HEIGHT = 60;
const GUTTER = 42;
const ownDate = value => value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
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
    overview: zh ? '左右滑动查看整周，上下滑动查看其他时间。下方日程可查看完整活动。'
      : 'Swipe across days and scroll through hours. The daily agenda below has full activity details.',
    activities: count => zh ? `${count} 项活动` : `${count} ${count === 1 ? 'activity' : 'activities'}`,
  };
}

function colorFor(event, kids) {
  const value = personColor(event, kids) || {};
  return { soft: value.soft || '#EAF3FA', ink: value.ink || colors.ink, line: value.line || colors.blue };
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
  return Math.max(minimum, Math.min(width, 640) - 40);
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

/** A full seven-day strip; narrow phones scroll instead of shrinking targets. */
export function DateStrip({ date, firstDay = 1, events = [], kids = [], language = 'en', onDate }) {
  const selected = ownDate(date), first = model.startOfDisplayWeek(selected, firstDayValue(firstDay));
  const width = usePhoneWidth(7 * 44);
  const t = viewCopy(language), scroll = useRef(null);
  const selectedIndex = (selected.getDay() - firstDayValue(firstDay) + 7) % 7;
  const onLayout = useRevealSelectedDay(scroll, width, selectedIndex);
  const today = calendar.dateKey(new Date());
  return <ScrollView horizontal ref={scroll} onLayout={onLayout} style={s.stripScroll} showsHorizontalScrollIndicator={false}
    contentContainerStyle={[s.strip, { width }]}>
    {Array.from({ length: 7 }, (_, index) => {
      const day = calendar.addDays(first, index), key = calendar.dateKey(day);
      const chosen = key === calendar.dateKey(selected), items = calendar.eventsForDate(events, day);
      return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: chosen }}
        accessibilityLabel={`${formatDate(day, language, { weekday: 'long', month: 'long', day: 'numeric' })}, ${t.activities(items.length)}`}
        onPress={() => onDate?.(day)} style={[s.stripDay, chosen && s.selectedDay]}>
        <Text style={[s.weekday, chosen && s.selectedText]}>{formatDate(day, language, { weekday: 'short' }).replace('周', '')}</Text>
        <Text style={[s.dateNumber, key === today && s.todayNumber, chosen && s.selectedText]}>{day.getDate()}</Text>
        <View accessible={false} style={s.dots}>{items.slice(0, 3).map((event, i) => <View key={i}
          style={[s.dot, { backgroundColor: chosen ? colors.white : colorFor(event, kids).line }]} />)}</View>
      </Pressable>;
    })}
  </ScrollView>;
}

/** A 42-date grid using the account's saved first weekday. */
export function MonthGrid({ date, firstDay = 1, events = [], kids = [], language = 'en', onDate }) {
  const selected = ownDate(date), start = model.startOfDisplayWeek(selected, firstDayValue(firstDay));
  const days = model.displayMonthDays(selected, firstDayValue(firstDay));
  const width = usePhoneWidth(7 * 44), cell = width / 7;
  const today = calendar.dateKey(new Date()), selectedKey = calendar.dateKey(selected), t = viewCopy(language);
  const scroll = useRef(null), selectedIndex = (selected.getDay() - firstDayValue(firstDay) + 7) % 7;
  const onLayout = useRevealSelectedDay(scroll, width, selectedIndex);
  return <ScrollView horizontal ref={scroll} onLayout={onLayout} style={s.monthScroll} showsHorizontalScrollIndicator={false}>
    <View style={[s.month, { width }]}>
      <View style={s.weekdays}>{Array.from({ length: 7 }, (_, i) => <Text key={i}
        style={[s.monthWeekday, { width: cell }]}>{formatDate(calendar.addDays(start, i), language, { weekday: 'short' }).replace('周', '')}</Text>)}</View>
      <View style={s.monthGrid}>{days.map(day => {
        const key = calendar.dateKey(day), chosen = key === selectedKey, items = calendar.eventsForDate(events, day);
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: chosen }}
          accessibilityLabel={`${formatDate(day, language, { weekday: 'long', month: 'long', day: 'numeric' })}, ${t.activities(items.length)}`}
          onPress={() => onDate?.(day)} style={[s.monthCell, { width: cell }]}>
          <View style={[s.monthDate, chosen && s.selectedDay]}>
            <Text style={[s.monthNumber, day.getMonth() !== selected.getMonth() && s.outsideMonth,
              key === today && s.todayNumber, chosen && s.selectedText]}>{day.getDate()}</Text>
            <View accessible={false} style={s.dots}>{items.slice(0, 3).map((event, i) => <View key={i}
              style={[s.dot, { backgroundColor: chosen ? colors.white : colorFor(event, kids).line }]} />)}</View>
          </View>
        </Pressable>;
      })}</View>
    </View>
  </ScrollView>;
}

function EventBlock({ event, date, kids, language, t, onEvent, style, compact = false, occurrenceStartDate }) {
  const palette = colorFor(event, kids), cancelled = event.status === 'cancelled';
  const segment = calendar.daySegment(event, date, occurrenceStartDate);
  return <Pressable accessibilityRole="button" accessibilityLabel={eventLabel(event, date, kids, language, t, occurrenceStartDate)}
    accessibilityHint={t.details} onPress={() => onEvent?.(event, date, occurrenceStartDate)}
    style={({ pressed }) => [s.eventBlock, { backgroundColor: palette.soft, borderLeftColor: palette.line },
      compact && s.compactBlock, style, (pressed || cancelled) && { opacity: 0.6 }]}>
    <Text style={[s.blockTitle, { color: palette.ink }, cancelled && s.cancelled]} numberOfLines={compact ? 2 : 3}>
      {segment?.continuesBefore ? '← ' : ''}{text(event.title) || t.activity}{segment?.continuesAfter ? ' →' : ''}
    </Text>
  </Pressable>;
}

function NonTimedRow({ label, rows, dates, colWidth, scrollRef, scrollProps, kids, language, t, onEvent }) {
  const count = Math.max(1, ...rows.map(items => items.length));
  const height = Math.max(38, count * 47 + 5);
  return <View style={[s.nonTimed, { minHeight: height }]}>
    <View style={[s.nonTimedGutter, { height }]}><Text style={s.nonTimedLabel}>{label}</Text></View>
    <ScrollView ref={scrollRef} horizontal {...scrollProps} nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator={false} style={s.daysViewport}>
      <View style={[s.nonTimedDays, { width: colWidth * 7, minHeight: height }]}>{rows.map((items, index) =>
        <View key={calendar.dateKey(dates[index])} style={[s.nonTimedColumn, { width: colWidth }]}>
          {items.map((event, j) => <EventBlock key={`${event.id ?? 'event'}:${j}`} event={event} date={dates[index]}
            kids={kids} language={language} t={t} onEvent={onEvent} compact />)}
        </View>)}
      </View>
    </ScrollView>
  </View>;
}

/**
 * Compact week overview. The parent also renders a full-width selected-day
 * agenda so narrow overlap lanes are not the only way to reach an activity.
 */
export function WeekGrid({ date, firstDay = 1, initialHour = 8, events = [], kids = [], language = 'en', onDate, onEvent }) {
  const selected = ownDate(date), first = model.startOfDisplayWeek(selected, firstDayValue(firstDay));
  const dates = Array.from({ length: 7 }, (_, i) => calendar.addDays(first, i));
  const t = viewCopy(language), width = usePhoneWidth(430), colWidth = (width - GUTTER) / 7;
  const columns = dates.map(day => model.layoutDay(calendar.eventsForDate(events, day), { date: day, hourHeight: HOUR_HEIGHT, minHeight: 30 }));
  const canvasHeight = Math.max(24 * HOUR_HEIGHT, ...columns.flatMap(column => column.timed.map(item => item.top + item.height + 4)));
  const vertical = useRef(null), horizontal = useRef(null), headers = useRef(null), allDay = useRef(null), untimed = useRef(null);
  const horizontalSource = useRef(horizontal), horizontalOffset = useRef(0), [viewportWidth, setViewportWidth] = useState(0);
  const lastInitial = useRef(''), firstKey = calendar.dateKey(first);
  const startHour = Number.isFinite(Number(initialHour)) ? Math.max(0, Math.min(23, Number(initialHour))) : 8;
  const scrollKey = `${firstKey}:${startHour}`;
  const selectedKey = calendar.dateKey(selected);
  const today = calendar.dateKey(new Date());
  const hasUntimed = columns.some(column => column.untimed.length);

  function syncHorizontal(event, source) {
    if (horizontalSource.current !== source) return;
    const x = event.nativeEvent.contentOffset.x;
    horizontalOffset.current = x;
    for (const ref of [horizontal, headers, allDay, untimed]) if (ref !== source) ref.current?.scrollTo({ x, animated: false });
  }
  function horizontalProps(source) {
    return { onScrollBeginDrag: () => { horizontalSource.current = source; }, onScroll: event => syncHorizontal(event, source), scrollEventThrottle: 16 };
  }
  function scrollInitially() {
    if (lastInitial.current === scrollKey) return;
    vertical.current?.scrollTo({ y: startHour * HOUR_HEIGHT, animated: false });
    lastInitial.current = scrollKey;
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => { lastInitial.current = ''; scrollInitially(); });
    return () => cancelAnimationFrame(frame);
  }, [scrollKey]);
  useEffect(() => {
    if (!viewportWidth) return;
    const index = (selected.getDay() - firstDayValue(firstDay) + 7) % 7;
    const left = index * colWidth, right = left + colWidth;
    const current = horizontalOffset.current;
    const x = Math.max(0, Math.min(colWidth * 7 - viewportWidth,
      left < current ? left : right > current + viewportWidth ? right - viewportWidth : current));
    horizontalOffset.current = x;
    for (const ref of [horizontal, headers, allDay, untimed]) ref.current?.scrollTo({ x, animated: false });
  }, [selectedKey, firstDay, colWidth, viewportWidth, hasUntimed]);

  function chooseEvent(event, day, occurrenceStartDate) { onDate?.(day); onEvent?.(event, day, occurrenceStartDate); }

  return <View style={s.weekContainer} onLayout={event => setViewportWidth(Math.max(0, event.nativeEvent.layout.width - GUTTER))}>
    <View style={s.dayHeaders}><View style={s.headerGutter} />
      <ScrollView horizontal ref={headers} {...horizontalProps(headers)} nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator={false} style={s.daysViewport}>
        <View style={[s.dayHeaderColumns, { width: colWidth * 7 }]}>{dates.map(day => {
          const key = calendar.dateKey(day), chosen = key === selectedKey;
          return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: chosen }}
            accessibilityLabel={formatDate(day, language, { weekday: 'long', month: 'long', day: 'numeric' })}
            onPress={() => onDate?.(day)} style={[s.gridDayHeader, { width: colWidth }, chosen && s.currentColumn]}>
            <Text style={s.weekday}>{formatDate(day, language, { weekday: 'short' }).replace('周', '')}</Text>
            <View style={[s.gridDate, chosen && s.selectedDay]}><Text style={[s.dateNumber, key === today && s.todayNumber, chosen && s.selectedText]}>{day.getDate()}</Text></View>
          </Pressable>;
        })}</View>
      </ScrollView>
    </View>
    <NonTimedRow label={t.allDay} rows={columns.map(column => column.allDay)} dates={dates} colWidth={colWidth}
      scrollRef={allDay} scrollProps={horizontalProps(allDay)} kids={kids} language={language} t={t} onEvent={chooseEvent} />
    {hasUntimed && <NonTimedRow label={t.untimed} rows={columns.map(column => column.untimed)} dates={dates} colWidth={colWidth}
      scrollRef={untimed} scrollProps={horizontalProps(untimed)} kids={kids} language={language} t={t} onEvent={chooseEvent} />}
    <ScrollView ref={vertical} style={s.hoursViewport} nestedScrollEnabled directionalLockEnabled
      onContentSizeChange={scrollInitially} showsVerticalScrollIndicator>
      <View style={[s.timeBody, { height: canvasHeight }]}>
        <View style={[s.timeGutter, { height: canvasHeight }]}>{Array.from({ length: 24 }, (_, hour) =>
          <Text key={hour} style={[s.hourLabel, { top: hour * HOUR_HEIGHT }]}>
            {calendar.formatTime(`${String(hour).padStart(2, '0')}:00`, language).replace(':00', '')}
          </Text>)}
        </View>
        <ScrollView ref={horizontal} horizontal nestedScrollEnabled {...horizontalProps(horizontal)}
          showsHorizontalScrollIndicator directionalLockEnabled style={s.daysViewport}>
          <View style={{ width: colWidth * 7, height: canvasHeight }}>
            {Array.from({ length: 25 }, (_, hour) => <View accessible={false} key={hour}
              style={[s.hourLine, { top: hour * HOUR_HEIGHT, width: colWidth * 7 }]} />)}
            {dates.map((day, index) => <View key={calendar.dateKey(day)} pointerEvents="box-none"
              style={[s.dayColumn, { left: index * colWidth, width: colWidth, height: canvasHeight }, calendar.dateKey(day) === selectedKey && s.currentColumn]}>
              {columns[index].timed.map((item, j) => {
                const laneWidth = colWidth / Math.max(1, item.lanes);
                return <EventBlock key={`${item.event.id ?? 'event'}:${item.occurrenceStartDate || ''}:${j}`} event={item.event} date={day}
                  kids={kids} language={language} t={t} onEvent={chooseEvent} occurrenceStartDate={item.occurrenceStartDate}
                  style={{ position: 'absolute', top: item.top, height: item.height,
                    left: item.lane * laneWidth + 1, width: Math.max(1, laneWidth - 2) }} />;
              })}
            </View>)}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
    <Text style={s.overviewHint}>{t.overview}</Text>
  </View>;
}

const s = StyleSheet.create({
  stripScroll: { flexGrow: 0, marginBottom: 14 }, strip: { flexDirection: 'row' },
  stripDay: { flex: 1, minWidth: 44, minHeight: 76, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 7 },
  weekday: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  dateNumber: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  selectedDay: { backgroundColor: colors.blue }, selectedText: { color: colors.white },
  dots: { flexDirection: 'row', gap: 2, minHeight: 4, justifyContent: 'center' }, dot: { width: 4, height: 4, borderRadius: 2 },
  monthScroll: { flexGrow: 0, marginBottom: 17 }, month: { backgroundColor: colors.white, borderRadius: 16, overflow: 'hidden', paddingVertical: 5 },
  weekdays: { flexDirection: 'row' }, monthWeekday: { color: colors.muted, fontSize: 12, paddingVertical: 10, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' }, monthCell: { minHeight: 49, alignItems: 'center', justifyContent: 'center' },
  monthDate: { width: 42, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 4 },
  monthNumber: { color: colors.ink, fontSize: 15, lineHeight: 20 }, outsideMonth: { color: '#9AABB2' }, todayNumber: { color: colors.blue, fontWeight: '700' },
  weekContainer: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 15, overflow: 'hidden', marginBottom: 17 },
  dayHeaders: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  headerGutter: { width: GUTTER, backgroundColor: colors.white }, daysViewport: { flex: 1 }, dayHeaderColumns: { flexDirection: 'row' },
  gridDayHeader: { minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 3, borderLeftWidth: 1, borderLeftColor: colors.line },
  gridDate: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, currentColumn: { backgroundColor: 'rgba(31,104,152,0.04)' },
  nonTimed: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line }, nonTimedGutter: { width: GUTTER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  nonTimedLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, textAlign: 'center' }, nonTimedDays: { flexDirection: 'row' },
  nonTimedColumn: { paddingHorizontal: 2, paddingVertical: 3, gap: 3, borderLeftWidth: 1, borderLeftColor: colors.line },
  hoursViewport: { height: 390, flexGrow: 0 }, timeBody: { flexDirection: 'row' }, timeGutter: { width: GUTTER, backgroundColor: colors.white },
  hourLabel: { position: 'absolute', left: 0, right: 0, color: colors.muted, fontSize: 9, lineHeight: 13, paddingTop: 3, paddingRight: 4, textAlign: 'right' },
  hourLine: { position: 'absolute', height: 1, backgroundColor: '#E7EDF0', left: 0 }, dayColumn: { position: 'absolute', top: 0, borderLeftWidth: 1, borderLeftColor: colors.line },
  eventBlock: { borderLeftWidth: 3, borderRadius: 5, paddingVertical: 3, paddingHorizontal: 3, overflow: 'hidden' },
  compactBlock: { minHeight: 44, justifyContent: 'center' }, blockTitle: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
  cancelled: { textDecorationLine: 'line-through' }, overviewHint: { color: colors.muted, fontSize: 11, lineHeight: 17, padding: 11, borderTopWidth: 1, borderTopColor: colors.line },
});
