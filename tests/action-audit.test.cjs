const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
function source(name) {
  const match = new RegExp(`    (?:async )?function ${name}\\(`).exec(html);
  assert(match, `Missing ${name}`);
  return html.slice(match.index, html.indexOf('\n    }', match.index) + 6);
}
function context(values, names) {
  const ctx = vm.createContext(values);
  names.forEach(name => vm.runInContext(source(name), ctx));
  return ctx;
}
const t = key => key;

test('every static button has a production ID reference or a delegated action binding', () => {
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).join('\n')
    + fs.readdirSync(require.resolve('../assets/experience.js').replace(/experience\.js$/, '')).filter(file => file.endsWith('.js') && !file.endsWith('.min.js')).map(file => fs.readFileSync(require.resolve(`../assets/${file}`), 'utf8')).join('\n');
  const buttons = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  assert(buttons.length >= 250);
  for (const [, attributes, text] of buttons) {
    if (/type="submit"/.test(attributes)) continue;
    const id = attributes.match(/\bid="([^"]+)"/)?.[1];
    if (id && scripts.includes(id)) continue;
    const actions = [...attributes.matchAll(/\b(data-[\w-]+)(?=\s|=|$)/g)].map(match => match[1]).filter(name => !/^(data-(?:i18n|experience-text|smart-text|visual-text|tools-text|tooltip))/.test(name));
    const template = /class="[^"]*\bevent-template\b/.test(attributes) && scripts.includes('querySelectorAll(".event-template")');
    assert(template || actions.some(action => scripts.includes(`[${action}`)), `Unbound button ${id || text.replace(/<[^>]*>/g, '').trim()}`);
  }
});

test('guest Share opens sign-in without exposing or mutating the calendar sharing panel', () => {
  const label = { dataset: {}, textContent: '' }, button = { dataset: {}, querySelector: () => label, setAttribute(key, value) { this[key] = value; } };
  const calls = [];
  const ctx = context({ activeAccount: null, t, document: { getElementById: id => { assert.equal(id, 'shareSchedule'); return button; } }, showAuthScreen: view => calls.push(view) }, ['updateShareAction', 'openShareDialog']);
  ctx.updateShareAction(); assert.equal(button.disabled, false); assert.equal(label.textContent, 'auth.signInToShare');
  ctx.openShareDialog(); assert.deepEqual(calls, ['signin']);
  ctx.activeAccount = { id: 'owner' }; ctx.updateShareAction(); assert.equal(label.textContent, 'sharing.share');
});

test('clipboard failures preserve a selected manual fallback and never claim success', async () => {
  let selected = 0, execResult = false;
  const field = { isConnected: true, getClientRects: () => [{}], focus() {}, select() { selected++; } };
  const ctx = context({ navigator: { clipboard: { async writeText() { throw Error('blocked'); } } }, document: { execCommand: () => execResult } }, ['copyTextToClipboard']);
  assert.equal(await ctx.copyTextToClipboard('Family plan', field), false); assert.equal(field.value, 'Family plan'); assert.equal(selected, 1);
  execResult = true; assert.equal(await ctx.copyTextToClipboard('second', field), true);
  ctx.document.execCommand = () => { throw Error('unsupported'); };
  assert.equal(await ctx.copyTextToClipboard('third', field), false);
  field.isConnected = false; assert.equal(await ctx.copyTextToClipboard('late', field), false); assert.equal(field.value, 'third');
  ctx.navigator.clipboard.writeText = async () => {};
  assert.equal(await ctx.copyTextToClipboard('copied without fallback'), true);
});

test('blocked or failed print windows return false and successful previews contain the calendar', () => {
  const writes = [], reports = []; let closed = false;
  const popup = { document: { open() {}, write: value => writes.push(value), close() {} }, close() { closed = true; } };
  const ctx = context({ window: { open: () => null }, buildPrintableScheduleHtml: () => '<h1>Family calendar</h1>', reportClientError: error => reports.push(error) }, ['openPrintableSchedule']);
  assert.equal(ctx.openPrintableSchedule(), false);
  ctx.window.open = () => popup; assert.equal(ctx.openPrintableSchedule(), true); assert.match(writes[0], /Family calendar/);
  popup.document.write = () => { throw Error('blocked document'); }; assert.equal(ctx.openPrintableSchedule(), false); assert(closed); assert.equal(reports.length, 1);
  ctx.window.open = () => { throw Error('restricted window'); }; assert.equal(ctx.openPrintableSchedule(), false);
});

