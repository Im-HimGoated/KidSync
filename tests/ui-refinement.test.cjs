const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync(require.resolve('../assets/ui-refinement.css'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const worker = fs.readFileSync(require.resolve('../sw.js'), 'utf8');
const planning = fs.readFileSync(require.resolve('../assets/dashboard-planning.js'), 'utf8');

test('the refinement is available offline and preserves the final mobile stylesheet', () => {
  assert.match(html, /ui-refinement\.css\?v=1">\s*<link rel="stylesheet" href="\.\/assets\/mobile\.css\?v=\d+">\s*<\/head>/);
  assert.match(worker, /"\.\/assets\/ui-refinement\.css\?v=1"/);
});

test('all seven planning sections get decorative, non-focusable vector icons', () => {
  const iconDefinitions = planning.slice(planning.indexOf('const panelIcons ='), planning.indexOf('function panel('));
  for (const key of ['today', 'attention', 'outlook', 'handoffs', 'priority', 'prep', 'special']) {
    assert.match(iconDefinitions, new RegExp(`\\b${key}: '<`));
  }
  assert.match(planning, /class="dashboard-planning-symbol" aria-hidden="true"><svg[^>]*focusable="false"/);
  assert.match(planning, /class="dashboard-planning-heading"/);
});

test('phone dashboard actions have text, wrapping, two columns and 44px targets', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 740px)'));
  assert.match(mobile, /dashboard-page-actions \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /dashboard-page-actions button \{[^}]*min-height: 44px/);
  assert.match(mobile, /button > span:last-child \{[^}]*position: static[^}]*clip: auto[^}]*white-space: normal/);
  assert.match(mobile, /dashboard-plan-copy \{ display: flex; flex-direction: column/);
  assert.match(mobile, /#appShell\.is-dashboard-view \.mobile-action-dock \{ display: none; \}/);
});

function luminance(hex) {
  const parts = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722;
}
test('attention colors meet AA text contrast in light and dark appearances', () => {
  const foregrounds = [...css.matchAll(/--refine-warning: (#[a-f\d]{6})/gi)].map(match => match[1]);
  const backgrounds = [...css.matchAll(/--refine-warning-bg: (#[a-f\d]{6})/gi)].map(match => match[1]);
  assert.equal(foregrounds.length, 2);
  foregrounds.forEach((foreground, index) => {
    const values = [luminance(foreground), luminance(backgrounds[index])].sort((a, b) => b - a);
    assert((values[0] + .05) / (values[1] + .05) >= 4.5);
  });
  assert.match(css, /html\.dark-mode #appShell/);
});

test('keyboard focus, motion preferences, and calendar geometry remain protected', () => {
  assert.match(css, /:focus-visible \{ outline: 2px solid var\(--blue\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /html\.reduce-motion/);
  assert.doesNotMatch(css, /#weekSchedule|\.day-column|\.schedule-shell|\.event\s*\{/);
  assert.doesNotMatch(css, /animation\s*:|!important|overflow-x:\s*hidden/);
});
