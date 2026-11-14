import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, ChoiceRow, Field, useCalendarUi } from './ui';
import calendarHistory from './calendar-history';

const copy = {
  en: { activity: 'Activity history', versions: 'Version history', presets: 'Presets', created: 'Created', updated: 'Edited',
    moved: 'Moved', deleted: 'Deleted', empty: 'No records yet.', device: 'This device', unknown: 'Untitled event',
    loading: 'Loading…', remoteFailed: 'Shared updates could not be loaded. Showing saved calendar history.',
    restore: 'Restore', confirmation: 'Replace this calendar’s events and profiles with this version?',
    keep: 'Keep current calendar', restored: 'Calendar restored', retry: 'Refresh', failed: 'Could not restore. Check your connection and try again.',
    conflict: 'The calendar changed. Refresh before restoring.', events: 'events', profiles: 'profiles',
    presetName: 'Preset name', savePreset: 'Save current calendar as preset', presetSaved: 'Preset saved',
    acknowledge: 'Acknowledge', acknowledged: 'Acknowledged by you', acknowledgeFailed: 'Could not acknowledge this change. Try again.' },
  zh: { activity: '活动历史', versions: '版本历史', presets: '预设', created: '已创建', updated: '已编辑',
    moved: '已移动', deleted: '已删除', empty: '暂无记录。', device: '此设备', unknown: '未命名活动',
    loading: '正在加载…', remoteFailed: '无法加载共享更新，正在显示已保存的日历历史。',
    restore: '恢复', confirmation: '用此版本替换当前日历的活动及资料？',
    keep: '保留当前日历', restored: '已恢复日历', retry: '刷新', failed: '恢复失败，请检查连接后重试。',
    conflict: '日历已更改，请刷新后再恢复。', events: '项活动', profiles: '个资料',
    presetName: '预设名称', savePreset: '将当前日历保存为预设', presetSaved: '已保存预设',
    acknowledge: '确认已读', acknowledged: '您已确认', acknowledgeFailed: '无法确认此变更，请重试。' },
};
const timestamp = value => {
  const date = new Date(value ?? '');
  return Number.isFinite(date.getTime()) ? date : null;
};
const string = value => typeof value === 'string' ? value : '';

