import React, { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarDays } from 'lucide-react-native';
import { Button, Sheet } from '../calendar/ui';
import calendarTools from '../lib/calendar';
import weeklyBrief from '../home/weekly-brief';
import { useThemeStyles } from './AppearanceContext';

const store = weeklyBrief.createWeeklyBriefStore(AsyncStorage);
const copy = {
  en: {
    title: 'Your week ahead', close: 'Dismiss weekly reminder', calendar: 'Open calendar',
    empty: 'This calendar has no upcoming plans in the next seven days.',
    noCalendar: 'You don’t have a calendar to show here yet.',
    allDay: 'All day', noTime: 'Time not set', untitled: 'Untitled plan',
    continues: 'Continues', until: time => `Until ${time}`,
    more: count => `See ${count} more ${count === 1 ? 'plan' : 'plans'}`,
    dateRange: (first, last) => `${first} – ${last}`,
    cached: 'Showing plans saved on this device.'
  },
  zh: {
    title: '未来七天的安排', close: '关闭每周提醒', calendar: '打开日历',
    empty: '此日历未来七天没有待进行的安排。',
    noCalendar: '这里暂时没有可显示的日历。',
    allDay: '全天', noTime: '未设置时间', untitled: '未命名的安排',
    continues: '持续中', until: time => `持续到 ${time}`,
    more: count => `查看其余 ${count} 项安排`,
    dateRange: (first, last) => `${first}至${last}`,
    cached: '当前显示保存在此设备上的安排。'
  }
};

function displayText(value) {
  if (typeof value === 'string') return value.trim();
  return Number.isFinite(value) ? String(value) : '';
}

function eventTime({ event, segment }, language, t) {
  if (event.allDay) return t.allDay;
  const start = calendarTools.formatTime(event.start, language);
  const end = calendarTools.formatTime(event.end, language);
  if (segment?.continuesBefore) return segment.continuesAfter || !end ? t.continues : t.until(end);
  if (segment?.continuesAfter) return start || t.continues;
  return [start, end].filter(Boolean).join(' – ') || t.noTime;
}

export default function WeeklyBrief({ userId, language, active, ready, cached, firstDay, calendar, onOpenCalendar }) {
  const t = copy[language], s = useThemeStyles(createStyles);
  const [foreground, setForeground] = useState(() => AppState.currentState == null || AppState.currentState === 'active' ? new Date() : null);
  const [shownOn, setShownOn] = useState(null);

  useEffect(() => {
    const listener = AppState.addEventListener('change', next => setForeground(next === 'active' ? new Date() : null));
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (!active) { setShownOn(null); return; }
    if (!foreground) return;
    const now = new Date();
    if (shownOn && weeklyBrief.hasSeenWeek(calendarTools.dateKey(shownOn), now, firstDay)) return;
    if (shownOn) setShownOn(null);
    if (!ready) return;
    let current = true;
    void store.read(userId).then(lastShown => {
      if (!current || (AppState.currentState != null && AppState.currentState !== 'active')) return;
      const date = new Date();
      if (!weeklyBrief.hasSeenWeek(lastShown, date, firstDay)) setShownOn(date);
    });
    return () => { current = false; };
  }, [active, firstDay, foreground, ready, shownOn, userId]);

  if (!active || !shownOn) return null;
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const shortDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const dayHeading = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric' });
  const { end, days } = weeklyBrief.buildWeeklyBrief(calendar?.data?.activities, shownOn);
  const calendarName = displayText(calendar?.name);
  const markShown = () => { void store.markShown(userId, shownOn); };
  const close = () => { markShown(); setShownOn(null); };
  const open = date => { close(); onOpenCalendar(date); };

  return <Sheet title={t.title} closeLabel={t.close} onClose={close} onShow={markShown}>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.summary}>
        <Text style={s.range}>{t.dateRange(shortDate.format(shownOn), shortDate.format(end))}</Text>
        {!!calendarName && <Text style={s.meta}>{calendarName}</Text>}
        {cached && <Text style={s.meta}>{t.cached}</Text>}
      </View>
      {!days.length && <Text style={s.empty}>{calendar ? t.empty : t.noCalendar}</Text>}
      {days.map(day => <View key={day.dateKey} style={s.day}>
        <Text accessibilityRole="header" style={s.heading}>{dayHeading.format(day.date)}</Text>
        {day.plans.map(item => <View key={item.key} style={s.row}>
          <Text style={s.plan}>{displayText(item.event.title) || t.untitled}</Text>
          <Text style={s.meta}>{eventTime(item, language, t)}</Text>
        </View>)}
        {day.more > 0 && <Pressable accessibilityRole="button" onPress={() => open(day.dateKey)} style={({ pressed }) => [s.more, pressed && s.pressed]}>
          <Text style={s.moreText}>{t.more(day.more)}</Text>
        </Pressable>}
      </View>)}
    </ScrollView>
    <View style={s.footer}><Button icon={CalendarDays} onPress={() => open()}>{t.calendar}</Button></View>
  </Sheet>;
}

function createStyles(colors) {
  return StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 18, gap: 14 },
    summary: { backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, gap: 4 },
    range: { color: colors.ink, fontSize: 16, fontWeight: '700' },
    empty: { color: colors.muted, fontSize: 15, lineHeight: 21, paddingVertical: 12 },
    day: { gap: 6 },
    heading: { color: colors.primary, fontSize: 15, fontWeight: '700', paddingVertical: 4 },
    row: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 8, gap: 3 },
    plan: { color: colors.ink, fontSize: 16, fontWeight: '600' },
    meta: { color: colors.muted, fontSize: 14, lineHeight: 19 },
    more: { minHeight: 44, justifyContent: 'center' },
    moreText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.6 },
    footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.line }
  });
}
