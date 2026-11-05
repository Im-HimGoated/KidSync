const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const trial = require('../mobile/src/lib/native-trial');
const event = extra => ({ title: 'Early flight', startDate: '2026-10-23', start: '01:30', end: '02:30', child: 'Maya', ...extra });
function device() {
  const data = new Map();
  return { data, getItem: async key => data.get(key) ?? null, setItem: async (key, value) => data.set(key, value) };
}
test('native preview starts blank and resumes the same clock, plans and profile without reset', async () => {
  const storage = device(), store = trial.createTrialStore(storage);
  assert.equal(await store.load(), null);
  const first = await store.start();
  assert.equal(first.events.length, 0); assert.equal(first.elapsedMs, 0);
  await store.saveEvent(event()); await store.advance(39000);
  await store.saveProfile({ name: 'Alex', calendarName: 'Our week', icon: '⭐', description: 'Parent' });
  const reopened = await trial.createTrialStore(storage).start();
  assert.equal(reopened.id, first.id); assert.equal(reopened.elapsedMs, 39000); assert.equal(reopened.events[0].start, '01:30');
  assert.equal(reopened.profile.calendarName, 'Our week');
});
test('foreground time pauses outside the calendar, clamps clock jumps and resumes without background time', () => {
  let now = 0; const deltas = [], clock = trial.createForegroundClock(delta => deltas.push(delta), () => now);
  clock.setActive(true); now = 1000; clock.sample(); now = 1500; clock.setActive(false);
  now = 100000; clock.sample(); clock.setActive(true); now = 101000; clock.sample(); now = 100; clock.sample();
  assert.deepEqual(deltas, [1000, 500, 1000, 0]);
});
test('ten minutes expires edits, survives restart, and still allows personalization and event draft preservation', async () => {
  const storage = device(), store = trial.createTrialStore(storage);
  await store.start(); await store.saveEvent(event()); await store.advance(trial.LIMIT_MS - 1);
  assert.equal(trial.remainingLabel((await store.load()).elapsedMs), '0:01');
  await store.advance(1); assert.equal(trial.remainingLabel((await store.load()).elapsedMs), '0:00');
  await assert.rejects(store.saveEvent(event()), { code: 'expired' });
  await assert.rejects(store.removeEvent((await store.load()).events[0].id), { code: 'expired' });
  await store.saveDraft(event({ title: 'Unfinished' }));
  await store.saveProfile({ name: 'Alex', calendarName: 'Family' });
  const restarted = await trial.createTrialStore(storage).start();
  assert.equal(restarted.elapsedMs, trial.LIMIT_MS); assert.equal(restarted.events.length, 1); assert.equal(restarted.draft.title, 'Unfinished');
});
test('strict dates and clocks reject rollovers, invalid times and overnight ranges but allow 24-hour and all-day plans', () => {
  assert.deepEqual(trial.eventErrors(event()), {});
  for (const value of ['2026-02-30', '2026-13-01', 'invalid']) assert.equal(trial.eventErrors(event({ startDate: value })).startDate, 'dateInvalid');
  for (const value of ['24:00', '1:30', '13:75']) assert.equal(trial.eventErrors(event({ start: value })).start, 'timeInvalid');
  assert.equal(trial.eventErrors(event({ start: '23:30', end: '01:00' })).end, 'endInvalid');
  assert.deepEqual(trial.eventErrors(event({ allDay: true, start: '', end: '' })), {});
});
test('serialized edits preserve other events and drafts; editing never duplicates the event ID', async () => {
  const store = trial.createTrialStore(device()); await store.start();
  await Promise.all([store.saveEvent(event()), store.saveEvent(event({ title: 'Soccer', child: 'Theo' }))]);
  const initial = await store.load(); const id = initial.events[0].id;
  const edited = await store.saveEvent(event({ title: 'Edited flight' }), id);
  assert.equal(edited.events.length, 2); assert.equal(edited.events[0].id, id); assert.equal(edited.events[0].title, 'Edited flight');
  await store.removeEvent(id); assert.equal((await store.load()).events[0].title, 'Soccer');
});
test('failed persistence is reported and does not replace durable plans or grant extra preview time', async () => {
  const storage = device(), store = trial.createTrialStore(storage); await store.start(); await store.saveEvent(event());
  const originalSet = storage.setItem; storage.setItem = async () => { throw new Error('disk full'); };
  await assert.rejects(store.saveEvent(event({ title: 'Unsaved' })), /disk full/);
  await assert.rejects(store.advance(1000), { code: 'clockFailed' });
  storage.setItem = originalSet;
  assert.equal((await store.load()).events.length, 1);
  assert.equal((await store.load()).elapsedMs, trial.LIMIT_MS);
  await assert.rejects(store.saveEvent(event()), { code: 'expired' });
});
test('corrupt calendars are not silently replaced and missing/corrupt clocks expire conservatively', async () => {
  const storage = device(), store = trial.createTrialStore(storage); await store.start(); await store.saveEvent(event());
  storage.data.set(trial.CLOCK_KEY, 'invalid'); assert.equal((await store.load()).elapsedMs, trial.LIMIT_MS);
  storage.data.set(trial.TRIAL_KEY, '{bad'); await assert.rejects(store.start(), { code: 'loadFailed' });
  assert.equal(storage.data.get(trial.TRIAL_KEY), '{bad');
});
test('profile validation distinguishes signup from existing-account sign-in and safely limits fields', async () => {
  assert.equal(trial.profileErrors({ calendarName: 'Family' }).name, 'nameRequired');
  assert.deepEqual(trial.profileErrors({ calendarName: 'Family' }, false), {});
  const normalized = trial.normalizeProfile({ name: ' Alex ', calendarName: 'Family', icon: 'invalid', password: 'never store', description: 'x'.repeat(200) });
  assert.equal(normalized.name, 'Alex'); assert.equal(normalized.icon, '👤'); assert.equal(normalized.description.length, 160); assert(!Object.hasOwn(normalized, 'password'));
  const store = trial.createTrialStore(device()); await store.start(); await store.saveProfileDraft({ name: 'Unfinished' });
  assert.equal((await store.load()).profile.name, 'Unfinished');
});
test('claimed previews retain their local backup but cannot be edited or attached to a different account', async () => {
  const store = trial.createTrialStore(device()); await store.start(); await store.saveEvent(event()); await store.markClaimed('owner', 'calendar');
  await assert.rejects(store.saveEvent(event()), { code: 'alreadyClaimed' });
  await assert.rejects(store.markClaimed('other', 'calendar'), { code: 'alreadyClaimed' });
  assert.equal((await store.load()).events.length, 1); assert.equal((await store.load()).claimedBy, 'owner');
});
test('trial and personalization UI are bilingual, native, reachable early and connected to the real expiry', () => {
  for (const [file, name] of [['TrialCalendarScreen', 'trialCopy'], ['PersonalizeCalendarScreen', 'personalizeCopy']]) {
    const source = fs.readFileSync(require.resolve(`../mobile/src/screens/${file}.js`), 'utf8');
    const copy = vm.runInNewContext(`(${source.match(new RegExp(`export const ${name} = (\\{[^]*?\\n\\});`))[1]})`);
    assert.deepEqual(Object.keys(copy.en), Object.keys(copy.zh));
    for (const value of Object.values(copy.en)) assert(value.length);
    assert(!source.includes('WebView'));
  }
  const app = fs.readFileSync(require.resolve('../mobile/src/App.js'), 'utf8');
  assert.match(app, /entryScreen === 'trial' && trial.data\?\.elapsedMs >= nativeTrial.LIMIT_MS/);
  assert.match(app, /onPersonalize=\{\(\) => beginTrial\(\{ personalize: true \}\)\}/);
  assert.match(app, /onGetStarted=\{beginSetup\} onPreview=\{\(\) => beginTrial\(\)\}/);
  assert.match(app, /trialImport.claimNativeTrial\(supabase, userId, reserved\)/);
  assert.match(app, /entryScreen === 'onboarding' && \(!session \|\| trialSetupReturn \|\| accountSetup\)/);
  assert.match(app, /returnToCalendar=\{trialSetupReturn \|\| accountSetup\}/);
  assert.match(app, /backLabel=\{trialAuthIntent \? t.trialBack : undefined\}/);
});

