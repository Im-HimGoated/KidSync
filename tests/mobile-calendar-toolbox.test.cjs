const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../mobile/src/ui/CalendarToolbox.js'), 'utf8');
// Execute the actual dependency-free navigation contract without a native runtime.
const pure = source.slice(source.indexOf('export const toolboxCopy'), source.indexOf('// UI:')).replace(/export /g, '');
const { toolboxCopy, toolboxSections, resolveToolAction, runToolAction } = vm.runInNewContext(`${pure}; ({toolboxCopy, toolboxSections, resolveToolAction, runToolAction})`);
const plain = value => JSON.parse(JSON.stringify(value));
const nativeIds = ['open-time', 'compare-days', 'day-notes', 'share-week', 'find-events', 'saved-views'];
const webIds = ['scan-document', 'connected-calendars', 'google-import', 'activity-history', 'version-history', 'export-calendar', 'print-schedule'];

test('tool directory covers each agreed native and website intent once with complete EN/ZH copy', () => {
  assert.deepEqual(Object.keys(toolboxCopy.en), Object.keys(toolboxCopy.zh));
  const tools = toolboxSections.flatMap(section => section.tools);
  const ids = Array.from(tools, tool => tool.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice().sort(), [...nativeIds, ...webIds, 'calendar-preferences'].sort());
  for (const language of ['en', 'zh']) {
    const copy = toolboxCopy[language];
    for (const section of toolboxSections) assert(copy[section.id]);
    for (const tool of tools) {
      assert(copy[tool.label]);
      assert(copy[`${tool.label}Web`]);
      if (tool.native) assert(copy[`${tool.label}Hint`]);
    }
    for (const key of ['webHint', 'webNote', 'unavailableHint', 'failed', 'close']) assert(copy[key]);
  }
});

test('resolving the menu is read-only and never opens a screen or website automatically', () => {
  const calls = [], options = { onPlanning: id => calls.push(id), onPreferences: () => calls.push('preferences'), onWebsite: id => calls.push(id), nativeAvailability: Object.fromEntries(nativeIds.map(id => [id, true])) };
  for (const section of toolboxSections) for (const tool of section.tools) resolveToolAction(tool.id, options);
  assert.deepEqual(calls, []);
});

test('implemented planning tools call the exact native mode, without closing a replacement sheet', async () => {
  const calls = [], options = {
    nativeAvailability: Object.fromEntries(nativeIds.map(id => [id, true])),
    onPlanning: id => calls.push(['native', id]), onWebsite: id => calls.push(['web', id]), onClose: () => calls.push(['close'])
  };
  for (const id of nativeIds) assert.deepEqual(plain(await runToolAction(id, options)), { ok: true, kind: 'native' });
  assert.deepEqual(calls, nativeIds.map(id => ['native', id]));
});

test('onTool is a native planning fallback only when the exact capability is enabled', async () => {
  const calls = [], options = { nativeAvailability: { 'compare-days': true }, onTool: id => calls.push(id) };
  assert.equal(resolveToolAction('compare-days', options).kind, 'native');
  assert.equal(resolveToolAction('day-notes', options).kind, 'unavailable');
  await runToolAction('compare-days', options);
  assert.deepEqual(calls, ['compare-days']);
});

test('missing, false, truthy-string and inherited capabilities never advertise a native feature', () => {
  const handler = () => {}, maps = [undefined, {}, { 'open-time': false }, { 'open-time': 'true' }, Object.create({ 'open-time': true })];
  for (const nativeAvailability of maps) assert.equal(resolveToolAction('open-time', { nativeAvailability, onPlanning: handler, onWebsite: handler }).kind, 'web');
  assert.equal(resolveToolAction('open-time', { nativeAvailability: { 'open-time': true }, onWebsite: handler }).kind, 'web');
});

test('preferences use their dedicated callback and use an explicit Web fallback if absent', async () => {
  const calls = [];
  await runToolAction('calendar-preferences', { onPreferences: () => calls.push('native'), onWebsite: () => calls.push('web') });
  await runToolAction('calendar-preferences', { onWebsite: id => calls.push(id) });
  assert.deepEqual(calls, ['native', 'calendar-preferences']);
});

test('scan, connections, import, history, export and print always stay explicit Web actions', async () => {
  const calls = [], options = { nativeAvailability: Object.fromEntries(webIds.map(id => [id, true])), onPlanning: () => { throw new Error('wrong route'); }, onTool: () => { throw new Error('wrong route'); }, onWebsite: id => calls.push(id) };
  for (const id of webIds) {
    assert.equal(resolveToolAction(id, options).kind, 'web');
    assert.deepEqual(plain(await runToolAction(id, options)), { ok: true, kind: 'web' });
  }
  assert.deepEqual(calls, webIds);
});

test('unknown commands and missing callbacks are unavailable without side effects', async () => {
  let calls = 0;
  for (const id of [null, '', 'https://example.com', 'javascript:alert(1)', '__proto__', 'not-a-tool']) {
    assert.deepEqual(plain(await runToolAction(id, { onWebsite: () => { calls++; } })), { ok: false, reason: 'unavailable' });
  }
  for (const id of [...nativeIds, ...webIds, 'calendar-preferences']) assert.equal(resolveToolAction(id, {}).kind, 'unavailable');
  assert.equal(calls, 0);
});

test('rejected, thrown, false and explicit error results retain failure without silently opening the web', async () => {
  let webCalls = 0;
  for (const onPlanning of [() => false, () => ({ error: 'blocked' }), () => { throw new Error('failed'); }, async () => { throw new Error('offline'); }]) {
    const result = await runToolAction('open-time', { nativeAvailability: { 'open-time': true }, onPlanning, onWebsite: () => { webCalls++; } });
    assert.deepEqual(plain(result), { ok: false, reason: 'failed' });
  }
  assert.equal(webCalls, 0);
  assert.deepEqual(plain(await runToolAction('print-schedule', { onWebsite: async () => false })), { ok: false, reason: 'failed' });
});

test('website routes correspond to existing KidsSync tools rather than invented native support', () => {
  const web = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  for (const id of ['gameScanPanel', 'openGoogleImport', 'openActivityHistory', 'openVersionHistory', 'exportIcs', 'printSchedule', 'openWeeklySummary']) assert(web.includes(`id="${id}"`), id);
  const connections = fs.readFileSync(require.resolve('../assets/external-calendars.js'), 'utf8');
  assert(connections.includes("button.id='openExternalCalendars'"));
  assert.match(toolboxCopy.en.webNote, /sign in there or finish provider setup/);
  assert.doesNotMatch(source, /Linking\.openURL|Share\.share|supabase|\.insert\(|\.upsert\(/);
});
