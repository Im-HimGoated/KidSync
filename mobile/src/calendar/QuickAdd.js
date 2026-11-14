import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import calendar from '../lib/calendar';
import quick from './quick-add';
import { Button, Field, useCalendarUi } from './ui';

export default function QuickAdd({ language, date, onDraft }) {
  const zh = language === 'zh';
  const { u } = useCalendarUi();
  const [description, setDescription] = useState('');
  const [error, setError] = useState(false);
  const example = zh ? '钢琴 明天 16:00–17:00 @ 音乐教室' : 'Piano tomorrow 4–5pm @ Music Studio';
  return <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
    <Field label={zh ? '描述一项活动' : 'Describe an event'} placeholder={example} value={description}
      multiline maxLength={500} onChangeText={value => { setDescription(value); setError(false); }} />
    {!!error && <Text accessibilityRole="alert" style={u.error}>
      {zh ? '请输入活动名称。' : 'Enter an event name.'}
    </Text>}
    <Button secondary onPress={() => { setDescription(example); setError(false); }}>{zh ? '试用示例' : 'Try an example'}</Button>
    <Button disabled={!description.trim()} onPress={() => {
      const draft = quick.quickDraft(description, calendar.dateKey(new Date()), calendar.dateKey(date));
      if (draft) onDraft(draft);
      else setError(true);
    }}>{zh ? '在编辑器中核对' : 'Review in event editor'}</Button>
  </ScrollView>;
}
