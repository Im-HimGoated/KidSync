const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const css = readFileSync(resolve(__dirname, '../assets/mobile.css'), 'utf8');
const sw = readFileSync(resolve(__dirname, '../sw.js'), 'utf8');
const start = html.indexOf('    function initializeMobileLayout(');
const end = html.indexOf('\n    }', start) + '\n    }'.length;
assert.ok(start >= 0, 'Responsive initialization must be present');

function setup(mobile) {
  const elements = Object.fromEntries(['calendarSideDisclosure', 'sidebarMenu', 'workspacePanelMenu', 'calendarViewMenu', 'plannerOptions', 'moreActions'].map(id => [id, {
    open: false, handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; }
  }]));
  const media = { matches: mobile, addEventListener(name, handler) { this.change = handler; } };
  const context = vm.createContext({
    window: { matchMedia(query) { assert.equal(query, '(max-width: 900px)'); return media; } },
    document: { getElementById: id => elements[id] }
  });
  vm.runInContext(html.slice(start, end), context);
  context.initializeMobileLayout();
  return { elements, media };
}

test('side calendar starts collapsed on compact screens and can be opened by the user', () => {
  const { elements } = setup(true);
  assert.equal(elements.calendarSideDisclosure.open, false);
  elements.calendarSideDisclosure.open = true;
  elements.calendarViewMenu.open = true;
  elements.calendarViewMenu.handlers.toggle();
  assert.equal(elements.calendarSideDisclosure.open, true, 'Opening a floating menu must not close the date browser');
});

test('crossing a breakpoint restores the full desktop side calendar', () => {
  const { elements, media } = setup(false);
  assert.equal(elements.calendarSideDisclosure.open, true);
  media.matches = true;
  media.change();
  assert.equal(elements.calendarSideDisclosure.open, false);
  media.matches = false;
  media.change();
  assert.equal(elements.calendarSideDisclosure.open, true);
});

test('only one floating menu is open at a time', () => {
  const { elements } = setup(true);
  const ids = ['sidebarMenu', 'workspacePanelMenu', 'calendarViewMenu', 'plannerOptions', 'moreActions'];
  for (const id of ids) {
    elements[id].open = true;
    elements[id].handlers.toggle();
    assert.equal(ids.filter(key => elements[key].open).length, 1);
    assert.equal(elements[id].open, true);
  }
  elements.moreActions.open = false;
  elements.moreActions.handlers.toggle();
  assert.equal(ids.filter(key => elements[key].open).length, 0);
});

test('mobile assets are loaded last and included in the offline shell', () => {
  const mobileStylesheet = html.match(/href="(\.\/assets\/mobile\.css(?:\?v=\d+)?)">\s*<\/head>/);
  assert(mobileStylesheet);
  assert.ok(sw.includes(`"${mobileStylesheet[1]}"`));
  assert.match(html, /<details class="calendar-side-disclosure" id="calendarSideDisclosure" open>/);
  assert.match(html, /<summary class="calendar-side-toggle" aria-controls="calendarSideContent">/);
  assert.match(html, /<div id="calendarSideContent">/);
  assert.match(html, /"miniCalendar.mobileBrowse": "Dates & calendar tools"/);
  assert.match(html, /"miniCalendar.mobileBrowse": "日期与日历工具"/);
});

