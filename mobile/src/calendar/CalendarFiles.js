import React, { useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import files from './calendar-files';
import planning from './planning';
import calendar from '../lib/calendar';
import { Button, useCalendarUi } from './ui';

const copy = {
  en: { title: 'Calendar files', ics: 'Share iCalendar (.ics)', json: 'Share KidsSync backup', pdf: 'Share weekly PDF',
    print: 'Print this week', email: 'Draft weekly email', choose: 'Choose an .ics or .json file', review: 'Review import', append: 'Add events to this calendar',
    cancel: 'Cancel import', saved: 'Events imported', failed: 'Could not complete this action. Please try again.',
    invalid: 'This file could not be read. Check its format, recurrence, or time zone.',
    unsupportedRecurrence: 'This file uses a repeating rule the app cannot represent. Export a simpler series or individual events.',
    unsupportedTimeZone: 'This file uses a different time zone. Export in your phone’s time zone or UTC.',
    profileLimit: 'This backup would exceed 50 family profiles.',
    conflict: 'The calendar changed. Choose the file again to review the latest family profiles.',
    count: (total, skipped) => `${total} events ready to add${skipped ? ` · ${skipped} skipped` : ''}`,
    newProfiles: total => `${total} new family ${total === 1 ? 'profile' : 'profiles'} will also be added.`,
    reassigned: total => `${total} ${total === 1 ? 'event is' : 'events are'} assigned to Family because its person is missing from the backup.`,
    selected: total => `Add ${total} selected ${total === 1 ? 'event' : 'events'}`,
    selectAll: 'Select all', selectNone: 'Clear selection', untimed: 'All day', family: 'Family',
    notes: 'Backups include family profiles and events. Imports add the selected events and any new profiles.', pending: 'Working…' },
  zh: { title: '日历文件', ics: '分享 iCalendar（.ics）', json: '分享 KidsSync 备份', pdf: '分享本周 PDF',
    print: '打印本周', email: '起草每周日程邮件', choose: '选择 .ics 或 .json 文件', review: '核对导入内容', append: '将活动添加到此日历',
    cancel: '取消导入', saved: '活动已导入', failed: '操作失败，请重试。',
    invalid: '无法读取此文件。请检查文件格式、重复规则或时区。',
    unsupportedRecurrence: '文件包含此应用尚不支持的重复规则。请导出较简单的重复活动或单次活动。',
    unsupportedTimeZone: '此文件使用其他时区。请按手机时区或 UTC 导出。',
    profileLimit: '此备份会使家庭资料超过 50 个。',
    conflict: '日历已更改。请重新选择文件，以核对最新家庭资料。',
    count: (total, skipped) => `可添加 ${total} 项活动${skipped ? ` · 跳过 ${skipped} 项` : ''}`,
    newProfiles: total => `同时将添加 ${total} 个新家庭资料。`,
    reassigned: total => `${total} 项活动已分配给全家，因为备份中缺少对应资料。`,
    selected: total => `添加选中的 ${total} 项活动`, selectAll: '全选', selectNone: '清除选择', untimed: '全天', family: '全家',
    notes: '备份包含家庭资料及活动。导入会添加选中的活动和新资料。', pending: '正在处理…' },
};
export const calendarFilesAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export default function CalendarFiles({ language, active, date, kids, events, firstDay, initialMode, onImport, onBusyChange }) {
  const t = copy[language] || copy.en;
  const { u, colors } = useCalendarUi();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState([]);
  const running = useRef(false);

  async function run(work, failure = t.failed) {
    if (running.current) return;
    running.current = true; setWorking(true); onBusyChange(true); setMessage('');
    try { await work(); }
    catch (error) { setMessage(error?.code === 'CONFLICT' ? t.conflict : ({
      UNSUPPORTED_RECURRENCE: t.unsupportedRecurrence, UNSUPPORTED_TIME_ZONE: t.unsupportedTimeZone, PROFILE_LIMIT: t.profileLimit,
    })[error?.message] || failure); }
    finally { running.current = false; setWorking(false); onBusyChange(false); }
  }
  async function shareFile(extension, type, contents) {
    if (!await Sharing.isAvailableAsync()) throw new Error('SHARING_UNAVAILABLE');
    const file = new File(Paths.cache, `kidssync-${Date.now()}.${extension}`);
    await file.write(contents);
    await Sharing.shareAsync(file.uri, { mimeType: type });
  }
  const agenda = () => planning.weekAgenda(events, calendar.dateKey(date), { language, kids, firstDay });
  const printDocument = () => files.printHtml(active.name, agenda());
  const printButton = <Button secondary disabled={working} onPress={() => run(() => Print.printAsync({ html: printDocument() }))}>{t.print}</Button>;
  const importButton = !!onImport && <Button secondary disabled={working} onPress={() => run(async () => {
    const choice = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (choice.canceled) return;
    const asset = choice.assets[0];
    if (asset.size > 2_000_000) throw new Error('INVALID_FILE');
    const file = new File(asset.uri);
    try {
      const imported = files.readImport(await file.text(), kids);
      setDraft(imported); setSelected(imported.events.map(event => event.id));
    }
    finally { try { file.delete(); } catch { /* Cached copies can be evicted by the OS. */ } }
  }, t.invalid)}>{t.choose}</Button>;
  return <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 30 }}>
    {initialMode === 'print' && printButton}
    {!draft && <>
      <Text style={u.body}>{t.notes}</Text>
      {initialMode === 'import' && importButton}
      <Button secondary disabled={working} onPress={() => run(() => shareFile('ics', 'text/calendar', files.exportIcs(events, active.name)))}>{t.ics}</Button>
      <Button secondary disabled={working} onPress={() => run(() => shareFile('json', 'application/json', JSON.stringify({
        app: 'KidsSync', version: 2, exportedAt: new Date().toISOString(), calendar: active.name, kids, activities: events,
      }, null, 2)))}>{t.json}</Button>
      <Button secondary disabled={working} onPress={() => run(async () => {
        if (!await Sharing.isAvailableAsync()) throw new Error('SHARING_UNAVAILABLE');
        const pdf = await Print.printToFileAsync({ html: printDocument() });
        await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf' });
      })}>{t.pdf}</Button>
      {initialMode !== 'print' && printButton}
      <Button secondary disabled={working} onPress={() => run(() => Linking.openURL(
        `mailto:?subject=${encodeURIComponent(`${active.name} · ${language === 'zh' ? '每周安排' : 'Weekly agenda'}`)}&body=${encodeURIComponent(agenda())}`
      ))}>{t.email}</Button>
      {initialMode !== 'import' && importButton}
    </>}
    {draft && <>
      <Text accessibilityRole="header" style={u.heading}>{t.review}</Text>
      <Text style={u.body}>{t.count(draft.events.length, draft.skipped)}</Text>
      {!!draft.profiles.length && <Text style={u.body}>{t.newProfiles(draft.profiles.length)} {draft.profiles.map(profile => profile.name).join(', ')}</Text>}
      {!!draft.reassigned && <Text style={u.body}>{t.reassigned(draft.reassigned)}</Text>}
      <View style={u.choices}>
        <Button secondary disabled={working} onPress={() => setSelected(draft.events.map(event => event.id))}>{t.selectAll}</Button>
        <Button secondary disabled={working} onPress={() => setSelected([])}>{t.selectNone}</Button>
      </View>
      {draft.events.map(event => {
        const checked = selected.includes(event.id);
        return <Pressable key={event.id} accessibilityRole="checkbox" accessibilityLabel={event.title}
          accessibilityState={{ checked, disabled: working }} disabled={working}
          onPress={() => setSelected(previous => checked ? previous.filter(id => id !== event.id) : [...previous, event.id])}
          style={[u.card, { borderColor: checked ? colors.primary : colors.line }]}>
          <Text style={u.label}>{checked ? '✓ ' : ''}{event.title}</Text>
          <Text style={u.body}>{event.startDate}{event.endDate ? ` – ${event.endDate}` : ''} · {event.allDay ? t.untimed : `${calendar.formatTime(event.start, language)}–${calendar.formatTime(event.end, language)}`}</Text>
          <Text style={u.body}>{event.child === '__family__' ? t.family : event.child}{event.location ? ` · ${event.location}` : ''}</Text>
        </Pressable>;
      })}
      <Button disabled={working || !selected.length} onPress={() => run(async () => {
        const events = draft.events.filter(event => selected.includes(event.id));
        await onImport(draft.profiles.length ? { events, profiles: draft.profiles, originalKids: draft.originalKids } : events);
        setDraft(null); setMessage(t.saved);
      })}>{t.selected(selected.length)}</Button>
      <Button secondary disabled={working} onPress={() => setDraft(null)}>{t.cancel}</Button>
    </>}
    {(working || !!message) && <Text accessibilityRole="alert" style={u.body}>{working ? t.pending : message}</Text>}
  </ScrollView>;
}
