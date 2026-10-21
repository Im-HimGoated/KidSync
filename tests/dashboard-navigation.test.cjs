const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { preferencesFor, nextPlan, countdownPhase, sections } = require('../assets/dashboard-navigation.js');
const engine = require('../assets/dashboard-planning.js');

test('dashboard preferences accept only known section names and keep no duplicate values', () => {
  assert.deepEqual(preferencesFor(null), { collapsed: [] });
  assert.deepEqual(preferencesFor({ collapsed: ['today', 'today', 'unknown', {}, 'prep'] }), { collapsed: ['today', 'prep'] });
  assert.deepEqual(preferencesFor({ collapsed: 'all' }), { collapsed: [] });
});
test('Next up prioritizes ongoing or upcoming timed plans ahead of all-day items', () => {
  const holiday = { id: 'holiday', allDay: true, eventType: 'holiday' }, timed = { id: 'lesson', start: '17:00' };
  assert.equal(nextPlan({ near: [holiday, timed], special: [] }), timed);
  assert.equal(nextPlan({ near: [holiday], special: [] }), holiday);
  assert.equal(nextPlan({ near: [], special: [holiday] }), holiday);
  assert.equal(nextPlan({ near: [], special: [] }), null);
});
test('countdowns use Starting soon instead of Begins just now before the exact start', () => {
  assert.equal(countdownPhase({ start: 30000 }, 0), 'soon');
  assert.equal(countdownPhase({ start: 60000 }, 0), 'begins');
  assert.equal(countdownPhase({ start: 1000 }, 1000), 'ends');
});
function fixture({ saved, blocked = false, small = false } = {}) {
  const store = new Map(saved ? [['family:dashboard-sections-v1', JSON.stringify(saved)]] : []);
  const listeners = {}, windowListeners = {}, frames = [], nodes = new Map(), panelNodes = new Map(), focus = [], moves = [], calls = [];
  let calendar = 'family', dialogs = false;
  class Node {
    constructor(name = '') { this.name = name; this.dataset = {}; this.hidden = false; this.open = true; this.children = new Map(); this.handlers = {}; this.attributes = {}; this.textContent = ''; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] || null; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    querySelector(selector) {
      if (this === page && selector.includes('data-dashboard-section')) return panelNodes.get(selector.match(/"([^"]+)"/)[1]);
      if (!this.children.has(selector)) {
        const result = new Node(selector), jump = selector.match(/data-dashboard-jump="([^"]+)"/);
        if (jump) result.dataset.dashboardJump = jump[1];
        this.children.set(selector, result);
      }
      return this.children.get(selector);
    }
    querySelectorAll(selector) {
      if (selector === '[data-dashboard-jump]') return sections.map(key => this.querySelector(`[data-dashboard-jump="${key}"]`));
      if (selector === '.dashboard-panel .dashboard-collapse') return [legacy];
      if (selector === '[data-dashboard-key]') return this.eventNodes || [];
      return [];
    }
    before(child) { moves.push([this.name, 'before', child.name]); }
    prepend(child) { moves.push([this.name, 'prepend', child.name]); }
    focus() { focus.push(this); }
    getBoundingClientRect() { return { left: 0, right: 500, top: 0, bottom: 1000, width: 500 }; }
    scrollTo() {}
    scrollIntoView(options) { calls.push(['scroll', this.name, options.behavior]); }
    contains(target) { return target === this; }
  }
  const page = new Node('dashboardPage'); page.hidden = false;
  const get = id => { if (id === 'dashboardPage') return page; if (!nodes.has(id)) nodes.set(id, new Node(id)); return nodes.get(id); };
  sections.forEach(key => { const panel = new Node(key); panel.querySelector('[data-plan-eyebrow]').textContent = '1'; panelNodes.set(key, panel); });
  const legacy = new Node('legacy'); legacy.setAttribute('aria-expanded', 'true');
  legacy.click = () => legacy.setAttribute('aria-expanded', legacy.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
  const media = { matches: small, handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } };
  const activity = { id: 'a', title: 'Soccer', child: 'Maya', occurrenceDate: '2026-10-21', start: '17:00', end: '18:00' };
  const model = engine.buildModel([activity], new Date(2026, 9, 21, 16));
  const window = { scrollY: 321, scrollX: 0, scrollTo: value => calls.push(['restore-scroll', value.top]), addEventListener: (type, fn) => { windowListeners[type] = fn; },
    KidsSyncDashboard: { engine, refresh: () => window.KidsSyncDashboardUX?.refresh(model) }, KidsSyncScheduler: { open: value => calls.push(['scheduler', value]) } };
  const context = vm.createContext({ window, document: { getElementById: get, createElement: () => get('bar'), addEventListener: (type, fn) => { listeners[type] = fn; }, querySelector: () => dialogs ? {} : null },
    currentLanguage: 'en', scheduleStorageKey: key => `${calendar}:${key}`, localStorage: { getItem: key => store.get(key) || null, setItem(key, value) { if (blocked) throw Error('blocked'); store.set(key, value); } },
    escapeHtml: value => String(value), displayIcon: () => '⚽', activityTitle: item => item.title, activityCompactTitle: item => item.title, displayChild: item => item.child,
    formatRelativeTime: () => 'in 1 hour', userSettings: { reduceMotion: true }, matchMedia: query => query.includes('980px') ? media : { matches: false },
    requestAnimationFrame: fn => frames.push(fn), showEventDetails: item => calls.push(['event', item.id]), Date });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/dashboard-navigation.js'), 'utf8'), context);
  const bar = get('bar');
  function click(button) { bar.handlers.click({ target: { closest: () => button } }); }
  const target = (data, attribute) => ({ dataset: data, hasAttribute: name => name === attribute });
  function toggle(key) {
    page.handlers.click({ target: { closest: selector => selector.includes('> summary') ? panelNodes.get(key).querySelector('summary') : null } });
    panelNodes.get(key).open = !panelNodes.get(key).open;
    flush();
  }
  function flush() { while (frames.length) frames.shift()(); }
  return { context, window, windowListeners, listeners, store, panelNodes, bar, get, focus, moves, calls, toggle, flush, click, target, legacy, media,
    scope: value => { calendar = value; }, dialogs: value => { dialogs = value; } };
}
test('collapsed sections persist per calendar and returning to a calendar restores its own choices', () => {
  const f = fixture({ saved: { collapsed: ['prep'] } });
  assert.equal(f.panelNodes.get('prep').open, false);
  f.toggle('outlook');
  assert.deepEqual(JSON.parse(f.store.get('family:dashboard-sections-v1')).collapsed, ['prep', 'outlook']);
  f.scope('work'); f.window.KidsSyncDashboard.refresh();
  assert(f.panelNodes.get('prep').open); assert(f.panelNodes.get('outlook').open);
  f.scope('family'); f.window.KidsSyncDashboard.refresh();
  assert.equal(f.panelNodes.get('prep').open, false); assert.equal(f.panelNodes.get('outlook').open, false);
});
test('blocked storage retains choices in this session and announces that limit accurately', () => {
  const f = fixture({ blocked: true }); f.toggle('prep');
  assert.match(f.bar.querySelector('[data-dashboard-status]').textContent, /session only/);
  f.scope('work'); f.window.KidsSyncDashboard.refresh(); f.scope('family'); f.window.KidsSyncDashboard.refresh();
  assert.equal(f.panelNodes.get('prep').open, false);
  assert.equal(f.store.size, 0);
});
test('section shortcuts expand the destination, respect reduced motion and save the choice', () => {
  const f = fixture({ saved: { collapsed: ['outlook'] } });
  f.click(f.target({ dashboardJump: 'outlook' }));
  assert(f.panelNodes.get('outlook').open);
  assert.equal(f.focus.at(-1), f.panelNodes.get('outlook').querySelector('summary'));
  assert.deepEqual(f.calls.at(-1), ['scroll', 'outlook', 'auto']);
  assert.equal(f.bar.querySelector('[data-dashboard-jump="outlook"]').getAttribute('aria-current'), 'location');
});
test('Expand all and Collapse all operate on both new cards and existing dashboard sections', () => {
  const f = fixture(); f.click(f.target({ dashboardSections: 'collapse' }));
  assert([...f.panelNodes.values()].every(panel => !panel.open));
  assert.equal(f.legacy.getAttribute('aria-expanded'), 'false');
  f.click(f.target({ dashboardSections: 'expand' }));
  assert([...f.panelNodes.values()].every(panel => panel.open));
  assert.equal(f.legacy.getAttribute('aria-expanded'), 'true');
});
test('cross-tab preferences apply only to the current calendar', () => {
  const f = fixture();
  f.windowListeners.storage({ key: 'other:dashboard-sections-v1', newValue: '{"collapsed":["today"]}' });
  assert(f.panelNodes.get('today').open);
  f.windowListeners.storage({ key: 'family:dashboard-sections-v1', newValue: '{"collapsed":["today"]}' });
  assert.equal(f.panelNodes.get('today').open, false);
  f.windowListeners.storage({ key: 'family:dashboard-sections-v1', newValue: null });
  assert(f.panelNodes.get('today').open);
});
test('closing a detail sheet restores the originating card after a refresh without stealing focus from another dialog', () => {
  const f = fixture(), original = { dataset: { dashboardKey: 'a' }, closest: () => ({ dataset: { dashboardSection: 'today' } }) };
  f.get('dashboardPage').handlers.click({ target: { closest: selector => selector.includes('> summary') ? null : original } });
  const replacement = { dataset: { dashboardKey: 'a' }, focus() { f.focus.push(this); } };
  f.panelNodes.get('today').eventNodes = [replacement];
  f.dialogs(true); f.listeners.close(); f.flush(); assert.equal(f.focus.length, 0);
  f.dialogs(false); f.listeners.close(); f.flush(); assert.equal(f.focus.at(-1), replacement);
  assert.deepEqual(f.calls.at(-1), ['restore-scroll', 321]);
});
test('Next up never opens a stale plan after switching calendars', () => {
  const f = fixture(); f.scope('work'); f.click(f.target({}, 'data-dashboard-next'));
  assert(!f.calls.some(call => call[0] === 'event'));
  assert.match(f.bar.querySelector('[data-dashboard-status]').textContent, /calendar changed/);
});
test('the phone layout promotes important plans and preparation before the outlook', () => {
  const f = fixture({ small: true });
  assert.deepEqual(f.moves.at(-1), ['dashboardPlanMain', 'before', 'dashboardPlanSide']);
  f.media.matches = false; f.media.handlers.change();
  assert.deepEqual(f.moves.at(-1), ['.dashboard-side-column', 'prepend', 'dashboardPlanSide']);
});