test('deleting an edited event clears only the draft for that event', async () => {
  const store = trial.createTrialStore(device()); await store.start();
  await store.saveEvent(event()); const saved = (await store.load()).events[0];
  await store.saveDraft(saved); await store.removeEvent(saved.id);
  assert.equal((await store.load()).draft, null);
  await store.saveEvent(event()); const next = (await store.load()).events[0];
  await store.saveDraft(event({ title: 'Separate draft' })); await store.removeEvent(next.id);
  assert.equal((await store.load()).draft.title, 'Separate draft');
});
test('failed clock writes expire conservatively and retain the durable plans after reopening', async () => {
  const storage = device(), store = trial.createTrialStore(storage); await store.start(); await store.saveEvent(event());
  const set = storage.setItem; storage.setItem = async (key, value) => { if (key === trial.CLOCK_KEY) throw new Error('clock storage failed'); return set(key, value); };
  await assert.rejects(store.advance(1000), { code: 'clockFailed' });
  const reopened = await trial.createTrialStore(storage).load();
  assert.equal(reopened.elapsedMs, trial.LIMIT_MS); assert.equal(reopened.events.length, 1);
});
test('an explicit import reserves its account before the network request and survives ambiguous failures', async () => {
  const storage = device(), store = trial.createTrialStore(storage); await store.start(); await store.saveEvent(event());
  await store.reserveClaim('original-account');
  const restarted = trial.createTrialStore(storage);
  assert.equal((await restarted.load()).claimOwner, 'original-account');
  await assert.rejects(restarted.reserveClaim('different-account'), { code: 'alreadyClaimed' });
  await assert.rejects(restarted.markClaimed('different-account', 'calendar'), { code: 'alreadyClaimed' });
  await restarted.markClaimed('original-account', 'calendar');
  assert.equal((await restarted.load()).claimedBy, 'original-account');
  assert.equal((await restarted.load()).events.length, 1);
});
test('new trial events use saved hours and reminder metadata and retain them across reopening', async () => {
  const defaults = trial.defaultEvent('2026-10-29', { hours: 'evening', reminders: '30' });
  assert.equal(defaults.start, '18:00'); assert.equal(defaults.end, '19:00'); assert.equal(defaults.reminderMinutes, 30);
  const storage = device(), store = trial.createTrialStore(storage); await store.start();
  await store.saveEvent({ ...defaults, title: 'Family plan', importance: 'high' });
  const event = (await trial.createTrialStore(storage).load()).events[0];
  assert.equal(event.reminderMinutes, 30); assert.equal(event.importance, 'high');
  assert.equal(trial.defaultEvent('2026-10-29', { reminders: 'start' }).reminderMinutes, 0);
  assert.equal(trial.defaultEvent('2026-10-29', {}).reminderMinutes, null);
});
