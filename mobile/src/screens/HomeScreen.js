import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, CalendarDays, ChevronRight, Clock3, RefreshCw, Settings2, UserRound, UsersRound } from 'lucide-react-native';
import calendarTools from '../lib/calendar';
import homeModel from '../home/model';
import { IconButton } from '../calendar/ui';
import { useAppearance, useThemeStyles } from '../ui/AppearanceContext';

const copy = {
  en: {
    morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening',
    intro: 'Here is what your family needs next.', home: 'Home', calendar: 'Open calendar',
    today: 'Today', weekPlans: '7-day plans', plannedDays: 'days planned', handoffs: 'Needs handoff',
    next: 'Next up', nextBody: 'The closest plans across your family calendar.',
    handoffTitle: 'Family Handoff Center', handoffBody: 'Assign an adult before these plans begin.',
    workload: 'Family rhythm', workloadBody: 'Scheduled plans for each child over the next seven days.',
    empty: 'Your week is open.', emptyBody: 'Open the calendar to add the first plan.',
    allDay: 'All day', family: 'Family', pickup: 'Pickup not assigned', preferences: 'Calendar preferences',
    refresh: 'Refresh', live: 'In sync', connecting: 'Connecting', calendars: 'Calendars', coordinate: 'Coordinate pickups',
  },
  zh: {
    morning: '早上好', afternoon: '下午好', evening: '晚上好', intro: '这是家里接下来最需要关注的安排。',
    home: '首页', calendar: '打开日历', today: '今天', weekPlans: '七天安排', plannedDays: '天有安排', handoffs: '待安排接送',
    next: '接下来', nextBody: '家庭日历中即将开始的安排。', handoffTitle: '家庭交接中心', handoffBody: '请在活动开始前安排一位大人。',
    workload: '家庭节奏', workloadBody: '未来七天每个孩子的安排数量。', empty: '这一周还有空闲。', emptyBody: '打开日历，添加第一项安排。',
    allDay: '全天', family: '全家', pickup: '尚未安排接送', preferences: '日历偏好', refresh: '刷新', live: '已同步', connecting: '连接中', calendars: '日历', coordinate: '安排接送',
  },
};

const eventsIn = active => Array.isArray(active?.data?.activities) ? active.data.activities : [];
const kidsIn = active => Array.isArray(active?.data?.kids) ? active.data.kids : [];

function dateText(date, language, todayKey) {
  const key = calendarTools.dateKey(date);
  if (key === todayKey) return language === 'zh' ? '今天' : 'Today';
  return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function personPalette(event, kids, palettes) {
  const kid = kids.find(person => person.name === event?.child || String(person.id) === String(event?.child));
  return palettes[event?.style] || palettes[kid?.palette] || palettes.blue;
}

function EventRow({ item, kids, language, t, todayKey, onPress, warning, styles, colors, palettes }) {
  const event = item.event, palette = personPalette(event, kids, palettes);
  const people = calendarTools.kidsForEvent(event, kids).map(kid => kid.name).join(', ') || t.family;
  const time = event.allDay ? t.allDay : calendarTools.formatTime(event.start, language) || t.allDay;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.eventRow, pressed && styles.pressed]}>
    <View style={[styles.eventAccent, { backgroundColor: warning ? colors.warning : palette.line }]} />
    <View style={styles.eventIcon}><Text style={styles.eventEmoji}>{event.icon || '📅'}</Text></View>
    <View style={styles.eventCopy}>
      <Text numberOfLines={1} style={styles.eventTitle}>{event.title || t.calendar}</Text>
      <Text numberOfLines={1} style={styles.eventMeta}>{dateText(item.date, language, todayKey)} · {time} · {people}</Text>
      {warning && <Text numberOfLines={1} style={styles.warningText}>{t.pickup}</Text>}
    </View>
    <ChevronRight size={18} color={colors.muted} />
  </Pressable>;
}

