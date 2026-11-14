import React, { useRef, useState } from 'react';
import { Linking, Platform, ScrollView, Text } from 'react-native';
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
    count: (total, skipped) => `${total} events ready to add${skipped ? ` · ${skipped} skipped` : ''}`,
    notes: 'The backup includes family profiles and events in this calendar.', pending: 'Working…' },
  zh: { title: '日历文件', ics: '分享 iCalendar（.ics）', json: '分享 KidsSync 备份', pdf: '分享本周 PDF',
    print: '打印本周', email: '起草每周日程邮件', choose: '选择 .ics 或 .json 文件', review: '核对导入内容', append: '将活动添加到此日历',
    cancel: '取消导入', saved: '活动已导入', failed: '操作失败，请重试。',
    invalid: '无法读取此文件。请检查文件格式、重复规则或时区。',
    count: (total, skipped) => `可添加 ${total} 项活动${skipped ? ` · 跳过 ${skipped} 项` : ''}`,
    notes: '备份包含此日历中的家庭资料和活动。', pending: '正在处理…' },
};
export const calendarFilesAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export default function CalendarFiles({ language, active, date, kids, events, firstDay, initialMode, onImport, onBusyChange }) {
  const t = copy[language] || copy.en;
  const { u } = useCalendarUi();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(null);
  const running = useRef(false);

  async function run(work, failure = t.failed) {
    if (running.current) return;
    running.current = true; setWorking(true); onBusyChange(true); setMessage('');
    try { await work(); }
    catch { setMessage(failure); }
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
  return <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 30 }}>
    {initialMode === 'print' && printButton}
    {!draft && <>
      <Text style={u.body}>{t.notes}</Text>
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
      {!!onImport && <Button secondary disabled={working} onPress={() => run(async () => {
        const choice = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (choice.canceled) return;
        const asset = choice.assets[0];
        if (asset.size > 2_000_000) throw new Error('INVALID_FILE');
        const file = new File(asset.uri);
        try { setDraft(files.readImport(await file.text(), kids)); }
        finally { try { file.delete(); } catch { /* Cached copies can be evicted by the OS. */ } }
      }, t.invalid)}>{t.choose}</Button>}
    </>}
    {draft && <>
      <Text accessibilityRole="header" style={u.heading}>{t.review}</Text>
      <Text style={u.body}>{t.count(draft.events.length, draft.skipped)}</Text>
      {draft.events.slice(0, 8).map(event => <Text key={event.id} style={u.body}>{event.title}</Text>)}
      <Button disabled={working} onPress={() => run(async () => { await onImport(draft.events); setDraft(null); setMessage(t.saved); })}>{t.append}</Button>
      <Button secondary disabled={working} onPress={() => setDraft(null)}>{t.cancel}</Button>
    </>}
    {(working || !!message) && <Text accessibilityRole="alert" style={u.body}>{working ? t.pending : message}</Text>}
  </ScrollView>;
}
