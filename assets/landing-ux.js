/* Landing-page interactions are isolated from calendar data and preferences. */
(() => {
  'use strict';
  const screen = document.getElementById('welcomeScreen');
  if (!screen) return;
  const menu = document.getElementById('welcomeMenuToggle');
  const navigation = document.getElementById('welcomeSections');
  const filters = [...screen.querySelectorAll('[data-sample-person]')];
  const plans = [...screen.querySelectorAll('[data-sample-owner]')];
  const days = [...screen.querySelectorAll('.welcome-preview-day')];
  let selectedPerson = 'all';

  function closeMenu({ returnFocus = false } = {}) {
    menu.setAttribute('aria-expanded', 'false');
    screen.classList.remove('welcome-menu-open');
    if (returnFocus) menu.focus();
  }

  function filterSample(person) {
    selectedPerson = filters.some(button => button.dataset.samplePerson === person) ? person : 'all';
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.samplePerson === selectedPerson)));
    let count = 0;
    plans.forEach(plan => {
      plan.hidden = selectedPerson !== 'all' && plan.dataset.sampleOwner !== selectedPerson;
      if (!plan.hidden) count++;
    });
    days.forEach(day => {
      day.querySelector('.welcome-sample-empty').hidden = [...day.querySelectorAll('[data-sample-owner]')].some(plan => !plan.hidden);
    });
    document.getElementById('welcomeSampleCount').textContent = t('welcome.sampleCount', { count });
  }

  screen.classList.add('landing-enhanced');
  menu.hidden = false;
  menu.addEventListener('click', () => {
    const opening = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(opening));
    screen.classList.toggle('welcome-menu-open', opening);
  });
  navigation.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    closeMenu();
    // Move keyboard focus with the destination instead of leaving it in a hidden menu.
    const destination = document.getElementById(link.getAttribute('href').slice(1));
    if (destination) {
      destination.setAttribute('tabindex', '-1');
      destination.focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', event => {
    if (!navigation.contains(event.target) && !menu.contains(event.target)) closeMenu();
  });
  screen.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      closeMenu({ returnFocus: true });
    }
  });
  filters.forEach(button => button.addEventListener('click', () => filterSample(button.dataset.samplePerson)));
  screen.querySelectorAll('[data-welcome-start]').forEach(button => button.addEventListener('click', showGuestPreview));
  screen.querySelectorAll('[data-welcome-signin]').forEach(button => button.addEventListener('click', () => {
    closeMenu();
    showAuthScreen('signin');
  }));

  // Only observe the landing page's language/visibility, never calendar state.
  const observer = new MutationObserver(() => {
    filterSample(selectedPerson);
    if (screen.hidden) closeMenu();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  observer.observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  window.matchMedia('(max-width: 1050px)').addEventListener('change', () => closeMenu());

  if ('IntersectionObserver' in window) {
    const sections = [...navigation.querySelectorAll('a[href^="#"]')].map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
    const visibleSections = new Map();
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => visibleSections.set(entry.target.id, entry.isIntersecting));
      const current = sections.find(section => visibleSections.get(section.id));
      navigation.querySelectorAll('a').forEach(link => {
        if (current && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-100px 0px -45% 0px', threshold: 0 });
    sections.forEach(section => sectionObserver.observe(section));
  }
  filterSample('all');
})();
