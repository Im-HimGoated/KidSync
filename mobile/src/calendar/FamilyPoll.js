import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import pollModel from '../../../assets/family-polls';
import scheduler from '../../../assets/smart-scheduling';
import calendar from '../lib/calendar';
import eventOptions from './event-options';
import { Button, ChoiceRow, Field, useCalendarUi } from './ui';

const copy = {
  en: { title: 'Plan name', people: 'Participants (one per line)', create: 'Create poll', date: 'Date', start: 'Starts', end: 'Ends',
    add: 'Add time option', remove: 'Remove option', reset: 'Reset poll', keep: 'Keep poll', share: 'Share options', review: 'Review time',
    intro: 'Compare up to five times. Record replies here on this device.', preferred: 'Most preferred',
    invalid: 'Enter a plan name and up to eight different names.', invalidTime: 'Choose a new future time with the end after the start.',
    failed: 'Could not save this poll on this device.', answers: ['Awaiting reply', 'Yes', 'If needed', 'No'] },
  zh: { title: '计划名称', people: '参与者（每行一位）', create: '创建投票', date: '日期', start: '开始', end: '结束',
    add: '添加候选时段', remove: '移除候选', reset: '重置投票', keep: '保留投票', share: '分享候选时段', review: '核对时段',
    intro: '比较最多五个时段，并在此设备上记录回复。', preferred: '最受欢迎',
    invalid: '请输入计划名称及最多八个不同的姓名。', invalidTime: '请选择新的未来时段，结束时间须晚于开始时间。',
    failed: '无法在此设备保存投票。', answers: ['待回复', '可以', '必要时可以', '不可以'] },
};
const answers = ['pending', 'yes', 'maybe', 'no'];
const id = () => globalThis.crypto?.randomUUID?.() || `poll-${Date.now()}-${Math.random().toString(36).slice(2)}`;

import erasure from '../lib/account-erasure';
export default function FamilyPoll({ language, scope, initialDate, kids, events, onDraft, canWrite }) {
  const t = copy[language] || copy.en, { u } = useCalendarUi();
  const key = `kidssync:mobile:poll:v1:${scope}`;
  const [poll, setPoll] = useState(null), [ready, setReady] = useState(false);
  const [title, setTitle] = useState(''), [names, setNames] = useState(() => kids.map(kid => kid.name).slice(0, 8).join('\n'));
  const [date, setDate] = useState(initialDate), [start, setStart] = useState('16:00'), [end, setEnd] = useState('17:00');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const writing = useRef(false), mounted = useRef(true);
  const pendingSave = useRef(Promise.resolve());
  useEffect(() => {
    mounted.current = true;
    AsyncStorage.getItem(key).then(raw => {
      if (!mounted.current) return;
      const saved = raw ? pollModel.normalizePoll(JSON.parse(raw)) : null;
      if (raw && !saved) throw new Error('Invalid poll');
      setPoll(saved); setReady(true);
    }).catch(() => { if (mounted.current) setError(t.failed); });
    return () => { mounted.current = false; };
  }, [key, t.failed]);
  async function save(next) {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError('');
    const operation = (async () => {
    try {
      const actor = JSON.parse(scope)?.[0];
      erasure.registerQueue(AsyncStorage, actor, key, () => pendingSave.current);
      if (next) await AsyncStorage.setItem(key, JSON.stringify(next));
      else await AsyncStorage.removeItem(key);
      if (mounted.current) { setPoll(next); setConfirm(false); }
    } catch { if (mounted.current) setError(t.failed); }
    finally { writing.current = false; if (mounted.current) setBusy(false); }
    })();
    pendingSave.current = operation;
    await operation;
  }
  function add() {
    const option = { id: id(), date, start, end };
    const startMinute = scheduler.clock(start);
    const from = startMinute === null ? null : scheduler.wallTime(date, startMinute);
    const next = pollModel.normalizePoll({ ...poll, options: [...poll.options, option] });
    if (!from || from <= new Date() || next?.options.length !== poll.options.length + 1) setError(t.invalidTime);
    else void save(next);
  }
  function review(option) {
    const from = scheduler.clock(option.start), to = scheduler.clock(option.end);
    const people = poll.people.filter(person => kids.some(kid => kid.name === person));
    const date = calendar.parseDateKey(option.date);
    const busy = scheduler.busyIntervals(eventOptions.nearbyEvents(events, date), people.length ? people : ['__family__']);
    if (scheduler.wallTime(option.date, from) <= new Date() || !scheduler.roomFor(from, to, busy)) { setError(t.invalidTime); return; }
    onDraft({ title: poll.title, startDate: option.date, start: option.start, end: option.end,
      child: people.length === 1 ? people[0] : '__family__', attendees: people.length ? people : ['all'] });
  }
  const preferred = poll ? pollModel.preferredOptions(poll) : [];
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 30 }}>
    <Text style={u.body}>{t.intro}</Text>
    {!!error && <Text accessibilityRole="alert" style={u.error}>{error}</Text>}
    {ready && (!poll ? <>
      <Field label={t.title} value={title} onChangeText={setTitle} maxLength={100} />
      <Field label={t.people} value={names} onChangeText={setNames} multiline maxLength={335} />
      <Button disabled={busy} onPress={() => {
        const draft = pollModel.normalizePoll({ version: 1, id: id(), title, people: names.split('\n').map(name => name.trim()).filter(Boolean), options: [] });
        if (draft) void save(draft);
        else setError(t.invalid);
      }}>{t.create}</Button>
    </> : <>
      <Text accessibilityRole="header" style={u.heading}>{poll.title}</Text>
      {poll.options.map(option => <View key={option.id} style={u.card}>
        <Text style={u.label}>{option.date} · {option.start}–{option.end}</Text>
        {preferred.includes(option.id) && <Text style={u.body}>{t.preferred}</Text>}
        {poll.people.map((person, index) => <View key={person} style={{ marginVertical: 6 }}>
          <Text style={u.label}>{person}</Text>
          <ChoiceRow label={person} value={option.votes[index]} disabled={busy}
            options={answers.map((value, i) => ({ value, label: t.answers[i] }))}
            onChange={value => save({ ...poll, options: poll.options.map(item => item.id === option.id
              ? { ...item, votes: item.votes.map((answer, i) => i === index ? value : answer) } : item) })} />
        </View>)}
        {canWrite && pollModel.voteTotals(option).ready && <Button secondary disabled={busy} onPress={() => review(option)}>{t.review}</Button>}
        <Button secondary danger disabled={busy} onPress={() => save({ ...poll, options: poll.options.filter(item => item.id !== option.id) })}>{t.remove}</Button>
      </View>)}
      {poll.options.length < 5 && <>
        <Field label={t.date} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} />
        <Field label={t.start} value={start} onChangeText={setStart} maxLength={5} />
        <Field label={t.end} value={end} onChangeText={setEnd} maxLength={5} />
        <Button secondary disabled={busy} onPress={add}>{t.add}</Button>
      </>}
      {!!poll.options.length && <Button secondary disabled={busy} onPress={() => {
        Share.share({ message: [poll.title, ...poll.options.map(option => `${option.date} · ${option.start}–${option.end}`)].join('\n') })
          .catch(() => setError(t.failed));
      }}>{t.share}</Button>}
      {confirm && <Button secondary disabled={busy} onPress={() => setConfirm(false)}>{t.keep}</Button>}
      <Button danger disabled={busy} onPress={() => confirm ? save(null) : setConfirm(true)}>{confirm ? `${t.reset}?` : t.reset}</Button>
    </>)}
  </ScrollView>;
}
