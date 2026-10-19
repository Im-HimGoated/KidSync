(() => {
  'use strict';

  const labels = {
    en: {
      nav: 'Quick calendar navigation', next: 'Next event', nextHint: 'Jump to next event: {event}',
      date: 'Go to date', time: 'Jump to time', chooseTime: 'Choose time',
      now: 'Now', morning: 'Morning', noon: 'Noon', evening: 'Evening', midnight: 'Midnight',
      hideSide: 'Hide mini calendar', showSide: 'Show mini calendar',
      viewer: 'Can view the calendar. Cannot edit events or comment.',
      commenter: 'Can view the calendar and comment. Cannot edit events.',
      editor: 'Can view, add, and edit events.'
    },
    zh: {
      nav: '日历快捷导航', next: '下一个活动', nextHint: '跳转到下一个活动：{event}',
      date: '前往日期', time: '跳转到时间', chooseTime: '选择时间',
      now: '现在', morning: '早上', noon: '中午', evening: '晚上', midnight: '午夜',
      hideSide: '隐藏迷你日历', showSide: '显示迷你日历',
      viewer: '可以查看日历，不能编辑活动或发表评论。',
      commenter: '可以查看日历并发表评论，不能编辑活动。',
      editor: '可以查看、添加和编辑活动。'
    }
  };
  const language = () => document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
  const text = (key, values = {}) => labels[language()][key].replace(/\{(\w+)\}/g, (_, name) => values[name] || '');
  const shell = document.getElementById('appShell');
  const nav = document.getElementById('quickCalendarNav');
  const next = document.getElementById('quickNextEvent');
  const nextLabel = document.getElementById('quickNextEventLabel');
  const date = document.getElementById('quickDate');
  const time = document.getElementById('quickTime');
  const side = document.getElementById('quickSideToggle');
  const role = document.getElementById('memberRole');
  const roleHint = document.getElementById('memberRoleHint');

  function updateSide() {
    const visible = !shell.classList.contains('panels-hide-side');
    side.setAttribute('aria-pressed', String(visible));
    side.setAttribute('aria-label', text(visible ? 'hideSide' : 'showSide'));
    side.querySelector('[data-quick-text]').dataset.quickText = visible ? 'hideSide' : 'showSide';
    side.querySelector('[data-quick-text]').textContent = text(visible ? 'hideSide' : 'showSide');
  }

  function localize() {
    document.querySelectorAll('[data-quick-text]').forEach(node => { node.textContent = text(node.dataset.quickText); });
    nav.setAttribute('aria-label', text('nav'));
    date.setAttribute('aria-label', text('date'));
    time.setAttribute('aria-label', text('time'));
    const roleDescription = text(['viewer', 'commenter', 'editor'].includes(role.value) ? role.value : 'viewer');
    if (roleHint.textContent !== roleDescription) roleHint.textContent = roleDescription;
    updateSide();
  }

  function refresh() {
    const source = document.getElementById('jumpNextEvent');
    const title = document.getElementById('overviewNextEvent').textContent.trim();
    next.hidden = source.disabled || !title;
    if (!next.hidden) {
      nextLabel.textContent = title;
      next.setAttribute('aria-label', text('nextHint', { event: title }));
      next.title = text('nextHint', { event: title });
    }
    date.value = dateKey(selectedDate);
    time.parentElement.hidden = !['week', 'four'].includes(currentView);
    localize();
  }

  next.addEventListener('click', () => document.getElementById('jumpNextEvent').click());
  date.addEventListener('change', () => {
    if (!date.value || !date.validity.valid) { date.reportValidity(); return; }
    const picker = document.getElementById('periodDatePicker');
    picker.value = date.value;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });
  time.addEventListener('change', () => {
    const now = new Date();
    const minute = time.value === 'now' ? now.getHours() * 60 + now.getMinutes() : Number(time.value);
    if (Number.isFinite(minute)) window.KidsSyncUI?.jumpToMinute(minute, { focusReturn: false });
    time.value = '';
    time.focus({ preventScroll: true });
  });
  side.addEventListener('click', () => {
    document.querySelector('[data-panel-toggle="side"]').click();
    updateSide();
  });
  role.addEventListener('change', () => { roleHint.textContent = text(role.value); });
  new MutationObserver(updateSide).observe(shell, { attributes: true, attributeFilter: ['class'] });
  window.KidsSyncQuick = { localize, refresh };
  refresh();
})();