export default function HomeScreen({ language = 'en', calendars = [], calendar, loading, error,
  onSelectCalendar, onOpenCalendar, onOpenDate, onOpenFamily, onPreferences, onRefresh }) {
  const t = copy[String(language).startsWith('zh') ? 'zh' : 'en'];
  const { colors, palettes } = useAppearance(), styles = useThemeStyles(createStyles);
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date(), events = eventsIn(calendar), kids = kidsIn(calendar);
  const model = useMemo(() => homeModel.buildHomeModel(events, kids, now), [calendar?.id, calendar?.data]);
  const todayKey = calendarTools.dateKey(now), hour = now.getHours();
  const greeting = hour < 12 ? t.morning : hour < 18 ? t.afternoon : t.evening;
  const todayLabel = now.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await onRefresh?.(); } finally { setRefreshing(false); }
  };
  const maxWorkload = Math.max(1, ...model.workload.map(item => item.count));

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />}>
    <View style={styles.hero}>
      <View style={styles.heroTop}><View style={styles.heroCopy}><Text style={styles.todayLabel}>{todayLabel}</Text><Text accessibilityRole="header" style={styles.greeting}>{greeting}</Text><Text style={styles.intro}>{t.intro}</Text></View>
        <View style={styles.heroActions}><IconButton icon={RefreshCw} label={t.refresh} color={colors.ink} onPress={refresh} disabled={refreshing} />
          <IconButton icon={Settings2} label={t.preferences} color={colors.ink} onPress={onPreferences} /></View></View>
    </View>

    {calendars.length > 1 && <View style={styles.calendarSection}><Text style={styles.eyebrow}>{t.calendars}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarChips}>
      {calendars.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === calendar?.id }}
        onPress={() => onSelectCalendar?.(item.id)} style={[styles.calendarChip, item.id === calendar?.id && styles.calendarChipSelected]}>
        <Text numberOfLines={1} style={[styles.calendarChipText, item.id === calendar?.id && styles.calendarChipTextSelected]}>{item.name}</Text>
      </Pressable>)}
    </ScrollView></View>}

    {!!error && <View style={styles.error}><AlertCircle size={18} color={colors.red} /><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text></View>}
    {loading ? <ActivityIndicator accessibilityLabel={t.connecting} color={colors.blue} style={styles.loader} /> : <>
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{model.today.length}</Text><Text style={styles.metricLabel}>{t.today}</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{model.sevenDayCount}</Text><Text style={styles.metricLabel}>{t.weekPlans}</Text><Text style={styles.metricDetail}>{model.daysPlanned} {t.plannedDays}</Text></View>
        <View style={styles.metric}><Text style={[styles.metricValue, model.handoffCount > 0 && styles.metricWarning]}>{model.handoffCount}</Text><Text style={styles.metricLabel}>{t.handoffs}</Text></View>
      </View>

      <View style={styles.sectionHeading}><View style={styles.sectionIcon}><Clock3 size={18} color={colors.blue} /></View><View style={styles.sectionCopy}><Text accessibilityRole="header" style={styles.sectionTitle}>{t.next}</Text><Text style={styles.sectionBody}>{t.nextBody}</Text></View></View>
      {model.nextUp.length ? model.nextUp.map(item => <EventRow key={item.key} item={item} kids={kids} language={language} t={t} todayKey={todayKey} styles={styles} colors={colors} palettes={palettes} onPress={() => onOpenDate?.(item.dateKey)} />)
        : <View style={styles.empty}><CalendarDays size={28} color={colors.green} /><Text style={styles.emptyTitle}>{t.empty}</Text><Text style={styles.emptyBody}>{t.emptyBody}</Text></View>}

      {model.handoffs.length > 0 && <View style={styles.sectionBlock}>
        <View style={styles.sectionHeading}><View style={[styles.sectionIcon, styles.warningIcon]}><UsersRound size={18} color={colors.warning} /></View><View style={styles.sectionCopy}><Text accessibilityRole="header" style={styles.sectionTitle}>{t.handoffTitle}</Text><Text style={styles.sectionBody}>{t.handoffBody}</Text></View></View>
        {model.handoffs.map(item => <EventRow key={`handoff-${item.key}`} item={item} kids={kids} language={language} t={t} todayKey={todayKey} styles={styles} colors={colors} palettes={palettes} warning onPress={() => onOpenDate?.(item.dateKey)} />)}
        <Pressable accessibilityRole="button" onPress={onOpenFamily} style={({ pressed }) => [styles.handoffButton, pressed && styles.pressed]}>
          <UsersRound size={18} color={colors.green} /><Text style={styles.handoffButtonText}>{t.coordinate}</Text><ChevronRight size={18} color={colors.green} />
        </Pressable>
      </View>}

      {model.workload.length > 0 && <View style={styles.sectionBlock}>
        <View style={styles.sectionHeading}><View style={styles.sectionIcon}><UserRound size={18} color={colors.green} /></View><View style={styles.sectionCopy}><Text accessibilityRole="header" style={styles.sectionTitle}>{t.workload}</Text><Text style={styles.sectionBody}>{t.workloadBody}</Text></View></View>
        <View style={styles.workload}>{model.workload.map(kid => { const palette = personPalette({ child: kid.id ?? kid.name }, kids, palettes); const person = kids.find(item => String(item.id) === String(kid.id) || item.name === kid.name); return <View key={String(kid.id ?? kid.name)} style={styles.workloadRow}><View style={[styles.workloadAvatar, { backgroundColor: palette.soft, borderColor: palette.line }]}><Text style={[styles.workloadAvatarText, { color: palette.ink }]}>{person?.avatar || String(kid.name || '?').charAt(0).toUpperCase()}</Text></View><Text numberOfLines={1} style={styles.workloadName}>{kid.name}</Text><View style={styles.workloadTrack}><View style={[styles.workloadBar, { width: `${kid.count ? Math.max(8, kid.count / maxWorkload * 100) : 0}%`, backgroundColor: palette.line }]} /></View><Text style={styles.workloadCount}>{kid.count}</Text></View>; })}</View>
      </View>}
    </>}

    <Pressable accessibilityRole="button" onPress={onOpenCalendar} style={({ pressed }) => [styles.calendarButton, pressed && styles.pressed]}>
      <CalendarDays size={19} color={colors.onPrimary} /><Text style={styles.calendarButtonText}>{t.calendar}</Text><ChevronRight size={18} color={colors.onPrimary} />
    </Pressable>
  </ScrollView>;
}