test('PDF fallback reports a blocked popup instead of claiming print preview opened', () => {
  const status = {};
  const ctx = context({ calendars: [], currentCalendarId: 'family', state: { activities: [] }, window: {}, t,
    document: { getElementById: () => status }, openPrintableSchedule: () => false }, ['exportSchedulePdf']);
  ctx.exportSchedulePdf(); assert.equal(status.textContent, 'sharing.printBlocked');
  ctx.openPrintableSchedule = () => true; ctx.exportSchedulePdf(); assert.equal(status.textContent, 'sharing.pdfFallback');
});

test('email handoff exposes copyable content and explains that KidsSync has not sent mail', () => {
  const nodes = { shareText: {}, shareStatus: {} };
  const ctx = context({ calendars: [{ id: 'family', name: 'Family' }], currentCalendarId: 'family', FAMILY_CHILD: '__family__',
    upcomingOccurrences: () => [{ title: 'School', child: 'Alex', startDate: '2027-02-01', start: '09:00', end: '10:00' }],
    t, window: { location: {} }, document: { getElementById: id => nodes[id] } }, ['emailWeeklySummary']);
  ctx.emailWeeklySummary();
  assert.match(ctx.window.location.href, /^mailto:\?subject=/); assert(nodes.shareText.value.includes('School'));
  assert.equal(nodes.shareStatus.textContent, 'sharing.emailOpened');
  assert(decodeURIComponent(ctx.window.location.href).includes(nodes.shareText.value));
});

test('settings email action requires sign-in and then opens the actual summary workflow', () => {
  const calls = [];
  const ctx = context({ activeAccount: null, closeSettingsDialog: () => calls.push('close'), showAuthScreen: view => calls.push(view),
    openShareDialog: () => calls.push('share'), emailWeeklySummary: () => calls.push('email'), window: { KidsSyncExperience: { selectShareTab: tab => calls.push(tab) } }
  }, ['handleEmailSummaryAction']);
  ctx.handleEmailSummaryAction(); assert.deepEqual(calls, ['close', 'signin']);
  calls.length = 0; ctx.activeAccount = { id: 'owner' }; ctx.handleEmailSummaryAction();
  assert.deepEqual(calls, ['close', 'share', 'files', 'email']);
});

function nativeShareFixture(share) {
  const nodes = { shareStatus: {}, nativeShareSchedule: { addEventListener(_, fn) { this.click = fn; } } };
  const start = html.indexOf('    document.getElementById("nativeShareSchedule").addEventListener(');
  const end = html.indexOf('\n    });', start) + 8;
  const ctx = vm.createContext({ File: class {}, buildReadOnlyCalendarHtml: () => '<h1>Calendar</h1>', navigator: { canShare: () => true, share }, t, document: { getElementById: id => nodes[id] } });
  vm.runInContext(html.slice(start, end), ctx);
  return nodes;
}
test('native sharing gives explicit success, cancellation and unsupported-device feedback', async () => {
  const success = nativeShareFixture(async () => {}); await success.nativeShareSchedule.click(); assert.equal(success.shareStatus.textContent, 'sharing.shareCompleted');
  const cancel = nativeShareFixture(async () => { const error = Error('cancel'); error.name = 'AbortError'; throw error; });
  await cancel.nativeShareSchedule.click(); assert.equal(cancel.shareStatus.textContent, 'sharing.shareCancelled');
  const unavailable = nativeShareFixture(undefined); await unavailable.nativeShareSchedule.click(); assert.equal(unavailable.shareStatus.textContent, 'sharing.unavailable');
});

