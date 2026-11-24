const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { remapProfileActivities } = require('../shared/family-profile-links');

const kid = (id, name, extra = {}) => ({ id, name, ...extra });
const event = extra => ({ id: 'plan', title: 'Practice', child: 'Casey', attendees: ['Casey'], future: { keep: [1, 2] }, ...extra });

test('removing a named profile retains every activity and reassigns its references to family', () => {
  const original = [kid('casey', 'Casey'), kid('riley', 'Riley')];
  const activities = [event(), event({ id: 'other', child: 'Riley', attendees: ['Riley'] }), event({ id: 'family', child: '__family__', attendees: ['all'] })];
  const saved = remapProfileActivities(activities, original, [original[1]]);
  assert.equal(saved.length, activities.length);
  assert.equal(saved[0].child, '__family__'); assert.deepEqual(saved[0].attendees, ['all']);
  assert.deepEqual(saved[0].future, activities[0].future);
  assert.deepEqual(saved.slice(1), activities.slice(1));
});

test('renames update names and numeric or string ID aliases in child, childId and attendees', () => {
  const before = [kid(7, 'Casey')], after = [kid('7', 'Riley')];
  const activities = [
    event({ child: 7, attendees: [7, '7', 'Casey'] }),
    event({ id: 'string', child: '7', childId: 7, attendees: ['Casey', 'Outside'] }),
    event({ id: 'named', child: 'Casey', childId: 'Casey' }),
  ];
  const saved = remapProfileActivities(activities, before, after);
  for (const activity of saved) assert.equal(activity.child, 'Riley');
  assert.equal(saved[1].childId, 'Riley'); assert.equal(saved[2].childId, 'Riley');
  assert.deepEqual(saved[0].attendees, ['Riley']);
  assert.deepEqual(saved[1].attendees, ['Riley', 'Outside']);
});

test('unchanged IDs keep their original representation and unresolved references stay intact', () => {
  const activities = [event({ child: 7, childId: '7', attendees: [7, '7', 'Casey'] }),
    event({ id: 'unknown', child: 'Outside', attendees: ['Outside', 'Outside', null] })];
  const saved = remapProfileActivities(activities, [kid(7, 'Casey')], [kid('7', 'Casey')]);
  assert.deepEqual(saved, activities);
  assert.equal(saved[0].attendees, activities[0].attendees);
  assert.equal(saved[1].attendees, activities[1].attendees);
});

test('removed IDs and legacy childId-only records become family without inventing a child field', () => {
  const legacy = event({ childId: '7', attendees: [7] }); delete legacy.child;
  const saved = remapProfileActivities([legacy, event({ child: 7 })], [kid(7, 'Casey')], []);
  assert.equal(saved[0].childId, '__family__'); assert.equal(Object.hasOwn(saved[0], 'child'), false);
  assert.deepEqual(saved[0].attendees, ['all']); assert.equal(saved[1].child, '__family__');
});

test('array references remove only retired people and preserve existing null or unknown values', () => {
  const activities = [event({ child: [7, '7', 'Casey', 'Outside', null], childId: [7], attendees: ['Casey', 'Outside', null] }),
    event({ id: 'retired-only', child: [7, 'Casey'], attendees: ['Casey'] })];
  const saved = remapProfileActivities(activities, [kid(7, 'Casey')], []);
  assert.deepEqual(saved[0].child, ['Outside', null]); assert.equal(saved[0].childId, '__family__');
  assert.deepEqual(saved[0].attendees, ['Outside', null]);
  assert.equal(saved[1].child, '__family__'); assert.deepEqual(saved[1].attendees, ['all']);
});

test('ID-less legacy profiles match retained exact names and removed names become family', () => {
  const activities = [event(), event({ id: 'riley', child: 'Riley', attendees: ['Riley'] })];
  const saved = remapProfileActivities(activities, [{ name: 'Casey' }, { name: 'Riley' }], [kid('new-casey', 'Casey')]);
  assert.deepEqual(saved[0], activities[0]); assert.equal(saved[1].child, '__family__');
  assert.deepEqual(saved[1].attendees, ['all']);
});

