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
  assert.match(html, /href="\.\/assets\/mobile\.css">\s*<\/head>/);
  assert.ok(sw.includes('"./assets/mobile.css"'));
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
  assert.match(html, /<dialog id="activityDialog" aria-labelledby="dialogTitle">/);
  assert.match(html, /data-sidebar-action="dashboard" data-i18n="dashboard.open"/);
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