function membersFixture() {
  const status = {}, calls = []; let response = Promise.resolve({ error: null });
  const query = { delete() { calls.push('delete'); return this; }, eq() { return this; }, then(resolve, reject) { return response.then(resolve, reject); } };
  const ctx = context({ calendarMembers: [{ id: 'member-1', member_email: 'alex@example.test', role: 'viewer', status: 'active' }],
    memberRequests: new Set(), cloudSession: { user: { id: 'owner' } }, currentScope: 'family', calendarStorageKey: () => ctx.currentScope,
    isCalendarOwner: () => true, cloudClient: { rpc: (name, data) => { calls.push({ name, data }); return response; }, from: () => query },
    document: { getElementById: () => status }, t, renderMemberList: () => calls.push('render'), saveCalendarMembers: () => calls.push('save'), reportClientError() {}
  }, ['normalizeMemberRole', 'persistMemberChange', 'updateMember', 'updateMemberRole', 'removeMember']);
  return { ctx, calls, status, setResponse: value => { response = value; } };
}
test('failed role, ban and removal requests retain the displayed permissions and report failure', async () => {
  for (const action of ['role', 'ban', 'remove']) {
    const f = membersFixture(), before = JSON.stringify(f.ctx.calendarMembers);
    f.setResponse(Promise.resolve({ error: { message: 'denied' } }));
    if (action === 'role') await f.ctx.updateMemberRole('member-1', 'editor');
    else if (action === 'ban') await f.ctx.updateMember('member-1');
    else await f.ctx.removeMember('member-1');
    assert.equal(JSON.stringify(f.ctx.calendarMembers), before); assert(!f.calls.includes('save'));
    assert.equal(f.status.textContent, 'sharing.memberUpdateFailed'); assert.equal(f.ctx.memberRequests.size, 0);
  }
});

test('access updates wait for server confirmation, ignore duplicate clicks, and preserve a different calendar', async () => {
  const f = membersFixture(); let finish;
  f.setResponse(new Promise(resolve => { finish = resolve; }));
  const pending = f.ctx.updateMemberRole('member-1', 'editor');
  assert.equal(f.ctx.calendarMembers[0].role, 'viewer');
  await f.ctx.updateMemberRole('member-1', 'commenter');
  assert.equal(f.calls.filter(call => call.name).length, 1);
  finish({ error: null }); await pending;
  assert.equal(f.ctx.calendarMembers[0].role, 'editor'); assert.equal(f.status.textContent, 'sharing.roleUpdated');
  f.setResponse(new Promise(resolve => { finish = resolve; }));
  const stale = f.ctx.updateMember('member-1'); f.ctx.currentScope = 'school';
  f.ctx.calendarMembers = [{ id: 'school-member', status: 'active', role: 'viewer' }];
  finish({ error: null }); await stale;
  assert.equal(f.ctx.calendarMembers[0].id, 'school-member'); assert.equal(f.ctx.calendarMembers[0].status, 'active');
});

test('offline exceptions are handled, owners alone can change access, and cache errors do not misreport server success', async () => {
  const f = membersFixture();
  f.ctx.cloudClient.rpc = async () => { throw Error('offline'); };
  assert.equal(await f.ctx.updateMember('member-1'), false); assert.equal(f.ctx.calendarMembers[0].status, 'active');
  f.ctx.isCalendarOwner = () => false; const calls = f.calls.length;
  await f.ctx.removeMember('member-1'); assert.equal(f.calls.length, calls);
  f.ctx.isCalendarOwner = () => true; f.ctx.cloudClient.rpc = async () => ({ error: null });
  f.ctx.saveCalendarMembers = () => { throw Error('quota'); };
  assert.equal(await f.ctx.updateMemberRole('member-1', 'editor'), true);
  assert.equal(f.ctx.calendarMembers[0].role, 'editor'); assert.equal(f.status.textContent, 'sharing.memberCacheWarning');
});

test('member refresh responses cannot populate the wrong account/calendar after switching', async () => {
  let finish;
  const query = { select() { return this; }, eq() { return this; }, order: () => new Promise(resolve => { finish = resolve; }) };
  const ctx = context({ isCalendarOwner: () => true, calendarStorageKey: () => ctx.scope, scope: 'family', currentCalendarId: 'family', cloudSession: { user: { id: 'owner' } },
    cloudClient: { from: () => query }, calendarMembers: [] }, ['refreshCloudCalendarMembers']);
  const pending = ctx.refreshCloudCalendarMembers(); ctx.scope = 'school';
  finish({ data: [{ id: 'private-family-member' }], error: null }); assert.equal(await pending, false); assert.equal(ctx.calendarMembers.length, 0);
});