test('exact names take precedence when a name also matches another profile ID', () => {
  const before = [kid('alias', 'Casey'), kid('other', 'alias')];
  const after = [kid('alias', 'Casey renamed'), kid('other', 'alias')];
  const saved = remapProfileActivities([event({ child: 'alias', attendees: ['alias', 'Casey'] })], before, after);
  assert.equal(saved[0].child, 'alias'); assert.deepEqual(saved[0].attendees, ['alias', 'Casey renamed']);
});

test('family sentinels stay family even in malformed legacy profile data', () => {
  const activities = [event({ child: '__family__', childId: 'all', attendees: ['all', '__family__'] })];
  assert.deepEqual(remapProfileActivities(activities, [kid('all', 'all'), kid('__family__', '__family__')], []), activities);
});

test('malformed legacy activities and reference metadata are retained without filtering', () => {
  const marker = { malformed: 'reference' }, list = ['legacy'], date = new Date(0);
  const activities = [null, false, 17, 'legacy', list, date,
    event({ child: marker, childId: false, attendees: 'legacy' }),
    { id: 'missing-fields', future: { unknown: true } },
    event({ child: null, childId: 0, attendees: [null, null, marker] })];
  const saved = remapProfileActivities(activities, [kid('casey', 'Casey')], []);
  assert.equal(saved.length, activities.length);
  assert.deepEqual(saved, activities);
  for (let index = 0; index < 6; index++) assert.equal(saved[index], activities[index]);
  assert.equal(saved[6].child, marker); assert.equal(saved[6].attendees, 'legacy');
  assert.equal(saved[8].attendees, activities[8].attendees);
});

test('prototype-like names remap safely and unknown own properties remain data', () => {
  const activity = JSON.parse('{"id":"plan","child":"__proto__","attendees":["constructor","toString"],"__proto__":{"keep":true}}');
  const before = [kid('1', '__proto__'), kid('2', 'constructor'), kid('3', 'toString')];
  const after = [kid('1', 'Riley'), kid('3', 'toString')];
  const saved = remapProfileActivities([activity], before, after)[0];
  assert.equal(saved.child, 'Riley'); assert.deepEqual(saved.attendees, ['toString']);
  assert.equal(Object.hasOwn(saved, '__proto__'), true); assert.deepEqual(saved.__proto__, { keep: true });
  assert.equal(Object.getPrototypeOf(saved), Object.prototype); assert.equal({}.keep, undefined);
});

test('frozen inputs and their nested unknown metadata never mutate', () => {
  const before = Object.freeze([Object.freeze(kid('casey', 'Casey'))]);
  const after = Object.freeze([Object.freeze(kid('casey', 'Riley'))]);
  const metadata = Object.freeze({ preserve: true });
  const original = Object.freeze(event({ future: metadata, attendees: Object.freeze(['Casey']) }));
  const activities = Object.freeze([original]);
  const saved = remapProfileActivities(activities, before, after);
  assert.notEqual(saved, activities); assert.notEqual(saved[0], original);
  assert.equal(saved[0].future, metadata); assert.equal(original.child, 'Casey');
  assert.deepEqual(original.attendees, ['Casey']); assert.equal(before[0].name, 'Casey');
});

test('invalid top-level collections are left untouched', () => {
  for (const invalid of [null, false, {}, 'legacy']) {
    assert.equal(remapProfileActivities(invalid, [], []), invalid);
    const activities = [event()];
    assert.equal(remapProfileActivities(activities, invalid, []), activities);
    assert.equal(remapProfileActivities(activities, [], invalid), activities);
  }
});

test('browser global and CommonJS implementations return identical results', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../shared/family-profile-links'), 'utf8'), context);
  const input = {
    activities: [event({ child: [7, 'Casey', null], childId: '7', attendees: [7, 'Outside'] }),
      event({ id: 'family', child: '__family__', attendees: ['all'] }), null],
    before: [kid(7, 'Casey')], after: [kid('7', 'Riley')],
  };
  context.input = JSON.stringify(input);
  const browser = vm.runInContext('(() => { const {activities,before,after}=JSON.parse(input); return JSON.stringify(KidsSyncFamilyProfileLinks.remapProfileActivities(activities,before,after)); })()', context);
  assert.deepEqual(JSON.parse(browser), remapProfileActivities(input.activities, input.before, input.after));
  assert.deepEqual(Object.keys(context.KidsSyncFamilyProfileLinks), ['remapProfileActivities']);
});
