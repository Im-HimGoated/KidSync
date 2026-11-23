const calendar = require('../lib/calendar');
const scheduler = require('../../../assets/smart-scheduling');
const colors = {
  default: ['#4285f4', '#e4efff', '#174a9e'],
  red: ['#ea4335', '#fde9e7', '#9d2118'],
  yellow: ['#d99a00', '#fff5d8', '#7c5500'],
  purple: ['#9334e6', '#f2e7ff', '#5b168e'],
  coral: ['#d65d55', '#fdebea', '#8a2e29'],
  green: ['#249342', '#e3f4e7', '#17662b'],
  orange: ['#dd3e10', '#ffebe4', '#8b260d'],
  teal: ['#00897b', '#dff5f1', '#006258'],
  gray: ['#6b7280', '#edf0f3', '#3e4650'],
  indigo: ['#5c6bc0', '#e9ebfb', '#303d8e'],
  cyan: ['#0395d7', '#e2f5fd', '#05648d'],
  brown: ['#976c3d', '#f5ece3', '#694521'],
};
const colorIds = Object.keys(colors);
const icons = ['📖', '✏️', '🏫', '🧪', '🤖', '√x', '💻', '🎓', '🎨', '🎵', '🎹', '🎸', '💃', '🎭',
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏊', '🥋', '⛸️', '🩺', '🦷', '👓', '🎂', '🎉', '🍽️', '🚗', '🚌',
  '✈️', '🏠', '✅', '🛒', '😴', '🎮', '🎬', '🍿', '🍦', '🛝', '🧸', '🎲', '🎡', '🥳', '🧺', '✨'];
const types = ['activity', 'trip', 'deadline', 'birthday', 'holiday'];
const statuses = ['confirmed', 'tentative', 'cancelled'];
const travelTimes = [0, 15, 30, 45, 60];
const templates = {
  school: { icon: '🏫', recurrence: 'weekly', repeatDays: [1, 2, 3, 4, 5], start: '08:00', end: '15:00' },
  sports: { icon: '⚽', recurrence: 'weekly', start: '16:00', end: '17:30' },
  trip: { icon: '✈️', eventType: 'trip', recurrence: 'none', allDay: true, start: '09:00', end: '17:00' },
  bedtime: { icon: '😴', recurrence: 'daily', start: '19:30', end: '20:00' },
  chores: { icon: '✅', recurrence: 'weekly', repeatDays: [6], start: '10:00', end: '10:30' },
};

function duplicateDraft(event, date) {
  const { dateKey, parseDateKey, dateSerial, addDays } = calendar;
  const startDate = dateKey(date);
  const from = parseDateKey(event.startDate);
  const to = parseDateKey(event.endDate);
  const span = dateSerial(to) - dateSerial(from);
  const keys = ['title', 'child', 'allDay', 'start', 'end', 'location', 'responsible', 'items', 'notes',
    'importance', 'reminderMinutes', 'eventType', 'icon', 'color', 'attendees', 'travelMinutes', 'bufferBeforeMinutes', 'bufferAfterMinutes'];
  return { ...Object.fromEntries(keys.filter(key => event[key] != null).map(key => [key, event[key]])),
    startDate, endDate: Number.isFinite(span) && span >= 0 ? dateKey(addDays(date, span)) : '',
    status: 'confirmed', recurrence: 'none' };
}

function conflictingEvents(form, events, originalId) {
  if (form.allDay || form.status === 'cancelled') return [];
  const date = calendar.parseDateKey(form.date);
  const start = scheduler.clock(form.start), end = scheduler.clock(form.end);
  if (!Number.isFinite(date.getTime()) || start === null || end === null || end <= start) return [];
  const named = [...new Set([form.child === '__family__' ? null : form.child, ...(form.attendees || [])]
    .filter(name => name && name !== 'all'))];
  const people = named.length ? named : ['__family__'];
  return calendar.eventsForDate(events, date).filter(event => {
    if ((originalId != null && String(event.id) === String(originalId)) || event.eventType === 'holiday') return false;
    const bounds = calendar.daySegment(event, date);
    const effective = bounds ? { ...event, start: scheduler.clockString(bounds.start), end: scheduler.clockString(bounds.end) } : event;
    const busy = scheduler.busyIntervals([effective], people);
    return !scheduler.roomFor(start, end, busy, scheduler.bufferMinutes(form.travelMinutes) + scheduler.bufferMinutes(form.bufferBeforeMinutes),
      scheduler.bufferMinutes(form.bufferAfterMinutes));
  });
}

function nearbyEvents(events, date) {
  return [-1, 0, 1].flatMap(dayOffset => {
    const day = calendar.addDays(date, dayOffset);
    return calendar.eventsForDate(events, day).filter(event => !event.isBuiltInHoliday && event.eventType !== 'holiday').map(event => {
      const segment = calendar.daySegment(event, day);
      return { ...event, dayOffset, ...(segment ? { start: scheduler.clockString(segment.start), end: scheduler.clockString(segment.end) } : {}) };
    });
  });
}

function paletteFor(value) {
  if (value === 'default' || !colorIds.includes(value)) return null;
  const [line, soft, ink] = colors[value];
  return { line, soft, ink };
}

module.exports = { colors, colorIds, paletteFor, icons, types, statuses, travelTimes, templates, duplicateDraft, conflictingEvents, nearbyEvents };
