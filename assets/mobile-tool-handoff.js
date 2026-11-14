(() => {
  const commands = {
    'scan-document': () => {
      openNewEventForDate(selectedDate, preferredNewEventChild());
      const scan = document.getElementById('gameScanPanel');
      scan.open = true;
      scan.querySelector('summary')?.focus();
    },
    'connected-calendars': () => document.getElementById('openExternalCalendars')?.click(),
    'google-import': () => document.getElementById('openGoogleImport')?.click(),
    'activity-history': () => document.getElementById('openActivityHistory')?.click(),
    'version-history': () => document.getElementById('openVersionHistory')?.click(),
    'activity-lists': () => handleSidebarAction('lists'),
    presets: () => document.getElementById('managePresets')?.click(),
    'family-poll': () => window.KidsSyncScheduler?.open('poll'),
    'family-time': () => window.KidsSyncScheduler?.open('find'),
    'quick-add': () => window.KidsSyncScheduler?.open('quick'),
    'export-calendar': openFiles,
    'print-schedule': openFiles,
  };
  const url = new URL(location.href);
  const tool = url.searchParams.get('tool');
  if (!Object.prototype.hasOwnProperty.call(commands, tool)) return;
  let opened = false;

  function openFiles() {
    openShareDialog();
    document.getElementById('shareFilesTab')?.click();
    if (tool === 'print-schedule') document.getElementById('printSchedule')?.focus();
  }

  function open() {
    if (opened || passwordRecoveryMode || pendingInviteToken) return;
    if (!activeAccount) {
      if (document.getElementById('authScreen').hidden) showAuthScreen('signin');
      return;
    }
    if (activeAccount.provider === 'supabase' && !window.KidsSyncCloudReady) return;
    const target = url.searchParams.get('calendar');
    if (target && calendars.some(item => item.id === target) && target !== currentCalendarId) switchCalendar(target);
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    opened = true;
    commands[tool]();
    url.searchParams.delete('tool');
    url.searchParams.delete('calendar');
    history.replaceState(history.state, '', url);
  }

  window.addEventListener('load', open, { once: true });
  window.addEventListener('kidssync:cloud-ready', open);
})();
