const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'shared/family-profile-links.js'), 'utf8');
const start = html.indexOf('    kidsForm.addEventListener("submit"');
const end = html.indexOf('    function deleteCalendarActivity(', start);
assert(start >= 0 && end > start);
const source = html.slice(start, end);
const normalizeStart = html.indexOf('    function normalizeKidProfile(');
const normalizeSource = html.slice(normalizeStart, html.indexOf('    function renderSaveStatus(', normalizeStart));

function submit({ original, profiles, activities, available = true, broken = false, normalize = false }) {
  const context = vm.createContext({ seedJSON: JSON.stringify({ original, profiles, activities }) });
  vm.runInContext(`
    const seed = JSON.parse(seedJSON), trace = [], snapshots = [], checkpoints = [];
    let kidProfiles = seed.original, kids = {}, handler;
    const state = { activities: seed.activities, visibleKids: new Set() };
    const window = globalThis;
    const t = key => key;
    const makeId = prefix => prefix + '-generated';
    const defaultChildName = index => 'Child ' + index;
    const palettes = { blue: {}, green: {}, coral: {}, gold: {} }, KID_AVATARS = ['🧒'];
    const rows = seed.profiles.map(profile => ({
      dataset: { id: String(profile.id), originalName: profile.originalName || profile.name },
      querySelector(selector) {
        const field = { '.kid-name-input': 'name', '.kid-palette-select': 'palette', '.kid-avatar-select': 'avatar',
          '.kid-grade-input': 'grade', '.kid-school-input': 'school' }[selector];
        return { value: profile[field] || '' };
      }
    }));
    const kidEditorList = { querySelectorAll: () => rows };
    const kidsForm = { addEventListener: (name, callback) => { if (name !== 'submit') throw Error('Wrong event'); handler = callback; } };
    const buildKids = profiles => Object.fromEntries(profiles.map(profile => [profile.name, profile]));
    const rememberCurrentSchedule = () => { trace.push('checkpoint'); checkpoints.push(JSON.parse(JSON.stringify({ kids: kidProfiles, activities: state.activities }))); };
    function capture(name) { trace.push(name); snapshots.push(JSON.parse(JSON.stringify({ kids: kidProfiles, activities: state.activities }))); }
    const saveKids = () => capture('saveKids');
    const saveActivities = () => capture('saveActivities');
    const populateFormOptions = () => trace.push('populate');
    const closeKidsDialog = () => trace.push('close');
    const showFeedbackToast = message => trace.push(message);
  `, context);
  if (normalize) vm.runInContext(normalizeSource + '\nkidProfiles = kidProfiles.map(normalizeKidProfile);', context);
  if (available) vm.runInContext(helper, context);
  if (broken) vm.runInContext('window.KidsSyncFamilyProfileLinks.remapProfileActivities = () => { throw Error("unavailable"); };', context);
  vm.runInContext(source + '\nhandler({ preventDefault() { trace.push("preventDefault"); } });', context);
  return JSON.parse(vm.runInContext('JSON.stringify({ profiles: kidProfiles, activities: state.activities, visible: [...state.visibleKids], trace, snapshots, checkpoints })', context));
}

const kid = (id = 'child-1', name = 'Casey') => ({ id, name, palette: 'coral', avatar: '🧒', grade: '4', school: 'Test' });
const event = extra => ({ id: 'event', title: 'Practice', child: 'Casey', startDate: '2026-11-23', start: '15:00', end: '16:00',
  attendees: ['Casey'], recurrence: 'weekly', repeatDays: [1], future: { preserve: true }, ...extra });

test('actual website profile removal keeps activities and reassigns the removed child to family', () => {
  const original = [kid()], activities = [event(), event({ id: 'other', child: 'Someone else', attendees: ['Someone else'] }), null, 'legacy'];
  const result = submit({ original, profiles: [], activities });
  assert.equal(result.activities.length, activities.length);
  assert.deepEqual(result.activities, [{ ...activities[0], child: '__family__', attendees: ['all'] }, ...activities.slice(1)]);
  assert.deepEqual(result.checkpoints, [{ kids: original, activities }]);
  assert.deepEqual(result.trace, ['preventDefault', 'checkpoint', 'saveKids', 'saveActivities', 'populate', 'close', 'feedback.kidsSaved']);
  assert.equal(result.snapshots.length, 2);
  assert.deepEqual(result.snapshots[0], result.snapshots[1]);
});

test('actual website profile rename updates names, IDs, childId and attendees without losing metadata', () => {
  const original = [kid(7)], profiles = [kid('7', 'Riley')];
  const activities = [event(), event({ id: 'linked', child: 7, childId: ['7'], attendees: [7, 'Guest', 'all'] })];
  const result = submit({ original, profiles, activities });
  assert.deepEqual(result.activities, [
    { ...activities[0], child: 'Riley', attendees: ['Riley'] },
    { ...activities[1], child: 'Riley', childId: ['Riley'], attendees: ['Riley', 'Guest', 'all'] },
  ]);
  assert.deepEqual(result.profiles, [{ ...profiles[0], id: 7 }]);
  assert.deepEqual(result.visible, ['Riley']);
});

test('unchanged profile IDs and unknown legacy references survive unrelated website profile edits', () => {
  const original = [kid(), kid('child-2', 'Sam')], profiles = [kid(), kid('child-2', 'Sammy')];
  const activities = [event({ child: 'child-1', childId: 'child-1', attendees: ['child-1'] }),
    event({ id: 'legacy', child: 'not-in-profiles', childId: { raw: true }, attendees: ['external'] })];
  const result = submit({ original, profiles, activities });
  assert.deepEqual(result.activities, activities);
});

test('missing or failing profile tools leave all original data and the editing dialog intact', () => {
  const original = [kid()], activities = [event()];
  for (const options of [{ available: false }, { broken: true }]) {
    const result = submit({ original, profiles: [], activities, ...options });
    assert.deepEqual(result.activities, activities); assert.deepEqual(result.profiles, original);
    assert.deepEqual(result.trace, ['preventDefault', 'feedback.kidsSaveFailed']);
    assert.deepEqual(result.snapshots, []); assert.deepEqual(result.checkpoints, []);
  }
});

test('cloud hydration and profile submit retain numeric zero IDs and unknown profile metadata', () => {
  const original = [{ ...kid(0), futureProfile: { notes: ['preserve'] }, nickname: 'C' }];
  const profiles = [kid('0', 'Riley'), kid('new-child', 'New child')];
  const result = submit({ original, profiles, activities: [event({ child: 0, attendees: [0] })], normalize: true });
  assert.deepEqual(result.profiles[0], { ...original[0], ...profiles[0], id: 0 });
  assert.equal(result.profiles[1].id, 'new-child');
  assert.equal(result.profiles[1].futureProfile, undefined);
  assert.equal(result.profiles[1].nickname, undefined);
  assert.equal(result.activities[0].child, 'Riley');
  assert.deepEqual(result.activities[0].attendees, ['Riley']);
});

test('profile reference tools load before the website handler and ship in the updated offline shell', () => {
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert(html.indexOf('src="./shared/family-profile-links.js?v=1"') < start);
  assert.match(worker, /"\.\/shared\/family-profile-links\.js\?v=1"/);
  assert.match(worker, /kidssync-shell-v151/);
});
