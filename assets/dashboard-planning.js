/* Family dashboard: current plans, preparation, handoffs, and a longer outlook. */
(() => {
  'use strict';
  function localDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number), date = new Date(year, month - 1, day);
    return year >= 1900 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  const dateKeyFor = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function plusDays(date, count) { const next = new Date(date); next.setDate(next.getDate() + count); return next; }
  function clock(value) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null;
    const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute;
  }
  const isSpan = event => event.startDate && event.endDate && event.endDate > event.startDate;
  function eventBounds(event) {
    const startDay = localDay(isSpan(event) ? event.startDate : event.occurrenceDate || event.startDate);
    const endDay = localDay(isSpan(event) ? event.endDate : event.occurrenceDate || event.startDate);
    if (!startDay || !endDay) return null;
    if (event.allDay || event.eventType === 'holiday') return { start: startDay.getTime(), end: plusDays(endDay, 1).getTime() };
    const start = clock(event.start), end = clock(event.end);
    if (start === null || end === null) return null;
    startDay.setHours(Math.floor(start / 60), start % 60, 0, 0);
    endDay.setHours(Math.floor(end / 60), end % 60, 0, 0);
    return endDay > startDay ? { start: startDay.getTime(), end: endDay.getTime() } : null;
  }
  function occurrenceId(event) {
    return JSON.stringify([event.externalSource || '', event.id || event.title, isSpan(event) ? event.startDate : event.occurrenceDate || event.startDate]);
  }
  function uniqueEvents(events) {
    const seen = new Set();
    return events.filter(event => { const key = occurrenceId(event); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  function occupiedMinutes(events) {
    const intervals = events.filter(event => !event.allDay && !['holiday', 'trip'].includes(event.eventType) && event.status !== 'cancelled')
      .map(event => [clock(event.start), clock(event.end)]).filter(([start, end]) => start !== null && end !== null && end > start).sort((a, b) => a[0] - b[0]);
    let total = 0, last = -1;
    for (const [start, end] of intervals) { total += Math.max(0, end - Math.max(start, last)); last = Math.max(last, end); }
    return total;
  }
  function buildModel(entries, reference = new Date()) {
    const now = reference.getTime(), todayKey = dateKeyFor(reference), today = localDay(todayKey);
    const weekStart = plusDays(today, -((today.getDay() + 6) % 7));
    const weekEnd = dateKeyFor(plusDays(today, 7));
    const valid = entries.filter(event => event.status !== 'cancelled' && localDay(event.occurrenceDate || event.startDate) && eventBounds(event));
    const chronological = events => uniqueEvents(events).slice().sort((a, b) => eventBounds(a).start - eventBounds(b).start || String(a.id || '').localeCompare(String(b.id || '')));
    const todayEvents = chronological(valid.filter(event => (event.occurrenceDate || event.startDate) === todayKey));
    const near = chronological(valid.filter(event => (event.occurrenceDate || event.startDate) >= todayKey && (event.occurrenceDate || event.startDate) < weekEnd && eventBounds(event).end > now));
    const todayRemaining = todayEvents.filter(event => eventBounds(event).end > now);
    const todayFinished = todayEvents.filter(event => eventBounds(event).end <= now);
    const priorities = near.filter(event => event.importance === 'high' || event.eventType === 'deadline')
      .sort((a, b) => Number(b.importance === 'high') - Number(a.importance === 'high') || eventBounds(a).start - eventBounds(b).start);
    const urgent = near.filter(event => {
      const bounds = eventBounds(event), due = event.allDay ? bounds.end : bounds.start;
      return event.eventType === 'deadline' && due >= now && due <= now + 48 * 3600000;
    });
    const prep = near.filter(event => eventBounds(event).start <= now + 48 * 3600000 && (String(event.items || '').trim() || String(event.notes || '').trim()));
    const handoffs = new Map(), unassigned = [];
    for (const event of near.filter(event => !event.isBuiltInHoliday && !event.externalSource)) {
      const person = String(event.responsible || '').trim();
      if (!person) { unassigned.push(event); continue; }
      const key = person.toLocaleLowerCase();
      if (!handoffs.has(key)) handoffs.set(key, { person, events: [] });
      handoffs.get(key).events.push(event);
    }
    const special = chronological(valid.filter(event => ['holiday', 'birthday', 'trip'].includes(event.eventType) && eventBounds(event).end > now && (event.occurrenceDate || event.startDate) >= todayKey));
    const weeks = Array.from({ length: 4 }, (_, index) => {
      const start = plusDays(weekStart, index * 7), end = plusDays(start, 7), startKey = dateKeyFor(start), endKey = dateKeyFor(end);
      const events = valid.filter(event => (event.occurrenceDate || event.startDate) >= startKey && (event.occurrenceDate || event.startDate) < endKey);
      const daily = Array.from({ length: 7 }, (_, offset) => {
        const date = plusDays(start, offset), items = events.filter(event => (event.occurrenceDate || event.startDate) === dateKeyFor(date));
        return { date, minutes: occupiedMinutes(items), count: uniqueEvents(items).length };
      });
      return { start, end: plusDays(end, -1), count: uniqueEvents(events).length, minutes: daily.reduce((total, day) => total + day.minutes, 0), daily };
    });
    return { todayEvents, todayRemaining, todayFinished, near, priorities, urgent, prep, handoffs: [...handoffs.values()], unassigned, special, weeks,
      hasPlans: valid.some(event => !event.isBuiltInHoliday), occupiedToday: occupiedMinutes(todayEvents) };
  }
  const pure = { localDay, dateKeyFor, plusDays, clock, eventBounds, occurrenceId, uniqueEvents, occupiedMinutes, buildModel };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  const words = {
    en: {
      today: 'Today’s plan', todayHint: 'The whole family, in time order.', attention: 'Needs attention', attentionHint: 'Overlaps in the next 7 days and deadlines within 48 hours.',
      priority: 'Important plans', priorityHint: 'High-importance events and deadlines in the next 7 days.', prep: 'Bring & prepare', prepHint: 'Notes and packing lists for the next 48 hours.',
      handoffs: 'Family handoffs', handoffsHint: 'Who is listed as responsible over the next 7 days.', special: 'Dates to look forward to', specialHint: 'Holidays, birthdays, and trips in the next 90 days.',
      outlook: 'Four-week outlook', outlookHint: 'This calendar week and the next three. Overlapping busy time is counted once.',
      scope: 'Current calendar · all family members · calendar filters do not apply', todayEmpty: 'A little room to breathe. Nothing is scheduled for today.',
      todayDone: 'All of today’s timed plans are finished.', progressOne: '{done} of 1 entry finished', progress: '{done} of {total} entries finished', occupied: '{time} occupied',
      add: 'Add a plan', openDay: 'Open today', find: 'Find family time', quick: 'Quick Add', now: 'In progress', later: 'Later today', finished: 'Finished',
      allDay: 'All day', completed: 'Earlier today', more: 'Show {count} more', good: 'No upcoming overlaps or deadlines in the next 48 hours.',
      clearHint: 'This checks saved calendar events, not travel times or availability outside KidsSync.', overlap: 'Overlapping plans', review: 'Review both events',
      deadline: 'Deadline', important: 'High importance', priorityEmpty: 'No priority plans this week.', priorityEmptyHint: 'Set an event’s importance to High to keep it here.',
      prepEmpty: 'No preparation notes for the next 48 hours.', prepEmptyHint: 'Add items or notes to an event to see them here.', bring: 'Bring', notes: 'Notes', checklist: 'Open notes & checklist',
      noPerson: 'No person listed', unassigned: '{count} plans have no responsible person listed. Add one when a handoff is useful.',
      noHandoffs: 'No handoff assignments this week.', assignmentHint: 'Use the Responsible adult field in an event to coordinate pickups and care.',
      planOne: '1 plan', plans: '{count} plans', noSpecial: 'No special dates in the next 90 days.', thisWeek: 'This week', nextWeek: 'Next week', weekNumber: 'In {count} weeks',
      eventDetails: 'View {title}', begins: 'Begins {time}', ends: 'Ends {time}', holiday: 'Holiday', birthday: 'Birthday', trip: 'Trip',
      allFamily: 'Family', noBusy: 'No timed plans', scopeChanged: 'The calendar changed. Choose an event from the refreshed dashboard.',
      allDayNote: 'Includes all-day events. Busy time includes timed plans only.', dateRange: '{start} – {end}', dayPlanOne: '{date} · 1 entry', dayPlan: '{date} · {count} entries',
      prepFooter: 'Packing progress is personal to this calendar and device.', openWeek: 'Open week of {date}'
    },
    zh: {
      today: '今天的安排', todayHint: '按时间查看全家人的日程。', attention: '需要留意', attentionHint: '未来 7 天的时间冲突，以及 48 小时内的截止事项。',
      priority: '重要安排', priorityHint: '未来 7 天内的高重要性日程和截止事项。', prep: '携带与准备', prepHint: '未来 48 小时内的备注和打包清单。',
      handoffs: '家庭接送与分工', handoffsHint: '查看未来 7 天日程中填写的负责人。', special: '值得期待的日子', specialHint: '未来 90 天的节假日、生日和旅行。',
      outlook: '未来四周概览', outlookHint: '本周及接下来三周。重叠的忙碌时间只计算一次。',
      scope: '当前日历 · 所有家庭成员 · 不受日历筛选条件影响', todayEmpty: '今天暂无安排，给自己留一点轻松的空间。',
      todayDone: '今天的定时安排均已结束。', progressOne: '已结束 {done} / 1 项日程', progress: '已结束 {done} / {total} 项日程', occupied: '占用 {time}',
      add: '添加安排', openDay: '查看今天', find: '寻找家庭空闲时间', quick: '快速添加', now: '进行中', later: '今天稍后', finished: '已结束',
      allDay: '全天', completed: '今天早些时候', more: '再显示 {count} 项', good: '没有即将发生的时间冲突，48 小时内也没有截止事项。',
      clearHint: '仅检查已保存的日历日程，不包含出行时间或 KidsSync 之外的安排。', overlap: '时间重叠', review: '查看两个日程',
      deadline: '截止事项', important: '高重要性', priorityEmpty: '本周暂无重要安排。', priorityEmptyHint: '将日程的重要性设为“高”，即可在这里查看。',
      prepEmpty: '未来 48 小时暂无准备备注。', prepEmptyHint: '在日程中添加物品或备注，即可在这里查看。', bring: '携带', notes: '备注', checklist: '打开备注与打包清单',
      noPerson: '尚未填写负责人', unassigned: '{count} 项安排未填写负责人。如需接送或交接，可在日程中添加。',
      noHandoffs: '本周暂无交接分工。', assignmentHint: '在日程的“负责成人”一栏填写姓名，协调接送与照料。',
      planOne: '1 项安排', plans: '{count} 项安排', noSpecial: '未来 90 天暂无特别日期。', thisWeek: '本周', nextWeek: '下周', weekNumber: '{count} 周后',
      eventDetails: '查看{title}', begins: '{time}开始', ends: '{time}结束', holiday: '节假日', birthday: '生日', trip: '旅行',
      allFamily: '全家', noBusy: '没有定时安排', scopeChanged: '日历已切换，请从更新后的概览中选择日程。',
      allDayNote: '包括全天日程；忙碌时间仅统计定时安排。', dateRange: '{start} – {end}', dayPlanOne: '{date} · 1 项日程', dayPlan: '{date} · {count} 项日程',
      prepFooter: '打包进度仅为此设备上的当前日历保存。', openWeek: '查看 {date} 所在周'
    }
  };
  const text = (key, values = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  const planCount = count => text(count === 1 ? 'planOne' : 'plans', { count });
  const esc = value => escapeHtml(String(value ?? ''));
  const page = document.getElementById('dashboardPage');
  const panels = new Map();
  const roots = ['dashboardNow', 'dashboardPlanMain', 'dashboardPlanSide', 'dashboardSpecial'].map(id => document.getElementById(id));
  let references = [], referenceScope = '';
  const panelIcons = {
    today: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h3"/>',
    attention: '<path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0ZM12 9v5m0 3v.01"/>',
    outlook: '<path d="M4 20h16M7 16V9m5 7V4m5 12v-5"/>',
    handoffs: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m2 4a6 6 0 0 1 2 4v3"/>',
    priority: '<path d="M5 21V4c5-5 9 5 14 0v11c-5 5-9-5-14 0"/>',
    prep: '<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m9 13 2 2 4-4"/>',
    special: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>'
  };
  function panel(key, root) {
    const element = document.createElement('details');
    element.open = true; element.className = 'dashboard-planning-panel'; element.dataset.dashboardSection = key;
    element.innerHTML = `<summary><span class="dashboard-planning-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">${panelIcons[key] || ''}</svg></span><span class="dashboard-planning-heading"><span class="dashboard-planning-eyebrow" data-plan-eyebrow></span><h2 id="dashboardPlan-${key}"></h2><span class="dashboard-planning-subtitle" data-plan-hint></span></span><span class="dashboard-planning-toggle" aria-hidden="true"></span></summary><div class="dashboard-planning-body" data-plan-body></div>`;
    root.append(element); panels.set(key, element);
  }
  panel('today', roots[0]); panel('attention', roots[0]);
  panel('outlook', roots[1]); panel('handoffs', roots[1]);
  panel('priority', roots[2]); panel('prep', roots[2]); panel('special', roots[3]);
  const notice = document.createElement('p'); notice.className = 'sr-only'; notice.setAttribute('role', 'status'); page.append(notice);
  function ref(event) { references.push(event); return references.length - 1; }
  function duration(value) {
    const hours = Math.floor(value / 60), minutes = value % 60;
    return currentLanguage === 'zh' ? `${hours ? `${hours}小时` : ''}${minutes ? `${minutes}分` : ''}` : `${hours ? `${hours}h` : ''}${hours && minutes ? ' ' : ''}${minutes ? `${minutes}m` : ''}`;
  }
  function when(event) {
    const day = localDay(event.occurrenceDate || event.startDate);
    return `${formatShortDate(day)} · ${eventTimeText(event)}`;
  }
  function list(items, render, limit = 4) {
    const moreKey = items[limit]?.person ? `person:${items[limit].person}` : occurrenceId(Array.isArray(items[limit]) ? items[limit][0] : items[limit] || {});
    return items.slice(0, limit).map(render).join('') + (items.length > limit ? `<details class="dashboard-planning-more" data-dashboard-more="${esc(moreKey)}"><summary>${esc(text('more', { count: items.length - limit }))}</summary>${items.slice(limit).map(render).join('')}</details>` : '');
  }
  const empty = (title, hint = '') => `<div class="dashboard-planning-empty"><strong>${esc(text(title))}</strong>${hint ? `<p>${esc(text(hint))}</p>` : ''}</div>`;
  function eventRow(event, badge = '', extra = '') {
    return `<button type="button" class="dashboard-plan-event" data-dashboard-event="${ref(event)}" data-dashboard-key="${esc(occurrenceId(event))}" aria-label="${esc([text('eventDetails', { title: activityTitle(event) }), when(event), displayChild(event), badge].filter(Boolean).join(' · '))}"><span class="dashboard-plan-icon" aria-hidden="true">${esc(displayIcon(event))}</span><span class="dashboard-plan-copy"><strong>${esc(activityCompactTitle(event))}</strong><span>${esc(when(event))}</span><span>${esc(displayChild(event))}${event.location ? ` · ${esc(event.location)}` : ''}</span>${extra}${badge ? `<span class="dashboard-plan-badge">${esc(badge)}</span>` : ''}</span><span class="dashboard-plan-chevron" aria-hidden="true">↗</span></button>`;
  }
  function setPanel(key, body, count = '', visible = true) {
    const element = panels.get(key); element.hidden = !visible;
    element.querySelector('h2').textContent = text(key);
    element.querySelector('[data-plan-hint]').textContent = text(`${key}Hint`);
    element.querySelector('[data-plan-eyebrow]').textContent = count;
    const container = element.querySelector('[data-plan-body]');
    const opened = new Set([...container.querySelectorAll('[data-dashboard-more][open]')].map(node => node.dataset.dashboardMore));
    const active = container.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.dataset.dashboardKey;
    container.innerHTML = body;
    container.querySelectorAll('[data-dashboard-more]').forEach(node => { node.open = opened.has(node.dataset.dashboardMore); });
    if (focusKey) [...container.querySelectorAll('[data-dashboard-key]')].find(node => node.dataset.dashboardKey === focusKey)?.focus({ preventScroll: true });
  }
  function renderToday(model, now) {
    const total = model.todayEvents.length, done = model.todayFinished.length;
    const count = text(total === 1 ? 'dayPlanOne' : 'dayPlan', { date: formatFullDate(now), count: total });
    const progress = total ? `<div class="dashboard-plan-progress"><span>${esc(text(total === 1 ? 'progressOne' : 'progress', { done, total }))}</span><span>${model.occupiedToday ? esc(text('occupied', { time: duration(model.occupiedToday) })) : ''}</span><progress max="${total}" value="${done}" aria-label="${esc(text(total === 1 ? 'progressOne' : 'progress', { done, total }))}"></progress></div>` : '';
    const rows = model.todayRemaining.length ? list(model.todayRemaining, event => eventRow(event, event.allDay ? text('allDay') : eventBounds(event).start <= now.getTime() ? text('now') : text('later')), 4)
      : empty(total ? 'todayDone' : 'todayEmpty');
    const finished = done ? `<details class="dashboard-planning-more" data-dashboard-more="finished"><summary>${esc(text('completed'))} · ${done}</summary>${list(model.todayFinished, event => eventRow(event, text('finished')), 4)}</details>` : '';
    setPanel('today', `<p class="dashboard-plan-scope">${esc(text('scope'))}</p>${progress}${rows}${finished}<div class="dashboard-plan-actions"><button class="small-btn" type="button" data-dashboard-action="today">${esc(text('openDay'))}</button><button class="small-btn" type="button" data-dashboard-action="quick">${esc(text('quick'))}</button><button class="small-btn" type="button" data-dashboard-action="find">${esc(text('find'))}</button></div>`, count);
  }
  function renderAttention(model) {
    const pairs = findConflictPairs(model.near.filter(event => !isSpan(event)));
    const conflicts = list(pairs, ([first, second]) => `<article class="dashboard-plan-alert"><span class="dashboard-plan-badge">${esc(text('overlap'))}</span><strong>${esc(activityCompactTitle(first))} + ${esc(activityCompactTitle(second))}</strong><p>${esc(when(first))} · ${esc(displayChild(first))}</p><div class="dashboard-plan-actions"><button type="button" class="small-btn" data-dashboard-event="${ref(first)}" data-dashboard-key="${esc(occurrenceId(first))}">${esc(activityCompactTitle(first))} ↗</button><button type="button" class="small-btn" data-dashboard-event="${ref(second)}" data-dashboard-key="${esc(occurrenceId(second))}">${esc(activityCompactTitle(second))} ↗</button></div></article>`, 2);
    const urgent = list(model.urgent, event => eventRow(event, text('deadline')), 2);
    setPanel('attention', conflicts || urgent ? `${conflicts}${urgent}` : `${empty('good')}<p class="dashboard-plan-note">${esc(text('clearHint'))}</p>`, String(pairs.length + model.urgent.length), model.hasPlans);
  }
  function renderPreparation(model) {
    setPanel('priority', model.priorities.length ? list(model.priorities, event => eventRow(event, text(event.importance === 'high' ? 'important' : 'deadline')), 3) : empty('priorityEmpty', 'priorityEmptyHint'), planCount(model.priorities.length), model.hasPlans);
    const prep = list(model.prep, event => `<article class="dashboard-prep-item"><strong>${esc(activityCompactTitle(event))}</strong><p>${esc(when(event))} · ${esc(displayChild(event))}</p>${event.items ? `<p class="dashboard-prep-detail"><b>${esc(text('bring'))}</b> ${esc(event.items)}</p>` : ''}${event.notes ? `<p class="dashboard-prep-detail"><b>${esc(text('notes'))}</b> ${esc(event.notes)}</p>` : ''}<button class="small-btn" type="button" data-dashboard-event="${ref(event)}" data-dashboard-key="${esc(occurrenceId(event))}">${esc(text('checklist'))} ↗</button></article>`, 2);
    setPanel('prep', prep ? `${prep}<p class="dashboard-plan-note">${esc(text('prepFooter'))}</p>` : empty('prepEmpty', 'prepEmptyHint'), planCount(model.prep.length), model.hasPlans);
  }
  function renderHandoffs(model) {
    const assigned = list(model.handoffs, group => `<article class="dashboard-handoff-person"><div class="dashboard-handoff-heading"><strong>${esc(group.person)}</strong><span>${esc(planCount(group.events.length))}</span></div>${list(group.events, event => eventRow(event), 2)}</article>`, 3);
    const unassigned = model.unassigned.length ? `<details class="dashboard-planning-more" data-dashboard-more="unassigned"><summary>${esc(text('noPerson'))} · ${model.unassigned.length}</summary><p class="dashboard-plan-note">${esc(text('unassigned', { count: model.unassigned.length }))}</p>${list(model.unassigned, event => eventRow(event), 3)}</details>` : '';
    setPanel('handoffs', `${assigned || empty('noHandoffs', 'assignmentHint')}${unassigned}`, planCount(model.near.filter(event => !event.isBuiltInHoliday && !event.externalSource).length), model.hasPlans);
  }
  function renderSpecial(model, now) {
    const body = list(model.special, event => {
      const bounds = eventBounds(event), begun = bounds.start <= now.getTime();
      const relative = formatRelativeTime(new Date(begun ? bounds.end : bounds.start), now);
      return eventRow(event, `${text(event.eventType)} · ${text(begun ? 'ends' : 'begins', { time: relative })}`);
    }, 4);
    setPanel('special', body || empty('noSpecial'), planCount(model.special.length));
  }
  function renderOutlook(model) {
    const max = Math.max(1, ...model.weeks.map(week => week.count));
    const body = `<div class="dashboard-outlook-grid">${model.weeks.map((week, index) => `<button type="button" class="dashboard-outlook-week" data-dashboard-week="${dateKeyFor(week.start)}" aria-label="${esc(text('openWeek', { date: formatShortDate(week.start) }))}"><span>${esc(text(index === 0 ? 'thisWeek' : index === 1 ? 'nextWeek' : 'weekNumber', { count: index }))}</span><strong>${week.count}</strong><span>${esc(text('dateRange', { start: formatShortDate(week.start), end: formatShortDate(week.end) }))}</span><span class="dashboard-outlook-meter" aria-hidden="true"><i style="width:${week.count / max * 100}%"></i></span><span>${esc(week.minutes ? text('occupied', { time: duration(week.minutes) }) : text('noBusy'))}</span></button>`).join('')}</div><p class="dashboard-plan-note">${esc(text('allDayNote'))}</p>`;
    setPanel('outlook', body, '', model.hasPlans);
  }
  function refresh() {
    if (page.hidden) return;
    const now = new Date(), today = localDay(dateKeyFor(now)), first = plusDays(today, -((today.getDay() + 6) % 7));
    const entries = [];
    for (let date = first; date < plusDays(today, 90); date = plusDays(date, 1)) {
      entries.push(...occurrencesOnDate(date, { ignoreSearch: true, ignoreFilter: true, ignoreChildren: true }));
    }
    const snapshot = buildModel(entries, now); references = []; referenceScope = scheduleStorageKey('activities');
    renderToday(snapshot, now); renderAttention(snapshot); renderPreparation(snapshot); renderHandoffs(snapshot); renderSpecial(snapshot, now); renderOutlook(snapshot);
    window.KidsSyncDashboardUX?.refresh(snapshot);
  }
  function openDate(date, view) {
    selectedDate = new Date(date); showCalendarPage(); setSidebarActive('calendar');
    activateCalendarView(view, true, { remember: false });
    if (view === 'today') document.getElementById('todayHeading').focus({ preventScroll: true });
  }
  page.addEventListener('click', event => {
    const button = event.target.closest('[data-dashboard-event], [data-dashboard-action], [data-dashboard-week]');
    if (!button) return;
    if (referenceScope !== scheduleStorageKey('activities')) { refresh(); notice.textContent = text('scopeChanged'); return; }
    if (button.hasAttribute('data-dashboard-event')) {
      const activity = references[Number(button.dataset.dashboardEvent)];
      if (activity) showEventDetails(activity);
    } else if (button.dataset.dashboardWeek) openDate(localDay(button.dataset.dashboardWeek), 'week');
    else if (button.dataset.dashboardAction === 'today') openDate(new Date(), 'today');
    else if (button.dataset.dashboardAction === 'find') window.KidsSyncScheduler.open('find');
    else if (button.dataset.dashboardAction === 'quick') window.KidsSyncScheduler.open('quick');
  });
  window.KidsSyncDashboard = { refresh, engine: pure };
  refresh();
})();
