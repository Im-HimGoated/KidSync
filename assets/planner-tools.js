/* Personal planning helpers. Calendar changes still use the app's normal save/audit path. */
(() => {
  function localDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1900 || year > 9999) return null;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  function dateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function plusDays(date, count) {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  }
  function dayNumber(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  }
  function packingItems(value) {
    const seen = new Set();
    return String(value || '').split(/[,;\n，；、]+/).map(item => item.trim().replace(/^[-*•]\s*/, ''))
      .filter(item => {
        const key = item.toLocaleLowerCase();
        if (!item || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 30);
  }
  function personalStore(value) {
    const favorites = [...new Set(Array.isArray(value?.favorites) ? value.favorites.filter(id => typeof id === 'string' && id.length <= 200) : [])].slice(0, 500);
    const packed = Object.fromEntries(Object.entries(value?.packed && typeof value.packed === 'object' && !Array.isArray(value.packed) ? value.packed : {})
      .filter(([key, labels]) => key.length <= 300 && Array.isArray(labels))
      .slice(-300).map(([key, labels]) => [key, [...new Set(labels.filter(label => typeof label === 'string' && label.length <= 200))].slice(0, 30)]));
    return { favorites, packed };
  }
  function packingKey(activity, fallbackDate) {
    const date = activity.eventType === 'trip' ? activity.startDate : activity.occurrenceDate || activity.startDate;
    return `${activity.id}:${date || fallbackDate}`;
  }
  function copyForDate(activity, target, id) {
    const date = localDate(target);
    if (!date || !id) throw new Error('invalid-date');
    const copy = JSON.parse(JSON.stringify(activity));
    const start = localDate(activity.startDate);
    const end = localDate(activity.endDate);
    const span = activity.eventType === 'trip' && start && end ? Math.max(0, dayNumber(end) - dayNumber(start)) : 0;
    const shiftedEnd = plusDays(date, span);
    if (shiftedEnd.getFullYear() > 9999) throw new Error('invalid-date');
    Object.assign(copy, { id, startDate: target, endDate: activity.eventType === 'trip' ? dateString(shiftedEnd) : '',
      recurrence: 'none', repeatInterval: 1, repeatUntil: '', repeatDays: [], status: 'confirmed' });
    delete copy.occurrenceDate;
    delete copy.day;
    delete copy.isBuiltInHoliday;
    return copy;
  }
  function agendaItems(from, getOccurrences, favoriteIds = null) {
    const start = localDate(from);
    if (!start) return [];
    const favorites = favoriteIds === null ? null : new Set(favoriteIds);
    const seen = new Set();
    const items = [];
    for (let offset = 0; offset < 30; offset++) {
      const date = plusDays(start, offset);
      if (date.getFullYear() > 9999) break;
      for (const event of getOccurrences(date)) {
        if (event.status === 'cancelled' || (favorites && !favorites.has(event.id))) continue;
        const day = dateString(date);
        const key = event.eventType === 'trip' ? `${event.id}:${event.startDate}:${event.endDate}` : `${event.id}:${day}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ ...event, occurrenceDate: day });
      }
    }
    return items.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || Number(Boolean(b.allDay)) - Number(Boolean(a.allDay))
      || String(a.start || '').localeCompare(String(b.start || '')) || String(a.title || '').localeCompare(String(b.title || '')));
  }
  const pure = { localDate, dateString, plusDays, packingItems, personalStore, packingKey, copyForDate, agendaItems };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  const words = {
    en: {
      tools: 'Planner tools', agenda: '30-day agenda', favorites: 'Favorites', from: 'Starting date', close: 'Close',
      scope: 'Uses the current calendar, child filters, category, and search. Cancelled events are excluded.',
      device: 'Favorites and packing progress are personal to this calendar on this device; they are not shared or synced.',
      empty: 'No matching events in these 30 days. Try another date or adjust the calendar filters.',
      noFavorites: 'No favorite events match these dates and filters. Open an event and choose Favorite to add one.',
      favorite: '☆ Favorite', favorited: '★ Favorited', copy: 'Copy summary', copied: 'Summary copied.',
      manualCopy: 'Clipboard access is unavailable. Select and copy the summary below.',
      summaryLabel: 'Event summary', copyToDate: 'Copy to another date', copyNote: 'Creates one confirmed event. The original and its repeating series stay unchanged. Trips keep their length.',
      targetDate: 'New event date', createCopy: 'Create copy', copyDone: 'Copy created for {date}.',
      invalidDate: 'Choose a valid date.', saveFailed: 'Could not save. Your change was not applied; please try again.',
      packing: 'Packing checklist', packingHint: 'Add a comma-separated list in Bring / prepare when editing the event.',
      progress: '{done} of {total} packed', packingScope: 'This occurrence only; a later repeat starts with a fresh checklist.',
      tripPacking: 'This checklist is shared across the days of this trip.', reset: 'Reset checklist',
      conflict: 'This copy overlaps another event for the same person. Review it in the calendar.',
      stale: 'This event or calendar changed. Close this sheet and open the event again.',
      privacy: 'Personal helpers', toolsHint: 'See the next 30 days or revisit your favorite events.',
      event: 'Event', where: 'Location', who: 'For', adult: 'Responsible adult', bring: 'Bring / prepare', notes: 'Notes',
      start: 'Starts', end: 'Ends', status: 'Status', repeats: 'Repeats', count: '{count} events', countOne: '1 event'
    },
    zh: {
      tools: '计划工具', agenda: '30 天日程', favorites: '收藏', from: '起始日期', close: '关闭',
      scope: '遵循当前日历、孩子、类别与搜索筛选，不包含已取消的日程。',
      device: '收藏和打包进度仅保存在此设备的当前日历中，不会共享或同步。',
      empty: '这 30 天内没有符合筛选的日程。请选择其他日期或调整日历筛选。',
      noFavorites: '这些日期与筛选下没有收藏。打开日程并选择“收藏”即可添加。',
      favorite: '☆ 收藏', favorited: '★ 已收藏', copy: '复制日程摘要', copied: '摘要已复制。',
      manualCopy: '无法访问剪贴板。请选中并复制下方的摘要。', summaryLabel: '日程摘要',
      copyToDate: '复制到其他日期', copyNote: '新建一个已确认的单次日程，不更改原日程或重复系列。旅行会保留原来的天数。',
      targetDate: '新日程日期', createCopy: '创建副本', copyDone: '已为 {date} 创建副本。',
      invalidDate: '请选择有效日期。', saveFailed: '无法保存，更改未生效。请重试。',
      packing: '打包清单', packingHint: '编辑日程时，在“携带 / 准备”中用逗号分隔物品。',
      progress: '已打包 {done} / {total} 项', packingScope: '仅记录此次日程；下次重复日程会使用新的清单。',
      tripPacking: '此次旅行的所有日期使用同一份清单。', reset: '重置清单',
      conflict: '副本与同一人的其他日程重叠，请在日历中检查。',
      stale: '日程或日历已更改。请关闭并重新打开此日程。', privacy: '个人助手',
      toolsHint: '查看未来 30 天的安排，或再次查看已收藏的日程。',
      event: '日程', where: '地点', who: '参与者', adult: '负责的成人', bring: '携带 / 准备', notes: '备注',
      start: '开始', end: '结束', status: '状态', repeats: '重复', count: '{count} 个日程', countOne: '1 个日程'
    }
  };
  const tx = (key, args = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const hub = document.getElementById('plannerToolsDialog');
  const results = document.getElementById('plannerToolsResults');
  const startInput = document.getElementById('plannerToolsStart');
  let mode = 'agenda';
  let matches = [];
  let backToHub = false;
  let returnFocus = null;
  let attachment = null;

  function readHelpers() {
    try { return personalStore(JSON.parse(localStorage.getItem(scheduleStorageKey('planner-helpers')))); }
    catch { return personalStore(null); }
  }
  function writeHelpers(value) {
    try { localStorage.setItem(scheduleStorageKey('planner-helpers'), JSON.stringify(personalStore(value))); return true; }
    catch { return false; }
  }
  function localize() {
    document.querySelectorAll('[data-tools-text]').forEach(element => { element.textContent = tx(element.dataset.toolsText); });
    document.getElementById('closePlannerTools').setAttribute('aria-label', tx('close'));
  }
  function renderHub() {
    localize();
    hub.querySelectorAll('[data-tools-mode]').forEach(button => {
      const active = button.dataset.toolsMode === mode;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    matches = agendaItems(startInput.value, date => occurrencesOnDate(date), mode === 'favorites' ? readHelpers().favorites : null);
    const favoriteIds = new Set(readHelpers().favorites);
    const groups = new Map();
    matches.forEach((event, index) => {
      if (!groups.has(event.occurrenceDate)) groups.set(event.occurrenceDate, []);
      groups.get(event.occurrenceDate).push({ event, index });
    });
    results.setAttribute('aria-labelledby', mode === 'favorites' ? 'toolsFavoritesTab' : 'toolsAgendaTab');
    document.getElementById('plannerToolsCount').textContent = tx(matches.length === 1 ? 'countOne' : 'count', { count: matches.length });
    if (!localDate(startInput.value)) { results.innerHTML = `<p class="tools-empty">${esc(tx('invalidDate'))}</p>`; return; }
    results.innerHTML = matches.length ? [...groups].map(([day, entries]) => `<section class="tools-agenda-day"><h3>${esc(formatFullDate(localDate(day)))}</h3>${entries.map(({ event, index }) => {
      const timing = event.eventType === 'trip' && activityDateRangeText(event) ? activityDateRangeText(event) : eventTimeText(event);
      return `<button type="button" class="tools-agenda-event" data-tools-event="${index}"><span class="tools-agenda-time">${esc(timing)}</span><span class="tools-agenda-copy"><strong>${favoriteIds.has(event.id) ? '<span aria-hidden="true">★ </span>' : ''}${esc(activityTitle(event))}</strong><small>${esc([displayChild(event), event.location].filter(Boolean).join(' · '))}</small></span></button>`;
    }).join('')}</section>`).join('') : `<p class="tools-empty">${esc(tx(mode === 'favorites' ? 'noFavorites' : 'empty'))}</p>`;
  }
  function openHub() {
    returnFocus = document.activeElement;
    mode = 'agenda';
    startInput.value = dateKey(selectedDate);
    document.getElementById('moreActions').open = false;
    renderHub();
    hub.showModal();
  }
  function eventSummary(event) {
    const when = event.eventType === 'trip' && activityDateRangeText(event)
      ? `${activityDateRangeText(event)} · ${eventTimeText(event)}`
      : `${formatFullDate(localDate(event.occurrenceDate || event.startDate || dateKey(selectedDate)))} · ${eventTimeText(event)}`;
    return [activityTitle(event), when, `${tx('who')}: ${displayChild(event)}`,
      ...[['where', event.location], ['adult', event.responsible], ['bring', event.items], ['notes', event.notes]].filter(([, value]) => value).map(([label, value]) => `${tx(label)}: ${value}`)
    ].join('\n');
  }
  function currentAttachment() {
    return attachment && attachment.scope === scheduleStorageKey('planner-helpers');
  }
  async function copySummary() {
    if (!currentAttachment()) { status(tx('stale')); return; }
    const source = attachment;
    const button = document.getElementById('eventDetailsCopy');
    const summary = eventSummary(source.event);
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(summary);
      if (attachment === source && currentAttachment()) status(tx('copied'));
    } catch {
      if (attachment !== source || !currentAttachment()) return;
      const fallback = document.getElementById('eventSummaryFallback');
      if (fallback) { fallback.hidden = false; fallback.value = summary; fallback.focus(); fallback.select(); status(tx('manualCopy')); }
    } finally { button.disabled = false; }
  }
  function status(message) {
    const node = document.getElementById('eventToolsStatus');
    if (node) node.textContent = message;
  }
  function updatePacking() {
    if (!currentAttachment()) return;
    const packed = new Set(readHelpers().packed[attachment.packingKey] || []);
    const count = attachment.items.filter(item => packed.has(item)).length;
    document.getElementById('eventPackingProgress').textContent = tx('progress', { done: count, total: attachment.items.length });
    document.querySelectorAll('[data-packing-index]').forEach(input => { input.checked = packed.has(attachment.items[Number(input.dataset.packingIndex)]); });
    document.getElementById('resetEventPacking').disabled = count === 0;
  }
  function attach(event) {
    document.getElementById('eventUtilityPanel')?.remove();
    const items = packingItems(event.items);
    attachment = { event, items, scope: scheduleStorageKey('planner-helpers'), packingKey: packingKey(event, dateKey(selectedDate)) };
    const favorite = readHelpers().favorites.includes(event.id);
    const nextDate = dateString(plusDays(localDate(event.occurrenceDate || event.startDate) || new Date(), 1));
    document.getElementById('eventDetailsBody').insertAdjacentHTML('beforeend', `<section class="event-utility-panel" id="eventUtilityPanel" aria-label="${esc(tx('tools'))}">
      <div class="event-utility-actions"><button type="button" class="ghost-btn" id="favoriteEvent" aria-pressed="${favorite}">${esc(tx(favorite ? 'favorited' : 'favorite'))}</button></div>
      <p class="tools-status" id="eventToolsStatus" role="status" aria-live="polite"></p>
      <textarea id="eventSummaryFallback" aria-label="${esc(tx('summaryLabel'))}" readonly hidden></textarea>
      ${items.length ? `<section class="event-packing" aria-labelledby="eventPackingTitle"><h3 id="eventPackingTitle">${esc(tx('packing'))}</h3><p id="eventPackingProgress" class="tools-packing-progress" aria-live="polite"></p><div class="event-packing-items">${items.map((item, index) => `<label><input type="checkbox" data-packing-index="${index}"><span>${esc(item)}</span></label>`).join('')}</div><button type="button" class="ghost-btn" id="resetEventPacking">${esc(tx('reset'))}</button><p class="tools-note">${esc(tx(event.eventType === 'trip' ? 'tripPacking' : 'packingScope'))}</p></section>` : ''}
      <details class="event-copy-disclosure"><summary>${esc(tx('copyToDate'))}</summary><p class="tools-note">${esc(tx('copyNote'))}</p><label for="eventCopyDate">${esc(tx('targetDate'))}</label><div class="event-copy-row"><input id="eventCopyDate" type="date" value="${esc(nextDate)}" min="1900-01-01" max="9999-12-31"><button class="primary-btn" id="createDatedEventCopy" type="button">${esc(tx('createCopy'))}</button></div></details>
      <p class="tools-note tools-private">${esc(tx('device'))}</p></section>`);
    if (items.length) updatePacking();
  }

  document.getElementById('openPlannerTools').addEventListener('click', openHub);
  document.getElementById('closePlannerTools').addEventListener('click', () => hub.close());
  startInput.addEventListener('change', renderHub);
  hub.querySelectorAll('[data-tools-mode]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.toolsMode; renderHub(); }));
  hub.querySelector('[role="tablist"]').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...hub.querySelectorAll('[data-tools-mode]')];
    const next = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons[1] : buttons.find(button => button !== document.activeElement);
    next.click(); next.focus();
  });
  results.addEventListener('click', event => {
    const button = event.target.closest('[data-tools-event]');
    const item = matches[Number(button?.dataset.toolsEvent)];
    if (!button || !item) return;
    backToHub = true;
    hub.close();
    showEventDetails(item);
  });
  hub.addEventListener('close', () => {
    if (backToHub) return;
    if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
    else document.getElementById('moreActions').querySelector('summary').focus({ preventScroll: true });
  });
  eventDetailsDialog.addEventListener('close', () => {
    attachment = null;
    if (!backToHub) return;
    backToHub = false;
    if (document.querySelector('dialog[open]')) return;
    renderHub(); hub.showModal();
  });
  document.getElementById('eventDetailsLocate').addEventListener('click', () => { backToHub = false; }, true);
  document.getElementById('eventDetailsBody').addEventListener('change', event => {
    if (!event.target.matches('[data-packing-index]')) return;
    if (!currentAttachment()) { status(tx('stale')); return; }
    const helpers = readHelpers();
    const item = attachment.items[Number(event.target.dataset.packingIndex)];
    const packed = new Set(helpers.packed[attachment.packingKey] || []);
    if (event.target.checked) packed.add(item); else packed.delete(item);
    delete helpers.packed[attachment.packingKey]; // Keep recently used occurrences within the storage limit.
    helpers.packed[attachment.packingKey] = [...packed];
    if (!writeHelpers(helpers)) status(tx('saveFailed'));
    updatePacking();
  });
  document.getElementById('eventDetailsBody').addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || !button.closest('#eventUtilityPanel')) return;
    if (!currentAttachment()) { status(tx('stale')); return; }
    const helpers = readHelpers();
    if (button.id === 'favoriteEvent') {
      const favorite = !helpers.favorites.includes(attachment.event.id);
      helpers.favorites = helpers.favorites.filter(id => id !== attachment.event.id);
      if (favorite) helpers.favorites.unshift(attachment.event.id);
      if (!writeHelpers(helpers)) { status(tx('saveFailed')); return; }
      button.textContent = tx(favorite ? 'favorited' : 'favorite');
      button.setAttribute('aria-pressed', String(favorite));
    } else if (button.id === 'resetEventPacking') {
      delete helpers.packed[attachment.packingKey];
      if (!writeHelpers(helpers)) status(tx('saveFailed'));
      updatePacking();
    } else if (button.id === 'createDatedEventCopy') {
      const input = document.getElementById('eventCopyDate');
      if (!localDate(input.value)) { status(tx('invalidDate')); input.focus(); return; }
      const source = attachment.event.isBuiltInHoliday ? attachment.event : state.activities.find(item => item.id === attachment.event.id);
      if (!source) { status(tx('stale')); return; }
      let copy;
      try { copy = copyForDate(source, input.value, makeId('activity')); }
      catch { status(tx('invalidDate')); return; }
      rememberCurrentSchedule(t('versions.beforeCreate', { title: activityTitle(copy) }));
      state.activities.push(copy);
      if (saveActivities() === false) { state.activities = state.activities.filter(item => item !== copy); status(tx('saveFailed')); return; }
      auditActivity('created', null, copy);
      const target = localDate(input.value);
      const allOnDate = state.activities.filter(item => activityOccursOn(item, target)).map(item => ({ ...item, occurrenceDate: input.value }));
      const conflict = findConflictPairs(allOnDate).some(pair => pair.some(item => item.id === copy.id));
      renderAll();
      status(`${tx('copyDone', { date: formatShortDate(localDate(input.value)) })}${conflict ? ` ${tx('conflict')}` : ''}`);
    }
  });
  window.KidsSyncTools = { attach, copySummary, refresh() { localize(); if (hub.open) renderHub(); } };
  localize();
})();
