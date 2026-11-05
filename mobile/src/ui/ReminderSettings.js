import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Bell, RefreshCw, Settings } from 'lucide-react-native';
import { Button, Sheet } from '../calendar/ui';
import { useAppearance, useThemeStyles } from './AppearanceContext';

export const reminderCopy = {
  en: {
    title: 'Phone reminders', close: 'Close', toggle: 'Local reminders',
    privacy: 'Lock-screen messages stay generic. Activity names, people and locations are never shown.',
    detail: 'Uses reminder times from confirmed calendars you own. Calendars shared with you do not schedule reminders here. All-day plans start at 9 AM. Schedules the next 14 days on this device; open KidsSync regularly to refresh. Changes from other devices update here when KidsSync reconnects.',
    limit: 'Up to 48 upcoming reminders fit at a time. Delivery can be delayed or silenced by Focus, device settings or Android battery limits. No push or email reminders.',
    disabled: 'Off on this device', scheduled: 'Upcoming reminders scheduled', waiting: 'Waiting for a confirmed calendar you own',
    loading: 'Checking reminders…', configuring: 'Updating reminders…', 'permission-denied': 'Notifications are blocked. Allow them in system settings, then return here and enable reminders.',
    unsupported: 'Local reminders need the iPhone or Android app.', 'signed-out': 'Sign in to set reminders.',
    error: 'Could not update reminders. Check device settings and retry.', settings: 'Open system settings', retry: 'Retry',
    settingsFailed: 'Could not open settings. Open your phone’s Settings app manually.', count: 'Scheduled', trimmed: 'More plans will be scheduled on your next refresh.'
  },
  zh: {
    title: '手机提醒', close: '关闭', toggle: '本地提醒',
    privacy: '锁屏消息仅显示通用提示，不会显示活动名称、人员或地点。',
    detail: '使用你拥有且已确认的日历中的提醒时间。他人共享给你的日历不会在此安排提醒。全天活动按上午 9 点开始计算。此设备会安排未来 14 天的提醒；请定期打开 KidsSync 刷新。其他设备的更改会在此应用重新连接后更新。',
    limit: '最多安排 48 条即将到来的提醒。专注模式、设备设置或安卓省电限制可能延迟或静音提醒。不提供远程推送或邮件提醒。',
    disabled: '此设备已关闭', scheduled: '已安排即将到来的提醒', waiting: '正在等待你拥有且已确认的日历',
    loading: '正在检查提醒…', configuring: '正在更新提醒…', 'permission-denied': '通知被阻止。请在系统设置中允许通知，返回后开启提醒。',
    unsupported: '本地提醒需要 iPhone 或安卓应用。', 'signed-out': '登录后可设置提醒。',
    error: '无法更新提醒，请检查设备设置后重试。', settings: '打开系统设置', retry: '重试',
    settingsFailed: '无法打开设置，请手动打开手机的设置应用。', count: '已安排', trimmed: '下次刷新时会安排更多活动。'
  }
};

// Pass the result of useLocalReminders as `reminders`; shell owns visibility.
export default function ReminderSettings({ language = 'en', reminders, onClose }) {
  const t = reminderCopy[language] || reminderCopy.en;
  const { colors } = useAppearance();
  const s = useThemeStyles(createStyles);
  const { state, busy, enable, disable, refresh, openSettings } = reminders;
  const [settingsFailed, setSettingsFailed] = useState(false);
  const unavailable = ['unsupported', 'signed-out'].includes(state.status);
  async function settings() { try { await openSettings(); setSettingsFailed(false); } catch { setSettingsFailed(true); } }
  return <Sheet title={t.title} closeLabel={t.close} onClose={onClose} busy={state.status === 'configuring'}>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.row}><Bell size={22} color={colors.primary} /><Text style={[s.label, s.flex]}>{t.toggle}</Text>
        <Switch accessibilityLabel={t.toggle} accessibilityState={{ disabled: busy || unavailable, checked: !!state.enabled }}
          trackColor={{ false: colors.line, true: colors.primary }} thumbColor={state.enabled ? colors.onPrimary : colors.surface} ios_backgroundColor={colors.line}
          disabled={busy || unavailable} value={!!state.enabled} onValueChange={value => value ? enable() : disable()} />
      </View>
      <Text accessibilityRole={['error', 'permission-denied'].includes(state.status) ? 'alert' : 'text'} style={['error', 'permission-denied'].includes(state.status) ? s.error : s.body}>{t[state.status] || t.waiting}</Text>
      {state.status === 'scheduled' && <Text style={s.body}>{t.count}: {state.scheduled || 0}{state.trimmed > 0 ? ` · ${t.trimmed}` : ''}</Text>}
      <Text style={s.body}>{t.privacy}</Text><Text style={s.body}>{t.detail}</Text><Text style={s.body}>{t.limit}</Text>
      {state.status === 'permission-denied' && <Button secondary icon={Settings} onPress={settings}>{t.settings}</Button>}
      {!!settingsFailed && <Text accessibilityRole="alert" style={s.error}>{t.settingsFailed}</Text>}
      {!unavailable && <Button secondary icon={RefreshCw} disabled={busy} onPress={refresh}>{t.retry}</Button>}
    </ScrollView>
  </Sheet>;
}
function createStyles(colors) {
  return StyleSheet.create({
    content: { padding: 20, paddingBottom: 30, gap: 16, backgroundColor: colors.surface },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, flex: { flex: 1, minWidth: 0 },
    label: { color: colors.ink, fontSize: 14, lineHeight: 22, fontWeight: '600' },
    body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
    error: { color: colors.error, backgroundColor: colors.errorSoft, padding: 12, borderRadius: 8, fontSize: 14, lineHeight: 22 }
  });
}
