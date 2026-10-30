import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import theme from '../ui/theme';

export const colors = theme.colors;
export const palettes = {
  blue: { ink: '#245D83', soft: '#E4F0F7', line: '#88AEC5' },
  green: { ink: '#315F43', soft: '#E7F2EB', line: '#94B9A3' },
  purple: { ink: '#72528D', soft: '#F0E7F8', line: '#BE9DD5' },
  pink: { ink: '#985168', soft: '#F9EAF0', line: '#D9A2B5' },
  yellow: { ink: '#85682B', soft: '#F8F0DC', line: '#C8AE71' },
};
export function personColor(event, kids = []) {
  const kid = kids.find(person => person.name === event?.child || String(person.id) === String(event?.child));
  return palettes[event?.style] || palettes[kid?.palette] || palettes.blue;
}
export function Button({ children, onPress, secondary, danger, disabled, icon: Icon, style, label }) {
  const color = danger ? colors.red : secondary ? colors.blue : colors.white;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [u.button, secondary && u.secondaryButton, danger && u.dangerButton, style, (pressed || disabled) && { opacity: 0.5 }]}>
    {Icon && <Icon size={18} color={color} />}<Text style={[u.buttonText, { color }]}>{children}</Text>
  </Pressable>;
}
export function IconButton({ icon: Icon, label, onPress, color = colors.ink, disabled, style }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [u.iconButton, style, (pressed || disabled) && { opacity: 0.45 }]}><Icon size={21} color={color} strokeWidth={1.8} /></Pressable>;
}
export function Field({ label, value, onChangeText, error, multiline, style, inputRef, onLayout, ...props }) {
  return <View onLayout={onLayout} style={[u.field, style]}><Text style={u.label}>{label}</Text><TextInput ref={inputRef} accessibilityLabel={label} value={value == null ? '' : String(value)} onChangeText={onChangeText}
    placeholderTextColor="#88979F" multiline={multiline} style={[u.input, multiline && { minHeight: 90, textAlignVertical: 'top' }, error && { borderColor: colors.red }]} {...props} />
    {!!error && <Text accessibilityRole="alert" style={u.error}>{error}</Text>}
  </View>;
}
export function ChoiceRow({ options, value, onChange, label, disabled }) {
  return <View style={u.choices} accessibilityLabel={label}>{options.map(option => <Pressable key={String(option.value)} accessibilityRole="button" accessibilityState={{ selected: value === option.value, disabled: !!disabled }} disabled={disabled} onPress={() => onChange(option.value)}
    style={[u.choice, value === option.value && u.choiceSelected, disabled && { opacity: 0.5 }]}>{option.color && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: option.color }} />}<Text style={[u.choiceText, value === option.value && { color: colors.white }]}>{option.label}</Text></Pressable>)}</View>;
}
export function Sheet({ title, closeLabel, onClose, busy, children }) {
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true, changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setReduceMotion(value); });
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) setReduceMotion(value); }).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, []);
  return <Modal transparent animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="overFullScreen" supportedOrientations={['portrait', 'landscape']} statusBarTranslucent onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={u.modal}>
      <Pressable accessible={false} importantForAccessibility="no-hide-descendants" disabled={busy} onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView accessibilityViewIsModal onAccessibilityEscape={() => { if (!busy) onClose(); }} edges={['bottom', 'left', 'right']} style={u.sheet}>
        <View style={u.handle} /><View style={u.sheetHeading}><Text accessibilityRole="header" style={u.sheetTitle}>{title}</Text><IconButton icon={X} label={closeLabel} onPress={onClose} disabled={busy} /></View>
        {children}
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}
export const u = StyleSheet.create({
  button: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondaryButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, dangerButton: { backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#F3D7DC' }, buttonText: { fontSize: 15, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  modal: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(18,38,49,.36)' }, sheet: { width: '100%', maxWidth: 640, maxHeight: '93%', backgroundColor: colors.white, borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingTop: 9, flexShrink: 1, overflow: 'hidden' }, handle: { width: 35, height: 4, backgroundColor: '#D8E1E4', borderRadius: 3, alignSelf: 'center' }, sheetHeading: { paddingLeft: 20, paddingRight: 9, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' }, sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  field: { gap: 7, marginBottom: 17 }, label: { color: colors.ink, fontSize: 13, fontWeight: '600' }, input: { minHeight: 48, borderWidth: 1, borderColor: '#C5D3DB', borderRadius: 12, backgroundColor: colors.page, color: colors.ink, padding: 13, fontSize: 16 },
  error: { color: colors.red, fontSize: 13, lineHeight: 20 }, body: { color: colors.muted, fontSize: 14, lineHeight: 22 }, heading: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, choiceSelected: { backgroundColor: colors.blue, borderColor: colors.blue }, choiceText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingHorizontal: 25, paddingVertical: 32, gap: 13 }, card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 17, padding: 17 },
});
