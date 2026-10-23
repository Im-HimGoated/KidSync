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
  const asset = html.match(/href="(\.\/assets\/welcome-refresh\.css\?v=\d+)"/)[1];
  assert(html.includes(`href="${asset}"`));
  assert(fs.readFileSync(path.join(root, 'sw.js'), 'utf8').includes(`"${asset}"`));
  assert(!css.includes('linear-gradient'));
});

test('welcome leads with a useful headline, alongside a photo and a clearly labelled sample', () => {
  const welcome = html.slice(html.indexOf('<section class="welcome-screen"'), html.indexOf('<section class="auth-screen"'));
  assert.match(welcome, /<h1[^>]*id="welcomeHeadline"[^>]*data-i18n="welcome.headline"/);
  assert.equal((welcome.match(/<h1\b/g) || []).length, 1);
  assert.match(welcome, /class="welcome-hero-peek" href="#welcomePreview"[^>]*data-i18n-aria="welcome.heroPeekAria"/);
  assert.match(welcome, /data-i18n="welcome.heroPeekNote">A glimpse of the sample week/);
  assert.doesNotMatch(welcome, /class="welcome-hero-visual" aria-hidden="true"/);
  assert.match(welcome, /fetchpriority="high" width="1920" height="1281"/);
  assert(welcome.indexOf('welcome-overview-band') > welcome.indexOf('welcome-hero'));
  assert(!welcome.includes('welcome-scroll-link'));
  for (const id of ['welcomeTryHero', 'welcomeSignInHero', 'welcomeTryPreview', 'welcomeTryHow']) assert(welcome.includes(`id="${id}"`), id);
});

test('the photo-led hero and numbered about cards have explicit responsive spacing', () => {
  assert.match(css, /\.welcome-hero-inner \{[^}]*display: flex[^}]*min-height: 645px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.welcome-hero-inner \{ display: flex; min-height: 620px/);
  assert.match(css, /\.welcome-about-point \{[^}]*grid-template-columns: 36px minmax\(0, 1fr\)[^}]*padding: 22px/);
  assert.match(html, /"welcome.heroPeekAria": "查看这些家庭日程示例"/);
  assert.match(css, /\.welcome-hero-visual::after \{[^}]*display: block;[^}]*background: rgba\(5,30,25,\.69\)/);
  assert.match(css, /scroll-margin-top: 96px/);
  assert.match(css, /\.welcome-trial-points \{[^}]*display: flex/);
  assert.match(html, /"welcome.previewBlank": "从空白日历开始"/);
});

test('welcome has a phone layout and reduced motion support', () => {
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.welcome-week-preview \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /focus-visible/);
});

test('landing touch controls do not depend on unreleased calendar mobile styles', () => {
  assert.match(css, /\.welcome-wordmark \{ min-height: 44px/);
  assert.match(css, /\.welcome-nav \.welcome-nav-actions \.language-switch \{[^}]*width: 96px/);
  assert.match(css, /\.welcome-nav \.language-option \{ min-width: 44px; min-height: 44px/);
  assert.match(css, /\.welcome-sample-filters button \{ min-height: 44px/);
  assert.match(css, /@media \(max-width: 1050px\)[\s\S]*?\.welcome-hero-peek \{ display: none; \}/);
});
