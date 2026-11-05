function fallbackHour(value) {
  const hour = Number(value);
  return Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : 8;
}

function hourForTime(value, fallback = 8) {
  const match = typeof value === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) + Number(match[2]) / 60 : fallbackHour(fallback);
}

module.exports = { fallbackHour, hourForTime };
