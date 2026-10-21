const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const experience = fs.readFileSync(path.join(root, 'assets/experience.js'), 'utf8');
const experienceCss = fs.readFileSync(path.join(root, 'assets/experience.css'), 'utf8');

test('first-run and navigation keep direct actions without blocking appearance setup', () => {
  assert.match(html, /id="dashboardStart"[\s\S]*id="dashboardStartEvent"[\s\S]*id="dashboardStartChild"/);
  assert.match(html, /id="moreActions"[\s\S]*class="more-actions-group"/);
  assert.doesNotMatch(html, /setTimeout\(maybeShowAppearancePrompt/);
  assert.match(html, /calendarZoom: 0\.75/);
  assert.match(html, /Math\.max\(520, window\.innerHeight - calendarMain\.getBoundingClientRect\(\)\.top/);
});

test('dashboard stays task-focused after map discovery is removed', () => {
  assert.doesNotMatch(html, /dashboard-map|mapDialog|data-sidebar-action="map"/);
  assert.doesNotMatch(html, /renderDashboardMap|openMapDialog|KidsSyncMap/);
  assert.match(html, /classList\.toggle\("is-dashboard-empty", isEmpty\)/);
  assert.match(html, /const dashboardPanelNames = \["week", "updates", "upcoming", "past"\]/);
  assert.match(experienceCss, /is-dashboard-empty #dashboardStats/);
  assert.doesNotMatch(experienceCss, /dashboard-map|dashboard-location/);
  assert.doesNotMatch(worker, /map-discovery|place-search/);
  assert.match(html, /id="todayHeading"[^>]*><\/h2><button[^>]*id="todayAddEvent"/);
  const start = html.indexOf('    function renderToday(');
  const end = html.indexOf('    function renderCalendarEmptyState(', start);
  assert(start >= 0 && end > start, 'Day renderer must exist before checking its contents');
  const dayRenderer = html.slice(start, end);
  assert.doesNotMatch(dayRenderer, /today-empty-actions/);
});

test('empty selected days retain a date-specific add action with or without other saved events', () => {
  const start = html.indexOf('    function renderToday(');
  const end = html.indexOf('    function renderCalendarEmptyState(', start);
  assert(start >= 0 && end > start);
  for (const activities of [[], [{ id: 'another-day', startDate: '2026-10-23' }]]) {
    const attributes = {};
    const children = [];
    const heading = {};
    const date = new Date(2026, 9, 22);
    const context = vm.createContext({
      state: { activities }, selectedDate: date, todayHeading: heading,
      todayList: { innerHTML: 'stale content', appendChild: element => children.push(element) },
      document: {
        getElementById: id => {
          assert.equal(id, 'todayAddEvent');
          return { setAttribute: (key, value) => { attributes[key] = value; } };
        },
        createElement: tag => ({ tagName: tag, innerHTML: '', className: '' })
      },
      formatFullDate: selected => { assert.equal(selected, date); return 'October 22, 2026'; },
      occurrencesOnDate: selected => { assert.equal(selected, date); return []; },
      compareCalendarEntries: () => 0,
      findConflicts: () => new Set(),
      t: (key, values) => key === 'calendar.addOnDate' ? `Add event on ${values.date}` : 'Nothing scheduled for this day.'
    });
    vm.runInContext(html.slice(start, end), context);
    context.renderToday();
    assert.equal(heading.textContent, 'October 22, 2026');
    assert.equal(attributes['aria-label'], 'Add event on October 22, 2026');
    assert.equal(context.todayList.innerHTML, '');
    assert.equal(children.length, 1);
    assert.equal(children[0].className, 'today-empty');
    assert.match(children[0].innerHTML, /Nothing scheduled for this day\./);
    assert.doesNotMatch(children[0].innerHTML, /<button/);
  }
  assert.match(html, /getElementById\("todayAddEvent"\)\.addEventListener\("click", \(\) => openNewEventForDate\(selectedDate, preferredNewEventChild\(\)\)\)/);
});

test('sharing uses separate accessible people and file panels', () => {
  assert.match(html, /id="shareAccessTab" aria-controls="shareAccessPanel"/);
  assert.match(html, /id="shareCommentsTab" aria-controls="ownerCommentsPanel"/);
  assert.match(html, /id="shareFilesTab" aria-controls="shareFilesPanel"/);
  assert.match(html, /id="shareAccessPanel" role="tabpanel" aria-labelledby="shareAccessTab"/);
  assert.match(html, /id="ownerCommentsPanel" role="tabpanel" aria-labelledby="shareCommentsTab"/);
  assert.match(html, /id="shareFilesPanel" role="tabpanel" aria-labelledby="shareFilesTab"/);
  assert.match(html, /KidsSyncExperience\?\.openShare\(isCalendarOwner\(\)\)/);
  assert.match(worker, /"\.\/assets\/experience\.css"/);
  assert.match(worker, /"\.\/assets\/experience\.js"/);
});

test('share tabs keep owner tasks separate and hide member controls from non-owners', () => {
  function element(extra = {}) {
    const attributes = {};
    return {
      hidden: false, dataset: {}, open: false, tabIndex: -1, textContent: '',
      addEventListener() {}, focus() {},
      setAttribute(name, value) { attributes[name] = value; },
      getAttribute(name) { return attributes[name]; },
      ...extra
    };
  }
  const tabs = ['access', 'comments', 'files'].map(name => element({ dataset: { shareTab: name } }));
  const byId = {
    moreActions: element({ querySelectorAll() { return []; } }),
    shareDialog: element({ querySelectorAll() { return tabs; } }),
    shareAccessPanel: element(), ownerCommentsPanel: element(), shareFilesPanel: element(),
    shareDialogIntro: element(), shareTabs: element(),
    dashboardStartEvent: element(), dashboardStartChild: element(), dashboardStartExample: element()
  };
  const window = {};
  vm.runInNewContext(experience, {
    document: {
      documentElement: { lang: 'en' },
      getElementById(id) { return byId[id]; },
      querySelectorAll() { return []; }
    },
    window
  });
  window.KidsSyncExperience.openShare(true);
  assert.equal(byId.shareAccessPanel.hidden, false);
  assert.equal(byId.ownerCommentsPanel.hidden, true);
  assert.equal(byId.shareFilesPanel.hidden, true);
  window.KidsSyncExperience.selectShareTab('comments');
  assert.equal(byId.shareAccessPanel.hidden, true);
  assert.equal(byId.ownerCommentsPanel.hidden, false);
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  window.KidsSyncExperience.openShare(false);
  assert.equal(tabs[0].hidden, true);
  assert.equal(tabs[1].hidden, true);
  assert.equal(byId.shareFilesPanel.hidden, false);
  window.KidsSyncExperience.selectShareTab('access');
  assert.equal(byId.shareAccessPanel.hidden, true);
});

function serviceWorker(fetchResponse) {
  const handlers = {};
  const cachedPage = { name: 'cached-page' };
  const cachedStyles = { name: 'cached-styles' };
  const puts = [];
  const requested = [];
  const cache = {
    async match(request) {
      const key = typeof request === 'string' ? request : request.url;
      if (key === './index.html') return cachedPage;
      if (key.endsWith('/assets/experience.css')) return cachedStyles;
      return undefined;
    },
    async put(key, value) { puts.push({ key, value }); }
  };
  const scope = 'https://kidssync.test/';
  vm.runInNewContext(worker, {
    self: {
      location: { origin: 'https://kidssync.test' },
      registration: { scope },
      addEventListener(name, fn) { handlers[name] = fn; }
    },
    caches: { async open() { return cache; } },
    fetch(request) { requested.push(request.url); return fetchResponse(request); },
    Response: { error() { return { name: 'network-error' }; } },
    URL
  });
  async function request(url) {
    let response;
    handlers.fetch({ request: { url, method: 'GET' }, respondWith(value) { response = value; } });
    return response ? await response : undefined;
  }
  return { request, requested, puts, cachedPage, cachedStyles };
}

test('app shell checks the network first and uses only matching offline fallbacks', async () => {
  const live = { ok: true, name: 'new-page', clone() { return this; } };
  const online = serviceWorker(async () => live);
  assert.equal(await online.request('https://kidssync.test/'), live);
  assert.equal(online.requested.length, 1);
  assert.equal(online.puts.length, 1);

  const offline = serviceWorker(async () => { throw new Error('offline'); });
  assert.equal(await offline.request('https://kidssync.test/'), offline.cachedPage);
  assert.equal(await offline.request('https://kidssync.test/assets/experience.css'), offline.cachedStyles);
  assert.equal(await offline.request('https://kidssync.test/assets/experience.js').then(value => value.name), 'network-error');
  assert.equal(await offline.request('https://kidssync.test/api/private'), undefined);
});
