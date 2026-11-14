import React, { useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import calendar from '../lib/calendar';
import { Button, ChoiceRow, useCalendarUi } from './ui';
import planning from './planning';

export default function ActivityLists({ events, onOpen, language }) {
  const zh = language === 'zh', { u } = useCalendarUi();
  const [list, setList] = useState('upcoming');
  const [limit, setLimit] = useState(30);
  const now = new Date(), today = calendar.dateKey(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const entries = useMemo(() => {
    const date = calendar.parseDateKey(today);
    try { return planning.findEvents(events, calendar.dateKey(calendar.addDays(date, -90)), calendar.dateKey(calendar.addDays(date, 90)), ''); }
    catch { return []; }
  }, [events, today]);
  const upcoming = [], past = [];
  for (const event of entries) {
    const target = event.occurrenceDate > today || (event.occurrenceDate === today &&
      (calendar.daySegment(event, calendar.parseDateKey(today))?.end ?? 1440) > minute) ? upcoming : past;
    target.push(event);
  }
  past.reverse();
  const current = list === 'past' ? past : upcoming;
  return <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 30 }}>
    <ChoiceRow value={list} options={[
      { value: 'upcoming', label: zh ? `即将开始 · ${upcoming.length}` : `Upcoming · ${upcoming.length}` },
      { value: 'past', label: zh ? `已结束 · ${past.length}` : `Past · ${past.length}` },
    ]} onChange={value => { setList(value); setLimit(30); }} />
    {current.slice(0, limit).map((item, index) => {
      const date = calendar.parseDateKey(item.occurrenceDate);
      const label = date.toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', weekday: 'short' });
      const time = item.allDay ? zh ? '全天' : 'All day' : calendar.formatTime(item.start, language);
      return <Button key={`${item.id}:${item.occurrenceDate}:${index}`} secondary onPress={() => onOpen(item.id, date)}>
        {`${item.title || (zh ? '活动' : 'Activity')} · ${label}${time ? ` · ${time}` : ''}`}
      </Button>;
    })}
    {!current.length && <Text style={u.body}>{zh ? '此时段暂无活动。' : 'Nothing scheduled in this range.'}</Text>}
    {current.length > limit && <Button secondary onPress={() => setLimit(value => value + 30)}>{zh ? '显示更多' : 'Show more'}</Button>}
  </ScrollView>;
}
