const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/marketing-auth.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets/auth-visual-rotation.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('sign-in page exposes a controllable four-scene photo story', () => {
  assert.match(html, /id="authVisual"/);
  assert.equal((html.match(/class="auth-visual-image/g) || []).length, 2);
  assert.equal((html.match(/data-auth-visual-index=/g) || []).length, 4);
  assert.match(html, /id="authVisualPause"/);
  assert.equal((script.match(/src: "\.\/assets\/kidssync-[^"]+"/g) || []).length, 4);
  assert.match(script, /const rotationDelay = 9000/);
});

test('photo rotation respects visibility, motion preferences, and offline delivery', () => {
  assert.match(script, /document\.hidden/);
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(script, /MutationObserver/);
  assert.match(css, /\.auth-visual-image\.is-active/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.auth-visual-pause \{ display: none; \}/);
  assert.match(script, /function prepareNextSlide\(\)/);
  assert.match(script, /if \(!canRotate\(\)\) return;\s+prepareNextSlide\(\)/);
  for (const asset of ['./assets/auth-visual-rotation.js?v=1', './assets/kidssync-auth-family-signin.jpg']) assert(worker.includes(`"${asset}"`), asset);
  const shell = worker.slice(worker.indexOf('const APP_SHELL'), worker.indexOf('const LAZY_ASSETS'));
  const lazy = worker.slice(worker.indexOf('const LAZY_ASSETS'), worker.indexOf('self.addEventListener("install"'));
  for (const asset of [
    './assets/kidssync-family-entryway-signin.jpg',
    './assets/kidssync-family-park-signin.jpg',
    './assets/kidssync-family-table-signin.jpg'
  ]) {
    assert(!shell.includes(`"${asset}"`), `${asset} should not be precached`);
    assert(lazy.includes(`"${asset}"`), `${asset} should be cached after it is viewed`);
  }
});

test('mobile account access stays compact and hides empty cloud status', () => {
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.auth-screen \.auth-form-side \{ padding: 14px 18px 18px; \}/);
  assert.match(css, /\.auth-screen \.auth-link-btn \{ min-height: 32px; \}/);
  assert.match(css, /\.auth-screen \.auth-preview-btn \{[\s\S]*min-height: 42px;[\s\S]*background: #f7fafb;/);
  assert.match(css, /\.auth-screen \.auth-cloud-note\[hidden\] \{ display: none !important; \}/);
  assert.match(html, /note\.hidden = cloudConfigured;\s+note\.textContent = cloudConfigured \? "" : t\("auth\.cloudSetup"\);/);
  assert.match(html, /marketing-auth\.css\?v=3/);
  assert.match(worker, /marketing-auth\.css\?v=3/);
});
