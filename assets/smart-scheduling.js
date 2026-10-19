/* Inspired by Google Calendar Find a time, Calendly buffers, and Todoist Quick Add.
   All searches are local; external calendars and automatic bookings are not implied. */
(() => {
  function localDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split('-').map(Number), date = new Date(y, m - 1, d);
    return y >= 1900 && y <= 9999 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }
  const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const addDateDays = (date, count) => { const next = new Date(date); next.setDate(next.getDate() + count); return next; };
  const bufferMinutes = value => Math.max(0, Math.min(120, Math.round(Number(value) || 0)));
  function clock(value) {
    if (value === '24:00') return 1440;
    if (!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(value))) return null;
    const [h, m] = value.split(':').map(Number); return h * 60 + m;
  }
  const clockString = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  function wallTime(day, minute) {
    const date = localDate(day);
    if (!date || minute < 0 || minute > 1439) return null;
    const h = Math.floor(minute / 60), m = minute % 60;
    date.setHours(h, m, 0, 0);
    return date.getHours() === h && date.getMinutes() === m ? date : null;
  }
  function affectsPeople(event, people, family = '__family__') {
    if (event.isBuiltInHoliday || event.status === 'cancelled' || event.externalBusy === false) return false;
    const selected = new Set(people);
    if (selected.has(family)) return true;
    const named = (Array.isArray(event.attendees) ? event.attendees : []).filter(name => name !== 'all');
    if (event.child === family) return !named.length || named.some(name => selected.has(name));
    // Legacy individual events default to attendees=['all']; their child remains the busy person.
    return selected.has(event.child) || named.some(name => selected.has(name));
  }
  function busyIntervals(events, people, family = '__family__') {
    return events.filter(event => affectsPeople(event, people, family)).map(event => {
      const offset = (Number(event.dayOffset) || 0) * 1440;
      const start = clock(event.start), end = clock(event.end);
      if (event.allDay || event.eventType === 'trip' || start === null || end === null || end <= start) return [offset, offset + 1440];
      return [offset + start - bufferMinutes(event.bufferBeforeMinutes) - bufferMinutes(event.travelMinutes), offset + end + bufferMinutes(event.bufferAfterMinutes)];
    }).sort((a, b) => a[0] - b[0]);
  }
  function roomFor(start, end, busy, before = 0, after = 0) {
    return !busy.some(([busyStart, busyEnd]) => start - before < busyEnd && busyStart < end + after);
  }
  function validRules(rules) {
    return Boolean(localDate(rules.date) && [1, 3, 7, 14].includes(Number(rules.days))
      && [15, 30, 45, 60, 90, 120].includes(Number(rules.duration))
      && Number.isInteger(rules.earliest) && Number.isInteger(rules.latest) && rules.earliest >= 0 && rules.latest <= 1439 && rules.latest > rules.earliest
      && Array.isArray(rules.people) && rules.people.length > 0);
  }
  function dailyLoad(events, person) {
    const relevant = events.filter(event => !(Number(event.dayOffset) || 0) && affectsPeople(event, [person]));
    return { count: relevant.length, minutes: relevant.reduce((total, event) => {
      const start = clock(event.start), end = clock(event.end);
      return total + (!event.allDay && event.eventType !== 'trip' && start !== null && end !== null && end > start ? end - start : 0);
    }, 0) };
  }
  function withinDailyLimits(events, rules, duration) {
    const countCap = Math.max(0, Math.min(30, Math.floor(Number(rules.maxEvents) || 0)));
    const minuteCap = Math.max(0, Math.min(1440, Math.floor(Number(rules.maxMinutes) || 0)));
    return rules.people.every(person => {
      const load = dailyLoad(events, person);
      return (!countCap || load.count + 1 <= countCap) && (!minuteCap || load.minutes + duration <= minuteCap);
    });
  }
  function slotAvailable(slot, rules, getEvents, now = new Date()) {
    const before = bufferMinutes(rules.before), after = bufferMinutes(rules.after);
    const start = wallTime(slot.date, slot.start), end = wallTime(slot.date, slot.end);
    if (!start || !end || end <= start || (end - start) / 60000 !== slot.end - slot.start) return false;
    const notice = [0, 30, 60, 1440].includes(Number(rules.notice)) ? Number(rules.notice) : 0;
    if (start.getTime() < now.getTime() + notice * 60000) return false;
    if (slot.start - before < rules.earliest || slot.end + after > rules.latest) return false;
    const events = getEvents(localDate(slot.date));
    return withinDailyLimits(events, rules, slot.end - slot.start)
      && roomFor(slot.start, slot.end, busyIntervals(events, rules.people), before, after);
  }
  function findSlots(rules, getEvents, now = new Date()) {
    if (!validRules(rules)) return [];
    const slots = [], duration = Number(rules.duration), firstDate = localDate(rules.date);
    for (let day = 0; day < Number(rules.days); day++) {
      const date = addDateDays(firstDate, day);
      if (date.getFullYear() > 9999) break;
      const key = dateString(date), events = getEvents(date);
      let perDay = 0;
      for (let start = Math.ceil((rules.earliest + bufferMinutes(rules.before)) / 15) * 15; start + duration + bufferMinutes(rules.after) <= rules.latest; start += 15) {
        const slot = { date: key, start, end: start + duration };
        if (!slotAvailable(slot, rules, () => events, now)) continue;
        slots.push(slot); perDay++;
        start += Math.max(15, duration + bufferMinutes(rules.before) + bufferMinutes(rules.after)) - 15;
        if (perDay === 3 || slots.length === 30) break;
      }
      if (slots.length === 30) break;
    }
    return slots;
  }
  function quickDate(token, today) {
    if (localDate(token)) return token;
    const base = localDate(today); if (!base) return '';
    if (/^(today|今天)$/i.test(token)) return today;
    if (/^(tomorrow|明天)$/i.test(token)) return dateString(addDateDays(base, 1));
    if (token === '后天') return dateString(addDateDays(base, 2));
    const english = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const normalized = token.toLowerCase().replace(/^next\s+/, '');
    const chinese = token.match(/^(下)?(?:周|星期)([一二三四五六日天])$/);
    const target = chinese ? ({ 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 })[chinese[2]] : english.indexOf(normalized);
    if (target < 0 || target === undefined) return '';
    const difference = (target - base.getDay() + 7) % 7;
    return dateString(addDateDays(base, difference || (/^next\s|^下/.test(token.toLowerCase()) ? 7 : 0)));
  }
  function tokenizeQuickLine(raw, today) {
    const original = String(raw || '').trim().slice(0, 500);
    let rest = original.replace(/\s+/g, ' '), location = '', duration = '';
    const locationMatch = rest.match(/\s+@\s*(.+)$/);
    if (locationMatch) { location = locationMatch[1].trim().slice(0, 100); rest = rest.slice(0, locationMatch.index); }
    const advanced = /\b(?:every|each|weekly|daily|monthly|yearly|PST|PDT|EST|EDT|UTC|GMT|CST|CET|BST|all.day)\b|每周|每星期|每天|每月|每年|全天/i.test(rest);
    const dates = [...rest.matchAll(/\b\d{4}-\d{2}-\d{2}\b|\b(?:today|tomorrow|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b|今天|明天|后天|(?:下)?(?:周|星期)[一二三四五六日天]/gi)];
    const date = dates.length === 1 ? quickDate(dates[0][0], today) : '';
    const removeToken = (text, token, prefix) => {
      const literal = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.replace(new RegExp(`(?:\\b${prefix}\\s+)?${literal}`, 'i'), ' ');
    };
    dates.forEach(match => { rest = removeToken(rest, match[0], 'on'); });
    const durationMatch = rest.match(/(?:\bfor\s+|\bduration\s*:?\s*|时长\s*[:：]?\s*)(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|分钟|小时)/i);
    if (durationMatch) { duration = `${durationMatch[1]} ${durationMatch[2]}`; rest = rest.replace(durationMatch[0], ' '); }
    const patterns = [
      /(?:上午|下午|晚上|中午)?\s*\d{1,2}(?:[:：]\d{2}|点(?:半|\d{1,2}分?)?)\s*(?:-|–|—|至|到)\s*(?:上午|下午|晚上|中午)?\s*\d{1,2}(?:[:：]\d{2}|点(?:半|\d{1,2}分?)?)/,
      /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i,
      /\b\d{1,2}:\d{2}\s*(?:-|–|—|to)\s*\d{1,2}:\d{2}\b/i,
      /(?:上午|下午|晚上|中午)\s*\d{1,2}(?:[:：]\d{2}|点(?:半|\d{1,2}分?)?)/,
      /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i,
      /\b\d{1,2}:\d{2}\b/
    ];
    const timeMatch = patterns.map(pattern => rest.match(pattern)).find(Boolean);
    const time = timeMatch?.[0]?.trim() || '';
    if (timeMatch) rest = removeToken(rest, timeMatch[0], 'at');
    // Anything resembling a second time is ambiguous, not silently part of the event name.
    const extraTime = patterns.some(pattern => pattern.test(rest));
    const title = rest.replace(/^[\s,，:：\-–]+|[\s,，:：\-–]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
    return { original, title, date, time, duration, location, advanced: advanced || extraTime || dates.length > 1, missingDate: !date };
  }
  const pure = { localDate, dateString, addDateDays, bufferMinutes, clock, clockString, wallTime, affectsPeople, busyIntervals, roomFor, validRules, dailyLoad, withinDailyLimits, slotAvailable, findSlots, quickDate, tokenizeQuickLine };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // UI is kept after the pure engine so its scheduling rules can be tested without a browser.
  const words = {
    en: {
      smart: 'Smart scheduling', find: 'Find family time', quick: 'Quick Add', poll: 'Family poll', close: 'Close',
      intro: 'Find a free time, turn a sentence into an event, or compare family votes. Review everything before saving.',
      scope: 'Checks only this KidsSync calendar, including events hidden by filters. It does not check Google, Apple, or other calendars.',
      busy: 'Trips and saved all-day events block the day. Built-in holidays do not. Cancelled events are ignored.',
      who: 'Who needs to be free?', family: 'Family', date: 'Starting date', days: 'Search ahead', day1: '1 day', day3: '3 days', day7: '7 days', day14: '14 days',
      earliest: 'Not before', latest: 'Finish by', duration: 'Event length', before: 'Before', after: 'After', notice: 'Advance notice',
      buffer: 'Breathing room', bufferHint: 'Saved with the event and respected by this time finder. Manual events can still overlap; buffers are not separate events or external-calendar reservations.',
      noticeHint: 'How soon the event can start, counted from now.', minutes: '{count} min', none: 'None', nextDay: '24 hours',
      findButton: 'Find open times', empty: 'No open times match. Try shorter events, wider hours, less buffer, higher daily limits, or fewer people.',
      limits: 'Daily limits', maxEvents: 'Max events per person', maxMinutes: 'Max planned minutes per person', unlimited: '0 means no limit', limitsHint: 'Suggestions only. Counts all saved events for each selected person, including hidden ones. Planned minutes exclude travel, buffers, trips, and all-day events. Manual saves are not restricted.',
      count: '{count} suggestions · up to 3 per day', selectPeople: 'Choose at least one person.', invalid: 'Check the date and hours. Events must start and finish on the same day.',
      use: 'Review this time', suggestedTitle: 'Family time', review: 'Review in event editor',
      local: 'Times use your device’s time zone: {zone}.', stale: 'The calendar or people changed. Close and reopen Smart scheduling.',
      taken: 'This time is no longer available. Suggestions have been refreshed.',
      pending: 'You have an unfinished event. Resume or discard that draft in the editor first; it will not be overwritten.', openDraft: 'Open unfinished event',
      quickLabel: 'Describe a one-time event', quickHint: 'Use today, tomorrow, a weekday, or YYYY-MM-DD; include a time or time range. Add a place with @. English and Chinese are supported.',
      example: 'Piano tomorrow 4–5pm @ Music Studio', exampleLabel: 'Try an example', parse: 'Preview event', title: 'Event name', child: 'For', eventDate: 'Date', start: 'Starts', end: 'Ends', location: 'Location',
      estimate: 'The end time uses your default event length. Check it before continuing.',
      missing: 'Check the detected fields and fill anything missing. Nothing has been saved.',
      advanced: 'For repeating, all-day, multi-date, or time-zone-specific plans, use the full event editor. Your original text can be kept in Notes.', full: 'Use full event editor',
      changedText: 'Preview the updated text again before continuing.', bufferConflict: 'Breathing room overlaps another plan for the same person. The event time has not been changed.',
      savedBuffer: 'Breathing room: {before} min before · {after} min after', bufferValues: '{before} min before · {after} min after', bufferShort: '{count}m buffer', invalidLocal: 'This local time does not exist or crosses a clock change. Choose another time.'
    },
    zh: {
      smart: '智能排程', find: '寻找家庭空闲时间', quick: '快速添加', poll: '家庭投票', close: '关闭',
      intro: '寻找空闲时段、用一句话创建日程，或比较家庭投票。保存前均可检查和修改。',
      scope: '仅检查当前 KidsSync 日历，包括被筛选隐藏的日程；不会检查 Google、Apple 或其他日历。',
      busy: '旅行和已保存的全天日程会占用整天；内置节日不占用时间，已取消的日程会忽略。',
      who: '哪些人需要有空？', family: '全家', date: '起始日期', days: '查找范围', day1: '1 天', day3: '3 天', day7: '7 天', day14: '14 天',
      earliest: '最早开始', latest: '最晚结束', duration: '日程时长', before: '开始前', after: '结束后', notice: '提前准备时间',
      buffer: '缓冲时间', bufferHint: '随日程保存，查找空闲时段时会保留。手动添加的日程仍可能重叠；缓冲不是独立日程，也不会在外部日历中预约。',
      noticeHint: '从现在起，至少多久后才能开始。', minutes: '{count} 分钟', none: '无', nextDay: '24 小时',
      findButton: '查找空闲时段', empty: '没有符合条件的空闲时段。请缩短时长、扩大范围、减少缓冲、提高每日上限或减少参与者。',
      limits: '每日上限', maxEvents: '每人最多日程数', maxMinutes: '每人最多计划分钟数', unlimited: '0 表示不限制', limitsHint: '仅用于建议时段。计入每位参与者的所有已存日程，包括被隐藏的日程。计划分钟数不含交通、缓冲、旅行和全天日程；不会限制手动保存。',
      count: '{count} 个建议 · 每天最多 3 个', selectPeople: '请至少选择一位参与者。', invalid: '请检查日期和时间，开始与结束必须在同一天。',
      use: '检查此时段', suggestedTitle: '家庭时间', review: '在日程编辑器中检查',
      local: '时间使用此设备的时区：{zone}。', stale: '日历或参与者已更改，请关闭后重新打开智能排程。',
      taken: '此时段已不可用，建议已刷新。',
      pending: '您有未完成的日程。请先在编辑器中恢复或放弃该草稿；不会覆盖原有内容。', openDraft: '打开未完成的日程',
      quickLabel: '用一句话描述单次日程', quickHint: '支持今天、明天、星期或 YYYY-MM-DD，以及开始时间或时间范围。用 @ 添加地点，支持中英文。',
      example: '钢琴 明天 下午4点至5点 @ 音乐教室', exampleLabel: '试用示例', parse: '预览日程', title: '日程名称', child: '参与者', eventDate: '日期', start: '开始', end: '结束', location: '地点',
      estimate: '结束时间按默认日程时长推算，请在继续前检查。',
      missing: '请检查识别结果并补充缺失内容，尚未保存任何日程。',
      advanced: '重复、全天、多日期或指定时区的安排，请使用完整日程编辑器。原始文字可保留在备注中。', full: '使用完整日程编辑器',
      changedText: '文字已更改，请重新预览后再继续。', bufferConflict: '缓冲时间与同一人的其他安排重叠，日程时间尚未更改。',
      savedBuffer: '缓冲：开始前 {before} 分钟 · 结束后 {after} 分钟', bufferValues: '开始前 {before} 分钟 · 结束后 {after} 分钟', bufferShort: '{count} 分钟缓冲', invalidLocal: '此本地时间不存在或跨越时钟调整，请选择其他时间。'
    }
  };
  const tx = (key, args = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const node = id => document.getElementById(id);
  const hub = node('smartSchedulingDialog'), results = node('smartSchedulingResults');
  let mode = 'find', scope = '', options = null, suggestions = [], parsedText = '', opener = null;
  function localize() {
    document.querySelectorAll('[data-smart-text]').forEach(element => { element.textContent = tx(element.dataset.smartText); });
    node('closeSmartScheduling').setAttribute('aria-label', tx('close'));
    node('smartSchedulingZone').textContent = tx('local', { zone: Intl.DateTimeFormat().resolvedOptions().timeZone || localTimeZoneLabel() });
    node('smartQuickText').placeholder = tx('example');
    document.querySelectorAll('[data-smart-minutes]').forEach(option => { option.textContent = tx('minutes', { count: option.dataset.smartMinutes }); });
    node('smartRulesSummary').textContent = `${tx('bufferValues', { before: node('smartBefore').value, after: node('smartAfter').value })} · ${tx('notice')}: ${tx('minutes', { count: node('smartNotice').value })}`;
  }
  function message(value) { node('smartSchedulingStatus').textContent = value; }
  function setMode(value) {
    mode = ['quick', 'poll'].includes(value) ? value : 'find';
    node('smartFindPanel').hidden = mode !== 'find'; node('smartQuickPanel').hidden = mode !== 'quick';
    node('smartPollPanel').hidden = mode !== 'poll';
    document.querySelectorAll('[data-smart-mode]').forEach(button => { const active = button.dataset.smartMode === mode; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    message(''); node('smartOpenDraft').hidden = true;
    if (mode === 'poll') window.KidsSyncPolls?.open(scope);
  }
  function peopleControls() {
    const profiles = kidProfiles.length ? kidProfiles : [{ name: FAMILY_CHILD }];
    node('smartPeople').innerHTML = profiles.map((profile, index) => `<label><input type="checkbox" value="${esc(profile.name)}" id="smartPerson${index}" checked><span>${esc(profile.name === FAMILY_CHILD ? tx('family') : profile.name)}</span></label>`).join('');
    const selected = node('smartQuickChild').value;
    node('smartQuickChild').innerHTML = `<option value="${FAMILY_CHILD}">${esc(tx('family'))}</option>${kidProfiles.map(profile => `<option value="${esc(profile.name)}">${esc(profile.name)}</option>`).join('')}`;
    node('smartQuickChild').value = kidProfiles.some(profile => profile.name === selected) ? selected : FAMILY_CHILD;
  }
  function open(value = 'find') {
    opener = document.activeElement; scope = scheduleStorageKey('activities'); options = null; suggestions = [];
    document.getElementById('moreActions').open = false;
    localize(); peopleControls(); setMode(value);
    const today = dateString(new Date());
    node('smartFromDate').value = dateKey(selectedDate) < today ? today : dateKey(selectedDate);
    node('smartFromDate').min = today;
    results.innerHTML = ''; node('smartQuickPreview').hidden = true; node('smartQuickFull').hidden = true; parsedText = '';
    hub.showModal();
  }
  function allEventsNear(date, excludedId = '') {
    return [-1, 0, 1].flatMap(offset => {
      const day = addDateDays(date, offset);
      const external = typeof window !== 'undefined' && window.KidsSyncExternal ? window.KidsSyncExternal.eventsOn(day) : [];
      return [...state.activities.filter(event => event.id !== excludedId && activityOccursOn(event, day)), ...external].map(event => ({ ...event, dayOffset: offset }));
    });
  }
  function rulesFromControls() {
    return { date: node('smartFromDate').value, days: Number(node('smartDayCount').value), duration: Number(node('smartDuration').value),
      earliest: clock(node('smartEarliest').value), latest: clock(node('smartLatest').value), before: bufferMinutes(node('smartBefore').value), after: bufferMinutes(node('smartAfter').value),
      notice: Number(node('smartNotice').value), maxEvents: Number(node('smartMaxEvents').value), maxMinutes: Number(node('smartMaxMinutes').value), people: [...node('smartPeople').querySelectorAll('input:checked')].map(input => input.value) };
  }
  function renderSuggestions() {
    if (!options) return;
    suggestions = findSlots(options, allEventsNear);
    const groups = new Map();
    suggestions.forEach((slot, index) => { if (!groups.has(slot.date)) groups.set(slot.date, []); groups.get(slot.date).push({ slot, index }); });
    results.innerHTML = suggestions.length ? `<p class="smart-note">${esc(tx('count', { count: suggestions.length }))}</p>${[...groups].map(([date, slots]) => `<section class="smart-suggestion-day"><h3>${esc(formatFullDate(localDate(date)))}</h3><div>${slots.map(({ slot, index }) => `<button type="button" class="smart-slot" data-smart-slot="${index}" aria-label="${esc(`${tx('use')} · ${formatFullDate(localDate(date))} · ${formatTimeLabel(slot.start)} – ${formatTimeLabel(slot.end)}`)}"><strong>${esc(formatTimeLabel(slot.start))} – ${esc(formatTimeLabel(slot.end))}</strong><small>${esc(tx('use'))}</small></button>`).join('')}</div></section>`).join('')}` : `<p class="smart-empty">${esc(tx('empty'))}</p>`;
  }
  function checkScope() { if (scope === scheduleStorageKey('activities')) return true; message(tx('stale')); return false; }
  function draftExists() {
    if (!readEventDraft(scheduleStorageKey('event-draft'))) return false;
    message(tx('pending')); node('smartOpenDraft').hidden = false; return true;
  }
  function persistReviewedDraft(baseline, session) {
    // The normal editor defers its defaults baseline to a microtask. These reviewed
    // details are user input, so preserve the empty baseline after that task runs.
    queueMicrotask(() => {
      if (!session || eventDraftSession !== session) return;
      session.baseline = baseline;
      saveNewEventDraft();
    });
  }
  function reviewDraft(draft) {
    if (!checkScope() || draftExists()) return false;
    hub.close(); openDialog();
    if (requireEventDraftChoice()) return false;
    const session = eventDraftSession, baseline = comparableEventDraft(captureEventDraft());
    fields.title.value = draft.title || tx('suggestedTitle'); fields.child.value = draft.child || FAMILY_CHILD;
    fields.date.value = draft.date; fields.start.value = draft.start; fields.end.value = draft.end;
    fields.allDay.checked = false; fields.eventType.value = 'activity'; fields.recurrence.value = 'none';
    fields.location.value = draft.location || ''; fields.notes.value = draft.notes || '';
    fields.bufferBefore.value = String(bufferMinutes(draft.before)); fields.bufferAfter.value = String(bufferMinutes(draft.after));
    renderAttendeeOptions(draft.attendees || (draft.child && draft.child !== FAMILY_CHILD ? [draft.child] : ['all']));
    setIconField(inferredEventDefaults(normalizedEventTitle(fields.title.value))?.icon || '✨');
    // Explicitly reviewed times must not be replaced by title-based defaults.
    smartDefaultsAppliedTitle = normalizedEventTitle(fields.title.value);
    updateAllDayFields(); updateTripDateFields(); updateRecurrenceFields();
    navigateEventFormStep(4); scheduleNewEventDraftSave();
    persistReviewedDraft(baseline, session);
    return true;
  }
  function previewQuick() {
    if (!checkScope()) return;
    const tokens = tokenizeQuickLine(node('smartQuickText').value, dateString(new Date()));
    if (!tokens.original) { node('smartQuickText').focus(); return; }
    parsedText = tokens.original;
    node('smartQuickPreview').hidden = tokens.advanced;
    node('smartQuickFull').hidden = !tokens.advanced;
    if (tokens.advanced) { message(tx('advanced')); return; }
    const time = parseScannedTimes(`Time: ${tokens.time}\n${tokens.duration ? `Duration: ${tokens.duration}` : ''}`);
    node('smartQuickTitle').value = tokens.title; node('smartQuickDate').value = tokens.date;
    node('smartQuickStart').value = time.start || ''; node('smartQuickEnd').value = time.end || ''; node('smartQuickLocation').value = tokens.location;
    message(`${tx('missing')}${time.estimatedEnd ? ` ${tx('estimate')}` : ''}`);
  }
  function updateBufferEditor() {
    if (!fields.bufferBefore) return;
    const beforeLabel = bufferMinutes(fields.bufferBefore.value), afterLabel = bufferMinutes(fields.bufferAfter.value);
    node('eventBufferSummary').textContent = beforeLabel || afterLabel ? tx('bufferValues', { before: beforeLabel, after: afterLabel }) : tx('none');
    fields.bufferBefore.disabled = fields.allDay.checked || fields.eventType.value === 'trip';
    fields.bufferAfter.disabled = fields.bufferBefore.disabled;
    node('eventSaveReviewBody').querySelector('[data-smart-buffer-review]')?.remove();
    if (dialog.open && eventFormStep === 4 && !fields.bufferBefore.disabled && (beforeLabel || afterLabel)) {
      node('eventSaveReviewBody').insertAdjacentHTML('beforeend', `<div class="event-review-row" data-smart-buffer-review><div><dt>${esc(tx('buffer'))}</dt><dd>${esc(tx('bufferValues', { before: beforeLabel, after: afterLabel }))}</dd></div><button type="button" data-event-step-go="2" aria-label="${esc(`${tx('buffer')} · ${tx('before')} / ${tx('after')}`)}">↗</button></div>`);
    }
    const hint = node('bufferConflictHint'); hint.hidden = true;
    if (!dialog.open || eventFormStep !== 2 || fields.bufferBefore.disabled || !localDate(fields.date.value)) return;
    const start = clock(fields.start.value), end = clock(fields.end.value);
    if (start === null || end === null || end <= start) return;
    const named = selectedAttendees().filter(name => name !== 'all');
    const people = fields.child.value === FAMILY_CHILD ? (named.length ? named : [FAMILY_CHILD]) : [fields.child.value, ...named];
    const busy = busyIntervals(allEventsNear(localDate(fields.date.value), fields.id.value), people);
    const before = bufferMinutes(fields.bufferBefore.value), after = bufferMinutes(fields.bufferAfter.value);
    if (roomFor(start, end, busy, before, after)) return;
    // Ordinary overlaps already have the editor's conflict warning. Highlight padding-only clashes here.
    const plain = allEventsNear(localDate(fields.date.value), fields.id.value).map(event => ({ ...event, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, travelMinutes: 0 }));
    if (!roomFor(start, end, busyIntervals(plain, people))) return;
    hint.textContent = tx('bufferConflict'); hint.hidden = false;
  }
  function attachDetails(event) {
    const before = bufferMinutes(event.bufferBeforeMinutes), after = bufferMinutes(event.bufferAfterMinutes);
    if ((!before && !after) || event.allDay || event.eventType === 'trip') return;
    node('eventDetailsBody').querySelector('dl').insertAdjacentHTML('afterend', `<p class="smart-buffer-summary">${esc(tx('savedBuffer', { before, after }))}</p>`);
  }
  function decorateBuffers() {
    grid.querySelectorAll('.smart-time-buffer').forEach(element => element.remove());
    const visible = new Map(visibleActivities().map(event => [occurrenceKey(event), event]));
    grid.querySelectorAll('.day-column > .event').forEach(element => {
      const event = visible.get(element.dataset.occurrenceKey); if (!event) return;
      const start = clock(event.start), end = clock(event.end); if (start === null || end === null) return;
      const before = bufferMinutes(event.bufferBeforeMinutes), after = bufferMinutes(event.bufferAfterMinutes);
      if (before || after) {
        const oldSummary = element.dataset.smartBufferLabel;
        const label = oldSummary ? element.getAttribute('aria-label').replace(` · ${oldSummary}`, '') : element.getAttribute('aria-label');
        const summary = tx('savedBuffer', { before, after });
        element.setAttribute('aria-label', `${label} · ${summary}`); element.dataset.smartBufferLabel = summary;
      }
      [[Math.max(0, start - before), start], [end, Math.min(1440, end + after)]].forEach(([from, to]) => {
        if (to <= from) return;
        const decoration = document.createElement('div'); decoration.className = 'smart-time-buffer'; decoration.setAttribute('aria-hidden', 'true');
        decoration.style.top = `${from / 1440 * 100}%`; decoration.style.height = `${(to - from) * 2 * userSettings.calendarZoom}px`;
        decoration.style.left = element.style.left; decoration.style.right = element.style.right;
        decoration.textContent = tx('bufferShort', { count: to - from }); element.parentElement.appendChild(decoration);
      });
    });
  }
  document.querySelectorAll('[data-open-smart-scheduling]').forEach(button => button.addEventListener('click', () => open(button.dataset.openSmartScheduling)));
  node('closeSmartScheduling').addEventListener('click', () => hub.close());
  hub.addEventListener('close', () => {
    if (document.querySelector('dialog[open]')) return;
    const target = opener?.isConnected && opener.getClientRects().length ? opener : node('moreActions').querySelector('summary'); target.focus({ preventScroll: true });
  });
  document.querySelectorAll('[data-smart-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.smartMode)));
  node('smartSchedulingTabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const buttons = [...node('smartSchedulingTabs').querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    const target = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : buttons[(index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length];
    target.click(); target.focus();
  });
  node('smartFindForm').addEventListener('change', () => { options = null; suggestions = []; results.innerHTML = ''; message(''); localize(); });
  node('smartFindForm').addEventListener('submit', event => {
    event.preventDefault(); if (!checkScope()) return;
    const rules = rulesFromControls();
    if (!rules.people.length) { message(tx('selectPeople')); return; }
    if (!validRules(rules) || rules.date < dateString(new Date())) { message(tx('invalid')); return; }
    options = rules; message(''); renderSuggestions();
  });
  results.addEventListener('click', event => {
    const button = event.target.closest('[data-smart-slot]'); if (!button || !options || !checkScope()) return;
    const slot = suggestions[Number(button.dataset.smartSlot)]; if (!slot) return;
    if (!slotAvailable(slot, options, allEventsNear)) { renderSuggestions(); message(tx('taken')); return; }
    const child = options.people.length === 1 && options.people[0] !== FAMILY_CHILD ? options.people[0] : FAMILY_CHILD;
    reviewDraft({ title: tx('suggestedTitle'), child, date: slot.date, start: clockString(slot.start), end: clockString(slot.end),
      before: options.before, after: options.after, attendees: options.people.includes(FAMILY_CHILD) ? ['all'] : options.people });
  });
  node('smartQuickText').addEventListener('input', () => { parsedText = ''; node('smartQuickPreview').hidden = true; node('smartQuickFull').hidden = true; message(''); });
  node('smartQuickParse').addEventListener('click', previewQuick);
  node('smartQuickExample').addEventListener('click', () => { node('smartQuickText').value = tx('example'); previewQuick(); });
  node('smartQuickPreview').addEventListener('submit', event => {
    event.preventDefault(); if (!checkScope()) return;
    if (!parsedText || parsedText !== node('smartQuickText').value.trim()) { message(tx('changedText')); return; }
    if (node('smartQuickChild').value !== FAMILY_CHILD && !kidProfiles.some(profile => profile.name === node('smartQuickChild').value)) { message(tx('stale')); return; }
    const date = node('smartQuickDate').value, start = clock(node('smartQuickStart').value), end = clock(node('smartQuickEnd').value);
    if (!localDate(date) || start === null || end === null || end <= start) { message(tx('invalid')); return; }
    const realStart = wallTime(date, start), realEnd = wallTime(date, end);
    if (!realStart || !realEnd || (realEnd - realStart) / 60000 !== end - start) { message(tx('invalidLocal')); return; }
    reviewDraft({ title: node('smartQuickTitle').value.trim(), child: node('smartQuickChild').value, date,
      start: clockString(start), end: clockString(end), location: node('smartQuickLocation').value.trim(), notes: parsedText });
  });
  node('smartQuickFull').addEventListener('click', () => {
    if (!checkScope() || draftExists()) return;
    const original = node('smartQuickText').value.trim(); hub.close(); openDialog();
    if (!requireEventDraftChoice()) {
      const session = eventDraftSession, baseline = comparableEventDraft(captureEventDraft());
      fields.notes.value = original; scheduleNewEventDraftSave(); persistReviewedDraft(baseline, session);
    }
  });
  node('smartOpenDraft').addEventListener('click', () => { if (checkScope()) { hub.close(); openDialog(); } });
  form.addEventListener('input', updateBufferEditor); form.addEventListener('change', updateBufferEditor);
  window.KidsSyncScheduler = { open, updateBufferEditor, attachDetails, engine: pure,
    reviewPlan(draft) { return hub.open && reviewDraft(draft); },
    planIsFree(plan) {
      const start = clock(plan.start), end = clock(plan.end), date = localDate(plan.date);
      const realStart = wallTime(plan.date, start), realEnd = wallTime(plan.date, end);
      return Boolean(date && start !== null && end !== null && realStart && realEnd && end > start && realStart > new Date()
        && (realEnd - realStart) / 60000 === end - start && roomFor(start, end, busyIntervals(allEventsNear(date), plan.people)));
    }, refresh() {
    localize(); decorateBuffers(); updateBufferEditor();
    if (hub.open && !checkScope()) { suggestions = []; results.innerHTML = ''; return; }
    if (hub.open && options?.people.some(person => person !== FAMILY_CHILD && !kidProfiles.some(profile => profile.name === person))) {
      options = null; suggestions = []; results.innerHTML = ''; peopleControls(); message(tx('stale')); return;
    }
    if (hub.open && options) renderSuggestions();
    if (hub.open && mode === 'poll') window.KidsSyncPolls?.refresh();
  } };
  window.KidsSyncScheduler.refresh();
})();