function createStyles(colors) { return StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page }, content: { paddingBottom: 28 },
  hero: { backgroundColor: colors.primarySoft, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14, gap: 10 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, heroCopy: { flex: 1, minWidth: 0 }, heroActions: { flexDirection: 'row', alignItems: 'center' }, todayLabel: { color: colors.green, fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', marginBottom: 3 }, greeting: { color: colors.ink, fontSize: 25, lineHeight: 31, fontWeight: '700' }, intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 3 },
  calendarSection: { paddingTop: 15 }, eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: 18, marginBottom: 8 }, calendarChips: { paddingHorizontal: 18, gap: 8 }, calendarChip: { minHeight: 40, maxWidth: 180, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 13, backgroundColor: colors.surface }, calendarChipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, calendarChipText: { color: colors.ink, fontSize: 13, fontWeight: '600' }, calendarChipTextSelected: { color: colors.primary },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 16, paddingHorizontal: 18 }, metric: { flex: 1, minHeight: 92, alignItems: 'center', justifyContent: 'center', padding: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface }, metricValue: { color: colors.ink, fontSize: 24, fontWeight: '700' }, metricWarning: { color: colors.warning }, metricLabel: { color: colors.ink, fontSize: 11, lineHeight: 16, fontWeight: '600', textAlign: 'center' }, metricDetail: { color: colors.muted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  sectionBlock: { marginTop: 20 }, sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingHorizontal: 18, marginTop: 20, marginBottom: 10 }, sectionIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }, warningIcon: { backgroundColor: colors.warningSoft }, sectionCopy: { flex: 1, minWidth: 0 }, sectionTitle: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '700' }, sectionBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  eventRow: { minHeight: 72, marginHorizontal: 18, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 }, eventAccent: { width: 4, height: 38, borderRadius: 2 }, eventIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }, eventEmoji: { fontSize: 17 }, eventCopy: { flex: 1, minWidth: 0 }, eventTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '700' }, eventMeta: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 }, warningText: { color: colors.warning, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  handoffButton: { minHeight: 46, marginHorizontal: 18, marginTop: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 8 }, handoffButtonText: { flex: 1, color: colors.primary, fontSize: 13, fontWeight: '700' },
  empty: { marginHorizontal: 18, paddingVertical: 26, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, alignItems: 'center' }, emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', marginTop: 9 }, emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 4 },
  workload: { marginHorizontal: 18, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, gap: 11 }, workloadRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 }, workloadAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, workloadAvatarText: { fontSize: 13, fontWeight: '700' }, workloadName: { width: 68, color: colors.ink, fontSize: 13, fontWeight: '600' }, workloadTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceRaised, borderRadius: 4, overflow: 'hidden' }, workloadBar: { height: 8, borderRadius: 4 }, workloadCount: { width: 22, textAlign: 'right', color: colors.muted, fontSize: 12, fontWeight: '600' },
  calendarButton: { minHeight: 50, marginHorizontal: 18, marginTop: 24, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, calendarButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' }, pressed: { opacity: 0.58 },
  error: { margin: 18, marginBottom: 0, padding: 12, backgroundColor: colors.errorSoft, borderRadius: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, errorText: { color: colors.error, fontSize: 13, lineHeight: 19, flex: 1 }, loader: { margin: 34 },
}); }
