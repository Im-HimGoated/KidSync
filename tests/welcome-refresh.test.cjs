const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/welcome-refresh.css'), 'utf8');

test('welcome refresh is scoped away from the calendar and delivered offline', () => {
  for (const line of css.split('\n').filter(line => line.includes('{') && !line.trim().startsWith('@'))) {
    assert(line.trim().startsWith('#welcomeScreen'), line);
  }
  const asset = './assets/welcome-refresh.css?v=1';
  assert(html.includes(`href="${asset}"`));
  assert(fs.readFileSync(path.join(root, 'sw.js'), 'utf8').includes(`"${asset}"`));
  assert(!css.includes('linear-gradient'));
});

test('welcome shows the brand over a photo and keeps capabilities outside the hero', () => {
  const welcome = html.slice(html.indexOf('<section class="welcome-screen"'), html.indexOf('<section class="auth-screen"'));
  assert.match(welcome, /<h1[^>]*id="welcomeHeadline"[^>]*><span id="welcomeBrand"/);
  assert.match(welcome, /class="welcome-hero-tagline" data-i18n="welcome.headline"/);
  assert.match(welcome, /fetchpriority="high" width="1920" height="1281"/);
  assert(welcome.indexOf('welcome-overview-band') > welcome.indexOf('welcome-scroll-link'));
  for (const id of ['welcomeTryHero', 'welcomeSignInHero', 'welcomeTryPreview', 'welcomeTryHow']) assert(welcome.includes(`id="${id}"`), id);
});

test('welcome has a phone layout and reduced motion support', () => {
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.welcome-week-preview \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /focus-visible/);
});
