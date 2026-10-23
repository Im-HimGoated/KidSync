import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, Check, ExternalLink, Pause, Play } from 'lucide-react-native';
import CalendarPreview from '../ui/CalendarPreview';

const FAMILY_PHOTOS = [
  require('../../../assets/kidssync-family-park-signin.jpg'),
  require('../../../assets/kidssync-family-entryway-signin.jpg'),
  require('../../../assets/kidssync-family-table-signin.jpg')
];

export const welcomeCopy = {
  en: {
    heading: 'Welcome to KidsSync',
    tagline: 'Every kid. Every pickup.',
    headlineAccent: 'One clear plan.',
    description: 'Activities, pickup adults, and what to bring. The little details that keep a family in sync.',
    setupHint: 'Next: a few optional setup questions',
    family: 'Your family, in sync',
    pause: 'Pause family photos',
    play: 'Resume family photos',
    nextPhoto: 'Next family photo',
    photoDescriptions: ['A family walking in the park with a picnic basket and soccer ball', 'Two students outside school with their books and backpacks', 'A coach and children at sports practice'],
    signIn: 'Sign in',
    returning: 'Already have an account?',
    getStarted: 'Get started',
    explore: 'Explore the web calendar',
    footer: 'One family. One shared week.'
  },
  zh: {
    heading: '\u6b22\u8fce\u4f7f\u7528 KidsSync',
    tagline: '每个孩子，每次接送。',
    headlineAccent: '一份清晰的安排。',
    description: '活动、接送人、携带物品。让这些小细节，帮全家一起安排好生活。',
    setupHint: '下一步：几个可跳过的设置问题',
    family: '\u5bb6\u4eba\u7684\u65f6\u5149\uff0c\u4e00\u8d77\u5b89\u6392',
    pause: '\u6682\u505c\u5bb6\u5ead\u7167\u7247',
    play: '\u7ee7\u7eed\u64ad\u653e\u5bb6\u5ead\u7167\u7247',
    nextPhoto: '\u4e0b\u4e00\u5f20\u5bb6\u5ead\u7167\u7247',
    photoDescriptions: ['\u4e00\u5bb6\u4eba\u5e26\u7740\u91ce\u9910\u7bee\u548c\u8db3\u7403\u5728\u516c\u56ed\u6563\u6b65', '\u4e24\u540d\u5b66\u751f\u5e26\u7740\u4e66\u672c\u548c\u4e66\u5305\u7ad9\u5728\u5b66\u6821\u95e8\u5916', '\u6559\u7ec3\u548c\u5b69\u5b50\u4eec\u53c2\u52a0\u4f53\u80b2\u8bad\u7ec3'],
    signIn: '\u767b\u5f55',
    returning: '\u5df2\u6709\u8d26\u6237\uff1f',
    getStarted: '\u5f00\u59cb\u4f7f\u7528',
    explore: '\u6d4f\u89c8\u7f51\u9875\u65e5\u5386',
    footer: '\u4e00\u4e2a\u5bb6\uff0c\u4e00\u8d77\u5b89\u6392\u6bcf\u4e00\u5468\u3002'
  }
};

