const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const css = readFileSync(resolve(__dirname, '../assets/calendar-ui-refresh.css'), 'utf8');
const worker = readFileSync(resolve(__dirname, '../sw.js'), 'utf8');

test('calendar refresh loads before the final shared mobile layer and is cached', () => {
  const mobileIndex = html.indexOf('./assets/mobile.css?v=95');
  const refreshIndex = html.indexOf('./assets/calendar-ui-refresh.css?v=1');
  assert.ok(refreshIndex >= 0 && mobileIndex > refreshIndex);
  assert.match(worker, /const CACHE_NAME = "kidssync-shell-v\d+"/);
  assert.match(worker, /\.\/assets\/calendar-ui-refresh\.css\?v=1/);
});

test('desktop calendar controls collapse into one compact planning strip', () => {
  assert.match(css, /@media \(min-width: 741px\)[\s\S]*?\.calendar-pulse-summary \{ display: none; \}/);
  assert.match(css, /\.calendar-next-spotlight \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 1;/);
  assert.match(css, /\.date-ribbon \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;/);
  assert.match(css, /\.calendar-pulse > \.quick-calendar-nav \{[\s\S]*?grid-column: 3;[\s\S]*?grid-row: 1;/);
});

test('week view keeps readable dates and event metadata at compact sizes', () => {
  assert.match(css, /--week-header-height: 68px/);
  assert.match(css, /\.day-head\.is-today \.day-head-date \{[\s\S]*?background: var\(--blue\)/);
  assert.match(css, /\.event \.event-icon \{[\s\S]*?display: block/);
  assert.match(css, /\.event\.overlap-offset \.event-icon,[\s\S]*?display: none/);
  assert.match(css, /\.event \.event-title \{[\s\S]*?font-weight: 700/);
});

test('mobile agenda receives polish without changing its calendar replacement behavior', () => {
  assert.match(css, /@media \(max-width: 740px\)[\s\S]*?\.agenda-item \{/);
  assert.match(css, /\.agenda-item:active \{ background: var\(--blue-soft\); \}/);
});
