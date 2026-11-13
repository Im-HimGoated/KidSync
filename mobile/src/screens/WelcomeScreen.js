import React, { useEffect, useState } from 'react';
import { useAppearance, useThemeStyles } from '../ui/AppearanceContext';
import { AccessibilityInfo, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, CalendarDays, ChevronDown, Palette, ExternalLink, Pause, Play } from 'lucide-react-native';
import CalendarPreview from '../ui/CalendarPreview';
import { AppearanceSheet } from '../ui/AppearanceSettings';

const FAMILY_PHOTOS = [
  require('../../assets/kidssync-family-park-signin.jpg'),
  require('../../assets/kidssync-family-entryway-signin.jpg'),
  require('../../assets/kidssync-family-table-signin.jpg')
];

export const welcomeCopy = {
  en: {
    appearance: 'Appearance', example: 'See an example', more: 'More options',
    heading: 'One calendar for the whole family',
    description: 'Share the week’s plans, see who’s doing pickup, and know what to bring.',
    setupHint: '5 optional questions. Review your answers before saving.',
    preview: 'Try without an account',
    personalize: 'Personalize a preview calendar',
    pause: 'Pause family photos',
    play: 'Resume family photos',
    nextPhoto: 'Next family photo',
    photoDescriptions: ['A family walking in the park with a picnic basket and soccer ball', 'Two students outside school with their books and backpacks', 'A coach and children at sports practice'],
    signIn: 'Sign in',
    getStarted: 'Set up my calendar',
    explore: 'Open the web calendar'
  },
  zh: {
    appearance: '外观', example: '查看示例', more: '更多选项',
    heading: '全家共享的日历',
    description: '共享本周安排，查看谁负责接送、需要带什么。',
    setupHint: '5 个问题，均可跳过。保存前可核对答案。',
    preview: '无需账户即可体验',
    personalize: '自定义体验日历',
    pause: '\u6682\u505c\u5bb6\u5ead\u7167\u7247',
    play: '\u7ee7\u7eed\u64ad\u653e\u5bb6\u5ead\u7167\u7247',
    nextPhoto: '\u4e0b\u4e00\u5f20\u5bb6\u5ead\u7167\u7247',
    photoDescriptions: ['\u4e00\u5bb6\u4eba\u5e26\u7740\u91ce\u9910\u7bee\u548c\u8db3\u7403\u5728\u516c\u56ed\u6563\u6b65', '\u4e24\u540d\u5b66\u751f\u5e26\u7740\u4e66\u672c\u548c\u4e66\u5305\u7ad9\u5728\u5b66\u6821\u95e8\u5916', '\u6559\u7ec3\u548c\u5b69\u5b50\u4eec\u53c2\u52a0\u4f53\u80b2\u8bad\u7ec3'],
    signIn: '\u767b\u5f55',
    getStarted: '设置我的日历',
    explore: '打开网页日历'
  }
};

