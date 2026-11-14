import React, { useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import calendar from '../lib/calendar';
import scheduler from '../../../assets/smart-scheduling';
import eventOptions from './event-options';
import { Button, ChoiceRow, Field, useCalendarUi } from './ui';

export default function FamilyTime({ date, kids, events, language, canWrite, onDraft }) {
  const zh = language === 'zh', { u } = useCalendarUi();
  const [from, setFrom] = useState(calendar.dateKey(date));
  const [start, setStart] = useState('08:00'), [end, setEnd] = useState('20:00');
  const [people, setPeople] = useState(['__family__']), [duration, setDuration] = useState(60), [days, setDays] = useState(7);
  const [before, setBefore] = useState('0'), [after, setAfter] = useState('0');
  const [maxEvents, setMaxEvents] = useState('0'), [maxMinutes, setMaxMinutes] = useState('0'), [notice, setNotice] = useState(0);
  const options = [{ value: '__family__', label: zh ? '全家' : 'Everyone' }, ...kids.map(kid => ({ value: kid.name, label: kid.name }))];
  const suggestions = useMemo(() => {
    const now = new Date();
    const rules = { date: from, people, duration, days, earliest: scheduler.clock(start), latest: scheduler.clock(end), before, after, maxEvents, maxMinutes, notice };
    if (!scheduler.validRules(rules) || from < calendar.dateKey(now)) return null;
    return scheduler.findSlots(rules, day => eventOptions.nearbyEvents(events, day), now);
  }, [from, people, duration, days, start, end, before, after, maxEvents, maxMinutes, notice, events]);
  const durations = values => values.map(value => ({ value, label: `${value} ${zh ? '分钟' : 'min'}` }));
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 30 }}>
    <Text style={u.body}>{zh ? '仅查看当前日历中的安排。' : 'Checks plans in this calendar.'}</Text>
    <Text style={u.label}>{zh ? '谁需要有空？' : 'Who needs to be free?'}</Text>
    <ChoiceRow options={options} value={people} onChange={value => {
      setPeople(previous => {
        if (value === '__family__') return [value];
        const next = previous.includes(value) ? previous.filter(item => item !== value) : [...previous.filter(item => item !== '__family__'), value];
        return next.length ? next : ['__family__'];
      });
    }} />
    <Field label={zh ? '起始日期' : 'Starting date'} value={from} onChangeText={setFrom} maxLength={10} />
    <ChoiceRow value={days} onChange={setDays} options={[1, 3, 7, 14].map(value => ({ value, label: zh ? `${value} 天` : `${value} ${value === 1 ? 'day' : 'days'}` }))} />
    <Field label={zh ? '最早开始' : 'Not before'} value={start} onChangeText={setStart} maxLength={5} />
    <Field label={zh ? '最晚结束' : 'Finish by'} value={end} onChangeText={setEnd} maxLength={5} />
    <Text style={u.label}>{zh ? '活动时长' : 'Event length'}</Text>
    <ChoiceRow value={duration} onChange={setDuration} options={durations([15, 30, 45, 60, 90, 120])} />
    <Text style={u.label}>{zh ? '提前准备时间' : 'Advance notice'}</Text>
    <ChoiceRow value={notice} onChange={setNotice} options={durations([0, 30, 60, 1440])} />
    <Field label={zh ? '活动前缓冲时间（分钟）' : 'Buffer before (minutes)'} value={before} onChangeText={setBefore} keyboardType="number-pad" maxLength={3} />
    <Field label={zh ? '活动后缓冲时间（分钟）' : 'Buffer after (minutes)'} value={after} onChangeText={setAfter} keyboardType="number-pad" maxLength={3} />
    <Field label={zh ? '每日最多活动数（0 表示不限）' : 'Daily event limit (0 means unlimited)'} value={maxEvents} onChangeText={setMaxEvents} keyboardType="number-pad" maxLength={2} />
    <Field label={zh ? '每日最多计划分钟数（0 表示不限）' : 'Daily minutes limit (0 means unlimited)'} value={maxMinutes} onChangeText={setMaxMinutes} keyboardType="number-pad" maxLength={4} />
    {!suggestions?.length && <Text style={u.body}>{suggestions ? zh ? '未找到空闲时段。' : 'No matching times.' : zh ? '请检查日期与时间。' : 'Check the date and hours.'}</Text>}
    {suggestions?.map(slot => <Button key={`${slot.date}:${slot.start}`} secondary disabled={!canWrite} onPress={() => onDraft({
      title: zh ? '家庭时间' : 'Family time', startDate: slot.date, start: scheduler.clockString(slot.start), end: scheduler.clockString(slot.end),
      child: people.length === 1 ? people[0] : '__family__', attendees: people[0] === '__family__' ? ['all'] : people,
      bufferBeforeMinutes: scheduler.bufferMinutes(before), bufferAfterMinutes: scheduler.bufferMinutes(after),
    })}>{`${slot.date} · ${scheduler.clockString(slot.start)}–${scheduler.clockString(slot.end)}`}</Button>)}
  </ScrollView>;
}