export default function CalendarRecords({ client, userId, ownerId, calendarId, data, initialMode, onRestore, onSavePreset, onRefresh, busy, language }) {
  const t = copy[language] || copy.en;
  const { u } = useCalendarUi();
  const [mode, setMode] = useState(initialMode);
  const [remote, setRemote] = useState(null);
  const [reload, setReload] = useState(0);
  const [acknowledging, setAcknowledging] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [message, setMessage] = useState('');
  const [presetName, setPresetName] = useState('');
  const presetId = useRef(null);
  const request = useRef(false);
  useEffect(() => {
    let active = true;
    setRemote(null);
    if (mode !== 'activity' || !client || !ownerId) return;
    void (async () => {
      try {
        const rows = await calendarHistory.loadChanges(client, ownerId, calendarId);
        const ids = rows.map(row => row.id);
        let acknowledgements = null;
        if (userId && ids.length) {
          try {
            const { data: replies, error: replyError } = await client.from('calendar_acknowledgements')
              .select('change_id,user_id,user_email').in('change_id', ids);
            if (!replyError && Array.isArray(replies)) acknowledgements = replies;
          } catch { /* Keep activity history available independently. */ }
        }
        if (active) setRemote({ rows, acknowledgements });
      } catch { if (active) setRemote({ error: true, rows: [] }); }
    })();
    return () => { active = false; };
  }, [client, userId, ownerId, calendarId, reload, mode]);
  const activity = useMemo(() => calendarHistory.mergeChanges(remote?.rows ?? [], data?.audit), [remote, data?.audit]);
  const collection = mode === 'presets' ? 'presets' : 'history';
  const records = mode === 'activity' ? activity : Array.isArray(data?.[collection]) ? data[collection].filter(Boolean) : [];
  async function acknowledge(entry) {
    if (!entry.cloud || !userId || request.current) return;
    request.current = true;
    setAcknowledging(true); setMessage('');
    try {
      const { error } = await client.from('calendar_acknowledgements').insert({ change_id: entry.id, user_id: userId });
      if (error && error.code !== '23505') throw error;
      setReload(value => value + 1);
    } catch { setMessage(t.acknowledgeFailed); }
    finally { request.current = false; setAcknowledging(false); }
  }
  async function restore() {
    if (!confirm || !onRestore || busy || request.current) return;
    request.current = true;
    setMessage('');
    try { await onRestore({ collection, versionId: confirm.entry.id, baseline: confirm.baseline }); setConfirm(null); setMessage(t.restored); }
    catch (error) { setConfirm(null); setMessage(error?.code === 'CONFLICT' ? t.conflict : t.failed); }
    finally { request.current = false; }
  }
  const dateText = value => timestamp(value)?.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') ?? '';
  return <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 30 }}>
    {confirm ? <>
      <Text style={u.heading}>{string(confirm.entry.label || confirm.entry.name)}</Text>
      <Text style={u.body}>{t.confirmation}</Text>
      <Button secondary disabled={busy} onPress={() => setConfirm(null)}>{t.keep}</Button>
      <Button danger disabled={busy} onPress={restore}>{t.restore}</Button>
    </> : <>
      <ChoiceRow options={(onRestore ? ['activity', 'versions', 'presets'] : ['activity']).map(value => ({ value, label: t[value] }))}
        value={mode} disabled={busy} onChange={value => { setMode(value); setMessage(''); }} />
      {!!message && <Text accessibilityRole="alert" style={u.body}>{message}</Text>}
      {mode === 'presets' && !!onSavePreset && <>
        <Field label={t.presetName} value={presetName} editable={!busy} maxLength={100}
          onChangeText={value => { presetId.current = null; setPresetName(value); }} />
        <Button secondary disabled={busy || !presetName.trim()} onPress={async () => {
          if (request.current) return;
          request.current = true;
          presetId.current ||= globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          try { await onSavePreset({ name: presetName.trim(), presetId: presetId.current }); presetId.current = null; setPresetName(''); setMessage(t.presetSaved); }
          catch { setMessage(t.failed); }
          finally { request.current = false; }
        }}>{t.savePreset}</Button>
      </>}
      {mode === 'activity' && remote?.error && <Text accessibilityRole="alert" style={u.error}>{t.remoteFailed}</Text>}
      {mode === 'activity' && !remote && <Text style={u.body}>{t.loading}</Text>}
      {records.length ? records.map((entry, index) => <View key={`${String(entry.id)}:${index}`} style={u.card}>
        <Text style={u.label}>{mode === 'activity' ? `${t[entry.action] || t.updated} · ${string(entry.title) || t.unknown}` : string(entry.label || entry.name)}</Text>
        <Text style={u.body}>{mode === 'activity' ? string(entry.actor) || t.device
          : `${entry.snapshot?.activities?.length || 0} ${t.events} · ${entry.snapshot?.kids?.length || 0} ${t.profiles}`}</Text>
        <Text style={u.body}>{dateText(entry.at || entry.savedAt)}</Text>
        {mode === 'activity' && entry.cloud && !!remote?.acknowledgements && (() => {
          const replies = remote.acknowledgements.filter(reply => reply.change_id === entry.id);
          const mine = replies.some(reply => reply.user_id === userId);
          const names = replies.filter(reply => reply.user_id !== userId).map(reply => reply.user_email).filter(Boolean);
          return <>{!!names.length && <Text style={u.body}>{names.join(' · ')}</Text>}
            {mine ? <Text style={u.body}>{t.acknowledged}</Text>
              : <Button secondary disabled={busy || acknowledging} onPress={() => acknowledge(entry)}>{t.acknowledge}</Button>}</>;
        })()}
        {onRestore && mode !== 'activity' && typeof entry.id === 'string' && !!entry.snapshot &&
          <Button secondary disabled={busy} onPress={() => setConfirm({ entry, baseline: { kids: data.kids, activities: data.activities,
            snapshot: entry.snapshot } })}>{t.restore}</Button>}
      </View>) : (mode !== 'activity' || remote) && <Text style={u.body}>{t.empty}</Text>}
      <Button secondary disabled={busy} onPress={async () => {
        try { await onRefresh?.(); }
        catch { setMessage(t.failed); }
        finally { setReload(value => value + 1); }
      }}>{t.retry}</Button>
    </>}
  </ScrollView>;
}
