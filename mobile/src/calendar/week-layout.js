const GUTTER_WIDTH = 48;
const MIN_DAY_WIDTH = 100;
const MAX_DAY_WIDTH = 116;
const INITIAL_LEAD_MINUTES = 30;

function weekGeometry(viewportWidth) {
  const viewport = Number.isFinite(Number(viewportWidth)) ? Math.max(280, Number(viewportWidth)) : 350;
  const dayWidth = Math.max(MIN_DAY_WIDTH, Math.min(MAX_DAY_WIDTH,
    Math.round((viewport - GUTTER_WIDTH) / 5)));
  return {
    gutterWidth: GUTTER_WIDTH,
    dayWidth,
    daysWidth: dayWidth * 7,
    visibleDays: Math.max(1, (viewport - GUTTER_WIDTH) / dayWidth),
  };
}

function initialScrollOffset(initialHour, hourHeight) {
  const hour = Number.isFinite(Number(initialHour)) ? Math.max(0, Math.min(23, Number(initialHour))) : 8;
  const height = Number.isFinite(Number(hourHeight)) && Number(hourHeight) > 0 ? Number(hourHeight) : 64;
  return Math.max(0, (hour - INITIAL_LEAD_MINUTES / 60) * height);
}

module.exports = { GUTTER_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH, INITIAL_LEAD_MINUTES, weekGeometry, initialScrollOffset };
