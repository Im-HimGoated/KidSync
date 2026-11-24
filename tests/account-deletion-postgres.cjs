// Isolated PostgreSQL only: never connects to the live Supabase project.
// KIDSSYNC_PGLITE_MODULE points to a temporary @electric-sql/pglite installation.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.KIDSSYNC_PGLITE_MODULE || '@electric-sql/pglite');
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
let db;
const sql = name => fs.readFileSync(path.join(__dirname, '../supabase', name), 'utf8');
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to authenticated;`);
  await db.exec(sql('schema.sql'));
  await db.exec(sql('family-coordination.sql'));
  await db.exec(sql('mobile-shared-calendar.sql'));
  await db.exec(sql('account-deletion.sql'));
});
after(async () => { if (db) await db.close(); });
async function actor(id, email) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id, JSON.stringify({ email })]);
  await db.exec('set role authenticated');
}
async function seed() {
  await db.exec('reset role; truncate auth.users cascade;');
  await db.query('insert into auth.users values($1,$2),($3,$4)', [A, 'a@example.com', B, 'b@example.com']);
  await db.query('insert into public.family_schedules(user_id,schedule) values($1,$2),($3,$4)', [A, { activities: [{ id: 'private-a' }] }, B, { activities: [{ id: 'private-b' }] }]);
}
test('the migration is idempotent and only authenticated, existing accounts report ready', async () => {
  await seed(); await db.exec(sql('account-deletion.sql'));
  await actor(A, 'a@example.com');
  assert.deepEqual((await db.query('select public.account_deletion_status() status')).rows[0].status, { version: 1, available: true });
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.account_deletion_status()'), /permission denied/);
  await db.exec('reset role');
});
test('auth deletion cleans cross-owner references while retaining other families and their events', async () => {
  await seed();
  await db.query("insert into public.calendar_members(owner_id,owner_email,calendar_id,member_email,member_user_id,status) values($1,'b@example.com','b','a@example.com',$2,'active'),($1,'b@example.com','b2','a@example.com',null,'pending')", [B, A]);
  await db.query("insert into public.calendar_comments(owner_id,calendar_id,author_user_id,author_email,body) values($1,'b',$2,'a@example.com','My comment'),($1,'b',$1,'b@example.com','Keep owner comment')", [B, A]);
  await db.query("insert into public.calendar_changes(owner_id,calendar_id,event_id,actor_id,actor_email) values($1,'b','event',$2,'a@example.com')", [B, A]);
  await db.query("insert into public.calendar_pickups(owner_id,calendar_id,event_id,occurrence_date,assignee_email,assigned_by) values($1,'b','assigned-by','2026-11-24','b@example.com',$2),($1,'b','assigned-to','2026-11-24','a@example.com',$1),($1,'b','keep','2026-11-24','b@example.com',$1)", [B, A]);
  await db.query('delete from auth.users where id=$1', [A]);
  assert.deepEqual((await db.query('select user_id,schedule from public.family_schedules')).rows, [{ user_id: B, schedule: { activities: [{ id: 'private-b' }] } }]);
  assert.equal((await db.query('select count(*)::int count from public.calendar_members')).rows[0].count, 0);
  assert.deepEqual((await db.query('select body from public.calendar_comments')).rows.map(row => row.body), ['Keep owner comment']);
  assert.deepEqual((await db.query('select event_id from public.calendar_pickups')).rows.map(row => row.event_id), ['keep']);
  const change = (await db.query("select actor_id,actor_email from public.calendar_changes where event_id='event'")).rows[0];
  assert.deepEqual(change, { actor_id: null, actor_email: '' });
});
test('an issued JWT from a deleted account cannot read email-based invitations added afterward', async () => {
  await seed(); await db.query('delete from auth.users where id=$1', [A]);
  await db.query("insert into public.calendar_members(owner_id,owner_email,calendar_id,member_email) values($1,'b@example.com','b','a@example.com')", [B]);
  await actor(A, 'a@example.com');
  assert.deepEqual((await db.query('select id from public.calendar_members')).rows, []);
  assert.equal((await db.query('select public.account_is_active() active')).rows[0].active, false);
  assert.equal((await db.query('select public.account_deletion_status() status')).rows[0].status.available, false);
  await db.exec('reset role');
});
test('reused email addresses do not erase references already linked to a different Auth identity', async () => {
  await seed(); const other = '00000000-0000-4000-8000-000000000003';
  await db.query("insert into auth.users values($1,'current-address@example.com')", [other]);
  await db.query("insert into public.calendar_members(owner_id,calendar_id,member_email,member_user_id,status) values($1,'linked','a@example.com',$2,'active')", [B, other]);
  await db.query("insert into public.calendar_changes(owner_id,calendar_id,event_id,actor_id,actor_email) values($1,'linked','retain-history',$2,'a@example.com')", [B, other]);
  await db.query("insert into public.calendar_pickups(owner_id,calendar_id,event_id,occurrence_date,assignee_email,assigned_by) values($1,'linked','retain-pickup','2026-11-24','a@example.com',$1)", [B]);
  await db.query('delete from auth.users where id=$1', [A]);
  assert.equal((await db.query('select member_user_id from public.calendar_members')).rows[0].member_user_id, other);
  assert.equal((await db.query("select actor_id from public.calendar_changes where event_id='retain-history'")).rows[0].actor_id, other);
  assert.equal((await db.query("select count(*)::int count from public.calendar_pickups where event_id='retain-pickup'")).rows[0].count, 1);
});
test('a failed auth deletion rolls back cleanup and retains the account and all its data', async () => {
  await seed();
  await db.exec('create table public.deletion_hold(user_id uuid references auth.users(id));');
  await db.query('insert into public.deletion_hold values($1)', [A]);
  await db.query("insert into public.calendar_members(owner_id,calendar_id,member_email) values($1,'b','a@example.com')", [B]);
  await assert.rejects(db.query('delete from auth.users where id=$1', [A]), /foreign key/);
  assert.equal((await db.query('select count(*)::int count from auth.users where id=$1', [A])).rows[0].count, 1);
  assert.equal((await db.query('select count(*)::int count from public.family_schedules where user_id=$1', [A])).rows[0].count, 1);
  assert.equal((await db.query('select count(*)::int count from public.calendar_members')).rows[0].count, 1);
  await db.exec('drop table public.deletion_hold');
});
test('readiness fails closed if the cleanup trigger is disabled', async () => {
  await seed(); await db.exec('alter table auth.users disable trigger kidssync_account_cleanup');
  await actor(A, 'a@example.com');
  assert.equal((await db.query('select public.account_deletion_status() status')).rows[0].status.available, false);
  await db.exec('reset role; alter table auth.users enable trigger kidssync_account_cleanup');
});
test('readiness rejects disabled row security on each protected table', async () => {
  await seed();
  for (const name of ['family_schedules','calendar_members','calendar_comments','calendar_changes','calendar_acknowledgements','calendar_pickups']) {
    await db.exec(`alter table public.${name} disable row level security`);
    try {
      await actor(A, 'a@example.com');
      assert.equal((await db.query('select public.account_deletion_status() status')).rows[0].status.available, false, name);
    } finally { await db.exec(`reset role; alter table public.${name} enable row level security`); }
  }
  await actor(A, 'a@example.com');
  assert.equal((await db.query('select public.account_deletion_status() status')).rows[0].status.available, true);
  await db.exec('reset role');
});
test('readiness requires the actual cleanup function on a before-delete row trigger', async () => {
  await seed();
  await db.exec(`create function public.noop_account_cleanup() returns trigger language plpgsql as $$begin return old; end;$$;
    drop trigger kidssync_account_cleanup on auth.users;
    create trigger kidssync_account_cleanup before delete on auth.users for each row execute function public.noop_account_cleanup();`);
  try {
    await actor(A, 'a@example.com');
    assert.equal((await db.query('select public.account_deletion_status() status')).rows[0].status.available, false);
    for (const clause of ['after delete on auth.users for each row', 'before delete on auth.users for each statement']) {
      await db.exec(`reset role; drop trigger kidssync_account_cleanup on auth.users;
        create trigger kidssync_account_cleanup ${clause} execute function public.cleanup_deleted_account();`);
      await actor(A, 'a@example.com');
      assert.equal((await db.query('select public.account_deletion_status() status')).rows[0].status.available, false, clause);
    }
  } finally {
    await db.exec('reset role; drop function public.noop_account_cleanup();');
    await db.exec(sql('account-deletion.sql'));
  }
  await actor(A, 'a@example.com');
  assert.equal((await db.query('select public.account_deletion_status() status')).rows[0].status.available, true);
  await db.exec('reset role');
});
