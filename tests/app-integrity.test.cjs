const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(value => value.trim());

test('static IDs are unique and explicit form labels resolve', () => {
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of markup.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) assert(ids.includes(match[1]), match[1]);
});

test('all local markup assets, offline shell entries and manifest icons exist', () => {
  for (const match of markup.matchAll(/<(?:link|script|img)\b[^>]*\b(?:src|href)="(\.\/[^"#]+)"/g)) assert(fs.existsSync(path.join(root, match[1].split('?')[0])), match[1]);
  // Scripts were removed from markup to keep generated HTML out of ID checks.
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="(\.\/[^"?#]+)"/g)) assert(fs.existsSync(path.join(root, match[1])), match[1]);
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const match of worker.split('];', 1)[0].matchAll(/"(\.\/[^\"]*)"/g)) assert(fs.existsSync(path.join(root, match[1].split('?')[0])), match[1]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const icon of manifest.icons) {
    const iconPath = path.join(root, icon.src);
    assert(fs.existsSync(iconPath), icon.src);
    if (icon.type === 'image/png') {
      const png = fs.readFileSync(iconPath);
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      assert.equal(width, height, `${icon.src} must be square`);
      assert.equal(`${width}x${height}`, icon.sizes, `${icon.src} size metadata`);
    }
  }
  assert.match(markup, /rel="icon"[^>]+kidssync-app-icon\.svg/);
});

test('calendar management uses inline rename and delete confirmation', () => {
  const start = html.indexOf('    function renderCalendarList()');
  const end = html.indexOf('    function openCalendarDialog()', start);
  const source = html.slice(start, end);
  assert.match(source, /calendar-inline-form/);
  assert.match(source, /calendar-delete-confirmation/);
  assert.doesNotMatch(source, /window\.(?:prompt|alert|confirm)/);
});

test('English and Chinese cover every static translation and literal lookup', () => {
  const start = html.indexOf('    const translations =');
  const end = html.indexOf('    const AUTH_ACCOUNTS_KEY', start);
  const translations = vm.runInNewContext(html.slice(start, end) + '\ntranslations');
  const keys = new Set([
    ...[...markup.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)].map(match => match[1]),
    ...[...html.matchAll(/\bt\("([^"`{}]+)"/g)].map(match => match[1])
  ]);
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.zh).sort());
  for (const language of ['en', 'zh']) for (const key of keys) assert(Object.hasOwn(translations[language], key), `${language}: ${key}`);
});

test('all application JavaScript parses', () => {
  for (const script of scripts) new vm.Script(script);
  for (const file of ['sw.js', 'supabase-config.js', ...fs.readdirSync(path.join(root, 'assets')).filter(file => file.endsWith('.js')).map(file => `assets/${file}`)]) new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'));
});

test('loader dismisses on success, dependency error, or timeout and supports Chinese', () => {
  const source = scripts.find(script => script.includes('window.dismissAppLoader ='));
  assert(source);
  for (const language of ['en-US', 'zh-CN']) for (const trigger of ['ready', 'error', 'timeout']) {
    const classes = new Set();
    const loader = { hidden: false, classList: { contains: value => classes.has(value), add: value => classes.add(value) } };
    const label = {};
    const timers = [];
    const handlers = {};
    const window = { setTimeout: (fn, delay) => timers.push({ fn, delay }), addEventListener: (name, fn) => { handlers[name] = fn; } };
    vm.runInNewContext(source, { window, navigator: { language }, document: { getElementById: id => id === 'appLoader' ? loader : label } });
    if (language === 'zh-CN') assert.match(label.textContent, /日历/);
    if (trigger === 'ready') window.dismissAppLoader();
    if (trigger === 'error') handlers.error();
    if (trigger === 'timeout') timers.find(timer => timer.delay === 6000).fn();
    timers.find(timer => timer.delay === 200).fn();
    assert(loader.hidden);
    const count = timers.length;
    window.dismissAppLoader();
    assert.equal(timers.length, count);
  }
});
