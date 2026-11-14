const scheduling = require('../../../assets/smart-scheduling');

function parseClock(value, fallbackPeriod = '') {
  const normalized = value.toLowerCase().replace(/\./g, '').replace(/：/g, ':');
  const match = /^(上午|下午|晚上|中午)?\s*(\d{1,2})(?::(\d{2})|点(半|\d{1,2}分?)?)?\s*(am|pm)?$/.exec(normalized.trim());
  if (!match) return null;
  const period = match[5] || (match[1] === '上午' ? 'am' : match[1] ? 'pm' : fallbackPeriod);
  const hour = Number(match[2]);
  const minute = Number(match[3] || (match[4] === '半' ? 30 : match[4]?.replace('分', '')) || 0);
  if (hour > (period ? 12 : 23) || (period && hour < 1) || minute > 59) return null;
  return (period ? (hour % 12) + (period === 'pm' ? 12 : 0) : hour) * 60 + minute;
}

function quickDraft(description, today, fallbackDate) {
  const tokens = scheduling.tokenizeQuickLine(description, today);
  if (!tokens.title && !tokens.advanced) return null;
  if (tokens.advanced) return { title: tokens.title, notes: tokens.original, startDate: tokens.date || fallbackDate };
  const [left, right] = tokens.time.split(/\s*(?:[-–—]|\bto\b|至|到)\s*/i);
  const endPeriod = /[ap]\.?m\.?$/i.exec(right || '')?.[0]?.toLowerCase().replace(/\./g, '') || '';
  const from = parseClock(left, endPeriod);
  const duration = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(tokens.duration);
  const minutes = duration ? Math.round(Number(duration[1]) * (/hour|hr|小时/i.test(duration[2]) ? 60 : 1)) : 30;
  const to = right ? parseClock(right) : from === null ? null : from + minutes;
  const draft = { title: tokens.title, startDate: tokens.date || fallbackDate, location: tokens.location };
  if (from !== null && to !== null && to > from && to < 1440) {
    draft.start = scheduling.clockString(from);
    draft.end = scheduling.clockString(to);
  } else if (tokens.time) draft.notes = tokens.original;
  return draft;
}

module.exports = { quickDraft };