export default function WelcomeScreen({ language, onSignIn, onGetStarted, onOpenWebsite, error }) {
  const t = welcomeCopy[language] || welcomeCopy.en;
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 760 && fontScale <= 1.25;
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
    const timer = setInterval(() => setPhotoIndex(index => (index + 1) % FAMILY_PHOTOS.length), 8000);
    return () => clearInterval(timer);
  }, [paused, reduceMotion, appState]);

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.scroll}>
    <View style={styles.inner}>
      <ImageBackground source={FAMILY_PHOTOS[photoIndex]}
        accessible={false} resizeMode="cover" style={[styles.hero, compact && styles.heroCompact]} imageStyle={styles.heroImage}>
        <View style={styles.photoControls}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.nextPhoto} accessibilityHint={t.photoDescriptions[photoIndex]}
            onPress={() => setPhotoIndex(index => (index + 1) % FAMILY_PHOTOS.length)} style={styles.photoButton}>
            <ArrowRight size={18} color="#ffffff" aria-hidden={true} />
          </Pressable>
          {!reduceMotion && <Pressable accessibilityRole="button" accessibilityLabel={paused ? t.play : t.pause}
            accessibilityState={{ selected: paused }} onPress={() => setPaused(value => !value)} style={styles.photoButton}>
            {paused ? <Play size={18} color="#ffffff" aria-hidden={true} /> : <Pause size={18} color="#ffffff" aria-hidden={true} />}
          </Pressable>}
        </View>
        <View style={styles.caption}>
          <Text style={styles.eyebrow}>{t.family}</Text>
          <Text style={styles.heading}>{t.heading}</Text>
        </View>
      </ImageBackground>
      <View style={styles.body}>
        <Text accessibilityRole="header" style={styles.tagline}>{t.tagline}{'\n'}<Text style={styles.headlineAccent}>{t.headlineAccent}</Text></Text>
        <Text style={styles.description}>{t.description}</Text>
        <CalendarPreview language={language} compact={compact} showHandoff />
        <Pressable accessibilityRole="link" onPress={onOpenWebsite} style={styles.explore}>
          <Text style={styles.link}>{t.explore}</Text>
          <ExternalLink size={15} color="#4c626e" aria-hidden={true} />
        </Pressable>
        <Text style={styles.footer}>{t.footer}</Text>
      </View>
    </View>
    </ScrollView>
    <View style={styles.actionBar}>
      <View style={styles.actions}>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" onPress={onGetStarted}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{t.getStarted}</Text>
          <ArrowRight size={20} color="#ffffff" aria-hidden={true} />
        </Pressable>
        <View style={styles.setupHint}><Check size={13} color="#35634e" aria-hidden={true} /><Text style={styles.hintText}>{t.setupHint}</Text></View>
        <View style={styles.returning}>
          <Text style={styles.returningText}>{t.returning}</Text>
          <Pressable accessibilityRole="button" onPress={onSignIn}
            style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}>
            <Text style={styles.signInText}>{t.signIn}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  scroll: { flexGrow: 1, alignItems: 'center', paddingBottom: 20, backgroundColor: '#ffffff' },
  inner: { width: '100%', maxWidth: 560, flexGrow: 1 },
  hero: { width: '100%', aspectRatio: 2.2, minHeight: 160, maxHeight: 210, justifyContent: 'flex-end', overflow: 'hidden', flexShrink: 0 },
  heroCompact: { minHeight: 130, maxHeight: 150, aspectRatio: 2.4 },
  heroImage: { width: '100%', height: '100%' },
  photoControls: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6 },
  photoButton: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(12, 32, 43, 0.78)', alignItems: 'center', justifyContent: 'center' },
  caption: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: 'rgba(12, 32, 43, 0.78)' },
  eyebrow: { color: '#d4eddf', fontSize: 13, fontWeight: '500', marginBottom: 5 },
  heading: { color: '#ffffff', fontSize: 21, fontWeight: '600', lineHeight: 27 },
  body: { paddingHorizontal: 20, paddingTop: 22, gap: 16, backgroundColor: '#ffffff', flexGrow: 1 },
  tagline: { color: '#203c38', fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 },
  headlineAccent: { color: '#28734f' },
  description: { color: '#4c626e', fontSize: 15, lineHeight: 23, marginTop: -5 },
  actionBar: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, borderTopWidth: 1, borderColor: '#dce7e1', backgroundColor: '#ffffff' },
  actions: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 4 },
  primary: { minHeight: 52, padding: 14, borderRadius: 12, backgroundColor: '#235b47', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: '#ffffff', fontSize: 17, fontWeight: '600', flexShrink: 1 },
  returning: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 4 },
  returningText: { color: '#4c626e', fontSize: 14, lineHeight: 22 },
  setupHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 4 },
  hintText: { flexShrink: 1, color: '#4c626e', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  signIn: { minHeight: 44, minWidth: 44, paddingHorizontal: 5, justifyContent: 'center' },
  signInText: { color: '#245b48', fontSize: 14, fontWeight: '600' },
  explore: { minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 8 },
  link: { fontSize: 14, color: '#4c626e', textAlign: 'center' },
  footer: { color: '#4c626e', fontSize: 12, lineHeight: 20, textAlign: 'center' },
  pressed: { opacity: 0.75 },
  error: { color: '#a12632', fontSize: 15, lineHeight: 22 }
});
