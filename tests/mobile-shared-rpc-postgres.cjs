// Optional real-PostgreSQL check, separate from the fast *.test.cjs suite.
// Install @electric-sql/pglite in a temporary directory, then run this file with
// KIDSSYNC_PGLITE_MODULE pointing to that package. No live Supabase calls occur.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.KIDSSYNC_PGLITE_MODULE || '@electric-sql/pglite');
const OWNER = '00000000-0000-4000-8000-000000000001';
const EDITOR = '00000000-0000-4000-8000-000000000002';
const VIEWER = '00000000-0000-4000-8000-000000000003';
const COMMENTER = '00000000-0000-4000-8000-000000000004';
const VERSION = '2026-10-30T10:00:00.123456Z';
let db, actor;
const clone = value => JSON.parse(JSON.stringify(value));
const event = extra => ({ id: 'piano', title: 'Piano', startDate: '2026-10-30', start: '15:00', end: '16:00',
  child: '__family__', allDay: false, recurrence: 'weekly', repeatDays: [5], unknown: { keep: ['yes'] }, ...extra });
const snapshot = () => ({ version: 2, activeCalendarId: 'home', calendars: [{ id: 'home', name: 'Home' }, { id: 'work', name: 'Work' }],
  calendarData: { home: { kids: [{ name: 'Maya' }], activities: [event()], future: { retain: true } },
    work: { activities: [event({ id: 'private', title: 'Private' })] } },
  activities: [event()], profile: { private: true }, unknownRoot: [1, 2] });

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to authenticated;
    create table public.family_schedules(user_id uuid primary key,schedule jsonb not null,updated_at timestamptz not null);
    create table public.calendar_members(id uuid primary key,owner_id uuid,calendar_id text,member_user_id uuid,member_email text,role text,status text);
    alter table public.family_schedules enable row level security;
    grant select,update on public.family_schedules to authenticated;
    create policy owner_read on public.family_schedules for select to authenticated using(auth.uid()=user_id);
    create policy owner_write on public.family_schedules for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
    create table public.write_log(at timestamptz default clock_timestamp());
    create function public.track_schedule_write() returns trigger language plpgsql as
      $$begin insert into public.write_log default values;return new;end;$$;
    create trigger track_schedule_write after update of schedule on public.family_schedules for each row execute function public.track_schedule_write();
  `);
  await db.exec(fs.readFileSync(path.resolve(__dirname, '../supabase/mobile-shared-calendar.sql'), 'utf8'));
});
after(async () => { if (db) await db.close(); });
beforeEach(async () => { await seed(); });

async function account(id = EDITOR, email = id === EDITOR ? 'editor@example.com' : id === VIEWER ? 'viewer@example.com' : 'commenter@example.com') {
  actor = id;
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id, JSON.stringify({ email })]);
  await db.exec('set role authenticated');
}
async function admin(sql, params = []) {
  await db.exec('reset role');
  try { return await db.query(sql, params); } finally { await db.exec('set role authenticated'); }
}
async function seed(value = snapshot(), version = VERSION) {
  await db.exec('reset role;truncate public.family_schedules,public.calendar_members,public.write_log;');
  await db.query('insert into public.family_schedules values($1::uuid,$2::jsonb,$3::timestamptz)', [OWNER, JSON.stringify(value), version]);
  for (const [index, id, email, role] of [[1, EDITOR, 'editor@example.com', 'editor'], [2, VIEWER, 'viewer@example.com', 'viewer'], [3, COMMENTER, 'commenter@example.com', 'commenter']]) {
    await db.query('insert into public.calendar_members values($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7)',
      [`00000000-0000-4000-8001-${String(index).padStart(12, '0')}`, OWNER, 'home', id, email, role, 'active']);
  }
  await account();
}
async function row() { return (await admin('select schedule,updated_at::text from public.family_schedules where user_id=$1::uuid', [OWNER])).rows[0]; }
async function calls() { return Number((await admin('select count(*) as count from public.write_log')).rows[0].count); }
async function rpc({ changes = [], undo = null, expected = null, actorId = actor, calendarId = 'home' } = {}) {
  const result = await db.query('select public.mutate_shared_calendar_activities_checked($1::uuid,$2::text,$3::timestamptz,$4::jsonb,$5::jsonb,$6::uuid) as result',
    [OWNER, calendarId, expected, JSON.stringify(changes), undo === null ? null : JSON.stringify(undo), actorId]);
  return result.rows[0].result;
}
const rejects = code => error => error.code === code;

test('migration compiles and read-only probe returns only selected data without a write', async () => {
  const result = await rpc();
  assert.equal(result.role, 'editor'); assert.equal(result.canWrite, true);
  assert.equal(result.calendar.data.activities[0].title, 'Piano');
  assert.equal(result.calendar.data.profile, undefined); assert.equal(result.calendar.data.calendarData, undefined);
  assert.equal(result.profile, undefined); assert.equal(await calls(), 0);
  assert.deepEqual((await row()).schedule, snapshot());
});

test('checked RPC alone is executable by authenticated users; helpers and anonymous mutation stay private', async () => {
  const privileges = await admin(`select
    has_function_privilege('authenticated','public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid)','EXECUTE') as authenticated,
    has_function_privilege('anon','public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid)','EXECUTE') as anonymous,
    has_function_privilege('authenticated','public.mobile_shared_display_fields_valid(jsonb)','EXECUTE') as helper,
    (select prosecdef from pg_proc where oid='public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid)'::regprocedure) as definer`);
  assert.deepEqual(privileges.rows[0], { authenticated: true, anonymous: false, helper: false, definer: true });
});

test('viewer/commenter may probe but cannot mutate; direct editor owner-row UPDATE remains denied by RLS', async () => {
  for (const id of [VIEWER, COMMENTER]) {
    await account(id); assert.equal((await rpc()).canWrite, false);
    await assert.rejects(rpc({ expected: VERSION, changes: [{ original: null, event: event({ id: 'new' }) }] }), rejects('42501'));
  }
  await account();
  const result = await db.query('update public.family_schedules set schedule=$1::jsonb where user_id=$2::uuid', [JSON.stringify({}), OWNER]);
  assert.equal(result.affectedRows, 0); assert.equal(await calls(), 0);
  await assert.rejects(db.query('select public.mobile_shared_event_valid($1::jsonb)', [JSON.stringify(event())]), rejects('42501'));
});

test('wrong actor, wrong email, revoked access and another calendar all fail closed', async () => {
  await assert.rejects(rpc({ actorId: VIEWER }), rejects('42501'));
  await account(EDITOR, 'wrong@example.com'); await assert.rejects(rpc(), rejects('42501'));
  await account(); await assert.rejects(rpc({ calendarId: 'work' }), rejects('42501'));
  await admin("update public.calendar_members set status='banned' where member_user_id=$1::uuid", [EDITOR]);
  await assert.rejects(rpc(), rejects('42501')); assert.equal(await calls(), 0);
});

test('atomic occurrence split commits once and preserves unrelated calendars, fields and inputs', async () => {
  const original = event(), detached = event({ id: 'detached', title: 'Moved piano', startDate: '2026-11-07', recurrence: 'none', repeatDays: [], repeatInterval: 1, excludedDates: [] });
  const result = await rpc({ expected: VERSION, changes: [{ original, event: { id: original.id, excludedDates: ['2026-11-06'] } }, { original: null, event: detached }] });
  const actual = (await row()).schedule, expected = snapshot();
  expected.calendarData.home.activities = [{ ...original, excludedDates: ['2026-11-06'] }, detached];
  expected.activities = clone(expected.calendarData.home.activities);
  assert.deepEqual(actual, expected); assert.equal(await calls(), 1);
  assert.equal(result.undoToken.changes.length, 2); assert.equal(original.excludedDates, undefined);
});

test('stale revisions or raw originals and an invalid second change cannot partially commit', async () => {
  for (const request of [
    { expected: '2026-10-30T10:00:00Z', changes: [{ original: event(), event: { id: 'piano', title: 'Change' } }], code: '40001' },
    { expected: VERSION, changes: [{ original: event({ title: 'Stale' }), event: { id: 'piano', title: 'Change' } }], code: '40001' },
    { expected: VERSION, changes: [{ original: event(), event: { id: 'piano', excludedDates: ['2026-11-06'] } }, { original: null, event: event({ id: 'bad', start: '25:00' }) }], code: '22023' }
  ]) await assert.rejects(rpc(request), rejects(request.code));
  assert.equal(await calls(), 0); assert.deepEqual((await row()).schedule, snapshot());
});

test('deletion Undo preserves batch order and unrelated later edits, but rejects changed affected events', async () => {
  const initial = snapshot();
  initial.calendarData.home.activities = [event({ id: 'first' }), event({ id: 'second' }), event({ id: 'third' })];
  initial.activities = clone(initial.calendarData.home.activities); await seed(initial);
  const deleted = await rpc({ expected: VERSION, changes: initial.activities.slice(0, 2).map(original => ({ original, event: null })) });
  const latest = await row(); latest.schedule.calendarData.work.activities[0].title = 'Later work edit';
  await admin('update public.family_schedules set schedule=$1::jsonb,updated_at=$2::timestamptz where user_id=$3::uuid',
    [JSON.stringify(latest.schedule), '2026-11-01T00:00:00Z', OWNER]);
  const restored = await rpc({ expected: '2026-11-01T00:00:00Z', undo: deleted.undoToken });
  assert.deepEqual(restored.calendar.data.activities.map(value => value.id), ['first', 'second', 'third']);
  assert.equal((await row()).schedule.calendarData.work.activities[0].title, 'Later work edit');
  await assert.rejects(rpc({ expected: restored.updated_at, undo: deleted.undoToken }), rejects('40001'));
});

test('forged invalid Undo cannot insert arbitrary data or expose mismatched root metadata', async () => {
  const forged = { version: 1, userId: EDITOR, ownerId: OWNER, calendarId: 'home', mirrored: true,
    changes: [{ id: 'bad', before: { id: 'bad', title: {} }, after: null, index: 0, mirrorIndex: 0, mirrorBefore: null, mirrorAfter: null }] };
  await assert.rejects(rpc({ expected: VERSION, undo: forged }), rejects('22023')); assert.equal(await calls(), 0);
  const initial = snapshot(); initial.activities[0].privateMirror = 'Never return this'; await seed(initial);
  const saved = await rpc({ expected: VERSION, changes: [{ original: event(), event: { id: 'piano', title: 'Updated' } }] });
  assert.equal(saved.undoToken, null); assert.equal(JSON.stringify(saved).includes('Never return this'), false);
  assert.equal((await row()).schedule.activities[0].privateMirror, 'Never return this');
});

test('modern missing activities key persists new events and missing active ID yields a valid false mirror token', async () => {
  const initial = snapshot(); delete initial.calendarData.home.activities; delete initial.activeCalendarId; await seed(initial);
  const result = await rpc({ expected: VERSION, changes: [{ original: null, event: event({ id: 'new' }) }] });
  assert.equal((await row()).schedule.calendarData.home.activities[0].id, 'new');
  assert.equal(result.undoToken.mirrored, false); assert.deepEqual((await row()).schedule.activities, initial.activities);
});

test('bare legacy root cannot be selected through an unrelated active invitation', async () => {
  await seed({ kids: [], activities: [event()], privateRoot: 'keep' });
  await assert.rejects(rpc(), rejects('P0002'));
  await admin("update public.calendar_members set calendar_id='family' where member_user_id=$1::uuid", [EDITOR]);
  const result = await rpc({ calendarId: 'family' }); assert.equal(result.calendar.id, 'family');
  assert.equal(result.calendar.data.privateRoot, undefined); assert.equal(await calls(), 0);
});

test('overnight clocks are accepted only with a later valid date and versions advance beyond future clocks', async () => {
  const future = '2099-01-01T00:00:00.500123Z'; await seed(snapshot(), future);
  const result = await rpc({ expected: future, changes: [{ original: null, event: event({ id: 'train', start: '23:00', end: '00:00', endDate: '2026-10-31' }) }] });
  assert.equal((await admin('select $1::timestamptz > $2::timestamptz as advanced', [result.updated_at, future])).rows[0].advanced, true);
  for (const changes of [[{ original: null, event: event({ id: 'invalid', start: '23:00', end: '00:00' }) }],
    [{ original: null, event: event({ id: 'invalid-date', startDate: '2026-02-30' }) }]]) {
    await assert.rejects(rpc({ expected: result.updated_at, changes }), rejects('22023'));
  }
});

test('malformed known display fields cannot bypass validation through all-day, exclusion-only or Undo paths', async () => {
  for (const key of ['location', 'responsible', 'items', 'notes', 'icon', 'start', 'end']) {
    for (const value of [{ broken: true }, ['broken'], true, 7]) {
      await assert.rejects(rpc({ expected: VERSION, changes: [{ original: null,
        event: event({ id: 'invalid-display', allDay: true, start: '', end: '', [key]: value }) }] }), rejects('22023'));
    }
  }
  assert.equal(await calls(), 0);
  const malformed = snapshot(); malformed.calendarData.home.activities[0].location = { broken: true }; await seed(malformed);
  await assert.rejects(rpc({ expected: VERSION, changes: [{ original: malformed.calendarData.home.activities[0],
    event: { id: 'piano', excludedDates: ['2026-11-06'] } }] }), rejects('22023'));
  const good = event({ id: 'compatible', allDay: true, start: null, end: null, location: null, child: 7, future: { retain: true } });
  const result = await rpc({ expected: VERSION, changes: [{ original: null, event: good }] });
  assert.deepEqual(result.calendar.data.activities.at(-1), good);
});
