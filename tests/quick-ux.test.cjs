const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'assets/quick-ux.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/quick-ux.css'), 'utf8');

function node(extra = {}) {
  const handlers = {};
  const attributes = {};
  return {
    hidden: false, value: '', textContent: '', dataset: {}, parentElement: null,
    addEventListener(name, fn) { handlers[name] = fn; },
    setAttribute(name, value) { attributes[name] = value; },
    getAttribute(name) { return attributes[name]; },
    click() { handlers.click?.({}); },
    change() { handlers.change?.({}); },
    focus() { this.focused = true; },
    dispatchEvent(event) { this.dispatched = event.type; },
    ...extra
  };
}

test('five quick UX controls are present, bilingual, and included offline', () => {
  for (const id of ['quickNextEvent', 'quickDate', 'quickTime', 'quickSideToggle', 'memberRoleHint']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(source, new RegExp(`'${id}'`));
  }
  assert.match(html, /id="memberRole" aria-describedby="memberRoleHint"/);
  assert.match(html, /assets\/quick-ux\.css/);
  assert.match(html, /assets\/quick-ux\.js/);
  assert.match(worker, /"\.\/assets\/quick-ux\.css"/);
  assert.match(worker, /"\.\/assets\/quick-ux\.js"/);
  assert.match(source, /zh: \{/);
  assert.match(css, /@media \(max-width: 740px\)/);
});

test('shortcuts reuse existing actions and explain sharing roles', () => {
  const classes = new Set();
  const sideLabel = node({ dataset: { quickText: 'hideSide' } });
  const shell = node({ classList: { contains: name => classes.has(name) } });
  const side = node({ querySelector: () => sideLabel });
  const date = node({ validity: { valid: true }, reportValidity() {} });
  const time = node({ parentElement: node() });
  const sourceNext = node({ disabled: false });
  const sourceLabel = node({ textContent: 'Oct 31 · Halloween' });
  const periodPicker = node();
  const role = node({ value: 'viewer' });
  const byId = {
    appShell: shell, quickCalendarNav: node(), quickNextEvent: node(), quickNextEventLabel: node(),
    quickDate: date, quickTime: time, quickSideToggle: side,
    memberRole: role, memberRoleHint: node(), jumpNextEvent: sourceNext,
    overviewNextEvent: sourceLabel, periodDatePicker: periodPicker
  };
  const clockJumps = [];
  const labels = [sideLabel];
  const document = {
    documentElement: { lang: 'en' },
    getElementById: id => byId[id],
    querySelectorAll: () => labels,
    querySelector: () => ({ click() { classes.add('panels-hide-side'); } })
  };
  const window = { KidsSyncUI: { jumpToMinute(...args) { clockJumps.push(args); } } };
  vm.runInNewContext(source, {
    document, window, selectedDate: new Date(2026, 9, 19), currentView: 'week',
    dateKey: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    MutationObserver: class { observe() {} }, Event: class { constructor(type) { this.type = type; } }
  });

  assert.equal(byId.quickNextEvent.hidden, false);
  assert.equal(byId.quickNextEventLabel.textContent, sourceLabel.textContent);
  sourceNext.addEventListener('click', () => { sourceNext.wasClicked = true; });
  byId.quickNextEvent.click();
  assert.equal(sourceNext.wasClicked, true);

  date.value = '2026-10-31'; date.change();
  assert.equal(periodPicker.value, '2026-10-31');
  assert.equal(periodPicker.dispatched, 'change');

  time.value = '720'; time.change();
  assert.equal(clockJumps[0][0], 720);
  assert.equal(clockJumps[0][1].focusReturn, false);
  assert.equal(time.value, '');
  assert.equal(time.focused, true);

  side.click();
  assert.equal(side.getAttribute('aria-pressed'), 'false');
  assert.equal(sideLabel.textContent, 'Show mini calendar');

  role.value = 'editor'; role.change();
  assert.match(byId.memberRoleHint.textContent, /add, and edit/);
  document.documentElement.lang = 'zh-CN';
  window.KidsSyncQuick.localize();
  assert.match(byId.memberRoleHint.textContent, /编辑/);
});
