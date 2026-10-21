const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

test('help is clearly reachable from desktop and mobile navigation', () => {
  assert.match(html, /sidebar-nav-item[^>]*data-sidebar-action="help"[\s\S]*?data-i18n="sidebar\.help">Help<\/span>/);
  assert.match(html, /sidebar-help-button[^>]*data-sidebar-action="help"[\s\S]*?class="sidebar-help-label"[^>]*>Help<\/span>/);
  assert.match(html, /mobile-menu-item[^>]*data-sidebar-action="help"[^>]*data-i18n="sidebar\.help"/);
  assert.match(html, /if \(action === "help"\) \{\s*openSidebarHelp\(\);/);
});

test('main navigation also keeps settings easy to find', () => {
  assert.match(html, /sidebar-nav-item[^>]*data-sidebar-action="settings"[\s\S]*?data-i18n="sidebar\.settings">Settings<\/span>/);
});

test('help answers the four most common getting-started questions', () => {
  assert.match(html, /id="sidebarHelpQuestionsTitle"[^>]*data-i18n="sidebar\.questionsTitle"/);
  for (const key of ['questionAdd', 'questionEdit', 'questionSave', 'questionShare']) {
    assert.match(html, new RegExp(`data-i18n="sidebar\\.${key}"`));
  }
  assert.match(html, /"sidebar\.questionsTitle": "Common questions"/);
  assert.match(html, /"sidebar\.questionsTitle": "常见问题"/);
});
