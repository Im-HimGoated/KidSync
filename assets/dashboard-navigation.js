/* Keep a growing dashboard easy to navigate, personalize, and return to. */
(() => {
  'use strict';
  const sections = ['today', 'attention', 'priority', 'prep', 'handoffs', 'outlook', 'special'];
  function preferencesFor(value) {
    return { collapsed: [...new Set(Array.isArray(value?.collapsed) ? value.collapsed.filter(key => sections.includes(key)) : [])] };
  }
  function nextPlan(model) {
    return model.near.find(event => !event.allDay && event.eventType !== 'holiday') || model.near[0] || model.special[0] || null;
  }
  function countdownPhase(bounds, now) { return bounds.start <= now ? 'ends' : bounds.start - now < 60000 ? 'soon' : 'begins'; }
  const pure = { preferencesFor, nextPlan, countdownPhase, sections };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }
  const words = {
    en: {
      today: 'Today', attention: 'Attention', priority: 'Important', prep: 'Prepare', handoffs: 'Handoffs', outlook: 'Four weeks', special: 'Special dates',
      jump: 'Jump to a dashboard section', next: 'Next up', ongoing: 'Happening now', soon: 'Starting soon', begins: 'Begins {time}', ends: 'Ends {time}',
      open: 'Open {title}', empty: 'Make room for your next plan', add: 'Quick Add', sections: 'Sections', expand: 'Expand all', collapse: 'Collapse all',
      saved: 'Section preferences saved for this calendar on this device.', session: 'Storage is unavailable. Section choices are kept for this session only.',
      changed: 'The calendar changed. Choose a plan from the updated dashboard.', preferences: 'Dashboard sections', sectionCount: '{section}, {count} plans',
      one: '{section}, 1 plan', top: 'Back to overview', hint: 'Choose a section to open it and jump there.'
    },
    zh: {
      today: '今天', attention: '需留意', priority: '重要安排', prep: '准备', handoffs: '家庭分工', outlook: '四周概览', special: '特别日期',
      jump: '跳转到概览版块', next: '下一项安排', ongoing: '正在进行', soon: '即将开始', begins: '{time}开始', ends: '{time}结束',
      open: '打开{title}', empty: '为下一项安排留一点空间', add: '快速添加', sections: '版块', expand: '展开全部', collapse: '收起全部',
      saved: '已为此设备上的当前日历保存版块偏好。', session: '无法使用设备存储，版块选择仅在本次使用期间保留。',
      changed: '日历已切换，请从更新后的概览中选择安排。', preferences: '概览版块', sectionCount: '{section}，{count} 项安排',
      one: '{section}，1 项安排', top: '返回概览', hint: '选择版块，即可展开并跳转。'
    }
  };
  const text = (key, values = {}) => (words[currentLanguage] || words.en)[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  const esc = value => escapeHtml(String(value ?? ''));
  const page = document.getElementById('dashboardPage');
  const panels = new Map(sections.map(key => [key, page.querySelector(`[data-dashboard-section="${key}"]`)]));
  panels.forEach((panel, key) => { panel.id = `dashboardSection-${key}`; });
  const engine = window.KidsSyncDashboard.engine;
  const memory = new Map();
  let preferenceScope = '', preferences = preferencesFor(null), next = null, opener = null, currentSection = '', scrollFrame = false;
  const scope = () => scheduleStorageKey('dashboard-sections-v1');
  const bar = document.createElement('section');
  bar.id = 'dashboardWayfinding'; bar.className = 'dashboard-wayfinding';
  bar.innerHTML = `<div class="dashboard-wayfinding-top"><button type="button" class="dashboard-next-plan" data-dashboard-next></button><details class="dashboard-section-menu"><summary></summary><div><p data-dashboard-menu-hint></p><button type="button" data-dashboard-sections="expand"></button><button type="button" data-dashboard-sections="collapse"></button></div></details></div><nav class="dashboard-section-links">${sections.map(key => `<button type="button" data-dashboard-jump="${key}"><span data-dashboard-link-label></span><span class="dashboard-section-count" aria-hidden="true"></span></button>`).join('')}</nav><p class="sr-only" role="status" aria-live="polite" data-dashboard-status></p>`;
  document.getElementById('dashboardNow').before(bar);
  const menu = bar.querySelector('.dashboard-section-menu'), status = bar.querySelector('[data-dashboard-status]');
  function applyPreferences() {
    panels.forEach((panel, key) => { panel.open = !preferences.collapsed.includes(key); });
  }
  function ensureScope() {
    const key = scope();
    if (key === preferenceScope) return;
    preferenceScope = key; opener = null;
    if (memory.has(key)) preferences = memory.get(key);
    else {
      try { preferences = preferencesFor(JSON.parse(localStorage.getItem(key))); } catch { preferences = preferencesFor(null); }
      memory.set(key, preferences);
    }
    applyPreferences(); status.textContent = '';
  }
  function savePreferences() {
    preferences = { collapsed: sections.filter(key => !panels.get(key).open) };
    memory.set(preferenceScope, preferences);
    let message = 'saved';
    try { localStorage.setItem(preferenceScope, JSON.stringify(preferences)); } catch { message = 'session'; }
    status.textContent = text(message);
  }
  function localize() {
    bar.setAttribute('aria-label', text('preferences'));
    bar.querySelector('nav').setAttribute('aria-label', text('jump'));
    menu.querySelector('summary').textContent = text('sections');
    menu.querySelector('[data-dashboard-menu-hint]').textContent = text('hint');
    bar.querySelector('[data-dashboard-sections="expand"]').textContent = text('expand');
    bar.querySelector('[data-dashboard-sections="collapse"]').textContent = text('collapse');
  }
  function renderNext(model) {
    next = nextPlan(model);
    const button = bar.querySelector('[data-dashboard-next]');
    if (!next) {
      button.innerHTML = `<span class="dashboard-next-icon" aria-hidden="true">＋</span><span><small>${esc(text('empty'))}</small><strong>${esc(text('add'))}</strong></span>`;
      button.setAttribute('aria-label', text('add')); return;
    }
    const bounds = engine.eventBounds(next), now = new Date(), begun = bounds.start <= now.getTime();
    const when = text(countdownPhase(bounds, now.getTime()), { time: formatRelativeTime(new Date(begun ? bounds.end : bounds.start), now) });
    button.innerHTML = `<span class="dashboard-next-icon" aria-hidden="true">${esc(displayIcon(next))}</span><span class="dashboard-next-copy"><small>${esc(text(begun ? 'ongoing' : 'next'))} · ${esc(when)}</small><strong>${esc(activityCompactTitle(next))}</strong><span>${esc([displayChild(next), next.location, next.responsible].filter(Boolean).join(' · '))}</span></span><span aria-hidden="true">↗</span>`;
    button.setAttribute('aria-label', `${text('open', { title: activityTitle(next) })} · ${when}`);
  }
  function refresh(model) {
    ensureScope(); localize(); renderNext(model);
    const counts = { today: model.todayRemaining.length, attention: Number(panels.get('attention').querySelector('[data-plan-eyebrow]').textContent) || 0,
      priority: model.priorities.length, prep: model.prep.length, handoffs: model.near.filter(event => !event.isBuiltInHoliday && !event.externalSource).length, special: model.special.length };
    sections.forEach(key => {
      const button = bar.querySelector(`[data-dashboard-jump="${key}"]`), count = counts[key];
      button.hidden = panels.get(key).hidden;
      button.querySelector('[data-dashboard-link-label]').textContent = text(key);
      const badge = button.querySelector('.dashboard-section-count');
      badge.textContent = String(count ?? ''); badge.hidden = !count;
      button.setAttribute('aria-controls', panels.get(key).id);
      button.setAttribute('aria-label', count === undefined ? text(key) : text(count === 1 ? 'one' : 'sectionCount', { section: text(key), count }));
    });
    requestAnimationFrame(updateActive);
  }
  function markActive(key) {
    if (!key || currentSection === key) return;
    currentSection = key;
    bar.querySelectorAll('[data-dashboard-jump]').forEach(button => {
      if (button.dataset.dashboardJump === key) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
    });
    const link = bar.querySelector(`[data-dashboard-jump="${key}"]`), nav = bar.querySelector('nav');
    const linkRect = link.getBoundingClientRect(), navRect = nav.getBoundingClientRect();
    if (linkRect.left < navRect.left || linkRect.right > navRect.right) {
      nav.scrollTo({ left: nav.scrollLeft + linkRect.left - navRect.left - (nav.clientWidth - linkRect.width) / 2, behavior: 'auto' });
    }
  }
  function updateActive() {
    if (page.hidden) return;
    const edge = bar.getBoundingClientRect().bottom;
    const candidates = [...panels.entries()].filter(([, panel]) => !panel.hidden && panel.getBoundingClientRect().bottom > edge + 10);
    const current = panels.get(currentSection), rect = current?.getBoundingClientRect();
    if (current && !current.hidden && rect.top <= edge + 60 && rect.bottom > edge + 10) return;
    const key = candidates.sort((a, b) => Math.abs(a[1].getBoundingClientRect().top - edge) - Math.abs(b[1].getBoundingClientRect().top - edge))[0]?.[0];
    markActive(key);
  }
  function jump(key) {
    const panel = panels.get(key);
    if (!panel || panel.hidden) return;
    menu.open = false; panel.open = true; savePreferences();
    const summary = panel.querySelector('summary');
    summary.focus({ preventScroll: true });
    panel.scrollIntoView({ block: 'start', behavior: userSettings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    markActive(key);
  }
  bar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (preferenceScope !== scope()) { window.KidsSyncDashboard.refresh(); status.textContent = text('changed'); return; }
    if (button.hasAttribute('data-dashboard-next')) {
      menu.open = false; opener = { scope: scope(), next: true, scroll: { top: window.scrollY, left: window.scrollX } };
      if (next) showEventDetails(next); else window.KidsSyncScheduler.open('quick');
    } else if (button.dataset.dashboardJump) jump(button.dataset.dashboardJump);
    else if (button.dataset.dashboardSections) {
      const expand = button.dataset.dashboardSections === 'expand';
      panels.forEach(panel => { panel.open = expand; });
      page.querySelectorAll('.dashboard-panel .dashboard-collapse').forEach(toggle => {
        if ((toggle.getAttribute('aria-expanded') === 'true') !== expand) toggle.click();
      });
      savePreferences(); menu.open = false; menu.querySelector('summary').focus({ preventScroll: true });
    }
  });
  page.addEventListener('click', event => {
    const summary = event.target.closest('.dashboard-planning-panel > summary');
    if (summary) {
      const key = scope();
      requestAnimationFrame(() => { if (key === preferenceScope) savePreferences(); });
    }
    const button = event.target.closest('[data-dashboard-event]');
    if (button?.dataset.dashboardKey) opener = { scope: scope(), section: button.closest('[data-dashboard-section]').dataset.dashboardSection, key: button.dataset.dashboardKey, scroll: { top: window.scrollY, left: window.scrollX } };
  }, true);
  document.addEventListener('close', () => {
    if (!opener) return;
    if (page.hidden || opener.scope !== scope()) { opener = null; return; }
    if (document.querySelector('dialog[open]')) return;
    const target = opener; opener = null;
    requestAnimationFrame(() => {
      if (page.hidden || target.scope !== scope() || document.querySelector('dialog[open]')) return;
      const panel = panels.get(target.section);
      const button = target.next ? bar.querySelector('[data-dashboard-next]')
        : panel && !panel.hidden ? panel.open ? [...panel.querySelectorAll('[data-dashboard-key]')].find(node => node.dataset.dashboardKey === target.key) || panel.querySelector('summary') : panel.querySelector('summary') : bar.querySelector('[data-dashboard-jump="today"]');
      button?.focus({ preventScroll: true });
      if (target.scroll) window.scrollTo({ ...target.scroll, behavior: 'auto' });
    });
  }, true);
  document.addEventListener('pointerdown', event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault(); event.stopPropagation(); menu.open = false; menu.querySelector('summary').focus({ preventScroll: true });
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== scope()) return;
    try {
      preferences = preferencesFor(JSON.parse(event.newValue)); memory.set(scope(), preferences); preferenceScope = scope(); applyPreferences();
    } catch { /* Keep the current choices when another tab writes invalid data. */ }
  });
  const mobile = matchMedia('(max-width: 980px)');
  function orderForScreen() {
    const priority = document.getElementById('dashboardPlanSide');
    if (mobile.matches) document.getElementById('dashboardPlanMain').before(priority);
    else page.querySelector('.dashboard-side-column').prepend(priority);
  }
  mobile.addEventListener('change', orderForScreen); orderForScreen();
  document.addEventListener('scroll', () => {
    if (page.hidden || scrollFrame) return;
    scrollFrame = true;
    requestAnimationFrame(() => { scrollFrame = false; updateActive(); });
  }, { passive: true });
  window.KidsSyncDashboardUX = { refresh };
  window.KidsSyncDashboard.refresh();
})();
