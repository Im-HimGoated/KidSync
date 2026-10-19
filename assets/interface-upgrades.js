/* Five lightweight interface upgrades. Calendar data is read, never rewritten here. */
(() => {
  const cloneDate = value => {
    const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const localKey = value => {
    const date = cloneDate(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const addLocalDays = (value, days) => {
    const date = cloneDate(value);
    date.setDate(date.getDate() + days);
    return date;
  };
  function ribbonDateKeys(value, view = 'today') {
    const selected = cloneDate(value);
    let start = selected;
    if (view === 'week') {
      const weekday = selected.getDay();
      start = addLocalDays(selected, -(weekday === 0 ? 6 : weekday - 1));
    } else if (view !== 'four') {
      start = addLocalDays(selected, -3);
    }
    return Array.from({ length: 7 }, (_, index) => localKey(addLocalDays(start, index)));
  }
  function normalizeInterfacePreferences(value, compact = false) {
    return { familyCollapsed: typeof value?.familyCollapsed === 'boolean' ? value.familyCollapsed : Boolean(compact) };
  }
  function summaryCopy(count, conflicts, language = 'en') {
    if (language === 'zh') return `${count} 个日程${conflicts ? ` · ${conflicts} 个冲突` : ' · 无冲突'}`;
    return `${count} ${count === 1 ? 'event' : 'events'}${conflicts ? ` · ${conflicts} ${conflicts === 1 ? 'conflict' : 'conflicts'}` : ' · No conflicts'}`;
  }
  const pure = { ribbonDateKeys, normalizeInterfacePreferences, summaryCopy };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  const words = {
    en: {
      summary: 'Current view', ribbon: 'Quick date navigator', previous: 'Previous seven days', next: 'Next seven days',
      today: 'Today', openDay: 'Open {date}: {count}', noEvents: 'no events', oneEvent: '1 event', events: '{count} events',
      nextUp: 'Next event', noUpcoming: 'No upcoming events', openNext: 'Open next event',
      collapseFamily: 'Collapse child filters', expandFamily: 'Expand child filters', familySummary: '{visible} of {total} shown',
      dock: 'Quick calendar actions', search: 'Search', add: 'Add', more: 'More'
    },
    zh: {
      summary: '当前视图', ribbon: '快速日期导航', previous: '前七天', next: '后七天',
      today: '今天', openDay: '打开 {date}：{count}', noEvents: '无日程', oneEvent: '1 个日程', events: '{count} 个日程',
      nextUp: '下一个日程', noUpcoming: '没有即将开始的日程', openNext: '打开下一个日程',
      collapseFamily: '收起孩子筛选', expandFamily: '展开孩子筛选', familySummary: '显示 {visible}/{total}',
      dock: '日历快捷操作', search: '搜索', add: '添加', more: '更多'
    }
  };
  const tx = (key, values = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  const prefKey = 'kidssync.interface-preferences.v1';
  let preferences;
  try { preferences = normalizeInterfacePreferences(JSON.parse(localStorage.getItem(prefKey)), matchMedia('(max-width: 740px)').matches); }
  catch { preferences = normalizeInterfacePreferences(null, matchMedia('(max-width: 740px)').matches); }
  let highlightedEvent = null;

  function savePreferences() {
    try { localStorage.setItem(prefKey, JSON.stringify(preferences)); } catch { /* Session-only is still useful. */ }
  }

  function createPulse() {
    if (document.getElementById('calendarPulse')) return;
    const pulse = document.createElement('section');
    pulse.id = 'calendarPulse';
    pulse.className = 'calendar-pulse';
    pulse.innerHTML = `
      <div class="calendar-pulse-summary">
        <span class="calendar-pulse-icon" aria-hidden="true">▦</span>
        <span><small id="calendarPulseKicker"></small><strong id="calendarPulseRange"></strong><span id="calendarPulseHealth" role="status" aria-live="polite"></span></span>
      </div>
      <button class="calendar-next-spotlight" id="calendarNextSpotlight" type="button">
        <span class="calendar-next-icon" aria-hidden="true">→</span>
        <span><small id="calendarNextKicker"></small><strong id="calendarNextTitle"></strong><span id="calendarNextMeta"></span></span>
      </button>
      <nav class="date-ribbon" id="dateRibbon" aria-label="Quick date navigator">
        <button class="date-ribbon-arrow" type="button" data-ribbon-shift="-7" aria-label="Previous seven days" title="Previous seven days">‹</button>
        <div class="date-ribbon-days" id="dateRibbonDays"></div>
        <button class="date-ribbon-arrow" type="button" data-ribbon-shift="7" aria-label="Next seven days" title="Next seven days">›</button>
      </nav>`;
    document.getElementById('calendarInsights').after(pulse);
    pulse.addEventListener('click', event => {
      const dateButton = event.target.closest('[data-ribbon-date]');
      if (dateButton) {
        const date = parseDateKey(dateButton.dataset.ribbonDate);
        selectedDate = date;
        currentWeekStart = getMonday(date);
        currentMonthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        miniCalendarMonth = new Date(currentMonthStart);
        showCalendarPage();
        activateCalendarView('today', true);
        return;
      }
      const shift = event.target.closest('[data-ribbon-shift]');
      if (shift) {
        selectedDate = addDays(selectedDate, Number(shift.dataset.ribbonShift));
        currentWeekStart = getMonday(selectedDate);
        currentMonthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        miniCalendarMonth = new Date(currentMonthStart);
        renderAll();
      }
    });
    const quickUtilities = document.getElementById('quickCalendarNav');
    if (quickUtilities) {
      quickUtilities.classList.add('is-pulse-utility');
      pulse.append(quickUtilities);
    }
    document.getElementById('calendarNextSpotlight').addEventListener('click', () => {
      if (!highlightedEvent) return;
      showCalendarPage();
      showEventDetails(highlightedEvent);
    });
  }

  function createMobileDock() {
    if (document.getElementById('mobileActionDock')) return;
    const dock = document.createElement('nav');
    dock.id = 'mobileActionDock';
    dock.className = 'mobile-action-dock';
    dock.innerHTML = `
      <button type="button" data-dock-action="today"><span aria-hidden="true">●</span><span data-dock-label="today"></span></button>
      <button type="button" data-dock-action="search"><span class="dock-search-glyph" aria-hidden="true"></span><span data-dock-label="search"></span></button>
      <button class="is-primary" type="button" data-dock-action="add"><span aria-hidden="true">＋</span><span data-dock-label="add"></span></button>
      <button type="button" data-dock-action="more"><span aria-hidden="true">•••</span><span data-dock-label="more"></span></button>`;
    document.getElementById('appShell').append(dock);
    dock.addEventListener('click', event => {
      const action = event.target.closest('[data-dock-action]')?.dataset.dockAction;
      if (!action) return;
      // Delegated button clicks may open disclosures. The original dock click
      // must not reach the page's outside-click handler and close them again.
      event.stopPropagation();
      if (action === 'today') document.getElementById('jumpToday').click();
      if (action === 'search') document.getElementById('focusScheduleSearch').click();
      if (action === 'add') document.getElementById('addActivity').click();
      if (action === 'more') {
        showCalendarPage();
        if (hiddenWorkspacePanels.has('controls')) {
          hiddenWorkspacePanels.delete('controls');
          applyWorkspaceVisibility();
        }
        const menu = document.getElementById('moreActions');
        const summary = menu.querySelector('summary');
        if (!menu.open) summary.click();
        summary.focus({ preventScroll: true });
      }
    });
  }

  function applyFamilyStrip() {
    const panel = document.getElementById('kidFilters');
    const header = panel.querySelector('.kids-header');
    if (!header) return;
    let summary = panel.querySelector('.family-strip-summary');
    if (!summary) {
      summary = document.createElement('span');
      summary.className = 'family-strip-summary';
      panel.append(summary);
    }
    let toggle = header.querySelector('.family-strip-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'family-strip-toggle';
      toggle.innerHTML = '<span aria-hidden="true">⌃</span>';
      toggle.addEventListener('click', () => {
        preferences.familyCollapsed = !preferences.familyCollapsed;
        savePreferences();
        applyFamilyStrip();
      });
      header.append(toggle);
    }
    const visible = kidProfiles.filter(kid => state.visibleKids.has(kid.name)).length;
    summary.textContent = tx('familySummary', { visible, total: kidProfiles.length });
    panel.classList.toggle('is-ui-collapsed', preferences.familyCollapsed);
    toggle.setAttribute('aria-expanded', String(!preferences.familyCollapsed));
    toggle.setAttribute('aria-label', tx(preferences.familyCollapsed ? 'expandFamily' : 'collapseFamily'));
    toggle.title = toggle.getAttribute('aria-label');
    toggle.querySelector('span').textContent = preferences.familyCollapsed ? '⌄' : '⌃';
  }

  function eventCount(date) {
    return occurrencesOnDate(date).filter(event => activityStatus(event) !== 'cancelled').length;
  }

  function countText(count) {
    if (!count) return tx('noEvents');
    return tx(count === 1 ? 'oneEvent' : 'events', { count });
  }

  function renderRibbon() {
    const container = document.getElementById('dateRibbonDays');
    const locale = currentLanguage === 'zh' ? 'zh-CN' : 'en-US';
    const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const numberFormat = new Intl.DateTimeFormat(locale, { day: 'numeric' });
    const today = new Date();
    container.innerHTML = ribbonDateKeys(selectedDate, currentView).map(key => {
      const date = parseDateKey(key);
      const count = eventCount(date);
      const selected = isSameDate(date, selectedDate);
      const current = isSameDate(date, today);
      const full = formatFullDate(date);
      return `<button type="button" class="date-ribbon-day${selected ? ' is-selected' : ''}${current ? ' is-today' : ''}" data-ribbon-date="${key}" aria-current="${selected ? 'date' : 'false'}" aria-label="${escapeHtml(tx('openDay', { date: full, count: countText(count) }))}"><span>${escapeHtml(current ? tx('today') : weekdayFormat.format(date))}</span><strong>${escapeHtml(numberFormat.format(date))}</strong>${count ? `<i aria-hidden="true">${count > 9 ? '9+' : count}</i>` : ''}</button>`;
    }).join('');
    const active = container.querySelector('.is-selected');
    if (active && container.scrollWidth > container.clientWidth) {
      container.scrollLeft = Math.max(0, active.offsetLeft - container.offsetLeft - (container.clientWidth - active.offsetWidth) / 2);
    }
  }

  function renderPulse() {
    const insight = calendarInsightSummary();
    document.getElementById('calendarPulseKicker').textContent = tx('summary');
    document.getElementById('calendarPulseRange').textContent = document.getElementById('weekLabel').textContent;
    document.getElementById('calendarPulseHealth').textContent = summaryCopy(insight.count, insight.conflictCount, currentLanguage);
    document.getElementById('dateRibbon').setAttribute('aria-label', tx('ribbon'));
    document.querySelector('[data-ribbon-shift="-7"]').setAttribute('aria-label', tx('previous'));
    document.querySelector('[data-ribbon-shift="-7"]').title = tx('previous');
    document.querySelector('[data-ribbon-shift="7"]').setAttribute('aria-label', tx('next'));
    document.querySelector('[data-ribbon-shift="7"]').title = tx('next');

    highlightedEvent = upcomingOccurrences(90)[0] || null;
    const spotlight = document.getElementById('calendarNextSpotlight');
    document.getElementById('calendarNextKicker').textContent = tx('nextUp');
    document.getElementById('calendarNextTitle').textContent = highlightedEvent ? activityCompactTitle(highlightedEvent) : tx('noUpcoming');
    document.getElementById('calendarNextMeta').textContent = highlightedEvent
      ? `${formatShortDate(parseDateKey(highlightedEvent.occurrenceDate || highlightedEvent.startDate))} · ${highlightedEvent.allDay ? t('calendar.allDay') : eventTimeText(highlightedEvent)}`
      : '';
    spotlight.disabled = !highlightedEvent;
    spotlight.setAttribute('aria-label', highlightedEvent ? `${tx('openNext')}: ${activityCompactTitle(highlightedEvent)}` : tx('noUpcoming'));
    renderRibbon();
  }

  function localizeDock() {
    const dock = document.getElementById('mobileActionDock');
    dock.setAttribute('aria-label', tx('dock'));
    for (const key of ['today', 'search', 'add', 'more']) dock.querySelector(`[data-dock-label="${key}"]`).textContent = tx(key);
  }

  function refresh() {
    createPulse();
    createMobileDock();
    applyFamilyStrip();
    renderPulse();
    localizeDock();
  }

  window.addEventListener('storage', event => {
    if (event.key !== prefKey) return;
    try { preferences = normalizeInterfacePreferences(JSON.parse(event.newValue), matchMedia('(max-width: 740px)').matches); }
    catch { preferences = normalizeInterfacePreferences(null, matchMedia('(max-width: 740px)').matches); }
    applyFamilyStrip();
  });
  window.KidsSyncInterface = { refresh, ribbonDateKeys, summaryCopy };
  refresh();
})();
