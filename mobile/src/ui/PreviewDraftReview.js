import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Sheet } from '../calendar/ui';
import { useThemeStyles } from './AppearanceContext';

export const previewDraftCopy = {
  en: {
    title: 'Unfinished preview activity', close: 'Close',
    notice: 'This unfinished draft is kept on this device. It has not been added to your account calendar.',
    guidance: 'Open Calendar and choose the date. If you were editing an existing activity, open it and choose Edit activity. For a new plan, tap Add activity. Use the details below and save when you are ready.',
    notSet: 'Not set', yes: 'Yes', no: 'No', everyone: 'Everyone',
    none: 'No reminder', atStart: 'At the start', tenBefore: '10 minutes before', thirtyBefore: '30 minutes before',
    low: 'Low', normal: 'Normal', high: 'High',
    labels: {
      title: 'Activity title', startDate: 'Date', start: 'Starts (24-hour time)', end: 'Ends (24-hour time)',
      allDay: 'All day', child: 'Person', location: 'Location', responsible: 'Pickup / responsible adult',
      items: 'What to bring', importance: 'Importance', reminderMinutes: 'Reminder preference'
    }
  },
  zh: {
    title: '未完成的体验活动', close: '关闭',
    notice: '这份未完成的草稿保留在此设备上，尚未添加到账户日历。',
    guidance: '请打开“日历”并选择日期。如果之前正在修改已有活动，请打开原活动并选择“编辑活动”；如果是新计划，请点击“添加活动”。参考下方详情填写，准备好后再保存。',
    notSet: '未填写', yes: '是', no: '否', everyone: '所有人',
    none: '不提醒', atStart: '开始时', tenBefore: '提前 10 分钟', thirtyBefore: '提前 30 分钟',
    low: '低', normal: '普通', high: '高',
    labels: {
      title: '活动标题', startDate: '日期', start: '开始时间（24 小时制）', end: '结束时间（24 小时制）',
      allDay: '全天', child: '参与者', location: '地点', responsible: '接送／负责人',
      items: '携带物品', importance: '重要程度', reminderMinutes: '提醒偏好'
    }
  }
};

function reviewCopy(language) {
  return typeof language === 'string' && language.startsWith('zh') ? previewDraftCopy.zh : previewDraftCopy.en;
}

export function previewDraftRows(draft, language = 'en') {
  const t = reviewCopy(language);
  const data = draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  const text = value => typeof value === 'string' && value.trim() ? value : t.notSet;
  const reminder = data.reminderMinutes === null ? t.none : data.reminderMinutes === 0 ? t.atStart
    : data.reminderMinutes === 10 ? t.tenBefore : data.reminderMinutes === 30 ? t.thirtyBefore : t.notSet;
  const values = {
    title: text(data.title), startDate: text(data.startDate), start: text(data.start), end: text(data.end),
    allDay: data.allDay === true ? t.yes : data.allDay === false ? t.no : t.notSet,
    child: data.child === '__family__' ? t.everyone : text(data.child),
    location: text(data.location), responsible: text(data.responsible), items: text(data.items),
    importance: ['low', 'normal', 'high'].includes(data.importance) ? t[data.importance] : t.notSet,
    reminderMinutes: reminder
  };
  return Object.keys(t.labels).map(key => ({ key, label: t.labels[key], value: values[key] }));
}

// The shell checks account ownership before showing this device-local backup.
export default function PreviewDraftReview({ language = 'en', draft, onClose }) {
  const t = reviewCopy(language), s = useThemeStyles(createStyles);
  return <Sheet title={t.title} closeLabel={t.close} onClose={onClose}>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.notice}><Text style={s.noticeText}>{t.notice}</Text></View>
      <Text style={s.guidance}>{t.guidance}</Text>
      <View style={s.fields}>
        {previewDraftRows(draft, language).map(row => <View key={row.key} style={s.field}>
          <Text style={s.label}>{row.label}</Text><Text selectable style={s.value}>{row.value}</Text>
        </View>)}
      </View>
      <Button secondary onPress={onClose}>{t.close}</Button>
    </ScrollView>
  </Sheet>;
}

function createStyles(colors) {
  return StyleSheet.create({
    content: { padding: 20, paddingBottom: 30, gap: 16 },
    notice: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: 14 },
    noticeText: { color: colors.ink, fontSize: 14, lineHeight: 22 },
    guidance: { color: colors.muted, fontSize: 14, lineHeight: 22 },
    fields: { gap: 12 },
    field: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 12, gap: 4 },
    label: { color: colors.muted, fontSize: 12, lineHeight: 19, fontWeight: '600' },
    value: { color: colors.ink, fontSize: 16, lineHeight: 24, flexShrink: 1 }
  });
}
