const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'shared/family-profile-links.js'), 'utf8');
const render = html.slice(html.indexOf('    function renderKidEditor()'), html.indexOf('    function openKidsDialog()'));
const submit = html.slice(html.indexOf('    kidsForm.addEventListener("submit"'), html.indexOf('    function deleteCalendarActivity('));

test('actual website editor can remove the last child and saves its plans as family activities', () => {
  const context = vm.createContext({});
  vm.runInContext(helper, context);
  vm.runInContext(`
    const window = globalThis, t = key => key, escapeHtml = value => value;
    const KID_AVATARS = ['🧒'], palettes = { blue: {} };
    const saved = { id: 'qa-child', name: 'QA Child', palette: 'blue', avatar: '🧒' };
    let kidProfiles = [saved], kidDraft = [{ ...saved }], kids = {}, handler;
    const activity = { id: 'qa-event', title: 'QA Event', child: saved.name, attendees: [saved.name], future: { keep: true } };
    const state = { activities: [activity] }, writes = [];
    const kidEditorList = {
      children: [], markup: '',
      set innerHTML(value) { this.markup = value; this.children = []; },
      appendChild(row) { this.children.push(row); },
      querySelectorAll() { return this.children; }
    };
    const document = { createElement() {
      const remove = { disabled: false, addEventListener(_type, callback) { this.click = () => { if (this.disabled) throw Error('Disabled'); callback(); }; } };
      return { dataset: {}, markup: '',
        set innerHTML(value) { this.markup = value; remove.disabled = /<button[^>]*\\sdisabled(?:\\s|>)/.test(value); },
        querySelector(selector) { if (selector !== '.remove-kid') throw Error('Unexpected field'); return remove; }
      };
    } };
    const kidsForm = { addEventListener(_type, callback) { handler = callback; } };
    const makeId = () => 'generated', defaultChildName = index => 'Child ' + index;
    const buildKids = profiles => Object.fromEntries(profiles.map(profile => [profile.name, profile]));
    const rememberCurrentSchedule = () => writes.push('checkpoint');
    const saveKids = () => writes.push('kids'), saveActivities = () => writes.push('activities');
    const populateFormOptions = () => {}, closeKidsDialog = () => writes.push('close'), showFeedbackToast = () => {};
  `, context);
  vm.runInContext(render + '\n' + submit + '\nrenderKidEditor();', context);
  assert.equal(vm.runInContext('kidEditorList.children[0].querySelector(".remove-kid").disabled', context), false);
  vm.runInContext('kidEditorList.children[0].querySelector(".remove-kid").click();', context);
  assert.equal(vm.runInContext('kidDraft.length', context), 0);
  assert.equal(vm.runInContext('kidProfiles.length', context), 1, 'removing a draft row does not persist before Save');
  assert.equal(vm.runInContext('state.activities[0].child', context), 'QA Child');
  assert.equal(vm.runInContext('writes.length', context), 0);
  assert.match(vm.runInContext('kidEditorList.markup', context), /kids.empty/);
  vm.runInContext('handler({ preventDefault() {} });', context);
  const result = JSON.parse(vm.runInContext('JSON.stringify({ profiles: kidProfiles, activities: state.activities, writes })', context));
  assert.deepEqual(result.profiles, []);
  assert.deepEqual(result.activities, [{ id: 'qa-event', title: 'QA Event', child: '__family__', attendees: ['all'], future: { keep: true } }]);
  assert.deepEqual(result.writes, ['checkpoint', 'kids', 'activities', 'close']);
});

test('stored empty profiles remain empty after reloading instead of inventing a child', () => {
  const start = html.indexOf('    function loadKids()'), end = html.indexOf('    function loadActivities()', start);
  const value = vm.runInNewContext(html.slice(start, end) + '\nloadKids()', {
    localStorage: { getItem: () => '[]' }, scheduleStorageKey: key => key,
    palettes: { blue: {} }, normalizeKidProfile: value => value,
    defaultKids: [{ name: 'Should not appear', palette: 'blue' }], defaultChildName: () => 'Should not appear',
  });
  assert.equal(value.length, 0);
});
