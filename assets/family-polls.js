/* Doodle-inspired, device-local family votes. No public poll links or automatic bookings. */
(() => {
  const engine = typeof module !== 'undefined' && module.exports ? require('./smart-scheduling.js') : window.KidsSyncScheduler.engine;
  const answers = ['pending', 'yes', 'maybe', 'no'];
  function normalizePoll(value) {
    if (!value || value.version !== 1 || typeof value.id !== 'string' || !value.id || value.id.length > 100 || typeof value.title !== 'string' || !value.title.trim() || !Array.isArray(value.people)) return null;
    const people = value.people.filter(name => typeof name === 'string').map(name => name.trim().slice(0, 40));
    if (!people.length || people.length > 8 || people.some(name => !name) || new Set(people).size !== people.length) return null;
    const seen = new Set(), slots = new Set();
    const options = (Array.isArray(value.options) ? value.options : []).filter(option => {
      if (!option || typeof option.id !== 'string' || !option.id || option.id.length > 100 || seen.has(option.id) || !engine.localDate(option.date)) return false;
      const start = engine.clock(option.start), end = engine.clock(option.end);
      const from = engine.wallTime(option.date, start), to = engine.wallTime(option.date, end);
      const key = `${option.date}:${option.start}:${option.end}`;
      if (start === null || end === null || end <= start || !from || !to || (to - from) / 60000 !== end - start || slots.has(key)) return false;
      seen.add(option.id); slots.add(key); return true;
    }).slice(0, 5).map(option => ({ id: option.id.slice(0, 100), date: option.date, start: option.start, end: option.end,
      votes: people.map((_, i) => answers.includes(option.votes?.[i]) ? option.votes[i] : 'pending') }));
    return { version: 1, id: value.id.slice(0, 100), title: value.title.trim().slice(0, 100), people, options };
  }
  function voteTotals(option) {
    const counts = { yes: 0, maybe: 0, no: 0, pending: 0 };
    for (const answer of option.votes) counts[answers.includes(answer) ? answer : 'pending']++;
    return { ...counts, ready: option.votes.length > 0 && !counts.no && !counts.pending };
  }
  function preferredOptions(poll) {
    const ready = poll.options.filter(option => voteTotals(option).ready);
    const best = Math.max(-1, ...ready.map(option => voteTotals(option).yes));
    return ready.filter(option => voteTotals(option).yes === best).map(option => option.id);
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { normalizePoll, voteTotals, preferredOptions }; return; }

  const words = {
    en: {
      intro: 'Compare up to 5 times and record everyone’s answers together.',
      local: 'One poll per calendar, saved only on this device. Responses are entered manually, not sent to other people or synced as a live poll.',
      name: 'What are you planning?', people: 'Participants — one name per line, up to 8', create: 'Create poll',
      date: 'Date', start: 'Starts', end: 'Ends', add: 'Add time option', yes: 'Yes', maybe: 'If needed', no: 'No', pending: 'Not answered',
      totals: '{yes} yes · {maybe} if needed · {no} no · {pending} awaiting', preferred: 'Most preferred',
      review: 'Review this time', voteFirst: 'Record Yes or If needed for everyone before reviewing a time.',
      copy: 'Copy options', copied: 'Options copied. Send them yourself and record the replies here.', manual: 'Select and copy the text below.',
      remove: 'Remove option', reset: 'Reset poll', confirm: 'Reset this poll? You can undo the change here.', resetNow: 'Reset now', keep: 'Keep poll', undo: 'Undo last change',
      invalid: 'Enter a plan name and 1–8 different participant names.', invalidTime: 'Choose a future date and valid start/end times on the same day. Clock-changing intervals are not supported.',
      duplicate: 'That time is already an option.', max: 'You can compare up to 5 times. Remove an option to add another.',
      failed: 'Could not save on this device. Your previous poll is unchanged.', stale: 'The calendar or poll changed. Reopen Family poll before continuing.',
      clash: 'This time now overlaps a saved plan or buffer for a recognized child. Try another option or use Find family time.',
      calendarHint: 'Before review, saved plans and buffers are checked for participant names matching your children. Other participants’ availability relies on the answers recorded here. Nothing is booked automatically.',
      option: 'Option {n}', response: '{person} — {time}', noOptions: 'Add a couple of times to start comparing.', saved: 'Saved on this device.',
      copiedTitle: 'Please reply Yes, If needed, or No for each option. This is a text shortlist, not a live voting link.', restored: 'Previous poll restored.'
    },
    zh: {
      intro: '比较最多 5 个时段，一起记录每个人的答复。',
      local: '每个日历一个投票，仅保存在此设备。答复需手动记录，不会发送给其他人，也不是实时同步投票。',
      name: '计划名称', people: '参与者 — 每行一个姓名，最多 8 位', create: '创建投票',
      date: '日期', start: '开始', end: '结束', add: '添加候选时段', yes: '可以', maybe: '必要时可以', no: '不可以', pending: '尚未答复',
      totals: '{yes} 可以 · {maybe} 必要时可以 · {no} 不可以 · {pending} 待答复', preferred: '最受欢迎',
      review: '检查此时段', voteFirst: '请为每位参与者记录“可以”或“必要时可以”后，再检查时段。',
      copy: '复制候选时段', copied: '已复制，请自行发送，并在此记录答复。', manual: '请选中并复制下方文字。',
      remove: '移除候选时段', reset: '重置投票', confirm: '要重置此投票吗？可在此撤销操作。', resetNow: '立即重置', keep: '保留投票', undo: '撤销上次更改',
      invalid: '请输入计划名称和 1–8 个不同的参与者姓名。', invalidTime: '请选择未来日期和同一天内有效的开始与结束时间，不支持跨越时钟调整的时段。',
      duplicate: '此时段已在候选列表中。', max: '最多比较 5 个时段，请先移除一个再添加。',
      failed: '无法保存到此设备，原投票保持不变。', stale: '日历或投票已更改，请重新打开家庭投票。',
      clash: '此时段与已识别孩子的已存安排或缓冲重叠，请选择其他时段，或使用空闲时间查找。',
      calendarHint: '检查前，会为姓名与孩子资料相同的参与者检查已存安排和缓冲。其他参与者的空闲情况取决于此处记录的答复，不会自动预约。',
      option: '候选 {n}', response: '{person} — {time}', noOptions: '请先添加几个时段进行比较。', saved: '已保存到此设备。',
      copiedTitle: '请为每个候选时段回复“可以”“必要时可以”或“不可以”。这是文字列表，并非实时投票链接。', restored: '已恢复原投票。'
    }
  };
  const tx = (key, values = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const panel = document.getElementById('smartPollPanel');
  const hub = document.getElementById('smartSchedulingDialog');
  const key = () => scheduleStorageKey('family-poll-v1');
  let origin = '', undo = null, resetConfirm = false;
  function read() { try { return normalizePoll(JSON.parse(localStorage.getItem(key()))); } catch { return null; } }
  function status(message) { panel.querySelector('#familyPollStatus').textContent = message; }
  function validOrigin() { return origin === scheduleStorageKey('activities'); }
  function current() {
    if (!validOrigin()) { status(tx('stale')); return null; }
    const poll = read();
    if ((poll?.id || '') !== panel.dataset.pollId) { render(); status(tx('stale')); return null; }
    return poll;
  }
  function store(next, remember = true) {
    if (!validOrigin()) { status(tx('stale')); return false; }
    const before = read();
    try {
      if (next) localStorage.setItem(key(), JSON.stringify(next)); else localStorage.removeItem(key());
      if (remember) undo = { poll: before, origin };
      resetConfirm = false; render(); status(tx('saved')); return true;
    } catch { status(tx('failed')); return false; }
  }
  const timeText = option => `${formatFullDate(engine.localDate(option.date))} · ${formatTimeLabel(engine.clock(option.start))} – ${formatTimeLabel(engine.clock(option.end))}`;
  function plainText(poll) {
    return [poll.title, tx('copiedTitle'), ...poll.options.map((option, i) => `${i + 1}. ${timeText(option)}`),
      poll.people.join(' · '), Intl.DateTimeFormat().resolvedOptions().timeZone].join('\n');
  }
  function render() {
    if (!validOrigin()) return;
    const previous = Object.fromEntries([...panel.querySelectorAll('form input, form textarea')].map(input => [input.id, input.value]));
    const addWasOpen = panel.querySelector('#pollAddTime')?.open;
    const poll = read(), preferred = poll ? preferredOptions(poll) : [];
    panel.dataset.pollId = poll?.id || '';
    panel.innerHTML = `<p class="smart-note">${esc(tx('intro'))}</p><p class="poll-local">${esc(tx('local'))}</p>${poll ? `
      <div class="poll-heading"><h3>${esc(poll.title)}</h3><button type="button" class="ghost-btn" data-poll-reset>${esc(tx('reset'))}</button></div>
      ${resetConfirm ? `<div class="poll-confirm"><p>${esc(tx('confirm'))}</p><button class="ghost-btn" type="button" data-poll-reset-now>${esc(tx('resetNow'))}</button><button class="ghost-btn" type="button" data-poll-keep>${esc(tx('keep'))}</button></div>` : ''}
      <div class="poll-options">${poll.options.length ? poll.options.map((option, i) => {
        const totals = voteTotals(option), time = timeText(option);
        return `<article class="poll-option"><div class="poll-option-heading"><h4>${esc(tx('option', { n: i + 1 }))}</h4>${preferred.includes(option.id) ? `<span class="poll-best">${esc(tx('preferred'))}</span>` : ''}</div><p class="poll-time">${esc(time)}</p>
          <div class="poll-votes">${poll.people.map((person, p) => `<label for="pollVote-${i}-${p}"><span>${esc(person)}</span><select id="pollVote-${i}-${p}" data-poll-option="${esc(option.id)}" data-poll-person="${p}" aria-label="${esc(tx('response', { person, time }))}">${answers.map(answer => `<option value="${answer}"${answer === option.votes[p] ? ' selected' : ''}>${esc(tx(answer))}</option>`).join('')}</select></label>`).join('')}</div>
          <p class="smart-note">${esc(tx('totals', totals))}</p><div class="poll-actions"><button class="primary-btn" type="button" data-poll-review="${esc(option.id)}"${totals.ready ? '' : ' disabled'}>${esc(tx('review'))}</button><button class="ghost-btn" type="button" data-poll-remove="${esc(option.id)}">${esc(tx('remove'))}</button></div></article>`;
      }).join('') : `<p class="smart-note">${esc(tx('noOptions'))}</p>`}</div>
      <details class="smart-rules" id="pollAddTime"${!poll.options.length || addWasOpen ? ' open' : ''}><summary>${esc(tx('add'))}</summary><form id="pollOptionForm"><div class="smart-field-grid"><label class="smart-full-row" for="pollDate">${esc(tx('date'))}<input type="date" id="pollDate" min="${engine.dateString(new Date())}" max="9999-12-31" required></label><label for="pollStart">${esc(tx('start'))}<input type="time" id="pollStart" value="17:00" required></label><label for="pollEnd">${esc(tx('end'))}<input type="time" id="pollEnd" value="18:00" required></label></div><button class="ghost-btn" type="submit"${poll.options.length >= 5 ? ' disabled' : ''}>${esc(tx('add'))}</button></form></details>
      <p class="smart-note">${esc(tx('voteFirst'))}</p><p class="smart-note">${esc(tx('calendarHint'))}</p>
      <button class="ghost-btn" type="button" data-poll-copy${poll.options.length ? '' : ' disabled'}>${esc(tx('copy'))}</button><textarea id="pollCopyText" rows="5" readonly aria-label="${esc(tx('copy'))}" hidden></textarea>
      ` : `<form id="pollCreateForm"><label for="pollPlanTitle">${esc(tx('name'))}<input id="pollPlanTitle" type="text" maxlength="100" required></label><label for="pollParticipants">${esc(tx('people'))}<textarea id="pollParticipants" rows="3" maxlength="400" required>${esc(kidProfiles.map(profile => profile.name).join('\n'))}</textarea></label><button class="primary-btn" type="submit">${esc(tx('create'))}</button></form>`}
      ${undo?.origin === origin ? `<button class="ghost-btn" type="button" data-poll-undo>${esc(tx('undo'))}</button>` : ''}<p id="familyPollStatus" role="status" aria-live="polite"></p>`;
    if (poll) panel.querySelector('#pollDate').value = engine.dateString(selectedDate) < engine.dateString(new Date()) ? engine.dateString(new Date()) : engine.dateString(selectedDate);
    for (const [id, value] of Object.entries(previous)) { const input = document.getElementById(id); if (panel.contains(input)) input.value = value; }
  }
  panel.addEventListener('submit', event => {
    event.preventDefault();
    if (!validOrigin()) { status(tx('stale')); return; }
    if (event.target.id === 'pollCreateForm') {
      if (read()) { render(); status(tx('stale')); return; }
      const poll = normalizePoll({ version: 1, id: makeId('poll'), title: panel.querySelector('#pollPlanTitle').value,
        people: panel.querySelector('#pollParticipants').value.split('\n').filter(name => name.trim()), options: [] });
      if (!poll) { status(tx('invalid')); return; }
      if (store(poll)) panel.querySelector('#pollDate').focus();
    } else if (event.target.id === 'pollOptionForm') {
      const poll = current(); if (!poll) return;
      if (poll.options.length >= 5) { status(tx('max')); return; }
      const date = panel.querySelector('#pollDate').value, start = panel.querySelector('#pollStart').value, end = panel.querySelector('#pollEnd').value;
      const option = { id: makeId('poll-time'), date, start, end, votes: poll.people.map(() => 'pending') };
      const validated = normalizePoll({ ...poll, options: [option] });
      if (!validated?.options.length || engine.wallTime(date, engine.clock(start)) <= new Date()) { status(tx('invalidTime')); return; }
      if (poll.options.some(item => item.date === date && item.start === start && item.end === end)) { status(tx('duplicate')); return; }
      if (store({ ...poll, options: [...poll.options, option] })) panel.querySelector('#pollDate').focus();
    }
  });
  panel.addEventListener('change', event => {
    if (!event.target.matches('[data-poll-option]')) return;
    const poll = current(); if (!poll) return;
    const option = poll.options.find(option => option.id === event.target.dataset.pollOption), person = Number(event.target.dataset.pollPerson);
    if (!option || !Number.isInteger(person) || person < 0 || person >= poll.people.length || !answers.includes(event.target.value)) return;
    option.votes[person] = event.target.value;
    const id = event.target.id;
    if (store(poll)) document.getElementById(id)?.focus({ preventScroll: true });
  });
  panel.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (!validOrigin()) { status(tx('stale')); return; }
    if (button.hasAttribute('data-poll-undo')) {
      if (undo?.origin !== origin) return;
      const previous = undo;
      if (store(previous.poll, false)) { undo = null; render(); status(tx('restored')); }
      return;
    }
    const poll = current(); if (!poll) return;
    if (button.hasAttribute('data-poll-reset')) { resetConfirm = true; render(); panel.querySelector('[data-poll-reset-now]').focus(); }
    if (button.hasAttribute('data-poll-keep')) { resetConfirm = false; render(); panel.querySelector('[data-poll-reset]').focus(); }
    if (button.hasAttribute('data-poll-reset-now')) { if (store(null)) panel.querySelector('#pollPlanTitle').focus(); }
    if (button.dataset.pollRemove) {
      if (store({ ...poll, options: poll.options.filter(option => option.id !== button.dataset.pollRemove) })) panel.querySelector('#pollDate').focus();
    }
    if (button.hasAttribute('data-poll-copy')) {
      const text = plainText(poll);
      try { await navigator.clipboard.writeText(text); if (validOrigin()) status(tx('copied')); }
      catch { if (!validOrigin()) return; const field = panel.querySelector('#pollCopyText'); field.hidden = false; field.value = text; field.focus(); field.select(); status(tx('manual')); }
    }
    if (button.dataset.pollReview) {
      const option = poll.options.find(option => option.id === button.dataset.pollReview); if (!option || !voteTotals(option).ready) { status(tx('voteFirst')); return; }
      const people = poll.people.filter(person => kidProfiles.some(profile => profile.name === person));
      const plan = { ...option, people };
      if (engine.wallTime(plan.date, engine.clock(plan.start)) <= new Date()) { status(tx('invalidTime')); return; }
      if (people.length && !window.KidsSyncScheduler.planIsFree(plan)) { status(tx('clash')); return; }
      const success = window.KidsSyncScheduler.reviewPlan({ ...plan, title: poll.title, child: people.length === 1 ? people[0] : FAMILY_CHILD,
        attendees: people.length ? people : ['all'], notes: `${plainText(poll)}\n\n${poll.people.map((person, i) => `${person}: ${tx(option.votes[i])}`).join('\n')}` });
      if (!success) status(document.getElementById('smartSchedulingStatus').textContent || tx('stale'));
    }
  });
  window.KidsSyncPolls = {
    open(scope) { if (origin !== scope) undo = null; origin = scope; resetConfirm = false; render(); },
    refresh() { if (hub.open && !panel.hidden) { if (validOrigin()) render(); else status(tx('stale')); } }
  };
})();
