const { dateKey } = require('../lib/calendar');

function builtInHolidays(year, language = 'en') {
  const firstMondayOfSeptember = 1 + (8 - new Date(year, 8, 1).getDay()) % 7;
  const lastMondayOfMay = 31 - (new Date(year, 4, 31).getDay() + 6) % 7;
  const fourthThursdayOfNovember = 22 + (11 - new Date(year, 10, 1).getDay()) % 7;
  const secondMondayOfOctober = 8 + (8 - new Date(year, 9, 1).getDay()) % 7;
  return [
    [0, 1, 'New Year’s Day', '元旦', '🎉'],
    [1, 14, 'Valentine’s Day', '情人节', '💌'],
    [2, 17, 'St. Patrick’s Day', '圣帕特里克节', '☘️'],
    [4, lastMondayOfMay, 'Memorial Day', '阵亡将士纪念日', '🌿'],
    [6, 4, 'Independence Day', '独立日', '🎆'],
    [8, firstMondayOfSeptember, 'Labor Day', '劳动节', '🛠️'],
    [9, secondMondayOfOctober, 'Columbus Day', '哥伦布日', '🗓️'],
    [9, 31, 'Halloween', '万圣节', '🎃'],
    [10, 11, 'Veterans Day', '退伍军人节', '🗓️'],
    [10, fourthThursdayOfNovember, 'Thanksgiving', '感恩节', '🦃'],
    [11, 25, 'Christmas Day', '圣诞节', '🎄'],
    [11, 31, 'New Year’s Eve', '除夕', '✨'],
  ].map(([month, day, en, zh, icon]) => {
    const startDate = dateKey(new Date(year, month, day));
    return { id: `builtin-holiday-${startDate}`, startDate, child: '__family__', title: language === 'zh' ? zh : en,
      icon, eventType: 'holiday', allDay: true, recurrence: 'none', status: 'confirmed', isBuiltInHoliday: true };
  });
}

function matchesCategory(event, category) {
  if (category === 'holidays') return event.eventType === 'holiday' || !!event.isBuiltInHoliday;
  if (category === 'special') return ['holiday', 'birthday', 'deadline', 'trip'].includes(event.eventType)
    || !!event.isBuiltInHoliday || event.importance === 'high';
  return true;
}

module.exports = { builtInHolidays, matchesCategory };
