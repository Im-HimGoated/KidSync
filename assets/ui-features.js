/* Small, device-local interface controls; event data is never changed here. */
(() => {
  const normalizePreferences = value => ({ contrast: value?.contrast === true, guides: value?.guides !== false });
  const sidebarWidth = value => Math.round(Math.max(220, Math.min(360, Number(value) || 260)));
  function snappedMinute(y, top, height, start = 0, end = 1440) {
    if (!(height > 0) || !Number.isFinite(y)) return null;
    return Math.min(end - 15, Math.max(start, Math.round((start + (y - top) / height * (end - start)) / 15) * 15));
  }
  function scrollTopForMinute(minute, height, viewport, scrollHeight, start = 0, end = 1440) {
    return Math.max(0, Math.min(Math.max(0, scrollHeight - viewport), (minute - start) / (end - start) * height));
  }
  function filterEntries(filter, query, profiles, visible, weekends, view) {
    const entries = [];
    if (filter && filter !== 'all') entries.push({ kind: 'category', value: filter });
    if (query.trim()) entries.push({ kind: 'search', value: query.trim() });
    profiles.filter(profile => !visible.has(profile.name)).forEach(profile => entries.push({ kind: 'child', value: profile.name }));
    if (!weekends && ['week', 'four'].includes(view)) entries.push({ kind: 'weekends', value: '' });
    return entries;
  }
  const pure = { normalizePreferences, sidebarWidth, snappedMinute, scrollTopForMinute, filterEntries };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  const labels = {
    en: {
      display: 'Display options', intro: 'Make the planner easier to read without changing your events.',
      contrast: 'High contrast', contrastHint: 'Stronger text, borders, and keyboard focus in light and dark modes.',
      guides: 'Time-slot hover guide', guideHint: 'On a computer, point at an empty time slot to preview its time. Click to add an event.',
      preview: 'Preview', sample: 'Family activity', sampleMeta: '4:30 PM · Andrew', close: 'Close', done: 'Done',
      local: 'These display choices stay on this device.', saved: 'Display preference saved.', session: 'Storage is unavailable. This preference will last for this session only.',
      filters: 'Active filters', clear: 'Clear all', remove: 'Remove filter: {label}', search: 'Search: {query}', hiddenChild: 'Hidden: {name}', showChild: 'Show {name}', weekdays: 'Weekdays only',
      applied: '{count} active filters', appliedOne: '1 active filter', jump: 'Jump to time', now: 'Current hour', night: 'Midnight', morning: '6 AM', noon: 'Noon', evening: '6 PM',
      resize: 'Resize side calendar', resizeHint: 'Drag to resize. Use left/right arrows, Home or End. Double-click to reset.',
      width: 'Side calendar width: {width} pixels', resizeNote: 'Drag the edge beside the side calendar to resize it. Keyboard users can focus the divider and use arrow keys.'
    },
    zh: {
      display: '显示选项', intro: '让计划更清晰易读，不更改任何日程。',
      contrast: '高对比度', contrastHint: '在浅色和深色模式下增强文字、边框和键盘焦点。',
      guides: '时间格悬停辅助线', guideHint: '在电脑上，将指针移到空白时间格可预览时间，点击即可添加日程。',
      preview: '预览', sample: '家庭活动', sampleMeta: '下午 4:30 · Andrew', close: '关闭', done: '完成',
      local: '这些显示偏好仅保存在此设备上。', saved: '显示偏好已保存。', session: '无法使用设备存储，此偏好仅在本次使用期间有效。',
      filters: '当前筛选', clear: '清除全部', remove: '移除筛选：{label}', search: '搜索：{query}', hiddenChild: '已隐藏：{name}', showChild: '显示 {name}', weekdays: '仅工作日',
      applied: '{count} 项筛选', appliedOne: '1 项筛选', jump: '跳转到时间', now: '当前时段', night: '午夜', morning: '早上 6 点', noon: '中午', evening: '晚上 6 点',
      resize: '调整侧边日历宽度', resizeHint: '拖动调整宽度，也可使用左右方向键、Home 或 End 键。双击恢复默认宽度。',
      width: '侧边日历宽度：{width} 像素', resizeNote: '拖动侧边日历旁的分隔线即可调整宽度；键盘用户可聚焦分隔线并使用方向键。'
    }
  };
  const text = (key, args = {}) => (labels[currentLanguage] || labels.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const prefKey = 'kidssync.visual-preferences.v1';
  let preferences;
  try { preferences = normalizePreferences(JSON.parse(localStorage.getItem(prefKey))); }
  catch { preferences = normalizePreferences(null); }
  const shell = document.getElementById('appShell');
  const panel = document.getElementById('visualPreferencesDialog');
  const contrast = document.getElementById('uiContrast');
  const guides = document.getElementById('uiGuides');
  const chips = document.getElementById('activeFilterChips');
  const jumpMenu = document.getElementById('timelineNavigator');
  const divider = document.getElementById('calendarSideResize');
  let activeEntries = [];
  let hoveredColumn = null;
  let drag = null;
  let returnToSettings = false;
  let openingElement = null;

  function localize() {
    document.querySelectorAll('[data-visual-text]').forEach(node => { node.textContent = text(node.dataset.visualText); });
    document.getElementById('closeVisualPreferences').setAttribute('aria-label', text('close'));
    chips.setAttribute('aria-label', text('filters'));
    divider.setAttribute('aria-label', text('resize'));
    divider.title = text('resizeHint');
    jumpMenu.querySelector('summary').setAttribute('aria-label', text('jump'));
  }
  function clearGuide() {
    if (!hoveredColumn) return;
    hoveredColumn.classList.remove('ui-slot-hover');
    hoveredColumn.removeAttribute('data-ui-time');
    hoveredColumn = null;
  }
  function applyPreferences() {
    document.documentElement.classList.toggle('ui-high-contrast', preferences.contrast);
    contrast.checked = preferences.contrast;
    guides.checked = preferences.guides;
    if (!preferences.guides) clearGuide();
  }
  function savePreferences() {
    preferences = { contrast: contrast.checked, guides: guides.checked };
    applyPreferences();
    let message = 'saved';
    try { localStorage.setItem(prefKey, JSON.stringify(preferences)); } catch { message = 'session'; }
    document.getElementById('visualPreferencesStatus').textContent = text(message);
  }
  function openPreferences() {
    openingElement = document.activeElement;
    returnToSettings = settingsDialog.open;
    if (returnToSettings) settingsDialog.close();
    document.getElementById('moreActions').open = false;
    localize(); applyPreferences();
    document.getElementById('visualPreferencesStatus').textContent = '';
    panel.showModal();
  }
  function filterLabel(entry) {
    if (entry.kind === 'search') return text('search', { query: entry.value });
    if (entry.kind === 'child') return text('hiddenChild', { name: entry.value });
    if (entry.kind === 'weekends') return text('weekdays');
    const key = { holidays: 'filters.holidaysTrips', important: 'sidebar.specialDays', activity: 'filters.activities', trip: 'filters.trips' }[entry.value];
    return key ? t(key) : entry.value;
  }
  function renderFilters() {
    activeEntries = filterEntries(state.eventFilter, state.searchQuery, kidProfiles, state.visibleKids, state.showWeekends, currentView);
    const bar = document.getElementById('calendarContextBar');
    bar.hidden = !activeEntries.length;
    document.getElementById('calendarContextLabel').textContent = text(activeEntries.length === 1 ? 'appliedOne' : 'applied', { count: activeEntries.length });
    document.getElementById('clearCalendarContext').textContent = text('clear');
    chips.innerHTML = activeEntries.map((entry, index) => {
      const label = filterLabel(entry);
      const action = entry.kind === 'child' ? text('showChild', { name: entry.value }) : text('remove', { label });
      return `<button class="active-filter-chip" type="button" data-clear-ui-filter="${index}" aria-label="${esc(action)}"><span>${esc(label)}</span><span aria-hidden="true">×</span></button>`;
    }).join('');
    requestAnimationFrame(resizeCalendarWorkspace);
  }
  function removeFilter(entry) {
    if (!entry) window.KidsSyncCalendarUX?.resetHiddenFilter();
    if (!entry || entry.kind === 'category') state.eventFilter = 'all';
    if (!entry || entry.kind === 'search') { state.searchQuery = ''; scheduleSearch.value = ''; }
    if (!entry) state.visibleKids = new Set(kidProfiles.map(profile => profile.name));
    else if (entry.kind === 'child') state.visibleKids.add(entry.value);
    if ((!entry && ['week', 'four'].includes(currentView) && !state.showWeekends) || entry?.kind === 'weekends') {
      state.showWeekends = true;
      userSettings.showWeekends = true;
      saveSettings();
    }
    conflictCursor = 0; travelCursor = 0;
    setSidebarActive(state.eventFilter === 'holidays' ? 'holidays' : state.eventFilter === 'important' ? 'special-days' : 'calendar');
    renderAll(); scheduleSmartCalendarFocus();
    const next = chips.querySelector('button') || document.querySelector('#plannerOptions > summary');
    if (next?.getClientRects().length) next.focus({ preventScroll: true });
    else document.getElementById('workspaceQuickAdd').focus({ preventScroll: true });
  }
  function jumpToMinute(minute, { focusReturn = true } = {}) {
    const timeline = grid.querySelector('.time-column');
    if (!timeline || !weekSchedule.getClientRects().length) return;
    const top = scrollTopForMinute(minute, timeline.offsetHeight, weekSchedule.clientHeight, weekSchedule.scrollHeight, scheduleStartMinutes, scheduleEndMinutes);
    const reduced = userSettings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    weekSchedule.scrollTo({ top, left: weekSchedule.scrollLeft, behavior: reduced ? 'auto' : 'smooth' });
    jumpMenu.open = false;
    if (focusReturn) jumpMenu.querySelector('summary').focus({ preventScroll: true });
  }
  function syncResize() {
    divider.setAttribute('aria-valuenow', String(workspaceLayout.sideWidth));
    divider.setAttribute('aria-valuetext', text('width', { width: workspaceLayout.sideWidth }));
  }
  function setWidth(value, commit = false) {
    workspaceLayout.sideWidth = sidebarWidth(value);
    shell.style.setProperty('--workspace-side-width', `${workspaceLayout.sideWidth}px`);
    syncResize();
    if (commit) { applyWorkspaceLayout(); saveWorkspaceLayout(); }
  }
  function finishDrag(cancel = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    setWidth(cancel ? previous.width : workspaceLayout.sideWidth, !cancel);
    if (divider.hasPointerCapture(previous.id)) divider.releasePointerCapture(previous.id);
    shell.classList.remove('ui-resizing-side');
  }
  function refresh() {
    localize(); applyPreferences(); syncResize(); clearGuide();
    jumpMenu.hidden = !['week', 'four'].includes(currentView);
    if (jumpMenu.hidden) jumpMenu.open = false;
    renderFilters();
  }

  document.querySelectorAll('[data-open-visual-preferences]').forEach(button => button.addEventListener('click', openPreferences));
  ['closeVisualPreferences', 'doneVisualPreferences'].forEach(id => document.getElementById(id).addEventListener('click', () => panel.close()));
  panel.addEventListener('close', () => {
    if (returnToSettings) { returnToSettings = false; settingsDialog.showModal(); }
    if (openingElement?.isConnected && openingElement.getClientRects().length) openingElement.focus({ preventScroll: true });
    else document.querySelector('#moreActions > summary').focus({ preventScroll: true });
  });
  contrast.addEventListener('change', savePreferences);
  guides.addEventListener('change', savePreferences);
  window.addEventListener('storage', event => {
    if (event.key !== prefKey) return;
    try { preferences = normalizePreferences(JSON.parse(event.newValue)); applyPreferences(); } catch { /* Ignore malformed data from another tab. */ }
  });
  chips.addEventListener('click', event => {
    const target = event.target.closest('[data-clear-ui-filter]');
    if (target) removeFilter(activeEntries[Number(target.dataset.clearUiFilter)]);
  });
  document.getElementById('clearCalendarContext').addEventListener('click', event => {
    event.preventDefault(); event.stopImmediatePropagation(); removeFilter(null);
  }, true);
  jumpMenu.querySelectorAll('[data-jump-minute]').forEach(button => button.addEventListener('click', () => {
    const now = new Date();
    jumpToMinute(button.dataset.jumpMinute === 'now' ? now.getHours() * 60 + now.getMinutes() : Number(button.dataset.jumpMinute));
  }));
  document.addEventListener('pointerdown', event => { if (jumpMenu.open && !jumpMenu.contains(event.target)) jumpMenu.open = false; });
  const otherMenus = ['moreActions', 'plannerOptions', 'calendarViewMenu', 'workspacePanelMenu', 'sidebarMenu'].map(id => document.getElementById(id));
  jumpMenu.addEventListener('toggle', () => { if (jumpMenu.open) otherMenus.forEach(menu => { menu.open = false; }); });
  otherMenus.forEach(menu => menu.addEventListener('toggle', () => { if (menu.open) jumpMenu.open = false; }));
  jumpMenu.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !jumpMenu.open) return;
    event.preventDefault(); event.stopPropagation(); jumpMenu.open = false; jumpMenu.querySelector('summary').focus();
  });
  grid.addEventListener('pointermove', event => {
    if (!preferences.guides || event.pointerType !== 'mouse' || event.buttons || !matchMedia('(hover: hover) and (pointer: fine)').matches) { clearGuide(); return; }
    const column = event.target.closest('.day-column');
    if (!column || event.target.closest('.event')) { clearGuide(); return; }
    const bounds = column.getBoundingClientRect();
    const minute = snappedMinute(event.clientY, bounds.top, bounds.height, scheduleStartMinutes, scheduleEndMinutes);
    if (minute === null) return;
    if (hoveredColumn !== column) clearGuide();
    hoveredColumn = column;
    column.style.setProperty('--ui-slot-top', `${(minute - scheduleStartMinutes) / scheduleDurationMinutes * 100}%`);
    column.setAttribute('data-ui-time', formatTimeLabel(minute));
    column.classList.add('ui-slot-hover');
  });
  grid.addEventListener('pointerleave', clearGuide);
  weekSchedule.addEventListener('scroll', clearGuide, { passive: true });
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0 || matchMedia('(max-width: 900px)').matches) return;
    event.preventDefault(); divider.focus();
    drag = { id: event.pointerId, x: event.clientX, width: workspaceLayout.sideWidth, direction: workspaceLayout.sidePosition === 'left' ? 1 : -1 };
    divider.setPointerCapture(event.pointerId); shell.classList.add('ui-resizing-side');
  });
  divider.addEventListener('pointermove', event => { if (drag?.id === event.pointerId) setWidth(drag.width + (event.clientX - drag.x) * drag.direction); });
  divider.addEventListener('pointerup', () => finishDrag());
  divider.addEventListener('pointercancel', () => finishDrag(true));
  divider.addEventListener('lostpointercapture', () => finishDrag(true));
  divider.addEventListener('dblclick', () => setWidth(260, true));
  divider.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); finishDrag(true); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const direction = workspaceLayout.sidePosition === 'left' ? 1 : -1;
    const delta = (event.key === 'ArrowRight' ? 1 : -1) * direction * (event.shiftKey ? 32 : 8);
    setWidth(event.key === 'Home' ? 220 : event.key === 'End' ? 360 : workspaceLayout.sideWidth + delta, true);
  });
  window.addEventListener('resize', () => { if (matchMedia('(max-width: 900px)').matches) finishDrag(true); clearGuide(); });
  window.KidsSyncUI = { refresh, renderFilters, syncResize, jumpToMinute };
  refresh();
})();
