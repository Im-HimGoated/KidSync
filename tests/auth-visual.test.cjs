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
  for (const asset of [
    './assets/kidssync-family-entryway-signin.jpg',
    './assets/kidssync-family-park-signin.jpg',
    './assets/kidssync-family-table-signin.jpg'
  ]) assert(!worker.includes(`"${asset}"`), `${asset} should load only when sign-in is visible`);
});
