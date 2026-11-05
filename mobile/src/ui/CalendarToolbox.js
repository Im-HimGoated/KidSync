import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Archive, CalendarDays, ChevronDown, ChevronRight, Clock, ExternalLink, FileDown, History, ListFilter, NotebookPen, Plug, Printer, ScanLine, Search, Settings2, Share2 } from 'lucide-react-native';
import { Sheet } from '../calendar/ui';
import { useAppearance, useThemeStyles } from './AppearanceContext';

export const toolboxCopy = {
  en: {
    title: 'Calendar tools', close: 'Close', intro: 'A few useful extras, all in one place.',
    plan: 'Plan & review', customize: 'Find & customize', connect: 'Connect & import', records: 'History & files',
    sectionHint: 'Show or hide these tools.', toolsCount: '{count} tools',
    web: 'Web', unavailable: 'Unavailable', opening: 'Opening…',
    webHint: 'Opens the KidsSync website in your browser.',
    unavailableHint: 'This tool is not connected in this version.',
    webNote: 'Tools marked Web open the website. You may need to sign in there or finish provider setup.',
    failed: 'Could not open that tool. Please try again.',
    openTime: 'Open time', openTimeHint: 'Look for room in the current calendar.', openTimeWeb: 'Use Day & week planning on the website.',
    compareDays: 'Compare days', compareDaysHint: 'See how two days fit together.', compareDaysWeb: 'Compare days in the website’s planning tools.',
    dayNotes: 'Day notes', dayNotesHint: 'Keep a note alongside a day’s plans.', dayNotesWeb: 'Open Day notes on the website.',
    shareWeek: 'Share week', shareWeekHint: 'Review a weekly summary before sharing.', shareWeekWeb: 'Open Weekly summary on the website.',
    findEvents: 'Find events', findEventsHint: 'Look up a plan in this calendar.', findEventsWeb: 'Find events in the website’s planning tools.',
    savedViews: 'Saved views', savedViewsHint: 'Return to a useful calendar view.', savedViewsWeb: 'Open Family brief & views on the website.',
    preferences: 'Calendar preferences', preferencesHint: 'Review or edit your setup answers.', preferencesWeb: 'Change calendar preferences on the website.',
    scan: 'Scan document', scanWeb: 'Add plans from a flyer or school notice on the website.',
    connections: 'Connected calendars', connectionsWeb: 'Set up Google or Outlook read-only connections.',
    googleImport: 'Import Google Calendar', googleImportWeb: 'Copy Google events into KidsSync on the website.',
    activityHistory: 'Activity history', activityHistoryWeb: 'See who changed plans on the website.',
    versionHistory: 'Version history', versionHistoryWeb: 'Review saved calendar versions on the website.',
    export: 'Export calendar', exportWeb: 'Calendar (.ics), PDF and backup files on the website.',
    print: 'Print schedule', printWeb: 'Use the website’s print-friendly schedule.'
  },
  zh: {
    title: '日历工具', close: '关闭', intro: '把实用的小工具放在一起。',
    plan: '计划与回顾', customize: '查找与偏好', connect: '连接与导入', records: '历史与文件',
    sectionHint: '展开或收起这些工具。', toolsCount: '{count} 个工具',
    web: '网页', unavailable: '暂不可用', opening: '正在打开…',
    webHint: '将在浏览器中打开 KidsSync 网站。',
    unavailableHint: '此版本尚未连接此工具。',
    webNote: '标有“网页”的工具会打开网站。你可能需要在网页中登录，或完成服务商设置。',
    failed: '无法打开此工具，请重试。',
    openTime: '空闲时间', openTimeHint: '查找当前日历中的空档。', openTimeWeb: '在网页中使用“日与周计划”。',
    compareDays: '比较日期', compareDaysHint: '比较两天的日程安排。', compareDaysWeb: '在网页计划工具中比较日期。',
    dayNotes: '当日笔记', dayNotesHint: '为一天的计划留一条笔记。', dayNotesWeb: '在网页中打开当日笔记。',
    shareWeek: '分享本周', shareWeekHint: '分享前先查看本周摘要。', shareWeekWeb: '在网页中打开每周摘要。',
    findEvents: '查找活动', findEventsHint: '查找当前日历中的安排。', findEventsWeb: '在网页计划工具中查找活动。',
    savedViews: '已存视图', savedViewsHint: '快速回到常用的日历视图。', savedViewsWeb: '在网页中打开家庭简报与视图。',
    preferences: '日历偏好', preferencesHint: '核对或修改最初的设置答案。', preferencesWeb: '在网页中修改日历偏好。',
    scan: '扫描文件', scanWeb: '在网页中从活动传单或学校通知添加安排。',
    connections: '已连接日历', connectionsWeb: '设置 Google 或 Outlook 只读连接。',
    googleImport: '导入 Google 日历', googleImportWeb: '在网页中将 Google 日程复制到 KidsSync。',
    activityHistory: '活动历史', activityHistoryWeb: '在网页中查看谁修改了安排。',
    versionHistory: '版本历史', versionHistoryWeb: '在网页中查看已保存的日历版本。',
    export: '导出日历', exportWeb: '在网页中导出日历（.ics）、PDF 或备份文件。',
    print: '打印日程', printWeb: '在网页中使用适合打印的日程。'
  }
};

