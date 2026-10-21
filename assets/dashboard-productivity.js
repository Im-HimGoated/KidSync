/* Fast dashboard tasks share favorites and packing state with the event sheet. */
(() => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  function searchPlans(events, query) {
    const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    return events.filter(event => {
      if (event.status === 'cancelled') return false;
      const haystack = normalize([event.title, event.child, event.location, event.responsible, event.items, event.notes, event.eventType].filter(Boolean).join(' '));
      return tokens.every(token => haystack.includes(token));
    });
  }
  function pinnedPlans(events, favorites) {
    const first = new Map();
    for (const event of events) if (event.status !== 'cancelled' && !first.has(event.id)) first.set(event.id, event);
    return [...new Set(favorites)].map(id => first.get(id)).filter(Boolean);
  }
  function dayBrief(events, options) {
    const rows = events.filter(event => event.status !== 'cancelled').map(event => {
      const details = [options.childFor(event), event.location, event.responsible].filter(Boolean).join(' · ');
      return [`${options.timeFor(event)} — ${event.title || ''}`, details,
        options.includeNotes && event.items ? `${options.bring}: ${event.items}` : '',
        options.includeNotes && event.notes ? `${options.notes}: ${event.notes}` : ''].filter(Boolean).join('\n');
    });
    return [options.dateLabel, options.calendarLabel, rows.join('\n\n') || options.empty].filter(Boolean).join('\n\n');
  }
  const pure = { normalize, searchPlans, pinnedPlans, dayBrief };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }
  const words = {
    en: {
      search: 'Find a plan', placeholder: 'Search plans, people, places…', range: 'Upcoming 90 days · this calendar', clear: 'Clear search',
      pins: 'Pinned plans', tomorrow: 'Tomorrow', brief: 'Copy today’s plan', personal: 'Pins use your favorites and stay on this device.',
      noPins: 'No upcoming pinned plans.', pinHint: 'Use the star beside a search result to pin a plan. Each pinned event shows its next occurrence.',
      pin: 'Pin {title}', unpin: 'Unpin {title}', find: 'Find a plan to pin', saved: 'Saved on this device.', failed: 'Could not save. Your previous choice is unchanged.',
      stale: 'The calendar changed. Choose a plan from the refreshed dashboard.', results: '{count} matching plans', resultOne: '1 matching plan',
      noResults: 'No plans match. Try a name, a place, or a shorter search.', more: 'Show more', emptyTomorrow: 'Nothing is scheduled for tomorrow.',
      addTomorrow: 'Add a plan for tomorrow', close: 'Close', copy: 'Copy plan', copied: 'Daily plan copied.', manual: 'Select the text and copy it manually.',
      notesToggle: 'Include notes and packing items', preview: 'Review the plan before copying.', bring: 'Bring', notes: 'Notes',
      packed: '{done} of {total} packed', checklist: 'Bring & prepare', emptyDay: 'Nothing scheduled.', plans: '{count} plans', planOne: '1 plan',
      open: 'View {title}', searchResults: 'Search results', briefField: 'Daily plan to copy', tools: 'Dashboard planning tools'
    },
    zh: {
      search: '查找安排', placeholder: '搜索日程、姓名、地点…', range: '未来 90 天 · 当前日历', clear: '清除搜索',
      pins: '置顶安排', tomorrow: '明天', brief: '复制今日安排', personal: '置顶与收藏同步，仅保存在此设备上。',
      noPins: '暂无即将发生的置顶安排。', pinHint: '点击搜索结果旁的星标即可置顶。每个日程显示下一次安排。',
      pin: '置顶{title}', unpin: '取消置顶{title}', find: '查找要置顶的安排', saved: '已保存在此设备上。', failed: '无法保存，已保留原来的选择。',
      stale: '日历已切换，请从更新后的概览中选择日程。', results: '找到 {count} 项安排', resultOne: '找到 1 项安排',
      noResults: '没有匹配的安排，请尝试姓名、地点或更短的搜索词。', more: '显示更多', emptyTomorrow: '明天暂无安排。',
      addTomorrow: '添加明天的安排', close: '关闭', copy: '复制安排', copied: '已复制每日安排。', manual: '请选择文本并手动复制。',
      notesToggle: '包括备注和携带物品', preview: '复制前请先核对安排。', bring: '携带', notes: '备注',
      packed: '已准备 {done} / {total} 项', checklist: '携带与准备', emptyDay: '暂无安排。', plans: '{count} 项安排', planOne: '1 项安排',
      open: '查看{title}', searchResults: '搜索结果', briefField: '要复制的每日安排', tools: '概览规划工具'
    }
  };
  const text = (key, values = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const engine = window.KidsSyncDashboard.engine, tools = window.KidsSyncTools;
  const page = document.getElementById('dashboardPage');
  const root = document.createElement('section'); root.id = 'dashboardProductivity'; root.className = 'dashboard-productivity';
  root.innerHTML = `<form role="search" class="dashboard-plan-search"><label class="sr-only" for="dashboardPlanSearch"></label><input id="dashboardPlanSearch" type="search" maxlength="120" autocomplete="off" aria-controls="dashboardSearchResults" aria-describedby="dashboardSearchRange"><button type="button" data-product-action="clear" hidden></button><small id="dashboardSearchRange"></small></form><div class="dashboard-product-actions"><button type="button" data-product-action="pins" aria-controls="dashboardProductDrawer" aria-expanded="false"></button><button type="button" data-product-action="tomorrow" aria-controls="dashboardProductDrawer" aria-expanded="false"></button><button type="button" data-product-action="brief" aria-haspopup="dialog" aria-controls="dashboardDailyBrief"></button></div><p class="dashboard-product-status" role="status" aria-live="polite"></p><section id="dashboardSearchResults" hidden><h2 data-product-result-count aria-live="polite"></h2><div data-product-result-list></div><button type="button" data-product-action="more" hidden></button></section><section id="dashboardProductDrawer" hidden></section>`;
  document.getElementById('dashboardWayfinding').before(root);
  const input = root.querySelector('input'), results = root.querySelector('#dashboardSearchResults'), drawer = root.querySelector('#dashboardProductDrawer');
  const status = root.querySelector('[role="status"]');
  const dialog = document.createElement('dialog'); dialog.id = 'dashboardDailyBrief'; dialog.className = 'dashboard-daily-brief'; dialog.setAttribute('aria-labelledby', 'dashboardBriefTitle');
  dialog.innerHTML = `<div class="modal-header"><h2 id="dashboardBriefTitle"></h2><button type="button" class="close-btn" data-product-brief-close></button></div><div class="dashboard-brief-body"><p data-product-brief-intro></p><label class="dashboard-brief-options"><input type="checkbox" data-product-brief-notes><span></span></label><label class="sr-only" for="dashboardBriefText"></label><textarea id="dashboardBriefText" readonly rows="12"></textarea><p role="status" aria-live="polite" data-product-brief-status></p><button type="button" class="primary-btn" data-product-copy></button></div>`;
  document.body.append(dialog);
  let model = null, modelScope = '', events = new Map(), mode = '', limit = 8, opener = null, briefScope = '';
  const scope = () => scheduleStorageKey('activities'), helperScope = () => scheduleStorageKey('planner-helpers');
  const keyFor = event => engine.occurrenceId(event);
  const find = key => events.get(key);
  function rows(entries, container) {
    const active = container.contains(document.activeElement) ? document.activeElement?.dataset.productActionKey : '';
    const favorites = new Set(tools.getPersonalState().favorites);
    container.innerHTML = entries.map(event => {
      const key = keyFor(event), pinned = favorites.has(event.id);
      return `<article class="dashboard-product-event"><button type="button" data-product-event="${esc(key)}" data-product-action-key="${esc(key + ':open')}" aria-label="${esc([text('open', { title: activityTitle(event) }), formatFullDate(engine.localDay(event.occurrenceDate || event.startDate)), eventTimeText(event), displayChild(event)].join(' · '))}"><strong>${esc(activityCompactTitle(event))}</strong><span>${esc(formatShortDate(engine.localDay(event.occurrenceDate || event.startDate)))} · ${esc(eventTimeText(event))}</span><span>${esc([displayChild(event), event.location, event.responsible].filter(Boolean).join(' · '))}</span></button><button class="dashboard-pin-plan" type="button" data-product-pin="${esc(key)}" data-product-action-key="${esc(key + ':pin')}" aria-pressed="${pinned}" aria-label="${esc(text(pinned ? 'unpin' : 'pin', { title: activityTitle(event) }))}">${pinned ? '★' : '☆'}</button></article>`;
    }).join('');
    if (active) [...container.querySelectorAll('[data-product-action-key]')].find(node => node.dataset.productActionKey === active)?.focus({ preventScroll: true });
  }
  function renderSearch() {
    const query = input.value.trim(), matches = query ? searchPlans(model.upcoming, query) : [];
    results.hidden = !query; drawer.hidden = Boolean(query) || !mode;
    root.querySelector('[data-product-action="clear"]').hidden = !input.value;
    input.setAttribute('aria-expanded', String(Boolean(query)));
    root.querySelector('[data-product-result-count]').textContent = query ? text(matches.length === 1 ? 'resultOne' : 'results', { count: matches.length }) : '';
    const list = root.querySelector('[data-product-result-list]');
    rows(matches.slice(0, limit), list);
    if (query && !matches.length) list.innerHTML = `<p class="dashboard-product-empty">${esc(text('noResults'))}</p>`;
    root.querySelector('[data-product-action="more"]').hidden = matches.length <= limit;
    root.querySelector('[data-product-action="pins"]').setAttribute('aria-expanded', String(mode === 'pins' && !query));
    root.querySelector('[data-product-action="tomorrow"]').setAttribute('aria-expanded', String(mode === 'tomorrow' && !query));
  }
  function renderDrawer() {
    const pinned = pinnedPlans(model.upcoming, tools.getPersonalState().favorites), entries = mode === 'pins' ? pinned : model.tomorrowEvents;
    root.querySelector('[data-product-action="pins"]').textContent = `${text('pins')}${pinned.length ? ` · ${pinned.length}` : ''}`;
    if (!mode) { drawer.hidden = true; return; }
    const focusKey = drawer.contains(document.activeElement) ? document.activeElement?.dataset.productActionKey : '';
    drawer.innerHTML = `<div class="dashboard-product-drawer-heading"><h2>${esc(text(mode))}</h2><button type="button" data-product-action="close" aria-label="${esc(text('close'))}">×</button></div><p class="dashboard-product-note">${esc(mode === 'pins' ? text('personal') : formatFullDate(engine.plusDays(new Date(), 1)))}</p><div data-product-drawer-rows></div>${mode === 'tomorrow' ? `<button class="small-btn" type="button" data-product-action="addTomorrow">${esc(text('addTomorrow'))}</button>` : ''}`;
    const list = drawer.querySelector('[data-product-drawer-rows]'); rows(entries, list);
    if (!entries.length) list.innerHTML = `<p class="dashboard-product-empty">${esc(text(mode === 'pins' ? 'noPins' : 'emptyTomorrow'))}</p>${mode === 'pins' ? `<p class="dashboard-product-note">${esc(text('pinHint'))}</p><button type="button" class="small-btn" data-product-action="find">${esc(text('find'))}</button>` : ''}`;
    if (focusKey) ([...drawer.querySelectorAll('[data-product-action-key]')].find(node => node.dataset.productActionKey === focusKey) || drawer.querySelector('[data-product-action="close"]')).focus({ preventScroll: true });
    drawer.hidden = Boolean(input.value.trim());
  }
  function renderPacking(event) {
    const items = tools.engine.packingItems(event.items), helpers = tools.getPersonalState();
    const packed = new Set(helpers.packed[tools.engine.packingKey(event, '')] || []);
    return `<fieldset class="dashboard-inline-packing" data-dashboard-pack-key="${esc(keyFor(event))}"><legend>${esc(text('checklist'))} · <span data-dashboard-pack-progress aria-live="polite">${esc(text('packed', { done: items.filter(item => packed.has(item)).length, total: items.length }))}</span></legend>${items.map(item => `<label><input type="checkbox" data-dashboard-pack-item="${esc(item)}"${packed.has(item) ? ' checked' : ''}><span>${esc(item)}</span></label>`).join('')}<span class="dashboard-pack-feedback" data-dashboard-pack-feedback role="status"></span></fieldset>`;
  }
  function refreshPersonal() {
    if (!model || modelScope !== scope()) return;
    renderDrawer(); renderSearch();
    const helpers = tools.getPersonalState();
    page.querySelectorAll('[data-dashboard-pack-key]').forEach(fieldset => {
      const event = find(fieldset.dataset.dashboardPackKey); if (!event) return;
      const items = tools.engine.packingItems(event.items), packed = new Set(helpers.packed[tools.engine.packingKey(event, '')] || []);
      fieldset.querySelectorAll('[data-dashboard-pack-item]').forEach(box => { box.checked = packed.has(box.dataset.dashboardPackItem); });
      fieldset.querySelector('[data-dashboard-pack-progress]').textContent = text('packed', { done: items.filter(item => packed.has(item)).length, total: items.length });
    });
  }
  function refresh(snapshot) {
    if (modelScope !== scope()) {
      modelScope = scope(); input.value = ''; mode = ''; status.textContent = ''; opener = null;
      if (dialog.open) { dialog.querySelector('textarea').value = ''; dialog.close(); }
    }
    model = snapshot;
    events = new Map([...model.upcoming, ...model.todayEvents, ...model.tomorrowEvents].map(event => [keyFor(event), event]));
    root.setAttribute('aria-label', text('tools')); root.querySelector('label').textContent = text('search'); input.placeholder = text('placeholder');
    root.querySelector('#dashboardSearchRange').textContent = text('range');
    ['clear', 'tomorrow', 'brief', 'more'].forEach(action => { root.querySelector(`[data-product-action="${action}"]`).textContent = text(action); });
    results.setAttribute('aria-label', text('searchResults')); refreshPersonal();
  }
  function remember(button) { opener = { scope: scope(), key: button.dataset.productActionKey, action: button.dataset.productAction, scroll: { top: window.scrollY, left: window.scrollX } }; }
  function valid() {
    if (modelScope === scope()) return true;
    window.KidsSyncDashboard.refresh(); status.textContent = text('stale'); return false;
  }
  function renderBrief() {
    const calendar = calendars.find(item => item.id === currentCalendarId);
    dialog.querySelector('textarea').value = dayBrief(model.todayEvents, { dateLabel: `${formatFullDate(new Date())} · ${localTimeZoneLabel()}`, calendarLabel: calendar?.name || '',
      timeFor: event => event.allDay || event.eventType === 'holiday' || event.eventType === 'trip' ? eventTimeText(event) : `${formatTimeLabel(minutes(event.start))} – ${formatTimeLabel(minutes(event.end))}`, childFor: displayChild, includeNotes: dialog.querySelector('[data-product-brief-notes]').checked,
      bring: text('bring'), notes: text('notes'), empty: text('emptyDay') });
  }
  root.addEventListener('input', event => { if (event.target === input && valid()) { limit = 8; renderSearch(); } });
  root.querySelector('form').addEventListener('submit', event => event.preventDefault());
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (input.value || mode)) { event.preventDefault(); event.stopPropagation(); input.value = ''; mode = ''; renderSearch(); input.focus(); }
    if (event.key === 'ArrowDown' && event.target === input && !results.hidden) { const first = results.querySelector('[data-product-event]'); if (first) { event.preventDefault(); first.focus(); } }
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || !valid()) return;
    if (button.dataset.productEvent) { const activity = find(button.dataset.productEvent); if (activity) { remember(button); showEventDetails(activity); } return; }
    if (button.dataset.productPin) {
      const activity = find(button.dataset.productPin); if (!activity) return;
      const enable = !tools.getPersonalState().favorites.includes(activity.id);
      const saved = tools.setFavorite(activity, enable, helperScope());
      if (!saved) refreshPersonal(); status.textContent = text(saved ? 'saved' : 'failed'); return;
    }
    const action = button.dataset.productAction;
    if (['pins', 'tomorrow'].includes(action)) { mode = mode === action ? '' : action; input.value = ''; renderDrawer(); renderSearch(); }
    else if (['clear', 'find', 'close'].includes(action)) { input.value = ''; if (action !== 'clear') mode = ''; renderSearch(); input.focus(); }
    else if (action === 'more') { limit += 8; renderSearch(); }
    else if (action === 'addTomorrow') { remember(button); openNewEventForDate(engine.plusDays(new Date(), 1), FAMILY_CHILD); }
    else if (action === 'brief') {
      remember(button); briefScope = scope(); dialog.querySelector('[data-product-brief-notes]').checked = false;
      dialog.querySelector('h2').textContent = `${text('brief')} · ${formatShortDate(new Date())}`;
      dialog.querySelector('[data-product-brief-intro]').textContent = text('preview'); dialog.querySelector('.dashboard-brief-options span').textContent = text('notesToggle');
      dialog.querySelector('[data-product-brief-close]').textContent = '×'; dialog.querySelector('[data-product-brief-close]').setAttribute('aria-label', text('close'));
      dialog.querySelector('label[for="dashboardBriefText"]').textContent = text('briefField'); dialog.querySelector('[data-product-copy]').textContent = text('copy');
      dialog.querySelector('[data-product-brief-status]').textContent = ''; renderBrief(); dialog.showModal();
    }
  });
  page.addEventListener('change', event => {
    const box = event.target; if (!box.matches('[data-dashboard-pack-item]') || !valid()) return;
    const activity = find(box.closest('[data-dashboard-pack-key]').dataset.dashboardPackKey); if (!activity) return;
    const saved = tools.setPacked(activity, box.dataset.dashboardPackItem, box.checked, helperScope());
    if (!saved) refreshPersonal(); status.textContent = text(saved ? 'saved' : 'failed');
    box.closest('[data-dashboard-pack-key]').querySelector('[data-dashboard-pack-feedback]').textContent = saved ? '' : text('failed');
  });
  dialog.querySelector('[data-product-brief-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-product-brief-notes]').addEventListener('change', () => { if (briefScope === scope()) renderBrief(); });
  dialog.querySelector('[data-product-copy]').addEventListener('click', async event => {
    if (briefScope !== scope()) { dialog.close(); return; }
    const button = event.currentTarget, capturedScope = briefScope; button.disabled = true;
    try {
      const copied = await copyTextToClipboard(dialog.querySelector('textarea').value, dialog.querySelector('textarea'));
      if (capturedScope === scope()) dialog.querySelector('[data-product-brief-status]').textContent = text(copied ? 'copied' : 'manual');
    } finally { button.disabled = false; }
  });
  document.addEventListener('close', () => {
    if (!opener) return;
    if (page.hidden || opener.scope !== scope()) { opener = null; return; }
    if (document.querySelector('dialog[open]')) return;
    const source = opener; opener = null;
    requestAnimationFrame(() => {
      if (page.hidden || source.scope !== scope() || document.querySelector('dialog[open]')) return;
      const button = source.key ? [...root.querySelectorAll('[data-product-action-key]')].find(node => node.dataset.productActionKey === source.key)
        : root.querySelector(`[data-product-action="${source.action}"]`);
      (button || input).focus({ preventScroll: true }); window.scrollTo({ ...source.scroll, behavior: 'auto' });
    });
  }, true);
  window.addEventListener('storage', event => { if (event.key === helperScope()) refreshPersonal(); });
  window.KidsSyncDashboardActions = { refresh, refreshPersonal, renderPacking };
  window.KidsSyncDashboard.refresh();
})();
