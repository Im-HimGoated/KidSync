// Shared phone palette. Keep these tokens independent of React for contrast tests.
const colors = Object.freeze({
  ink: '#203C38', muted: '#546B60', primary: '#235B47', primarySoft: '#EBF4EE',
  blue: '#1F6898', blueSoft: '#EAF3FA', green: '#356D50',
  page: '#F5F8F6', line: '#D8E4DC', white: '#FFFFFF', red: '#A32D40', redSoft: '#FFF1F3',
});
const normalizeLanguage = value => value === 'zh' ? 'zh' : 'en';
module.exports = { colors, normalizeLanguage };
