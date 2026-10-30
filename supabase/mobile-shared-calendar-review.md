# Checked native shared-calendar writes

Migration source: `supabase/mobile-shared-calendar.sql`.

Reviewed SHA-256:
`35c929503d9afde18a891f50808a1bf6ed5a44bd2ec285f674f58c0d897ce893`.

This source has **not been applied to Supabase**. Native shared editing stays
read-only with `SETUP_REQUIRED` until the checked function is installed.

## Change and scope

The additive migration creates a checked shared-calendar RPC and three private
validation helpers. It does not change existing table grants, RLS policies,
membership roles, or the existing web RPC. Only authenticated callers can invoke
the new RPC. A request must match the captured actor, current bound membership,
selected calendar, expected row timestamp, and exact original events.

Membership SHARE locks block concurrent role/status changes during the write;
an owner-row UPDATE lock and revision checks serialize checked mutations. Related
series exclusions and detached events commit together. Results contain only the
selected calendar. Undo checks current affected records and validates restored
data. No Undo receipt is advertised for invalid legacy events or mismatched
compatibility mirrors whose raw metadata should not be exposed to a member.

The existing broad member-read RLS and older blind web writer are unchanged.
The checked RPC cannot prevent a later blind writer from overwriting a snapshot;
that requires migrating or retiring the older write path separately.

## Executed verification

The migration compiled and **12 tests passed in an embedded PostgreSQL runtime**
using disposable, Supabase-shaped auth functions/tables and owner-only UPDATE
RLS. Tests execute the actual migration and cover authenticated/anonymous grants,
viewer/commenter/editor access, wrong actors/emails, revoked access, selected-only
results, direct owner-row UPDATE denial, atomic splits, stale revisions/originals,
Undo order and conflicts, forged invalid Undo, private mirror preservation, legacy
boundaries, missing activity arrays, overnight times, future clocks, and malformed
known display fields.

These are local database checks. They do not verify a deployed Supabase project,
real JWT authentication, two concurrent database sessions, or live two-account
device behavior. JavaScript adapter tests and independent source review supplement
them.

The optional database test uses an isolated development runtime; it adds no app
dependency:

```sh
npm install --prefix /private/tmp/kidssync-shared-rpc-validation --ignore-scripts --no-audit --no-fund @electric-sql/pglite
KIDSSYNC_PGLITE_MODULE=/private/tmp/kidssync-shared-rpc-validation/node_modules/@electric-sql/pglite node --test tests/mobile-shared-rpc-postgres.cjs
node --test tests/mobile-shared-calendar.test.cjs tests/mobile-calendar-shared-ui.test.cjs tests/mobile-calendar-draft-identity.test.cjs
```

## Admin deployment and verification

1. Confirm the intended Supabase project and existing `schema.sql` tables.
2. Review the exact source/hash above and run the complete migration in that
   project's SQL Editor using an authorized admin session.
3. Run these non-mutating checks:

```sql
select to_regprocedure(
  'public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid)'
) as checked_rpc;

select
  has_function_privilege('authenticated',
    'public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid)',
    'EXECUTE') as authenticated_can_call,
  has_function_privilege('anon',
    'public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid)',
    'EXECUTE') as anonymous_can_call;

select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('family_schedules','calendar_members');
```

Expected: a non-null function, authenticated `true`, anonymous `false`, and RLS
still enabled on both tables. Then refresh a dedicated test account's shared
calendar in the app. A capability probe uses empty changes and performs no
schedule update. Confirm Viewer/Commenter are read-only and Editor access is
enabled only after the checked probe succeeds. Complete isolated test-event CRUD,
revocation, conflict and Undo checks with two test accounts before claiming live
shared-editor acceptance.
