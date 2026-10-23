import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Backpack, CalendarDays, UserRound } from 'lucide-react-native';

export const calendarPreviewCopy = {
  en: {
    example: 'Example calendar', family: 'Family', allDay: 'All day', month: 'October',
    handoff: 'Soccer practice · Theo', pickup: 'Pickup', adult: 'Alex', bring: 'Bring', items: 'Water + cleats',
    days: ['Mon', 'Tue', 'Wed'],
    hours: ['3 PM', '4 PM', '5 PM'],
    titles: ['School pickup', 'Soccer practice', 'Family dinner'],
    times: ['3:00–3:45', '4:00–4:45', '5:00–5:45']
  },
  zh: {
    example: '\u793a\u4f8b\u65e5\u5386', family: '\u5bb6\u5ead', allDay: '\u5168\u5929', month: '\u5341\u6708',
    handoff: '足球训练 · 西奥', pickup: '接送', adult: '亚历克斯', bring: '携带', items: '水和足球鞋',
    days: ['\u5468\u4e00', '\u5468\u4e8c', '\u5468\u4e09'],
    hours: ['15:00', '16:00', '17:00'],
    titles: ['\u63a5\u5b69\u5b50\u653e\u5b66', '\u8db3\u7403\u8bad\u7ec3', '\u5bb6\u5ead\u665a\u9910'],
    times: ['15:00–15:45', '16:00–16:45', '17:00–17:45']
  }
};

// Match the website's child/family palettes and left-accent event blocks.
const colors = [
  { soft: '#e4f0f7', line: '#88aec5', ink: '#173f59' },
  { soft: '#e7f2eb', line: '#94b9a3', ink: '#214c38' },
  { soft: '#f8f0dc', line: '#c8ae71', ink: '#594514' }
];

export default function CalendarPreview({ language, compact = false, showHandoff = false }) {
  const t = calendarPreviewCopy[language] || calendarPreviewCopy.en;
  return <View style={styles.preview}>
    <View style={styles.labelRow}>
      <Text style={styles.example}>{t.example}</Text>
      <View style={styles.family}>
        <CalendarDays size={14} color="#4c626e" aria-hidden={true} />
        <Text style={styles.familyText}>{t.family}</Text>
      </View>
    </View>
    <View style={styles.grid}>
      <View style={styles.row}>
        <View style={[styles.gutter, styles.month]}><Text style={styles.small}>{t.month}</Text></View>
        {t.days.map((day, index) => <View key={day} style={styles.day}>
          <Text style={styles.small}>{day}</Text>
          <View style={[styles.date, index === 2 && styles.selectedDate]}>
            <Text style={[styles.dateText, index === 2 && styles.selectedDateText]}>{19 + index}</Text>
          </View>
        </View>)}
      </View>
      <View style={styles.allDayRow}>
        <View style={styles.gutter}><Text style={styles.small}>{t.allDay}</Text></View>
        {t.days.map(day => <View key={day} style={styles.allDayCell} />)}
      </View>
      {t.hours.map((hour, hourIndex) => <View key={hour} style={styles.row}>
        <View style={[styles.gutter, styles.hour, compact && styles.compactHour]}><Text style={styles.small}>{hour}</Text></View>
        {t.days.map((day, dayIndex) => <View key={day} style={[styles.slot, compact && styles.compactSlot]}>
            {dayIndex === hourIndex && <View style={[styles.event, compact && styles.compactEvent, {
              backgroundColor: colors[dayIndex].soft, borderColor: colors[dayIndex].line,
              borderLeftColor: colors[dayIndex].ink
            }]}>
              <Text style={[styles.eventTitle, { color: colors[dayIndex].ink }]}>{t.titles[dayIndex]}</Text>
              <Text style={[styles.eventTime, { color: colors[dayIndex].ink }]}>{t.times[dayIndex]}</Text>
            </View>}
        </View>)}
      </View>)}
    </View>
    {showHandoff && <View style={styles.handoff}>
      <Text style={styles.handoffTitle}>{t.handoff}</Text>
      <View style={styles.handoffRow}>
        <View style={styles.handoffDetail}><UserRound size={16} color="#35634e" aria-hidden={true} /><View style={styles.handoffCopy}><Text style={styles.handoffLabel}>{t.pickup}</Text><Text style={styles.handoffValue}>{t.adult}</Text></View></View>
        <View style={styles.handoffDetail}><Backpack size={16} color="#35634e" aria-hidden={true} /><View style={styles.handoffCopy}><Text style={styles.handoffLabel}>{t.bring}</Text><Text style={styles.handoffValue}>{t.items}</Text></View></View>
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  preview: { gap: 12, padding: 12, borderWidth: 1, borderColor: '#dce7e1', borderRadius: 14, backgroundColor: '#ffffff' },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  example: { color: '#4c626e', fontSize: 12, fontWeight: '600', lineHeight: 18 },
  family: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  familyText: { color: '#4c626e', fontSize: 12 },
  grid: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#dce5e9' },
  row: { flexDirection: 'row' },
  gutter: { width: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  month: { alignSelf: 'stretch' },
  small: { color: '#4c626e', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  day: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 5, gap: 3, borderLeftWidth: 1, borderColor: '#dce5e9' },
  date: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  dateText: { color: '#172b3a', fontSize: 15, fontWeight: '600' },
  selectedDate: { backgroundColor: '#172b3a' },
  selectedDateText: { color: '#ffffff' },
  allDayRow: { flexDirection: 'row', minHeight: 24, borderTopWidth: 1, borderColor: '#dce5e9', backgroundColor: '#f7fafb' },
  allDayCell: { flex: 1, borderLeftWidth: 1, borderColor: '#dce5e9' },
  hour: { minHeight: 64, justifyContent: 'flex-start', paddingTop: 3 },
  slot: { flex: 1, minWidth: 0, minHeight: 64, borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#e8eef1', padding: 3 },
  event: { minHeight: 56, borderWidth: 1, borderLeftWidth: 3, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 4, gap: 3 },
  eventTitle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  eventTime: { fontSize: 10, lineHeight: 13 },
  compactHour: { minHeight: 52 },
  compactSlot: { minHeight: 52 },
  compactEvent: { minHeight: 44 },
  handoff: { padding: 12, gap: 10, borderRadius: 10, backgroundColor: '#eff6f0' },
  handoffTitle: { color: '#30563f', fontSize: 12, fontWeight: '600', lineHeight: 18 },
  handoffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  handoffDetail: { flexGrow: 1, flexBasis: 100, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  handoffCopy: { flex: 1, minWidth: 0, gap: 2 },
  handoffLabel: { color: '#4c626e', fontSize: 10, lineHeight: 15 },
  handoffValue: { color: '#30563f', fontSize: 12, lineHeight: 18, fontWeight: '600' }
});
