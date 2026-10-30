import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronRight, Moon, Palette, Smartphone, Sun } from 'lucide-react-native';
import { Sheet } from '../calendar/ui';
import { useAppearance, useThemeStyles } from './AppearanceContext';
import theme from './theme';

export const appearanceCopy = {
  en: {
    title: 'Appearance', close: 'Close', intro: 'A calmer calendar, in your colors.',
    mode: 'Color mode', system: 'Device default', light: 'Light', dark: 'Dark',
    systemHint: 'Device default follows your phone’s appearance automatically.', accent: 'Accent color',
    sage: 'Sage', ocean: 'Ocean', lavender: 'Lavender', rose: 'Rose',
    preview: 'Live preview', example: 'Example day', sample: 'Family afternoon', sampleTime: '3:00–4:00 PM', samplePerson: 'Everyone', sampleNote: 'A clear plan, with room to breathe.',
    saved: 'Saved on this device for this account or guest preview. It does not change anyone else’s calendar.',
    saving: 'Saving appearance…', loading: 'Loading appearance…', unavailable: 'Appearance settings are not connected in this preview.',
    loadFailed: 'Could not load this profile’s saved appearance. Using device-default colors; your calendar is unchanged.',
    saveFailed: 'These colors are only previewed. Could not save on this device; retry to keep them.',
    retry: 'Try again', reset: 'Reset appearance', resetHint: 'Returns to Device default + Sage. Your plans stay unchanged.',
    activeLight: 'Currently light', activeDark: 'Currently dark'
  },
  zh: {
    title: '外观', close: '关闭', intro: '用喜欢的颜色，轻松安排家庭日历。',
    mode: '颜色模式', system: '随设备', light: '浅色', dark: '深色',
    systemHint: '“随设备”会自动跟随手机的外观设置。', accent: '强调色',
    sage: '鼠尾草绿', ocean: '海洋蓝', lavender: '薰衣草紫', rose: '柔和玫瑰',
    preview: '实时预览', example: '示例日程', sample: '家庭午后', sampleTime: '15:00–16:00', samplePerson: '全家人', sampleNote: '清晰的计划，也留一点自由时光。',
    saved: '仅为此账户或访客体验保存在此设备上，不会改变其他人的日历。',
    saving: '正在保存外观…', loading: '正在加载外观…', unavailable: '此预览尚未连接外观设置。',
    loadFailed: '无法加载此资料的外观，暂用设备默认颜色。日历未被更改。',
    saveFailed: '这些颜色目前仅供预览，无法保存在此设备上。请重试以保留。',
    retry: '重试', reset: '重置外观', resetHint: '恢复为“随设备 + 鼠尾草绿”，不会更改日程。',
    activeLight: '当前为浅色', activeDark: '当前为深色'
  }
};

