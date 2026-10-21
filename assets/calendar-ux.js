/* Calendar navigation, keyboard slots, and personal readability choices. */
(() => {
  'use strict';
  function parseDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return year >= 1900 && year <= 9999 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  function clock(value) {
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }
  function preferencesFor(value) {
    return { dimFinished: value?.dimFinished === true, hideCancelled: value?.hideCancelled === true };
  }
  function filterOccurrences(events, preferences) {
    return preferences.hideCancelled ? events.filter(event => event.status !== 'cancelled') : events;
  }
  function dayLoad(events) {
    const intervals = [];
    let untimed = 0;
    for (const event of events) {
      if (event.status === 'cancelled') continue;
      const start = clock(event.start), end = clock(event.end);
      if (event.allDay || ['trip', 'holiday'].includes(event.eventType) || start === null || end === null || end <= start) { untimed++; continue; }
      intervals.push([start, end]);
    }
    intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let minutes = 0, lastEnd = -1;
    for (const [start, end] of intervals) {
      minutes += Math.max(0, end - Math.max(start, lastEnd));
      lastEnd = Math.max(lastEnd, end);
    }
    return { minutes, untimed };
  }
  function eventEnd(event) {
    const day = parseDay(event.occurrenceDate || event.startDate);
    if (!day) return null;
    if (event.allDay || ['trip', 'holiday'].includes(event.eventType)) {
      const endDay = event.eventType === 'trip' ? parseDay(event.endDate) || day : day;
      return new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 1).getTime();
    }
    const minute = clock(event.end);
    if (minute === null) return null;
    day.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    return day.getTime();
  }
  function cursorStep(cursor, dates, key, start = 0, end = 1440) {
    if (!dates.length) return null;
    const index = Math.max(0, dates.indexOf(cursor.date));
    let minute = Number.isFinite(cursor.minute) ? cursor.minute : start, next = index;
    if (key === 'ArrowLeft') next--;
    if (key === 'ArrowRight') next++;
    if (key === 'ArrowUp') minute -= 15;
    if (key === 'ArrowDown') minute += 15;
    if (key === 'PageUp') minute -= 60;
    if (key === 'PageDown') minute += 60;
    if (key === 'Home') minute = start;
    if (key === 'End') minute = end - 15;
    return { date: dates[Math.max(0, Math.min(dates.length - 1, next))], minute: Math.max(start, Math.min(end - 15, minute)) };
  }
  class NavigationHistory {
    constructor() { this.scope = ''; this.items = []; this.index = -1; }
    record(scope, frame) {
      if (!parseDay(frame.date) || !['today', 'week', 'four', 'month'].includes(frame.view)) return;
      if (scope !== this.scope) { this.scope = scope; this.items = []; this.index = -1; }
      const current = this.items[this.index];
      if (current?.date === frame.date && current.view === frame.view) return;
      this.items = [...this.items.slice(0, this.index + 1), { date: frame.date, view: frame.view }].slice(-20);
      this.index = this.items.length - 1;
    }
    move(direction) {
      const index = this.index + direction;
      if (![-1, 1].includes(direction) || index < 0 || index >= this.items.length) return null;
      this.index = index;
      return { ...this.items[index] };
    }
  }
  const pure = { parseDay, clock, preferencesFor, filterOccurrences, dayLoad, eventEnd, cursorStep, NavigationHistory };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  const words = {
    en: {
      back: '← Back', forward: 'Forward →', history: 'Recent calendar navigation', target: '{action}: {date} · {view}',
      dim: 'Dim finished events', dimHint: 'Keep past plans visible with less emphasis. Focus or hover to read them at full contrast.',
      cancelled: 'Hide cancelled events', cancelledHint: 'Remove cancelled events from calendar views and counts. Your saved events stay in history.',
      local: 'Saved for this calendar on this device.', saved: 'Calendar display preference saved.', session: 'Storage is unavailable. This choice will last for this session only.',
      hidden: 'Cancelled events hidden · Show', filterOne: '1 active filter', filters: '{n} active filters',
      load: '{time} occupied', allDay: '{n} untimed', loadHint: 'Time with at least one visible timed event; overlapping time is counted once. All-day plans, holidays, and trips are counted separately.',
      keyboard: 'Use arrow keys to choose a day and move by 15 minutes. Page Up or Page Down moves one hour. Enter adds an event. Escape clears the selection.',
      slot: '{date}, {time}. Press Enter to add an event.', keyboardShort: 'Arrow keys: choose a time · Enter: add event'
    },
    zh: {
      back: '← 返回', forward: '前进 →', history: '最近浏览的日历', target: '{action}：{date} · {view}',
      dim: '淡化已结束的日程', dimHint: '保留已结束的安排并降低视觉强调。聚焦或悬停时恢复完整对比度。',
      cancelled: '隐藏已取消的日程', cancelledHint: '在日历视图和统计中隐藏已取消的日程。历史记录中的日程仍会保留。',
      local: '仅为此设备上的当前日历保存。', saved: '已保存日历显示偏好。', session: '无法使用设备存储，此选择仅在本次使用期间有效。',
      hidden: '已隐藏取消的日程 · 显示', filterOne: '1 项筛选', filters: '{n} 项筛选',
      load: '占用 {time}', allDay: '{n} 项无时间安排', loadHint: '计算至少有一项可见定时活动的时间，重叠时段仅计算一次。全天日程、节假日和旅行单独统计。',
      keyboard: '使用方向键选择日期，每次移动 15 分钟；Page Up 或 Page Down 移动一小时；Enter 添加活动；Escape 清除选择。',
      slot: '{date}，{time}。按 Enter 添加活动。', keyboardShort: '方向键选择时间 · Enter 添加活动'
    }
  };
  const tx = (key, values = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  const shell = document.getElementById('appShell');
  const timeline = document.getElementById('weekSchedule');
  const history = new NavigationHistory();
  let preferences = preferencesFor(null), preferenceScope = '', cursor = null;
  const scope = () => scheduleStorageKey('calendar-ux-v1');
  function ensureScope() {
    const next = scope();
    if (preferenceScope === next) return;
    preferenceScope = next;
    try { preferences = preferencesFor(JSON.parse(localStorage.getItem(next))); }
    catch { preferences = preferencesFor(null); }
    cursor = null;
    document.getElementById('calendarUXStatus').textContent = '';
  }
  function savePreferences() {
    let key = 'saved';
    try { localStorage.setItem(preferenceScope, JSON.stringify(preferences)); }
    catch { key = 'session'; }
    document.getElementById('calendarUXStatus').textContent = tx(key);
  }
  function resetHiddenFilter() {
    ensureScope();
    if (!preferences.hideCancelled) return;
    preferences.hideCancelled = false;
    savePreferences();
  }
  function visibleEvents(events) { ensureScope(); return filterOccurrences(events, preferences); }
  function shortDuration(value) {
    const hour = Math.floor(value / 60), minute = value % 60;
    return currentLanguage === 'zh' ? `${hour ? `${hour}小时` : ''}${minute ? `${minute}分` : ''}` : `${hour ? `${hour}h` : ''}${hour && minute ? ' ' : ''}${minute ? `${minute}m` : ''}`;
  }
  function loadLabel(events) {
    const load = dayLoad(events);
    return [load.minutes ? tx('load', { time: shortDuration(load.minutes) }) : '', load.untimed ? tx('allDay', { n: load.untimed }) : ''].filter(Boolean).join(' · ');
  }
  function decorateLoads() {
    document.querySelectorAll('.calendar-day-load').forEach(node => node.remove());
    document.querySelectorAll('#scheduleGrid .day-head[data-calendar-date], #mobileAgenda .day-card[data-calendar-date]').forEach(node => {
      const date = parseDay(node.dataset.calendarDate);
      if (!date) return;
      const label = loadLabel(occurrencesOnDate(date));
      if (!label) return;
      const badge = document.createElement('span');
      badge.className = 'calendar-day-load'; badge.textContent = label; badge.title = tx('loadHint');
      (node.querySelector('.agenda-day-heading') || node).append(badge);
      if (node.classList.contains('day-head')) {
        node.dataset.calendarBaseLabel ||= node.getAttribute('aria-label') || '';
        node.setAttribute('aria-label', `${node.dataset.calendarBaseLabel} · ${label}`);
      }
    });
    const label = loadLabel(occurrencesOnDate(selectedDate));
    if (label) {
      const badge = document.createElement('small');
      badge.className = 'calendar-day-load'; badge.textContent = label; badge.title = tx('loadHint');
      document.getElementById('todayHeading').append(badge);
    }
  }
  const nav = document.createElement('nav');
  nav.id = 'calendarNavigationHistory'; nav.className = 'calendar-navigation-history'; nav.hidden = true;
  nav.innerHTML = '<button type="button" data-calendar-history="-1"></button><button type="button" data-calendar-history="1"></button>';
  document.querySelector('.calendar-stage').before(nav);
  const hiddenChip = document.createElement('button');
  hiddenChip.type = 'button'; hiddenChip.className = 'active-filter-chip calendar-cancelled-chip';
  hiddenChip.addEventListener('click', () => {
    resetHiddenFilter(); renderAll();
    const summary = document.querySelector('#plannerOptions > summary');
    (summary.getClientRects().length ? summary : document.getElementById('workspaceQuickAdd')).focus({ preventScroll: true });
  });
  function refreshHistory() {
    history.record(preferenceScope, { date: dateKey(selectedDate), view: currentView });
    nav.hidden = history.items.length < 2;
    nav.setAttribute('aria-label', tx('history'));
    nav.querySelectorAll('[data-calendar-history]').forEach(button => {
      const direction = Number(button.dataset.calendarHistory), frame = history.items[history.index + direction];
      button.textContent = tx(direction < 0 ? 'back' : 'forward'); button.disabled = !frame;
      const label = frame ? tx('target', { action: tx(direction < 0 ? 'back' : 'forward'), date: formatFullDate(parseDay(frame.date)), view: t(`view.${frame.view}`) }) : button.textContent;
      button.title = label; button.setAttribute('aria-label', label);
    });
  }
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-calendar-history]');
    if (!button || button.disabled) return;
    ensureScope();
    const frame = history.move(Number(button.dataset.calendarHistory));
    if (!frame) return;
    selectedDate = parseDay(frame.date);
    showCalendarPage();
    activateCalendarView(frame.view, true, { remember: false });
    const target = !button.disabled ? button : nav.querySelector("button:not(:disabled)");
    target?.focus({ preventScroll: true });
  });
  function decorateEvent(element, event) {
    const end = eventEnd(event);
    if (end !== null) element.dataset.calendarEnd = String(end);
  }
  function refreshFinished() {
    ensureScope();
    shell.classList.toggle('calendar-dim-finished', preferences.dimFinished);
    const now = Date.now();
    shell.querySelectorAll('[data-calendar-end]').forEach(node => {
      const end = Number(node.dataset.calendarEnd);
      node.classList.toggle('calendar-event-finished', Number.isFinite(end) && end <= now);
    });
  }
  const keyboardStatus = document.createElement('p');
  keyboardStatus.id = 'calendarSlotStatus'; keyboardStatus.className = 'sr-only'; keyboardStatus.setAttribute('role', 'status');
  keyboardStatus.setAttribute('aria-live', 'polite'); document.body.append(keyboardStatus);
  const keyboardHint = document.createElement('p');
  keyboardHint.id = 'calendarKeyboardHint'; keyboardHint.className = 'calendar-keyboard-hint';
  timeline.after(keyboardHint);
  timeline.setAttribute('aria-describedby', `${timeline.getAttribute('aria-describedby') || ''} calendarKeyboardHint`.trim());
  function columns() { return [...grid.querySelectorAll('.day-column[data-drop-date]')]; }
  function clearCursor() {
    grid.querySelectorAll('.calendar-keyboard-slot').forEach(node => node.remove());
    timeline.setAttribute('aria-label', t('aria.weeklySchedule'));
    keyboardStatus.textContent = '';
  }
  function drawCursor(scroll = false) {
    clearCursor();
    const days = columns(), dates = days.map(node => node.dataset.dropDate);
    if (!dates.length || !timeline.getClientRects().length) return;
    if (!cursor || !dates.includes(cursor.date)) {
      const now = new Date(), selected = dateKey(selectedDate);
      cursor = { date: dates.includes(selected) ? selected : dates[0], minute: isSameDate(selectedDate, now) ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15 : 540 };
    }
    cursor = cursorStep(cursor, dates, '', scheduleStartMinutes, scheduleEndMinutes);
    const column = days[dates.indexOf(cursor.date)], marker = document.createElement('span');
    marker.className = 'calendar-keyboard-slot'; marker.setAttribute('aria-hidden', 'true'); marker.textContent = formatTimeLabel(cursor.minute);
    marker.style.top = `${(cursor.minute - scheduleStartMinutes) / scheduleDurationMinutes * 100}%`;
    column.append(marker);
    const label = tx('slot', { date: formatFullDate(parseDay(cursor.date)), time: formatTimeLabel(cursor.minute) });
    keyboardStatus.textContent = label; timeline.setAttribute('aria-label', label);
    if (scroll) marker.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }
  timeline.addEventListener('focusin', event => { if (event.target === timeline) drawCursor(true); });
  timeline.addEventListener('focusout', event => { if (event.target === timeline) clearCursor(); });
  timeline.addEventListener('pointerdown', () => { cursor = null; clearCursor(); });
  timeline.addEventListener('keydown', event => {
    if (event.target !== timeline || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { cursor = null; clearCursor(); return; }
    if (!cursor) drawCursor();
    if (!cursor) return;
    if (event.key === 'Enter') {
      if (!event.repeat) openNewEventAtTime(parseDay(cursor.date), cursor.minute);
      return;
    }
    cursor = cursorStep(cursor, columns().map(node => node.dataset.dropDate), event.key, scheduleStartMinutes, scheduleEndMinutes);
    drawCursor(true);
  });
  function refresh() {
    ensureScope();
    document.querySelectorAll('[data-calendar-ux-text]').forEach(node => { node.textContent = tx(node.dataset.calendarUxText); });
    document.getElementById('calendarDimFinished').checked = preferences.dimFinished;
    document.getElementById('calendarHideCancelled').checked = preferences.hideCancelled;
    keyboardHint.textContent = tx('keyboardShort'); keyboardHint.title = tx('keyboard');
    refreshHistory(); decorateLoads(); refreshFinished();
    hiddenChip.remove();
    if (preferences.hideCancelled) {
      hiddenChip.textContent = tx('hidden');
      const chips = document.getElementById('activeFilterChips'); chips.append(hiddenChip);
      document.getElementById('calendarContextBar').hidden = false;
      document.getElementById('calendarContextLabel').textContent = tx(chips.children.length === 1 ? 'filterOne' : 'filters', { n: chips.children.length });
    }
    if (document.activeElement === timeline) drawCursor(); else clearCursor();
    requestAnimationFrame(resizeCalendarWorkspace);
  }
  [['calendarDimFinished', 'dimFinished'], ['calendarHideCancelled', 'hideCancelled']].forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', event => {
      ensureScope(); preferences[key] = event.currentTarget.checked; savePreferences(); renderAll();
    });
  });
  window.addEventListener('storage', event => {
    if (event.key !== scope()) return;
    try { preferences = preferencesFor(JSON.parse(event.newValue)); preferenceScope = scope(); renderAll(); } catch { /* Ignore malformed updates. */ }
  });
  window.KidsSyncCalendarUX = { refresh, refreshFinished, decorateEvent, filterOccurrences: visibleEvents, resetHiddenFilter, hasHiddenFilter: () => { ensureScope(); return preferences.hideCancelled; } };
  renderAll();
})();
