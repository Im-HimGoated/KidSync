/* Calendar planning tools. Notes stay private to this calendar on this device. */
(() => {
  'use strict';
  function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split('-').map(Number), date = new Date(y, m - 1, d);
    return y >= 1900 && y <= 9998 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const plus = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  function range(from, to) {
    const first = day(from), last = day(to), dates = [];
    if (!first || !last || first > last) return null;
    for (let date = first; date <= last; date = plus(date, 1)) {
      if (dates.length === 366 || !day(key(date))) return null;
      dates.push(key(date));
    }
    return dates;
  }
  function collect(from, to, getEvents) {
    const dates = range(from, to);
    if (!dates) return null;
    return dates.flatMap(date => {
      const seen = new Set();
      return getEvents(day(date)).filter(event => {
        if (event.status === 'cancelled' || seen.has(event.id)) return false;
        seen.add(event.id); return true;
      }).map(event => ({ ...event, occurrenceDate: date }));
    }).sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate)
      || Number(Boolean(b.allDay || b.eventType === 'trip')) - Number(Boolean(a.allDay || a.eventType === 'trip'))
      || String(a.start || '').localeCompare(String(b.start || '')) || String(a.title || '').localeCompare(String(b.title || '')));
  }
  function search(events, query) {
    const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
    return events.filter(event => tokens.every(token => normalize([event.title, event.child, event.searchLabel, event.location, event.responsible, event.notes, event.items].join(' ')).includes(token)));
  }
  function clock(value) {
    if (value === '24:00') return 1440;
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [h, m] = value.split(':').map(Number); return h * 60 + m;
  }
  function openGaps(events, start, end, minimum) {
    if (![start, end, minimum].every(Number.isInteger) || start < 0 || end > 1440 || end <= start || minimum < 15 || minimum > 240) return [];
    const buffer = value => Math.max(0, Math.min(120, Math.round(Number(value) || 0)));
    const busy = events.filter(event => event.status !== 'cancelled' && !event.isBuiltInHoliday && event.eventType !== 'holiday' && event.externalBusy !== false).map(event => {
      const from = clock(event.start), to = clock(event.end);
      const offset = [-1, 0, 1].includes(event.dayOffset) ? event.dayOffset * 1440 : 0;
      if (event.allDay || event.eventType === 'trip' || from === null || to === null || to <= from) return [offset, offset + 1440];
      return [offset + from - buffer(event.travelMinutes) - buffer(event.bufferBeforeMinutes), offset + to + buffer(event.bufferAfterMinutes)];
    }).sort((a, b) => a[0] - b[0]);
    const gaps = []; let cursor = start;
    for (const [from, to] of busy) {
      if (to <= cursor || from >= end) continue;
      if (from - cursor >= minimum) gaps.push({ start: cursor, end: Math.min(from, end) });
      cursor = Math.max(cursor, to);
    }
    if (end - cursor >= minimum) gaps.push({ start: cursor, end });
    return gaps;
  }
  function notesFor(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([date, text]) => day(date) && typeof text === 'string' && text.length <= 2000).slice(-730));
  }
  function saveNote(storage, scope, expectedScope, date, value) {
    if (scope !== expectedScope || !day(date) || typeof value !== 'string' || value.length > 2000) return false;
    try {
      const raw = storage.getItem(scope);
      let notes; try { notes = notesFor(JSON.parse(raw)); } catch { notes = {}; }
      if (value.trim()) notes[date] = value; else delete notes[date];
      if (Object.keys(notes).length > 730) return false;
      storage.setItem(scope, JSON.stringify(notes)); return true;
    } catch { return false; }
  }
  function weekText(events, dates, labels) {
    return [labels.title, ...dates.map(date => [labels.date(date), ...events.filter(event => event.occurrenceDate === date).map(event => {
      const details = [labels.time(event), labels.person(event), event.location].filter(Boolean).join(' · ');
      return [event.title || '', details, labels.details ? [event.items, event.notes].filter(Boolean).join('\n') : ''].filter(Boolean).join('\n');
    }), ...(!events.some(event => event.occurrenceDate === date) ? [labels.empty] : [])].join('\n\n'))].join('\n\n');
  }
  function occupied(entries) {
    const intervals = entries.filter(e => e.status !== 'cancelled' && !e.allDay && !['trip', 'holiday'].includes(e.eventType)).map(e => [clock(e.start), clock(e.end)]).filter(([a, b]) => a !== null && b !== null && b > a).sort((a, b) => a[0] - b[0]);
    let end = 0, total = 0; for (const [a, b] of intervals) { total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); } return total;
  }
  const engine = { day, key, plus, range, collect, search, clock, openGaps, occupied, notesFor, saveNote, weekText };
  if (typeof module !== 'undefined' && module.exports) { module.exports = engine; return; }

  const words = {
    en: {
      title: 'Plan your calendar', open: 'Day & week planning', close: 'Close', find: 'Find events', gaps: 'Open time', compare: 'Compare days', notes: 'Day notes', copy: 'Copy week',
      scope: 'Current calendar · all people and categories · cancelled events excluded. Calendar filters do not limit these tools.',
      query: 'Search events, people, places or notes', from: 'From', to: 'Through', search: 'Search', rangeError: 'Choose a valid date range of up to 366 days.',
      found: '{n} matching occurrences', more: 'Show 20 more', empty: 'No events found in these dates.', details: 'View event', show: 'Show day', reveal: 'Show day opens Day view and clears calendar filters.',
      date: 'Date', start: 'Window starts', end: 'Window ends', duration: 'Minimum minutes', gapsHint: 'Open time across everyone in this calendar. Includes travel and buffers. All-day plans and trips block the window; holidays do not. Check any calendars that are not connected before booking.',
      gapEmpty: 'No open time meets this window and duration.', gapError: 'Choose a valid date and a window ending after it starts.', add: 'Plan here', gapDraft: 'Opens an unsaved event for the minimum duration.',
      first: 'First day', second: 'Second day', plans: '{n} events · {m} timed minutes', noPlans: 'Nothing scheduled.',
      private: 'Private notes for this date and calendar, saved only on this device. They are not shared, synced or included in copied agendas. Up to 730 dates.',
      noteLabel: 'Your note', save: 'Save note', saved: 'Note saved on this device.', failed: 'Could not save. Your text is still here; saved notes are unchanged.', dirty: 'Unsaved changes · choose Save note to keep them.',
      week: 'Week containing', include: 'Include event notes and packing items', preview: 'Review before copying. Includes all seven days and all people. Private day notes are excluded.',
      text: 'Weekly agenda to copy', copyButton: 'Copy agenda', copied: 'Weekly agenda copied.', manual: 'Clipboard unavailable. Select and copy the text below.', weekly: 'Weekly agenda', invalid: 'Choose a valid date.', stale: 'Calendar changed. The planning tools have been reset.',
      counts: '{n}/2000 characters', gap: '{start}–{end} · {n} min open'
    },
    zh: {
      title: '规划日历', open: '每日与每周规划', close: '关闭', find: '查找日程', gaps: '空闲时间', compare: '比较日期', notes: '每日笔记', copy: '复制本周',
      scope: '当前日历 · 所有成员和类别 · 不含已取消日程。此处不受日历筛选影响。',
      query: '搜索日程、姓名、地点或备注', from: '从', to: '至', search: '搜索', rangeError: '请选择不超过 366 天的有效日期范围。',
      found: '找到 {n} 项日程', more: '再显示 20 项', empty: '这些日期没有匹配的日程。', details: '查看日程', show: '查看当天', reveal: '查看当天会打开日视图并清除日历筛选。',
      date: '日期', start: '开始时间', end: '结束时间', duration: '最短分钟数', gapsHint: '计算当前日历所有成员的空闲时间，包括交通及缓冲。全天日程和旅行占用整段时间，节假日除外。预约前请检查未连接的其他日历。',
      gapEmpty: '此时间范围内没有满足时长的空闲时间。', gapError: '请选择有效日期，结束时间须晚于开始时间。', add: '在此安排', gapDraft: '打开未保存的日程，时长为所选最短时长。',
      first: '第一天', second: '第二天', plans: '{n} 项日程 · {m} 分钟占用', noPlans: '暂无日程。',
      private: '笔记仅为当前日期和日历保存在此设备上，不会共享、同步或复制到周安排。最多保存 730 个日期。',
      noteLabel: '你的笔记', save: '保存笔记', saved: '已在此设备保存笔记。', failed: '保存失败。文字仍保留在此，原有笔记未变。', dirty: '尚未保存 · 点击保存笔记以保留更改。',
      week: '所在周的日期', include: '包括日程备注和携带物品', preview: '复制前请核对。包括一周七天及所有成员，不含私人每日笔记。',
      text: '要复制的每周安排', copyButton: '复制安排', copied: '已复制每周安排。', manual: '无法访问剪贴板，请选择下方文字手动复制。', weekly: '每周安排', invalid: '请选择有效日期。', stale: '已切换日历，规划工具已重置。',
      counts: '{n}/2000 字符', gap: '{start}–{end} · 空闲 {n} 分钟'
    }
  };
  const tx = (name, vars = {}) => (words[currentLanguage] || words.en)[name].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const dialog = document.createElement('dialog'); dialog.id = 'calendarPlanning'; dialog.className = 'calendar-planning'; dialog.setAttribute('aria-labelledby', 'calendarPlanningTitle');
  const modes = ['find', 'gaps', 'compare', 'notes', 'copy'];
  const dateInput = (id, label) => `<label><span data-cp-text="${label}"></span><input id="${id}" type="date" min="1900-01-01" max="9998-12-31" required></label>`;
  dialog.innerHTML = `<header><h2 id="calendarPlanningTitle" data-cp-text="title"></h2><button type="button" data-cp-close data-cp-text="close"></button></header><p class="cp-scope" data-cp-text="scope"></p><nav class="cp-tabs" aria-label="${tx('title')}">${modes.map((name, i) => `<button type="button" data-cp-mode="${name}" aria-pressed="${i === 0}" data-cp-text="${name}"></button>`).join('')}</nav><div class="cp-body">
      <section data-cp-panel="find"><form id="cpFindForm"><label class="cp-wide"><span data-cp-text="query"></span><input id="cpQuery" type="search" maxlength="120"></label>${dateInput('cpFrom', 'from')}${dateInput('cpTo', 'to')}<button type="submit" class="primary-btn" data-cp-text="search"></button></form><p data-cp-text="reveal" class="cp-hint"></p><p id="cpFound" role="status"></p><div id="cpResults"></div><button type="button" id="cpMore" data-cp-text="more" hidden></button></section>
      <section data-cp-panel="gaps" hidden><p data-cp-text="gapsHint" class="cp-hint"></p><form id="cpGapForm">${dateInput('cpGapDate', 'date')}<label><span data-cp-text="start"></span><input id="cpGapStart" type="time" value="08:00" required></label><label><span data-cp-text="end"></span><input id="cpGapEnd" type="time" value="20:00" required></label><label><span data-cp-text="duration"></span><select id="cpDuration"><option>15</option><option selected>30</option><option>45</option><option>60</option><option>90</option><option>120</option></select></label></form><p data-cp-text="gapDraft" class="cp-hint"></p><div id="cpGaps" aria-live="polite"></div></section>
      <section data-cp-panel="compare" hidden><div class="cp-fields">${dateInput('cpFirst', 'first')}${dateInput('cpSecond', 'second')}</div><div id="cpComparison" class="cp-comparison"></div></section>
      <section data-cp-panel="notes" hidden><p data-cp-text="private" class="cp-hint"></p>${dateInput('cpNoteDate', 'date')}<label class="cp-note"><span data-cp-text="noteLabel"></span><textarea id="cpNote" maxlength="2000" rows="7" aria-describedby="cpNoteCount"></textarea></label><p id="cpNoteCount" class="cp-hint"></p><p id="cpNoteStatus" role="status" aria-live="polite"></p><button type="button" id="cpSaveNote" class="primary-btn" data-cp-text="save"></button></section>
      <section data-cp-panel="copy" hidden>${dateInput('cpWeekDate', 'week')}<p data-cp-text="preview" class="cp-hint"></p><label class="cp-check"><input id="cpDetails" type="checkbox"><span data-cp-text="include"></span></label><label class="cp-note"><span data-cp-text="text"></span><textarea id="cpWeekText" readonly rows="12"></textarea></label><button type="button" id="cpCopy" class="primary-btn" data-cp-text="copyButton"></button></section>
      <p id="cpStatus" role="status" aria-live="polite"></p></div>`;
  document.body.append(dialog);
  const button = document.createElement('button'); button.id = 'openCalendarPlanning'; button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', dialog.id); button.className = 'quick-side-toggle';
  document.getElementById('quickCalendarNav').append(button);
  // The quick navigation collapses on phones; keep the same entry point in More.
  const mobileButton = button.cloneNode(true); mobileButton.id = 'openCalendarPlanningMenu'; mobileButton.className = 'ghost-btn'; document.getElementById('openPlannerTools').after(mobileButton);
  const get = id => dialog.querySelector(`#${id}`), scope = () => scheduleStorageKey('calendar-day-notes-v1');
  const allEvents = date => occurrencesOnDate(date, { ignoreSearch: true, ignoreFilter: true, ignoreChildren: true }).map(event => ({ ...event, searchLabel: `${activityTitle(event)} ${displayChild(event)}` }));
  let activeScope = '', mode = 'find', events = new Map(), found = [], limit = 20, opener = null, noteDate = '', drafts = new Map(), lastSaved = '', slotChoices = [];
  function readNotes() { try { return notesFor(JSON.parse(localStorage.getItem(activeScope))); } catch { return {}; } }
  function localize() {
    dialog.querySelectorAll('[data-cp-text]').forEach(node => { node.textContent = tx(node.dataset.cpText); });
    dialog.querySelector('.cp-tabs').setAttribute('aria-label', tx('title'));
    button.textContent = mobileButton.textContent = tx('open');
  }
  function resetScope() {
    const changed = activeScope && activeScope !== scope();
    if (activeScope === scope()) return false;
    activeScope = scope(); events.clear(); found = []; drafts.clear(); noteDate = ''; lastSaved = '';
    get('cpQuery').value = ''; get('cpDetails').checked = false;
    const date = key(selectedDate);
    for (const id of ['cpGapDate', 'cpFirst', 'cpNoteDate', 'cpWeekDate']) get(id).value = date;
    get('cpSecond').value = key(plus(selectedDate, 1));
    get('cpFrom').value = key(plus(selectedDate, -30)); get('cpTo').value = key(plus(selectedDate, 90));
    get('cpNoteStatus').textContent = ''; get('cpStatus').textContent = changed ? tx('stale') : '';
    return true;
  }
  function register(event) { const id = `${event.id}:${event.occurrenceDate}`; events.set(id, event); return id; }
  function eventRows(items, showDay = true) {
    return items.map(event => `<article class="cp-event"><button type="button" data-cp-event="${esc(register(event))}"><strong>${esc(activityCompactTitle(event))}</strong><span>${esc(formatShortDate(day(event.occurrenceDate)))} · ${esc(eventTimeText(event))} · ${esc(displayChild(event))}</span>${event.location ? `<span>${esc(event.location)}</span>` : ''}</button>${showDay ? `<button type="button" data-cp-day="${esc(event.occurrenceDate)}" title="${esc(tx('reveal'))}">${esc(tx('show'))}</button>` : ''}</article>`).join('');
  }
  function renderFound() {
    get('cpFound').textContent = tx('found', { n: found.length });
    get('cpResults').innerHTML = found.length ? eventRows(found.slice(0, limit)) : `<p>${esc(tx('empty'))}</p>`;
    get('cpMore').hidden = found.length <= limit;
  }
  function runSearch() {
    const entries = collect(get('cpFrom').value, get('cpTo').value, allEvents);
    events.clear(); limit = 20; found = entries ? search(entries, get('cpQuery').value) : [];
    renderFound(); if (!entries) get('cpFound').textContent = tx('rangeError');
  }
  function renderGaps() {
    const date = get('cpGapDate').value, start = clock(get('cpGapStart').value), end = clock(get('cpGapEnd').value), duration = Number(get('cpDuration').value);
    slotChoices = [];
    if (!day(date) || start === null || end === null || end <= start) { get('cpGaps').textContent = tx('gapError'); return; }
    const now = new Date(), earliest = date === key(now) ? Math.max(start, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15) : start;
    const gaps = date < key(now) ? [] : openGaps([-1, 0, 1].flatMap(offset => { const dateObj = plus(day(date), offset); return day(key(dateObj)) ? allEvents(dateObj).map(event => ({ ...event, dayOffset: offset })) : []; }), earliest, end, duration);
    slotChoices = gaps.map(gap => ({ ...gap, date, duration }));
    get('cpGaps').innerHTML = gaps.length ? gaps.map((gap, i) => `<article class="cp-gap"><strong>${esc(tx('gap', { start: formatTimeLabel(gap.start), end: formatTimeLabel(gap.end), n: gap.end - gap.start }))}</strong><button type="button" data-cp-slot="${i}">${esc(tx('add'))}</button></article>`).join('') : `<p>${esc(tx('gapEmpty'))}</p>`;
  }
  function renderComparison() {
    events.clear();
    get('cpComparison').innerHTML = ['cpFirst', 'cpSecond'].map(id => {
      const date = day(get(id).value); if (!date) return `<p>${esc(tx('invalid'))}</p>`;
      const entries = collect(key(date), key(date), allEvents);
      return `<section><h3>${esc(formatFullDate(date))}</h3><p>${esc(tx('plans', { n: entries.length, m: occupied(entries) }))}</p>${entries.length ? eventRows(entries, false) : `<p>${esc(tx('noPlans'))}</p>`}<button type="button" data-cp-day="${key(date)}">${esc(tx('show'))}</button></section>`;
    }).join('');
  }
  function noteStatus() {
    get('cpNoteCount').textContent = tx('counts', { n: get('cpNote').value.length });
    get('cpNoteStatus').textContent = get('cpNote').value !== lastSaved ? tx('dirty') : '';
  }
  function loadNote() {
    if (noteDate) drafts.set(noteDate, get('cpNote').value);
    noteDate = get('cpNoteDate').value; lastSaved = readNotes()[noteDate] || '';
    get('cpNote').value = drafts.has(noteDate) ? drafts.get(noteDate) : lastSaved;
    get('cpSaveNote').disabled = !day(noteDate); noteStatus();
  }
  function renderWeek() {
    const date = day(get('cpWeekDate').value);
    if (!date) { get('cpWeekText').value = tx('invalid'); get('cpCopy').disabled = true; return; }
    const first = plus(date, -((date.getDay() + 6) % 7)), dates = range(key(first), key(plus(first, 6)));
    if (!dates) { get('cpWeekText').value = tx('invalid'); get('cpCopy').disabled = true; return; }
    get('cpCopy').disabled = false;
    get('cpWeekText').value = weekText(collect(dates[0], dates[6], allEvents), dates, { title: tx('weekly'), date: value => formatFullDate(day(value)), time: eventTimeText, person: displayChild, details: get('cpDetails').checked, empty: tx('noPlans') });
  }
  function renderMode() {
    if (mode === 'find') runSearch();
    if (mode === 'gaps') renderGaps();
    if (mode === 'compare') renderComparison();
    if (mode === 'notes') loadNote();
    if (mode === 'copy') renderWeek();
  }
  function selectMode(next) {
    mode = next; get('cpStatus').textContent = '';
    dialog.querySelectorAll('[data-cp-panel]').forEach(panel => { panel.hidden = panel.dataset.cpPanel !== mode; });
    dialog.querySelectorAll('[data-cp-mode]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.cpMode === mode)));
    renderMode();
  }
  function open(event) {
    opener = event.currentTarget; localize(); resetScope(); document.getElementById('moreActions').open = false;
    renderMode(); dialog.showModal();
  }
  button.addEventListener('click', open); mobileButton.addEventListener('click', open);
  dialog.querySelector('[data-cp-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (noteDate) drafts.set(noteDate, get('cpNote').value); if (opener?.getClientRects().length) opener.focus({ preventScroll: true }); });
  dialog.addEventListener('click', event => {
    const tab = event.target.closest('[data-cp-mode]'); if (tab) { selectMode(tab.dataset.cpMode); return; }
    if (activeScope !== scope()) { resetScope(); renderMode(); return; }
    const row = event.target.closest('[data-cp-event]');
    if (row) { const selected = events.get(row.dataset.cpEvent); if (selected) { dialog.close(); showEventDetails(selected); } return; }
    const dateButton = event.target.closest('[data-cp-day]');
    if (dateButton) {
      const date = day(dateButton.dataset.cpDay); if (!date) return;
      dialog.close(); state.searchQuery = ''; scheduleSearch.value = ''; state.eventFilter = 'all'; state.visibleKids = new Set(kidProfiles.map(profile => profile.name)); window.KidsSyncCalendarUX?.resetHiddenFilter(); setSidebarActive('calendar'); showCalendarPage(); openCalendarDay(date); return;
    }
    const slotButton = event.target.closest('[data-cp-slot]');
    if (slotButton) {
      const slot = slotChoices[Number(slotButton.dataset.cpSlot)]; if (!slot) return;
      renderGaps();
      if (!slotChoices.some(next => next.date === slot.date && next.start === slot.start && next.end === slot.end && next.duration === slot.duration)) return;
      const start = day(slot.date), finish = day(slot.date); start.setHours(Math.floor(slot.start / 60), slot.start % 60, 0, 0); finish.setHours(Math.floor((slot.start + slot.duration) / 60), (slot.start + slot.duration) % 60, 0, 0);
      if (start <= new Date() || (finish - start) / 60000 !== slot.duration || start.getHours() * 60 + start.getMinutes() !== slot.start || finish.getHours() * 60 + finish.getMinutes() !== slot.start + slot.duration) return;
      dialog.close(); openNewEventAtTime(day(slot.date), slot.start);
      fields.end.value = `${String(Math.floor((slot.start + slot.duration) / 60)).padStart(2, '0')}:${String((slot.start + slot.duration) % 60).padStart(2, '0')}`; updateConflictSuggestions();
    }
  });
  get('cpFindForm').addEventListener('submit', event => { event.preventDefault(); runSearch(); });
  get('cpMore').addEventListener('click', () => { limit += 20; renderFound(); });
  get('cpGapForm').addEventListener('submit', event => event.preventDefault());
  get('cpGapForm').addEventListener('change', renderGaps);
  for (const id of ['cpFirst', 'cpSecond']) get(id).addEventListener('change', renderComparison);
  get('cpNoteDate').addEventListener('change', loadNote);
  get('cpNote').addEventListener('input', () => { drafts.set(noteDate, get('cpNote').value); noteStatus(); });
  get('cpSaveNote').addEventListener('click', () => {
    if (saveNote(localStorage, scope(), activeScope, noteDate, get('cpNote').value)) { lastSaved = get('cpNote').value; drafts.delete(noteDate); get('cpNoteStatus').textContent = tx('saved'); }
    else get('cpNoteStatus').textContent = tx('failed');
  });
  for (const id of ['cpWeekDate', 'cpDetails']) get(id).addEventListener('change', renderWeek);
  get('cpCopy').addEventListener('click', async () => {
    const expected = activeScope; renderWeek(); if (get('cpCopy').disabled) return;
    const copied = await copyTextToClipboard(get('cpWeekText').value, get('cpWeekText'));
    if (scope() === expected) get('cpStatus').textContent = tx(copied ? 'copied' : 'manual');
  });
  window.addEventListener('storage', event => {
    if (event.key !== activeScope || !dialog.open || mode !== 'notes') return;
    if (get('cpNote').value !== lastSaved) { get('cpNoteStatus').textContent = tx('dirty'); return; }
    drafts.delete(noteDate); noteDate = ''; loadNote();
  });
  function refresh() { localize(); if (!dialog.open) return; const changed = resetScope(); if (changed || mode !== 'notes') renderMode(); }
  window.KidsSyncCalendarPlanning = { refresh, engine };
  refresh();
})();