export default function WelcomeScreen({ language, onSignIn, onGetStarted, onPreview, onPersonalize, onOpenWebsite, error }) {
  const t = welcomeCopy[language] || welcomeCopy.en;
  const { colors, available } = useAppearance(), styles = useThemeStyles(createStyles);
  const { height, width, fontScale } = useWindowDimensions();
  const compact = height < 740 || fontScale > 1.25;
  const stackActions = width < 350 || fontScale > 1.25;
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    let mounted = true;
    let changed = false;
    const motionListener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduceMotion(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !changed) setReduceMotion(value);
    }).catch(() => {});
    const stateListener = AppState.addEventListener('change', setAppState);
    return () => { mounted = false; motionListener.remove(); stateListener.remove(); };
  }, []);

  useEffect(() => {
    if (paused || reduceMotion || (appState && appState !== 'active')) return;
    const timer = setTimeout(() => setPhotoIndex((photoIndex + 1) % FAMILY_PHOTOS.length), 8000);
    return () => clearTimeout(timer);
  }, [paused, reduceMotion, appState, photoIndex]);

  return <View style={styles.screen}>
    <ScrollView style={styles.scroller} contentContainerStyle={styles.scroll}>
      <View style={styles.inner}>
        <View style={[styles.hero, compact && styles.heroCompact]}>
          <Image source={FAMILY_PHOTOS[photoIndex]} accessible={false} resizeMode="cover" style={styles.heroImage} />
          <View style={styles.photoControls}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.nextPhoto} accessibilityValue={{ text: t.photoDescriptions[photoIndex] }}
              onPress={() => setPhotoIndex(index => (index + 1) % FAMILY_PHOTOS.length)} style={styles.photoButton}>
              <ArrowRight size={18} color={colors.photoText} aria-hidden={true} />
            </Pressable>
            {!reduceMotion && <Pressable accessibilityRole="button" accessibilityLabel={paused ? t.play : t.pause}
              accessibilityState={{ selected: paused }} onPress={() => setPaused(value => !value)} style={styles.photoButton}>
              {paused ? <Play size={18} color={colors.photoText} aria-hidden={true} /> : <Pause size={18} color={colors.photoText} aria-hidden={true} />}
            </Pressable>}
          </View>
        </View>
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.heading}>{t.heading}</Text>
          <Text style={styles.description}>{t.description}</Text>
        </View>
        <View style={styles.actions}>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityHint={t.setupHint} onPress={onGetStarted}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{t.getStarted}</Text>
            <ArrowRight size={20} color={colors.onPrimary} aria-hidden={true} />
          </Pressable>
          <Text style={styles.hint}>{t.setupHint}</Text>
          <View style={[styles.secondaryActions, stackActions && styles.stackedActions]}>
            {!!onPreview && <Pressable accessibilityRole="button" onPress={onPreview}
              style={({ pressed }) => [styles.secondary, styles.previewButton, !stackActions && styles.previewWide, pressed && styles.pressed]}>
              <CalendarDays size={17} color={colors.primary} aria-hidden={true} />
              <Text style={styles.secondaryText}>{t.preview}</Text>
            </Pressable>}
            <Pressable accessibilityRole="button" onPress={onSignIn}
              style={({ pressed }) => [styles.secondary, !stackActions && styles.signInWide, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>{t.signIn}</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.utilities}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: exampleOpen }}
            onPress={() => setExampleOpen(value => !value)} style={styles.disclosure}>
            <Text style={styles.disclosureText}>{t.example}</Text>
            <ChevronDown size={17} color={colors.muted} style={exampleOpen && styles.expanded} />
          </Pressable>
          {exampleOpen && <CalendarPreview language={language} compact={compact} showHandoff />}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: optionsOpen }}
            onPress={() => setOptionsOpen(value => !value)} style={styles.disclosure}>
            <Text style={styles.disclosureText}>{t.more}</Text>
            <ChevronDown size={17} color={colors.muted} style={optionsOpen && styles.expanded} />
          </Pressable>
          {optionsOpen && <View>
            {!!onPersonalize && <Pressable accessibilityRole="button" onPress={onPersonalize} style={styles.explore}>
              <CalendarDays size={16} color={colors.primary} aria-hidden={true} /><Text style={styles.link}>{t.personalize}</Text>
            </Pressable>}
            <Pressable accessibilityRole="button" disabled={!available} accessibilityState={{ disabled: !available }}
              onPress={() => setAppearanceOpen(true)} style={styles.explore}>
              <Palette size={16} color={colors.muted} aria-hidden={true} /><Text style={styles.link}>{t.appearance}</Text>
            </Pressable>
            {!!onOpenWebsite && <Pressable accessibilityRole="link" onPress={onOpenWebsite} style={styles.explore}>
              <ExternalLink size={16} color={colors.muted} aria-hidden={true} /><Text style={styles.link}>{t.explore}</Text>
            </Pressable>}
          </View>}
        </View>
      </View>
    </ScrollView>
    {appearanceOpen && <AppearanceSheet language={language} onClose={() => setAppearanceOpen(false)} />}
  </View>;
}

function createStyles(colors) { return StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.surface },
  scroller: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, alignItems: 'center', backgroundColor: colors.surface },
  inner: { width: '100%', maxWidth: 560, flexGrow: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 16 },
  hero: { width: '100%', aspectRatio: 1.85, minHeight: 148, maxHeight: 250, borderRadius: 18, overflow: 'hidden' },
  heroCompact: { minHeight: 108, maxHeight: 142, aspectRatio: 2.35 },
  heroImage: { position: 'absolute', width: '100%', height: '100%' },
  photoControls: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6 },
  photoButton: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.photoOverlay, alignItems: 'center', justifyContent: 'center' },
  intro: { gap: 8 },
  heading: { color: colors.ink, fontSize: 32, lineHeight: 37, fontWeight: '700', letterSpacing: -0.6 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  actions: { gap: 8 },
  primary: { minHeight: 52, padding: 14, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: colors.onPrimary, fontSize: 17, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  secondaryActions: { flexDirection: 'row', gap: 8 },
  stackedActions: { flexDirection: 'column' },
  secondary: { minHeight: 48, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  previewButton: { backgroundColor: colors.surface2 },
  previewWide: { flex: 2, minWidth: 0 },
  signInWide: { flex: 1, minWidth: 0 },
  secondaryText: { color: colors.primary, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  utilities: { borderBottomWidth: 1, borderBottomColor: colors.line },
  disclosure: { minHeight: 48, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  disclosureText: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' },
  expanded: { transform: [{ rotate: '180deg' }] },
  explore: { minHeight: 44, flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 8 },
  link: { fontSize: 14, color: colors.primary, flexShrink: 1 },
  pressed: { opacity: 0.75 },
  error: { color: colors.error, fontSize: 15, lineHeight: 22 }
}); }
