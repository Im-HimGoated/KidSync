const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { ribbonDateKeys, normalizeInterfacePreferences, summaryCopy } = require('../assets/interface-upgrades.js');

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const css = readFileSync(resolve(__dirname, '../assets/interface-upgrades.css'), 'utf8');
const script = readFileSync(resolve(__dirname, '../assets/interface-upgrades.js'), 'utf8');
const mobileAgenda = readFileSync(resolve(__dirname, '../assets/mobile-agenda.js'), 'utf8');
const worker = readFileSync(resolve(__dirname, '../sw.js'), 'utf8');

test('interface preferences use a compact first-run default but honor an explicit saved choice', () => {
  assert.deepEqual(normalizeInterfacePreferences(null, false), { familyCollapsed: false });
  assert.deepEqual(normalizeInterfacePreferences(null, true), { familyCollapsed: true });
  assert.deepEqual(normalizeInterfacePreferences({ familyCollapsed: false }, true), { familyCollapsed: false });
  assert.deepEqual(normalizeInterfacePreferences({ familyCollapsed: true }, false), { familyCollapsed: true });
});

test('seven-day ribbon centers day and month views while week view starts on Monday', () => {
  const selected = new Date(2026, 9, 21); // Wednesday, October 21.
  assert.deepEqual(ribbonDateKeys(selected, 'today'), [
    '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'
  ]);
  assert.deepEqual(ribbonDateKeys(selected, 'week'), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'
  ]);
  assert.deepEqual(ribbonDateKeys(selected, 'four'), [
    '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'
  ]);
});

test('view summary copy handles singular, plural, conflicts, and Chinese', () => {
  assert.equal(summaryCopy(0, 0), '0 events · No conflicts');
  assert.equal(summaryCopy(1, 1), '1 event · 1 conflict');
  assert.equal(summaryCopy(8, 2), '8 events · 2 conflicts');
  assert.equal(summaryCopy(3, 0, 'zh'), '3 个日程 · 无冲突');
});

test('all five upgrades are present, responsive, and connected to the normal render cycle', () => {
  for (const marker of ['family-strip-toggle', 'calendar-pulse-summary', 'date-ribbon', 'calendar-next-spotlight', 'mobile-action-dock']) {
    assert(script.includes(marker) || css.includes(marker), `Missing ${marker}`);
  }
  const stylesheet = html.match(/<link rel="stylesheet" href="(\.\/assets\/interface-upgrades\.css(?:\?v=\d+)?)">/)[1];
  const scriptPath = html.match(/<script src="(\.\/assets\/interface-upgrades\.js(?:\?v=\d+)?)"><\/script>/)[1];
  assert.match(html, /window\.KidsSyncInterface\?\.refresh\(\)/);
  assert(worker.includes(JSON.stringify(stylesheet)));
  assert(worker.includes(JSON.stringify(scriptPath)));
  assert.match(css, /@media \(max-width: 740px\)[\s\S]*?\.mobile-action-dock \{/);
  assert.match(css, /\.mobile-action-dock button \{[\s\S]*?min-height: 52px/);
  assert.match(css, /\.date-ribbon-days \{[\s\S]*?overflow-x: auto/);
});

test('the interface layer only reads calendar events and keeps labels bilingual', () => {
  assert.doesNotMatch(script, /state\.activities\s*(?:=|\.|\[)/);
  assert.match(script, /occurrencesOnDate\(date\)/);
  assert.match(script, /upcomingOccurrences\(90\)/);
  const dictionarySource = script.slice(script.indexOf('  const words ='), script.indexOf('  const tx =')) + '\nwords';
  const words = vm.runInNewContext(dictionarySource);
  assert.deepEqual(Object.keys(words.en).sort(), Object.keys(words.zh).sort());
});

test('mobile calendar removes duplicated summaries while keeping direct navigation', () => {
  assert.match(css, /@media \(max-width: 740px\)[\s\S]*?\.calendar-pulse-summary \{ display: none; \}/);
  assert.match(css, /\.quick-date-field \{ display: none; \}/);
  assert.match(css, /\.quick-calendar-nav:has\(\.quick-time-field\[hidden\]\) \{ display: none; \}/);
  assert.match(css, /#appShell\.is-calendar-empty \.calendar-pulse/);
  assert.match(css, /#appShell\.is-calendar-empty \.empty-actions button \{ min-height: 44px; \}/);
  assert.match(script, /previousNextCommitment\.hidden = true/);
  assert.match(mobileAgenda, /document\.getElementById\('calendarNextSpotlight'\)/);
  assert.match(css, /\.family-strip-toggle \{ grid-column: 3; width: 44px;[^}]*min-height: 44px;/);
});