// Fixed IDs are navigation intents, never URLs. The parent owns navigation and
// modal replacement. Web-only tools stay Web even if an availability map is wrong.
export const toolboxSections = Object.freeze([
  Object.freeze({ id: 'plan', tools: Object.freeze([
    Object.freeze({ id: 'open-time', label: 'openTime', native: 'planning' }),
    Object.freeze({ id: 'compare-days', label: 'compareDays', native: 'planning' }),
    Object.freeze({ id: 'day-notes', label: 'dayNotes', native: 'planning' }),
    Object.freeze({ id: 'share-week', label: 'shareWeek', native: 'planning' })
  ]) }),
  Object.freeze({ id: 'customize', tools: Object.freeze([
    Object.freeze({ id: 'find-events', label: 'findEvents', native: 'planning' }),
    Object.freeze({ id: 'saved-views', label: 'savedViews', native: 'planning' }),
    Object.freeze({ id: 'calendar-preferences', label: 'preferences', native: 'preferences' })
  ]) }),
  Object.freeze({ id: 'connect', tools: Object.freeze([
    Object.freeze({ id: 'scan-document', label: 'scan' }),
    Object.freeze({ id: 'connected-calendars', label: 'connections' }),
    Object.freeze({ id: 'google-import', label: 'googleImport' })
  ]) }),
  Object.freeze({ id: 'records', tools: Object.freeze([
    Object.freeze({ id: 'activity-history', label: 'activityHistory' }),
    Object.freeze({ id: 'version-history', label: 'versionHistory' }),
    Object.freeze({ id: 'export-calendar', label: 'export' }),
    Object.freeze({ id: 'print-schedule', label: 'print' })
  ]) })
]);

export function resolveToolAction(id, options = {}) {
  const tool = toolboxSections.flatMap(section => section.tools).find(item => item.id === id);
  if (!tool) return { kind: 'unavailable' };
  if (tool.native === 'preferences' && typeof options.onPreferences === 'function') return { kind: 'native', invoke: () => options.onPreferences() };
  if (tool.native === 'planning' && Object.prototype.hasOwnProperty.call(options.nativeAvailability || {}, id) && options.nativeAvailability[id] === true) {
    if (typeof options.onPlanning === 'function') return { kind: 'native', invoke: () => options.onPlanning(id) };
    if (typeof options.onTool === 'function') return { kind: 'native', invoke: () => options.onTool(id) };
  }
  if (typeof options.onWebsite === 'function') return { kind: 'web', invoke: () => options.onWebsite(id) };
  return { kind: 'unavailable' };
}

export async function runToolAction(id, options) {
  const action = resolveToolAction(id, options);
  if (!action.invoke) return { ok: false, reason: 'unavailable' };
  try {
    const result = await action.invoke();
    if (result === false || result?.error) return { ok: false, reason: 'failed' };
    return { ok: true, kind: action.kind };
  } catch { return { ok: false, reason: 'failed' }; }
}

