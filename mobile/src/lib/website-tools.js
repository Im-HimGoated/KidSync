const toolIds = ['scan-document', 'connected-calendars', 'google-import', 'activity-history', 'version-history',
  'export-calendar', 'import-calendar', 'print-schedule', 'activity-lists', 'presets', 'family-poll', 'family-time', 'quick-add'];

function toolUrl(tool, calendarId) {
  if (!toolIds.includes(tool)) return null;
  const url = new URL('https://kid-sync-delta.vercel.app/');
  url.searchParams.set('tool', tool === 'import-calendar' ? 'export-calendar' : tool);
  if (typeof calendarId === 'string' && calendarId.length <= 300) url.searchParams.set('calendar', calendarId);
  return url.toString();
}

module.exports = { toolUrl };
