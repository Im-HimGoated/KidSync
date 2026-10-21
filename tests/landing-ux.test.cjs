const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'assets/landing-ux.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/landing-ux.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function node(data = {}) {
  const listeners = {}, attributes = {}, classes = new Set();
  return Object.assign({ dataset: {}, hidden: false, listeners, attributes,
    addEventListener: (type, callback) => { listeners[type] = callback; },
    setAttribute: (name, value) => { attributes[name] = value; }, getAttribute: name => attributes[name],
    removeAttribute: name => { delete attributes[name]; }, contains: target => target === data,
    focus() { this.focused = true; },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value), contains: value => classes.has(value) }
  }, data);
}

function fixture() {
  const filters = ['all', 'maya', 'theo', 'family'].map(person => node({ dataset: { samplePerson: person } }));
  const plans = ['maya', 'theo', 'family', 'maya', 'theo', 'family', 'maya', 'theo', 'family', 'family'].map(owner => node({ dataset: { sampleOwner: owner } }));
  const days = Array.from({ length: 5 }, (_, index) => {
    const empty = node();
    return node({ empty, querySelector: () => empty, querySelectorAll: () => plans.slice(index * 2, index * 2 + 2) });
  });
  const links = ['welcomePreview', 'welcomeHow', 'welcomeAbout', 'welcomeQuestions'].map(id => node({ hash: `#${id}` }));
  const menu = node(), status = node(), start = node(), signIn = node(), documentRoot = node(), sections = Object.fromEntries(links.map(link => [link.hash.slice(1), node({ id: link.hash.slice(1) })]));
  const navigation = node({ querySelectorAll: () => links });
  const screen = node({ querySelectorAll: selector => selector === '[data-sample-person]' ? filters : selector === '[data-sample-owner]' ? plans : selector === '.welcome-preview-day' ? days : selector === '[data-welcome-signin]' ? [signIn] : [start] });
  const nodes = { welcomeScreen: screen, welcomeMenuToggle: menu, welcomeSections: navigation, welcomeSampleCount: status, ...sections };
  const document = node({ documentElement: documentRoot, getElementById: id => nodes[id] });
  const observers = []; let started = 0, language = 'en', breakpoint, authView;
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} }
  const context = vm.createContext({ document, MutationObserver: Observer, window: { matchMedia: () => ({ addEventListener: (_, callback) => { breakpoint = callback; } }) },
    t: (key, values) => `${language}:${values.count}`, showGuestPreview: () => started++, showAuthScreen: view => { authView = view; } });
  vm.runInContext(script, context);
  return { filters, plans, days, menu, status, start, signIn, screen, document, navigation, sections, observers, authView: () => authView,
    setLanguage: value => { language = value; }, started: () => started, resize: () => breakpoint() };
}

test('sample filters show only matching examples, explain empty days, and never start a real preview', () => {
  const f = fixture();
  assert.equal(f.status.textContent, 'en:10');
  f.filters[1].listeners.click();
  assert.equal(f.status.textContent, 'en:3');
  assert.equal(f.filters[1].attributes['aria-pressed'], 'true');
  assert(f.plans.every(plan => plan.hidden === (plan.dataset.sampleOwner !== 'maya')));
  assert.equal(f.days.filter(day => !day.empty.hidden).length, 2);
  assert.equal(f.started(), 0);
  f.filters[0].listeners.click();
  assert(f.plans.every(plan => !plan.hidden)); assert(f.days.every(day => day.empty.hidden));
  f.start.listeners.click(); assert.equal(f.started(), 1);
});

test('mobile menu closes on Escape, outside click, navigation, resizing and leaving the welcome page', () => {
  const f = fixture(), open = () => f.menu.listeners.click();
  assert.equal(f.menu.hidden, false);
  open(); assert.equal(f.menu.attributes['aria-expanded'], 'true');
  let prevented = false;
  f.screen.listeners.keydown({ key: 'Escape', preventDefault: () => { prevented = true; } });
  assert(prevented); assert(f.menu.focused); assert.equal(f.menu.attributes['aria-expanded'], 'false');
  open(); f.document.listeners.click({ target: {} }); assert.equal(f.menu.attributes['aria-expanded'], 'false');
  open(); f.navigation.listeners.click({ target: { closest: () => ({ getAttribute: () => '#welcomeQuestions' }) } });
  assert(f.sections.welcomeQuestions.focused); assert.equal(f.menu.attributes['aria-expanded'], 'false');
  open(); f.resize(); assert.equal(f.menu.attributes['aria-expanded'], 'false');
  open(); f.screen.hidden = true; f.observers[0].callback(); assert.equal(f.menu.attributes['aria-expanded'], 'false');
  open(); f.signIn.listeners.click(); assert.equal(f.authView(), 'signin'); assert.equal(f.menu.attributes['aria-expanded'], 'false'); assert.equal(f.started(), 0);
});

test('changing language preserves the sample filter and refreshes its live result count', () => {
  const f = fixture(); f.filters[2].listeners.click(); f.setLanguage('zh'); f.observers[0].callback();
  assert.equal(f.status.textContent, 'zh:3'); assert.equal(f.filters[2].attributes['aria-pressed'], 'true');
  assert.equal(f.started(), 0);
});

test('landing additions are scoped, accessible, bilingual and offline-ready', () => {
  const welcome = html.slice(html.indexOf('<section class="welcome-screen"'), html.indexOf('<section class="auth-screen"'));
  assert.equal((welcome.match(/data-sample-owner=/g) || []).length, 10);
  assert.equal((welcome.match(/class="welcome-sample-empty"/g) || []).length, 5);
  assert.equal((welcome.match(/<details>/g) || []).length, 4);
  assert.match(welcome, /href="#welcomeHeadline"[^>]+data-i18n="welcome.skip"/);
  assert.match(welcome, /aria-controls="welcomeSections"/);
  assert.match(welcome, /role="status" aria-live="polite"/);
  assert(!/localStorage|sessionStorage|\bstate\.\w|saveState|openNewEvent/.test(script));
  assert.match(css, /#welcomeScreen \[hidden\] \{ display: none !important; \}/);
  assert.match(css, /prefers-reduced-motion/);
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const asset of ['landing-ux.css?v=1', 'landing-ux.js?v=1']) assert(worker.includes(`./assets/${asset}`));
});
