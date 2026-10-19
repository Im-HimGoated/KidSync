/* Family handoffs and device-local saved views, independent of display filters. */
(() => {
  function parseDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return y >= 1900 && y <= 9998 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }
  function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function clock(value) {
    if (!/^\d{2}:\d{2}$/.test(String(value))) return null;
    const [h, m] = value.split(':').map(Number);
    return h < 24 && m < 60 ? h * 60 + m : null;
  }
  function dayBrief(events) {
    return events.filter(event => event.status !== 'cancelled' && !event.isBuiltInHoliday)
      .map(event => {
        const start = clock(event.start);
        const travel = Math.min(240, Math.max(0, Number(event.travelMinutes) || 0));
        const needsAdult = ['activity', 'trip'].includes(event.eventType || 'activity') && !String(event.responsible || '').trim();
        return { event, needsAdult, tentative: event.status === 'tentative',
          departure: !event.allDay && start !== null && travel > 0 ? start - travel : null };
      }).sort((a, b) => Number(Boolean(b.event.allDay)) - Number(Boolean(a.event.allDay))
        || (clock(a.event.start) ?? 0) - (clock(b.event.start) ?? 0));
  }
  function normalizeViews(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.filter(item => item && typeof item.id === 'string' && !seen.has(item.id) && seen.add(item.id)
      && typeof item.name === 'string' && item.name.trim()).slice(0, 8).map(item => ({
      id: item.id.slice(0, 100), name: item.name.trim().slice(0, 40),
      view: ['today', 'week', 'four', 'month'].includes(item.view) ? item.view : 'week',
      filter: ['all', 'activity', 'important', 'holidays', 'trip'].includes(item.filter) ? item.filter : 'all',
      query: typeof item.query === 'string' ? item.query.slice(0, 200) : '',
      children: Array.isArray(item.children) ? [...new Set(item.children.filter(v => typeof v === 'string'))].slice(0, 100) : [],
      weekends: item.weekends !== false
    }));
  }
  function plannedLoad(events, people, family = '__family__') {
    return people.map(person => {
      const relevant = events.filter(event => {
        if (event.status === 'cancelled' || event.isBuiltInHoliday) return false;
        const named = (Array.isArray(event.attendees) ? event.attendees : []).filter(name => name !== 'all');
        return person === family || event.child === person || named.includes(person) || (event.child === family && !named.length);
      });
      let minutes = 0, untimed = 0;
      for (const event of relevant) {
        const start = clock(event.start), end = clock(event.end);
        if (event.allDay || event.eventType === 'trip' || start === null || end === null || end <= start) untimed++;
        else minutes += end - start;
      }
      return { person, minutes, untimed, count: relevant.length };
    });
  }
  const workloadTarget = value => [0, 60, 120, 180, 240, 360, 480, 600, 720].includes(Number(value)) ? Number(value) : 0;
  const pure = { parseDay, dayKey, clock, dayBrief, normalizeViews, plannedLoad, workloadTarget };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  const words = {
    en: {
      title: 'Family brief & views', brief: 'Day brief', views: 'Saved views', close: 'Close',
      briefDate: 'Date', scope: 'Current calendar · All children · All categories',
      invalid: 'Choose a valid date.', noEvents: 'No events on this day.',
      events: '{n} events', eventOne: '1 event', attention: '{n} need attention', adultMissing: 'Adult not assigned', tentative: 'Awaiting confirmation',
      adult: 'Adult', bring: 'Bring', leave: 'Leave by {time}', previous: 'Previous day', next: 'Next day',
      name: 'View name', save: 'Save current view', local: 'Saved on this device · Current calendar only',
      emptyViews: 'No saved views yet.', apply: 'Open {name}', remove: 'Delete {name}',
      deleted: 'Saved view deleted.', saved: 'View saved.', max: 'You can save up to 8 views. Delete one to make room.',
      failed: 'Could not save. Please try again.', nameRequired: 'Enter a name for this view.',
      view_today: 'Day', view_week: 'Week', view_four: '4 days', view_month: 'Month',
      filter_all: 'All events', filter_activity: 'Activities', filter_important: 'Important', filter_holidays: 'Holidays & trips', filter_trip: 'Trips',
      children: '{n} children', allChildren: 'All children', weekendsHidden: 'Weekends hidden', applied: 'View opened.',
      stale: 'Calendar changed. Please reopen this panel.',
      balance: 'Day balance', family: 'Family', target: 'Daily time budget per person', noTarget: 'No budget set', minuteTotal: '{n} min planned', minuteOption: '{n} min', allDayCount: '{n} untimed / all-day',
      overBudget: '{n} min over budget', nearBudget: 'Close to budget', withinBudget: 'Within budget',
      balanceHint: 'All saved events in this calendar, even when filtered out. Adds event durations, including overlapping plans; excludes travel and buffers. Untimed plans are listed separately. Your optional budget stays on this device.'
    },
    zh: {
      title: '家庭简报与视图', brief: '当日简报', views: '已存视图', close: '关闭',
      briefDate: '日期', scope: '当前日历 · 所有孩子 · 所有类别',
      invalid: '请选择有效日期。', noEvents: '当天没有日程。',
      events: '{n} 个日程', eventOne: '1 个日程', attention: '{n} 项需要关注', adultMissing: '尚未安排负责成人', tentative: '等待确认',
      adult: '负责成人', bring: '携带物品', leave: '{time} 前出发', previous: '前一天', next: '后一天',
      name: '视图名称', save: '保存当前视图', local: '保存在此设备 · 仅限当前日历',
      emptyViews: '暂无已保存视图。', apply: '打开 {name}', remove: '删除 {name}',
      deleted: '已删除视图。', saved: '已保存视图。', max: '最多保存 8 个视图，请先删除一个。',
      failed: '无法保存，请重试。', nameRequired: '请输入视图名称。',
      view_today: '日', view_week: '周', view_four: '4 天', view_month: '月',
      filter_all: '所有日程', filter_activity: '活动', filter_important: '重要', filter_holidays: '节假日与旅行', filter_trip: '旅行',
      children: '{n} 个孩子', allChildren: '所有孩子', weekendsHidden: '隐藏周末', applied: '已打开视图。',
      stale: '日历已更改，请重新打开此面板。',
      balance: '当日时间分配', family: '全家', target: '每人每日时间预算', noTarget: '未设预算', minuteTotal: '计划 {n} 分钟', minuteOption: '{n} 分钟', allDayCount: '{n} 项无时间 / 全天日程',
      overBudget: '超出预算 {n} 分钟', nearBudget: '接近预算', withinBudget: '预算范围内',
      balanceHint: '计入当前日历所有已存日程，包括被隐藏的日程。相加日程时长（包括重叠安排），不含交通和缓冲。无时间日程单独列出，可选预算仅保存在此设备。'
    }
  };
  const tx = (key, args = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const dialog = document.createElement('dialog');
  dialog.id = 'smartPlannerDialog'; dialog.setAttribute('aria-labelledby', 'smartPlannerTitle');
  document.body.append(dialog);
  let mode = 'brief', origin = '', briefs = [], returnToBrief = false;
  let from = dayKey(new Date());
  const getEvents = date => state.activities.filter(event => activityOccursOn(event, date));
  const scope = () => scheduleStorageKey('smart-views-v1');
  function readViews() { try { return normalizeViews(JSON.parse(localStorage.getItem(scope()))); } catch { return []; } }
  function writeViews(views) { try { localStorage.setItem(scope(), JSON.stringify(normalizeViews(views))); return true; } catch { return false; } }
  const budgetKey = () => scheduleStorageKey('daily-time-budget-v1');
  function readBudget() { try { return workloadTarget(localStorage.getItem(budgetKey())); } catch { return 0; } }
  function status(message) { dialog.querySelector('#smartStatus').textContent = message; }
  function summary(view) {
    return [tx(`view_${view.view}`), tx(`filter_${view.filter}`),
      view.children.length === kidProfiles.length ? tx('allChildren') : tx('children', { n: view.children.length }),
      view.query ? `“${view.query}”` : '', !view.weekends ? tx('weekendsHidden') : ''].filter(Boolean).join(' · ');
  }
  function render() {
    const button = document.getElementById('openSmartPlanner');
    button.querySelector('span').textContent = tx('title');
    dialog.innerHTML = `<div class="modal-header"><h2 id="smartPlannerTitle">${esc(tx('title'))}</h2><button class="close-btn" type="button" data-smart-close aria-label="${esc(tx('close'))}" title="${esc(tx('close'))}">${icon('x')}</button></div>
      <div class="family-body"><div class="family-tabs" role="tablist" aria-labelledby="smartPlannerTitle">${['brief', 'views'].map(key => `<button type="button" role="tab" id="smartTab-${key}" data-brief-mode="${key}" aria-selected="${key === mode}" tabindex="${key === mode ? '0' : '-1'}" aria-controls="smartPanel">${icon({ brief: 'list-checks', views: 'bookmark' }[key])}<span>${esc(tx(key))}</span></button>`).join('')}</div>
      <section id="smartPanel" role="tabpanel" aria-labelledby="smartTab-${mode}" tabindex="0"></section><p id="smartStatus" role="status" aria-live="polite"></p></div>`;
    const panel = dialog.querySelector('#smartPanel');
    if (mode === 'brief') {
      panel.innerHTML = `<div class="family-day-nav"><button class="ghost-btn" data-smart-day="-1" aria-label="${esc(tx('previous'))}" title="${esc(tx('previous'))}">${icon('chevron-left')}</button><label>${esc(tx('briefDate'))}<input id="smartBriefDate" type="date" value="${esc(from)}" min="1900-01-01" max="9998-12-31" required></label><button class="ghost-btn" data-smart-day="1" aria-label="${esc(tx('next'))}" title="${esc(tx('next'))}">${icon('chevron-right')}</button></div><p class="family-scope">${esc(tx('scope'))}</p>
        <section class="family-balance" aria-labelledby="familyBalanceTitle"><h3 id="familyBalanceTitle">${esc(tx('balance'))}</h3><label for="familyTimeBudget">${esc(tx('target'))}<select id="familyTimeBudget">${[0, 60, 120, 180, 240, 360, 480, 600, 720].map(n => `<option value="${n}"${n === readBudget() ? ' selected' : ''}>${esc(n ? tx('minuteOption', { n }) : tx('noTarget'))}</option>`).join('')}</select></label><div id="familyBalanceRows" class="family-balance-rows"></div><p class="family-scope">${esc(tx('balanceHint'))}</p></section><div id="smartBrief"></div>`;
      renderBrief();
    } else {
      const views = readViews();
      const current = { view: currentView, filter: state.eventFilter, query: state.searchQuery, children: [...state.visibleKids], weekends: state.showWeekends };
      panel.innerHTML = `<p class="family-scope">${esc(tx('local'))}</p><p class="family-current">${esc(summary(current))}</p>
        <form id="smartViewForm"><label>${esc(tx('name'))}<input name="name" type="text" maxlength="40" required autocomplete="off"></label><button class="primary-btn" type="submit">${icon('bookmark-plus')} ${esc(tx('save'))}</button></form>
        <div class="family-view-list">${views.length ? views.map(view => `<div class="family-saved-row"><button class="family-view-open" type="button" data-smart-view="${esc(view.id)}" aria-label="${esc(tx('apply', { name: view.name }))}"><strong>${esc(view.name)}</strong><small>${esc(summary(view))}</small></button><button class="ghost-btn" type="button" data-smart-delete="${esc(view.id)}" aria-label="${esc(tx('remove', { name: view.name }))}" title="${esc(tx('remove', { name: view.name }))}">${icon('trash-2')}</button></div>`).join('') : `<p class="family-empty">${esc(tx('emptyViews'))}</p>`}</div>`;
    }
    window.lucide?.createIcons();
  }
  function renderBrief() {
    briefs = parseDay(from) ? dayBrief(getEvents(parseDay(from))) : [];
    renderBalance();
    dialog.querySelector('#smartBrief').innerHTML = !parseDay(from) ? `<p class="family-empty">${esc(tx('invalid'))}</p>` : `<div class="family-brief-count"><strong>${esc(tx(briefs.length === 1 ? 'eventOne' : 'events', { n: briefs.length }))}</strong><span>${esc(tx('attention', { n: briefs.filter(item => item.needsAdult || item.tentative).length }))}</span></div>${briefs.length ? briefs.map((item, i) => {
      const { event } = item;
      let departure = '';
      if (item.departure !== null) {
        const at = new Date(parseDay(from)); at.setMinutes(item.departure);
        departure = tx('leave', { time: `${dayKey(at) !== from ? `${formatShortDate(at)} · ` : ''}${formatTimeLabel((item.departure + 1440) % 1440)}` });
      }
      return `<button type="button" class="family-brief-event" data-smart-event="${i}"><span class="family-brief-time">${esc(eventTimeText(event))}</span><span><strong>${esc(activityTitle(event))}</strong><small>${esc([displayChild(event), event.location].filter(Boolean).join(' · '))}</small>${event.responsible ? `<small>${esc(tx('adult'))}: ${esc(event.responsible)}</small>` : ''}${event.items ? `<small>${esc(tx('bring'))}: ${esc(event.items)}</small>` : ''}${departure ? `<small class="family-departure">${esc(departure)}</small>` : ''}${item.needsAdult || item.tentative ? `<span class="family-attention">${esc([item.needsAdult ? tx('adultMissing') : '', item.tentative ? tx('tentative') : ''].filter(Boolean).join(' · '))}</span>` : ''}</span></button>`;
    }).join('') : `<p class="family-empty">${esc(tx('noEvents'))}</p>`}`;
  }
  function renderBalance() {
    const target = readBudget(), people = kidProfiles.length ? kidProfiles.map(profile => profile.name) : [FAMILY_CHILD];
    const rows = plannedLoad(briefs.map(item => item.event), people);
    dialog.querySelector('#familyBalanceRows').innerHTML = rows.map(row => {
      const over = target && row.minutes > target, near = target && row.minutes >= target * .8;
      const note = target ? tx(over ? 'overBudget' : near ? 'nearBudget' : 'withinBudget', { n: row.minutes - target }) : '';
      return `<div class="family-balance-card${over ? ' is-over' : near ? ' is-near' : ''}"><strong>${esc(row.person === FAMILY_CHILD ? tx('family') : row.person)}</strong><span>${esc(tx('minuteTotal', { n: row.minutes }))}${target ? ` / ${target}` : ''}</span>${target ? `<meter min="0" max="${target}" value="${Math.min(target, row.minutes)}" aria-label="${esc(`${row.person === FAMILY_CHILD ? tx('family') : row.person} · ${tx('minuteTotal', { n: row.minutes })} · ${note}`)}"></meter><small>${esc(note)}</small>` : ''}${row.untimed ? `<small>${esc(tx('allDayCount', { n: row.untimed }))}</small>` : ''}</div>`;
    }).join('');
  }
  function open() {
    origin = scope(); from = dayKey(selectedDate); mode = 'brief';
    document.getElementById('moreActions').open = false;
    render(); dialog.showModal();
  }
  document.getElementById('openSmartPlanner').addEventListener('click', open);
  dialog.addEventListener('submit', event => {
    event.preventDefault();
    if (scope() !== origin) { dialog.close(); return; }
    const data = new FormData(event.target);
    if (event.target.id === 'smartViewForm') {
      const name = String(data.get('name') || '').trim(), views = readViews();
      if (!name) { status(tx('nameRequired')); return; }
      if (views.length >= 8) { status(tx('max')); return; }
      views.push({ id: makeId('view'), name, view: currentView, filter: state.eventFilter, query: state.searchQuery, children: [...state.visibleKids], weekends: state.showWeekends });
      if (!writeViews(views)) { status(tx('failed')); return; }
      render(); status(tx('saved')); dialog.querySelector('[name="name"]').focus();
    }
  });
  dialog.addEventListener('change', event => {
    if (scope() !== origin) { dialog.close(); return; }
    if (event.target.id === 'smartBriefDate') { from = event.target.value; renderBrief(); }
    if (event.target.id === 'familyTimeBudget') {
      try { localStorage.setItem(budgetKey(), String(workloadTarget(event.target.value))); renderBalance(); }
      catch { event.target.value = String(readBudget()); status(tx('failed')); }
    }
  });
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-smart-close')) { dialog.close(); return; }
    if (scope() !== origin) { dialog.close(); return; }
    if (button.dataset.briefMode) { mode = button.dataset.briefMode; render(); dialog.querySelector(`#smartTab-${mode}`).focus(); }
    if (button.dataset.smartDay) {
      const date = parseDay(from); if (!date) { status(tx('invalid')); return; }
      date.setDate(date.getDate() + Number(button.dataset.smartDay));
      if (!parseDay(dayKey(date))) return;
      from = dayKey(date); dialog.querySelector('#smartBriefDate').value = from; renderBrief();
    }
    if (button.hasAttribute('data-smart-event')) {
      const item = briefs[Number(button.dataset.smartEvent)]; if (!item) return;
      returnToBrief = true; dialog.close(); showEventDetails({ ...item.event, occurrenceDate: from });
    }
    if (button.dataset.smartDelete) {
      if (!writeViews(readViews().filter(view => view.id !== button.dataset.smartDelete))) { status(tx('failed')); return; }
      render(); status(tx('deleted')); dialog.querySelector('[name="name"]').focus();
    }
    if (button.dataset.smartView) {
      const view = readViews().find(item => item.id === button.dataset.smartView); if (!view) return;
      state.visibleKids = new Set(view.children.filter(name => kidProfiles.some(kid => kid.name === name)));
      state.eventFilter = view.filter; state.searchQuery = view.query; scheduleSearch.value = view.query;
      state.showWeekends = view.weekends; userSettings.showWeekends = view.weekends; saveSettings();
      dialog.close(); showCalendarPage();
      setSidebarActive(view.filter === 'holidays' ? 'holidays' : view.filter === 'important' ? 'special-days' : 'calendar');
      activateCalendarView(view.view, true); showFeedbackToast(tx('applied'));
    }
  });
  dialog.addEventListener('keydown', event => {
    if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const keys = ['brief', 'views'];
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - keys.indexOf(mode);
    dialog.querySelector(`[data-brief-mode="${keys[index]}"]`).click();
  });
  dialog.addEventListener('close', () => {
    if (!returnToBrief && !document.querySelector('dialog[open]')) document.getElementById('moreActions').querySelector('summary').focus({ preventScroll: true });
  });
  eventDetailsDialog.addEventListener('close', () => {
    if (!returnToBrief) return; returnToBrief = false;
    if (document.querySelector('dialog[open]') || scope() !== origin) return;
    render(); dialog.showModal();
  });
  document.getElementById('eventDetailsLocate').addEventListener('click', () => { returnToBrief = false; }, true);
  window.KidsSyncSmart = { refresh() {
    document.getElementById('openSmartPlanner').querySelector('span').textContent = tx('title');
    if (!dialog.open) return;
    if (scope() !== origin) { dialog.close(); return; }
    if (mode === 'brief') renderBrief();
  } };
  render();
})();