test('failed invitation lookup, insert, or network never create a fake local invitation or leave controls busy', async () => {
  for (const mode of ['lookup', 'insert', 'network']) {
    const nodes = { memberEmail: { value: 'friend@example.test', checkValidity: () => true }, memberRole: { value: 'editor' }, memberNote: { value: 'Welcome' }, shareStatus: {}, addMember: {} };
    const query = { select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: null, error: mode === 'lookup' ? { message: 'denied' } : null }; },
      async insert() { if (mode === 'network') throw Error('offline'); return { error: { message: 'not allowed' } }; }
    };
    const ctx = context({ isCalendarOwner: () => true, normalizeEmail: value => value.trim().toLowerCase(), normalizeMemberRole: value => value,
      activeAccount: { email: 'owner@example.test' }, cloudSession: { user: { id: 'owner' } }, currentCalendarId: 'family', calendars: [],
      calendarStorageKey: () => 'owner:family', memberRequests: new Set(), calendarMembers: [{ id: 'existing' }],
      cloudClient: { from: () => query }, document: { getElementById: id => nodes[id] }, t, reportClientError() {}
    }, ['addMember']);
    await ctx.addMember(); assert.equal(ctx.calendarMembers.length, 1); assert.equal(ctx.calendarMembers[0].id, 'existing');
    assert.equal(nodes.shareStatus.textContent, 'sharing.inviteFailed'); assert.equal(nodes.addMember.disabled, false);
    assert.equal(nodes.memberEmail.value, 'friend@example.test'); assert.equal(ctx.memberRequests.size, 0);
  }
});

test('mobile dock More reveals a hidden controls panel before opening its menu', () => {
  const script = fs.readFileSync(require.resolve('../assets/interface-upgrades.js'), 'utf8');
  let handler, applied = 0, focused = 0, stopped = 0;
  const menu = { open: false, querySelector: () => ({ focus: () => focused++, click: () => { menu.open = true; } }) };
  const dock = { set innerHTML(value) {}, addEventListener(_, fn) { handler = fn; } };
  const hiddenWorkspacePanels = new Set(['controls']);
  const ctx = vm.createContext({ document: { createElement: () => dock, getElementById: id => id === 'mobileActionDock' ? null : id === 'appShell' ? { append() {} } : menu },
    hiddenWorkspacePanels, showCalendarPage() {}, applyWorkspaceVisibility: () => applied++ });
  vm.runInContext(script.slice(script.indexOf('  function createMobileDock('), script.indexOf('  function applyFamilyStrip(')), ctx);
  ctx.createMobileDock(); handler({ stopPropagation: () => stopped++, target: { closest: () => ({ dataset: { dockAction: 'more' } }) } });
  assert.equal(hiddenWorkspacePanels.has('controls'), false); assert.equal(applied, 1); assert.equal(menu.open, true); assert.equal(focused, 1); assert.equal(stopped, 1);
});

test('mobile disclosure sheets leave room for the fixed action dock', () => {
  const css = fs.readFileSync(require.resolve('../assets/interface-upgrades.css'), 'utf8');
  for (const selector of ['.more-actions[open] .more-actions-menu', '.planner-options[open] .planner-options-panel', '.calendar-view-menu[open] .calendar-view-menu-panel']) {
    assert(css.includes(`#appShell ${selector}`));
  }
  assert.match(css, /bottom: calc\(80px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /max-height: min\(70dvh, calc\(100dvh - 112px - env\(safe-area-inset-bottom\)\)\);/);
});

test('expired-preview sign-in does not require a new family profile, while sign-up still validates it', () => {
  let validated = 0, saved = 0, closed = 0, shown;
  const nodes = { previewProfileForm: { reportValidity: () => { validated++; return false; } }, signInEmail: { focus() {} } };
  const ctx = context({ document: { getElementById: id => nodes[id] }, requestAnimationFrame: fn => fn(),
    saveFamilyProfile: () => saved++, closeDialogsForAccountAccess: () => closed++, showAuthScreen: view => { shown = view; }
  }, ['openAuthFromPreview']);
  ctx.openAuthFromPreview('signin');
  assert.equal(shown, 'signin'); assert.equal(closed, 1); assert.equal(validated, 0); assert.equal(saved, 0);
  shown = null;
  ctx.openAuthFromPreview('signup');
  assert.equal(shown, null); assert.equal(closed, 1); assert.equal(validated, 1); assert.equal(saved, 0);
});