// UI: actions run only after a press. Parents should replace/close the menu in
// their callbacks; calling onClose after them could close a newly opened sheet.
export default function CalendarToolbox({ language = 'en', onClose, onPlanning, onPreferences, onWebsite, onTool, nativeAvailability = {}, embedded = false }) {
  const t = toolboxCopy[String(language).startsWith('zh') ? 'zh' : 'en'];
  const { colors } = useAppearance(), s = useThemeStyles(createStyles);
  const [opening, setOpening] = useState(''), [failed, setFailed] = useState('');
  const [expanded, setExpanded] = useState({ plan: true });
  const request = useRef(false), mounted = useRef(true);
  const options = { onPlanning, onPreferences, onWebsite, onTool, nativeAvailability };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function choose(id) {
    if (request.current || resolveToolAction(id, options).kind === 'unavailable') return;
    request.current = true; setOpening(id); setFailed('');
    const result = await runToolAction(id, options);
    request.current = false;
    if (mounted.current) { setOpening(''); setFailed(result.ok ? '' : id); }
  }
  const hasWebTools = toolboxSections.some(section => section.tools.some(tool => resolveToolAction(tool.id, options).kind === 'web'));
  const content = <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.intro}>{t.intro}</Text>
      {toolboxSections.map(section => <View key={section.id} style={s.section}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t[section.id]}, ${t.toolsCount.replace('{count}', section.tools.length)}`}
          accessibilityHint={t.sectionHint} aria-expanded={!!expanded[section.id]} accessibilityState={{ expanded: !!expanded[section.id] }}
          onPress={() => setExpanded(value => ({ ...value, [section.id]: !value[section.id] }))} style={s.sectionHeading}>
          <Text style={[s.sectionTitle, s.flex]}>{t[section.id]}</Text>
          {section.tools.every(tool => resolveToolAction(tool.id, options).kind === 'web') && <Text style={s.badge}>{t.web}</Text>}
          <Text style={s.count}>{section.tools.length}</Text><ChevronDown size={17} color={colors.muted} style={expanded[section.id] && s.expanded} aria-hidden={true} />
        </Pressable>
        {!!expanded[section.id] && <View style={s.rows}>{section.tools.map((tool, index) => {
          const action = resolveToolAction(tool.id, options), web = action.kind === 'web', unavailable = action.kind === 'unavailable';
          const disabled = !!opening || unavailable, Icon = toolIcons[tool.id];
          const detail = unavailable ? t.unavailableHint : t[`${tool.label}${web ? 'Web' : 'Hint'}`];
          return <View key={tool.id}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t[tool.label]}${web ? `, ${t.web}` : unavailable ? `, ${t.unavailable}` : ''}`}
              accessibilityHint={web ? `${detail} ${t.webHint}` : detail} aria-disabled={disabled} accessibilityState={{ disabled, busy: opening === tool.id }} disabled={disabled}
              onPress={() => choose(tool.id)} style={({ pressed }) => [s.row, index > 0 && s.divider, unavailable && s.unavailable, pressed && s.pressed]}>
              <View style={s.icon}><Icon size={19} color={unavailable ? colors.muted : colors.primary} aria-hidden={true} /></View>
              <View style={s.flex}><Text style={s.rowTitle}>{t[tool.label]}</Text><Text style={s.detail}>{opening === tool.id ? t.opening : detail}</Text></View>
              {web && <Text style={s.badge}>{t.web}</Text>}
              {opening === tool.id ? <ActivityIndicator size="small" color={colors.primary} accessibilityLabel={t.opening} /> : !unavailable && (web ? <ExternalLink size={16} color={colors.muted} aria-hidden={true} /> : <ChevronRight size={17} color={colors.muted} aria-hidden={true} />)}
            </Pressable>
            {failed === tool.id && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{t.failed}</Text>}
          </View>;
        })}</View>}
      </View>)}
      {hasWebTools && <Text style={s.note}>{t.webNote}</Text>}
    </ScrollView>;
  return embedded ? content : <Sheet title={t.title} closeLabel={t.close} onClose={onClose}>{content}</Sheet>;
}

const toolIcons = {
  'open-time': Clock, 'compare-days': CalendarDays, 'day-notes': NotebookPen, 'share-week': Share2,
  'find-events': Search, 'saved-views': ListFilter, 'calendar-preferences': Settings2,
  'scan-document': ScanLine, 'connected-calendars': Plug, 'google-import': CalendarDays,
  'activity-history': History, 'version-history': Archive, 'export-calendar': FileDown, 'print-schedule': Printer
};
function createStyles(colors) { return StyleSheet.create({
  scroll: { minHeight: 0, flexShrink: 1 }, content: { paddingHorizontal: 18, paddingTop: 3, paddingBottom: 26, gap: 20 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 22 }, section: { gap: 8 },
  sectionHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 }, sectionTitle: { color: colors.ink, fontSize: 13, lineHeight: 20, fontWeight: '600' }, count: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] }, expanded: { transform: [{ rotate: '180deg' }] },
  rows: { borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { minHeight: 68, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line }, icon: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  flex: { flex: 1, minWidth: 0, gap: 3 }, rowTitle: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 18 }, badge: { color: colors.primary, backgroundColor: colors.primarySoft, fontSize: 10, lineHeight: 16, fontWeight: '600', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 19 }, error: { color: colors.error, backgroundColor: colors.errorSoft, fontSize: 12, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 10 },
  unavailable: { opacity: 0.65 }, pressed: { backgroundColor: colors.primarySoft }
}); }
