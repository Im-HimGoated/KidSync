// Runtime appearance primitives. No React, device state, auth or backend imports.
const DEFAULT_APPEARANCE = Object.freeze({ mode: 'system', accent: 'sage' });
const MODES = Object.freeze(['system', 'light', 'dark']);
const ACCENTS = Object.freeze(['sage', 'ocean', 'lavender', 'rose']);
const lightBase = Object.freeze({
  ink: '#203C38', muted: '#546B60', primary: '#235B47', primarySoft: '#EBF4EE',
  blue: '#1F6898', blueSoft: '#EAF3FA', green: '#356D50',
  page: '#F5F8F6', line: '#D8E4DC', white: '#FFFFFF', red: '#A32D40', redSoft: '#FFF1F3',
});
const accentColors = Object.freeze({
  sage: { light: '#235B47', dark: '#A7DDBB', soft: '#EBF4EE', darkSoft: '#243D30' },
  ocean: { light: '#245D83', dark: '#A7D4F2', soft: '#EBF3F9', darkSoft: '#233A4A' },
  lavender: { light: '#65508C', dark: '#D2BFF2', soft: '#F2EEF8', darkSoft: '#393047' },
  rose: { light: '#8C455E', dark: '#F1BED0', soft: '#FAEFF3', darkSoft: '#48303B' },
});
const lightPalettes = Object.freeze({
  blue: { ink: '#245D83', soft: '#E4F0F7', line: '#88AEC5' },
  green: { ink: '#315F43', soft: '#E7F2EB', line: '#94B9A3' },
  purple: { ink: '#72528D', soft: '#F0E7F8', line: '#BE9DD5' },
  pink: { ink: '#985168', soft: '#F9EAF0', line: '#D9A2B5' },
  yellow: { ink: '#85682B', soft: '#F8F0DC', line: '#C8AE71' },
});
const darkPalettes = Object.freeze({
  blue: { ink: '#B7DDF5', soft: '#243C4A', line: '#6CA8CD' },
  green: { ink: '#BDE8C9', soft: '#293E31', line: '#7DBA92' },
  purple: { ink: '#DDC9FA', soft: '#3A304B', line: '#B498D3' },
  pink: { ink: '#F5C5D7', soft: '#48303D', line: '#CA90A8' },
  yellow: { ink: '#F1D99F', soft: '#453D29', line: '#C6AE70' },
});
function normalizeAppearance(value) {
  return { mode: MODES.includes(value?.mode) ? value.mode : DEFAULT_APPEARANCE.mode,
    accent: ACCENTS.includes(value?.accent) ? value.accent : DEFAULT_APPEARANCE.accent };
}
function createTheme(value, systemScheme = 'light') {
  const settings = normalizeAppearance(value), resolvedMode = settings.mode === 'system' ? systemScheme === 'dark' ? 'dark' : 'light' : settings.mode;
  const isDark = resolvedMode === 'dark', accent = accentColors[settings.accent];
  const primary = isDark ? accent.dark : accent.light, primarySoft = isDark ? accent.darkSoft : accent.soft;
  const tokens = {
    ...lightBase,
    ink: isDark ? '#E7EEE9' : '#203C38', muted: isDark ? '#ADBDB3' : '#546B60',
    page: isDark ? '#121A17' : '#F5F8F6', surface: isDark ? '#1C2721' : '#FFFFFF',
    surfaceRaised: isDark ? '#25332B' : '#F0F5F2', surface2: isDark ? '#25332B' : '#F0F5F2',
    line: isDark ? '#50645A' : '#D8E4DC', strongLine: isDark ? '#81978A' : '#80998A',
    primary, onPrimary: isDark ? '#14251C' : '#FFFFFF', primarySoft,
    input: isDark ? '#18231D' : '#FFFFFF', inputFocused: isDark ? '#24382B' : '#F6FAF7',
    error: isDark ? '#FFB6C2' : '#A32D40', errorSoft: isDark ? '#452A31' : '#FFF1F3',
    success: isDark ? '#B4E2C2' : '#356D50', successSoft: isDark ? '#263D2F' : '#EAF4ED',
    warning: isDark ? '#EAD191' : '#775818', warningSoft: isDark ? '#423A27' : '#FAF2DF',
    backdrop: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(18,38,49,0.36)',
    photoText: '#FFFFFF', photoMuted: '#E5F4E9', photoOverlay: 'rgba(12,32,43,0.78)',
    white: '#FFFFFF', shadow: '#000000',
  };
  Object.assign(tokens, { blue: primary, blueSoft: primarySoft, green: tokens.success, red: tokens.error, redSoft: tokens.errorSoft,
    text: tokens.ink, textMuted: tokens.muted, border: tokens.line, background: tokens.page });
  const palettes = isDark ? darkPalettes : lightPalettes;
  return { settings, mode: settings.mode, accent: settings.accent, resolvedMode, isDark, colors: Object.freeze(tokens), palettes };
}
// Compatibility for callers not converted yet. Never mutate these global tokens.
const colors = lightBase;
const normalizeLanguage = value => value === 'zh' ? 'zh' : 'en';
module.exports = { colors, normalizeLanguage, DEFAULT_APPEARANCE, MODES, ACCENTS, accentColors, lightPalettes, darkPalettes, normalizeAppearance, createTheme };