test('mobile layout keeps browser zoom, large inputs, and touch targets', () => {
  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.ok(viewport.includes('viewport-fit=cover'));
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*(no|0)|maximum-scale/);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /max-height: min\(70dvh, 560px\)/);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /backdrop-filter: none/); // A filtered toolbar would trap fixed menus outside the viewport.
  assert.match(css, /#appShell #calendarSide \{ grid-column: 1; grid-row: 1/);
  assert.match(css, /#appShell \.calendar-stage-main \{ grid-column: 1; grid-row: 2/);
  assert.match(css, /\.event-attendee-option > input \{[^}]*width: 1px; height: 1px/);
  assert.match(html, /<dialog id="activityDialog" aria-labelledby="dialogTitle">/);
  assert.match(html, /data-sidebar-action="dashboard" data-i18n="dashboard.open"/);
  assert.match(html, /mobile-menu-item[^>]*data-sidebar-action="help"/);
  assert.match(html, /mobile-menu-item[^>]*data-sidebar-action="settings"/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?#appShell \.sidebar-calendar-row,[\s\S]*?min-height: 44px;/);
  assert.match(css, /#appShell \.sidebar-calendar-heading button,[\s\S]*?#appShell \.dashboard-collapse \{[\s\S]*?min-width: 44px;/);
});

test('mobile dashboard and editor keep calendar controls and actions out of the way', () => {
  assert.match(css, /#appShell\.is-dashboard-view \.sidebar-date-controls,[\s\S]*?#appShell\.is-dashboard-view \.workspace-visibility \{ display: none; \}/);
  assert.match(css, /#activityDialog #activityForm \.form-actions \{[\s\S]*?position: sticky;[\s\S]*?bottom: 0;/);
  assert.match(css, /@media \(max-width: 740px\) and \(max-height: 500px\)[\s\S]*?#activityDialog #activityForm \.form-actions \{ position: static; \}/);
  assert.match(css, /#appShell \.dashboard-week-chart \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); gap: 8px; \}/);
  assert.match(css, /#appShell \.planner-options-panel \.overview-next \{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\);/);
  assert.match(css, /\.settings-dialog \.setting-row:has\(select\) \{ align-items: stretch; flex-direction: column;/);
  assert.match(html, /class="remove-kid-label">\$\{t\("kids\.removeAction"\)\}<\/span>/);
});

test('toolbar minimum columns leave room at 320–740px, including a scrollbar', () => {
  // Guard the minimum track widths in mobile.css; this is not a browser layout test.
  assert.ok(css.includes('minmax(68px, 1fr) minmax(96px, 1.4fr) 44px 44px'));
  assert.ok(css.includes('minmax(60px, 1fr) minmax(88px, 1.3fr) 44px 44px'));
  for (const width of [320, 360, 375, 390, 430, 560, 740]) {
    const available = width - 24 - 12 - 2 - 15; // Gutters, toolbar padding/border, scrollbar.
    const required = width <= 360 ? 60 + 88 + 44 + 44 + 3 * 4 : 68 + 96 + 44 + 44 + 3 * 6;
    assert.ok(required <= available, `Toolbar minimums exceed a ${width}px screen`);
  }
});

test('mobile layout tools remain reachable without consuming a permanent toolbar row', () => {
  assert.match(html, /id="mobileCustomizeLayout" data-i18n="layout.customize"/);
  assert.match(html, /id="mobileFocusCalendar" data-i18n="layout.focusCalendar"/);
  for (const panel of ['header', 'account', 'controls', 'side']) assert(html.includes(`data-layout-panel="${panel}"`));
  assert(css.includes('#appShell:not(.has-minimized-panels):not(.is-dashboard-view) .workspace-visibility'));
  assert(css.includes('#appShell #calendarInsightsScope[data-filtered="true"]'));
});

test('scanner starts compact on a phone and expanded on desktop', () => {
  const start = html.indexOf('    function resetGameScan(');
  const end = html.indexOf('\n    }', start) + 6;
  for (const mobile of [true, false]) {
    const nodes = {};
    const context = vm.createContext({
      document: { getElementById: id => nodes[id] ||= {} }, window: { matchMedia: () => ({ matches: mobile }) },
      gameScanPreviewUrl: '', gameScanInput: {}, gameScanText: {}, gameScanProgressText: {},
      gameScanProgress: { classList: { remove() {} } }, gameScanReview: {}, gameScanPreview: { removeAttribute() {} }
    });
    vm.runInContext(html.slice(start, end), context);
    context.resetGameScan();
    assert.equal(nodes.gameScanPanel.open, !mobile);
  }
  assert.match(html, /<details class="game-scan-panel" id="gameScanPanel"/);
  assert.match(css, /#activityForm \.game-scan-heading[^}]+min-height: 44px/);
});