export default function AppearanceSettings({ language = 'en' }) {
  const t = appearanceCopy[language] || appearanceCopy.en;
  const appearance = useAppearance(), s = useThemeStyles(createStyles);
  const { colors, palettes, settings, setAppearance, resetAppearance, loading, saving, error, retry, available } = appearance;
  const disabled = loading || saving || !available;
  return <View style={s.content}>
    <Text style={s.intro}>{t.intro}</Text>
    <Text accessibilityRole="header" style={s.label}>{t.mode}</Text>
    <View style={s.modes} accessibilityLabel={t.mode}>
      {[[Smartphone, 'system'], [Sun, 'light'], [Moon, 'dark']].map(([Icon, value]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={t[value]} aria-checked={settings.mode === value} accessibilityState={{ checked: settings.mode === value, disabled }} disabled={disabled} onPress={() => setAppearance({ mode: value })} style={({ pressed }) => [s.mode, settings.mode === value && s.modeSelected, pressed && s.pressed]}>
        <Icon size={24} color={settings.mode === value ? colors.primary : colors.muted} /><Text style={[s.modeText, settings.mode === value && s.selectedText]}>{t[value]}</Text><View style={[s.radio, settings.mode === value && s.radioSelected]}>{settings.mode === value && <Check size={13} color={colors.onPrimary} />}</View>
      </Pressable>)}
    </View>
    <Text style={s.hint}>{t.systemHint} {settings.mode === 'system' ? appearance.isDark ? t.activeDark : t.activeLight : ''}</Text>
    <Text accessibilityRole="header" style={s.label}>{t.accent}</Text>
    <View style={s.accents} accessibilityLabel={t.accent}>{theme.ACCENTS.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={t[value]} aria-checked={settings.accent === value} accessibilityState={{ checked: settings.accent === value, disabled }} disabled={disabled} onPress={() => setAppearance({ accent: value })} style={({ pressed }) => [s.accent, settings.accent === value && s.accentSelected, pressed && s.pressed]}>
      <View style={[s.swatch, { backgroundColor: theme.accentColors[value][appearance.isDark ? 'dark' : 'light'] }]} />
      <Text style={[s.accentText, settings.accent === value && s.selectedText]}>{t[value]}</Text>{settings.accent === value && <Check size={16} color={colors.primary} />}
    </Pressable>)}</View>
    <View style={s.preview} accessible accessibilityLabel={`${t.preview}: ${t.sample}, ${t.sampleTime}`}>
      <View style={s.previewHeader}><Text style={s.hint}>{t.preview} · {t.example}</Text><Palette size={16} color={colors.primary} /></View>
      <Text style={s.previewTitle}>{t.sample}</Text><Text style={s.hint}>{t.sampleNote}</Text>
      <View style={[s.event, { backgroundColor: palettes.green.soft, borderLeftColor: palettes.green.line }]}><Text style={[s.eventTime, { color: palettes.green.ink }]}>{t.sampleTime}</Text><Text style={[s.eventTitle, { color: palettes.green.ink }]}>{t.samplePerson}</Text></View>
      <View style={s.previewButton}><Text style={s.previewButtonText}>{t.title}</Text><ChevronRight size={16} color={colors.onPrimary} /></View>
    </View>
    {(loading || saving) ? <View style={s.status}><ActivityIndicator size="small" color={colors.primary} /><Text accessibilityLiveRegion="polite" style={s.hint}>{loading ? t.loading : t.saving}</Text></View> : error ? <View style={s.errorBox}><Text accessibilityRole="alert" style={s.error}>{error === 'save' ? t.saveFailed : t.loadFailed}</Text><Pressable accessibilityRole="button" onPress={retry} style={s.textButton}><Text style={s.selectedText}>{t.retry}</Text></Pressable></View> : <Text style={s.hint}>{available ? t.saved : t.unavailable}</Text>}
    <Pressable accessibilityRole="button" disabled={disabled} onPress={resetAppearance} style={[s.reset, disabled && { opacity: 0.5 }]}><Text style={s.resetText}>{t.reset}</Text></Pressable><Text style={s.hint}>{t.resetHint}</Text>
  </View>;
}
export function AppearanceSheet({ language, onClose }) {
  const t = appearanceCopy[language] || appearanceCopy.en;
  const s = useThemeStyles(createStyles);
  return <Sheet title={t.title} closeLabel={t.close} onClose={onClose}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}><AppearanceSettings language={language} /></ScrollView></Sheet>;
}
function createStyles(c) { return StyleSheet.create({
  content: { gap: 16 }, sheetContent: { padding: 20, paddingTop: 5, paddingBottom: 28 }, intro: { color: c.muted, fontSize: 14, lineHeight: 22 }, label: { color: c.ink, fontSize: 14, fontWeight: '600' }, hint: { color: c.muted, fontSize: 12, lineHeight: 19 },
  modes: { flexDirection: 'row', gap: 8 }, mode: { flex: 1, minWidth: 0, minHeight: 115, borderWidth: 1, borderColor: c.line, borderRadius: 15, backgroundColor: c.surface, paddingVertical: 13, paddingHorizontal: 5, gap: 10, alignItems: 'center', justifyContent: 'center' }, modeSelected: { borderColor: c.primary, backgroundColor: c.primarySoft }, modeText: { fontSize: 12, lineHeight: 18, color: c.ink, textAlign: 'center', fontWeight: '600' }, selectedText: { color: c.primary, fontSize: 13, fontWeight: '600' }, radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1, borderColor: c.strongLine, alignItems: 'center', justifyContent: 'center' }, radioSelected: { backgroundColor: c.primary, borderColor: c.primary },
  accents: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, accent: { flexBasis: '46%', flexGrow: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 13, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }, accentSelected: { borderColor: c.primary, backgroundColor: c.primarySoft }, swatch: { width: 25, height: 25, borderRadius: 13 }, accentText: { flex: 1, color: c.ink, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  preview: { borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.page, padding: 16, gap: 10 }, previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, previewTitle: { color: c.ink, fontSize: 20, lineHeight: 27, fontWeight: '700' }, event: { padding: 12, borderLeftWidth: 4, borderRadius: 10, gap: 5 }, eventTime: { fontSize: 12, lineHeight: 18, fontWeight: '600' }, eventTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600' }, previewButton: { minHeight: 44, borderRadius: 11, backgroundColor: c.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 }, previewButtonText: { color: c.onPrimary, fontSize: 13, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 }, errorBox: { backgroundColor: c.errorSoft, borderRadius: 12, padding: 12 }, error: { fontSize: 12, lineHeight: 19, color: c.error }, textButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }, reset: { minHeight: 48, borderWidth: 1, borderColor: c.line, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }, resetText: { color: c.primary, fontSize: 13, fontWeight: '600' }, pressed: { opacity: 0.65 }
}); }
