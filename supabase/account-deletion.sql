-- Apply after schema.sql and any family/mobile collaboration migrations.
-- Adds self-service deletion support; does not delete any existing account.
begin;

create or replace function public.account_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = (select auth.uid()));
$$;
revoke all on function public.account_is_active() from public, anon;
grant execute on function public.account_is_active() to authenticated;

-- A deleted user's already-issued JWT can remain cryptographically valid.
-- Restrictive policies preserve all existing access rules while closing that
-- window for authenticated reads and writes, including legacy email policies.
do $$
declare target text;
begin
  foreach target in array array['family_schedules','calendar_members','calendar_comments',
    'calendar_changes','calendar_acknowledgements','calendar_pickups'] loop
    if pg_catalog.to_regclass('public.' || target) is not null then
      execute format('drop policy if exists "Active account required" on public.%I', target);
      execute format('create policy "Active account required" on public.%I as restrictive for all to authenticated using ((select public.account_is_active())) with check ((select public.account_is_active()))', target);
    end if;
  end loop;
end;
$$;

create or replace function public.cleanup_deleted_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Exact Auth IDs take precedence. Email matching removes unaccepted legacy
  -- invitations as well; calendars belonging to other people are retained.
  if pg_catalog.to_regclass('public.calendar_pickups') is not null then
    delete from public.calendar_pickups p where p.owner_id = old.id or p.assigned_by = old.id
      or (lower(p.assignee_email) = lower(old.email) and not exists (
        select 1 from public.calendar_members m where m.owner_id = p.owner_id
          and m.calendar_id = p.calendar_id and lower(m.member_email) = lower(old.email)
          and m.member_user_id is not null and m.member_user_id <> old.id));
  end if;
  if pg_catalog.to_regclass('public.calendar_acknowledgements') is not null then
    delete from public.calendar_acknowledgements where user_id = old.id;
  end if;
  if pg_catalog.to_regclass('public.calendar_changes') is not null then
    if pg_catalog.to_regclass('public.calendar_acknowledgements') is not null then
      delete from public.calendar_acknowledgements where change_id in
        (select id from public.calendar_changes where owner_id = old.id);
    end if;
    delete from public.calendar_changes where owner_id = old.id;
    update public.calendar_changes set actor_id = null, actor_email = ''
      where owner_id <> old.id and (actor_id = old.id or (actor_id is null and lower(actor_email) = lower(old.email)));
  end if;
  if pg_catalog.to_regclass('public.calendar_comments') is not null then
    delete from public.calendar_comments where owner_id = old.id or author_user_id = old.id;
  end if;
  if pg_catalog.to_regclass('public.calendar_members') is not null then
    delete from public.calendar_members where owner_id = old.id or member_user_id = old.id
      or (member_user_id is null and lower(member_email) = lower(old.email));
  end if;
  if pg_catalog.to_regclass('public.family_schedules') is not null then
    delete from public.family_schedules where user_id = old.id;
  end if;
  -- Explicit owner cleanup also covers older tables whose FK was not cascading.
  return old;
end;
$$;
revoke all on function public.cleanup_deleted_account() from public, anon, authenticated, service_role;
drop trigger if exists kidssync_account_cleanup on auth.users;
create trigger kidssync_account_cleanup before delete on auth.users
  for each row execute function public.cleanup_deleted_account();

create or replace function public.account_deletion_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('version', 1, 'available',
    public.account_is_active()
    and exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = 'auth.users'::regclass and t.tgname = 'kidssync_account_cleanup'
        and t.tgfoid = 'public.cleanup_deleted_account()'::regprocedure
        and t.tgtype = 11 -- BEFORE DELETE, FOR EACH ROW
        and t.tgenabled in ('O','A') and not t.tgisinternal)
    and not exists (
      select 1 from unnest(array['family_schedules','calendar_members','calendar_comments',
        'calendar_changes','calendar_acknowledgements','calendar_pickups']) as tables(name)
      where pg_catalog.to_regclass('public.' || tables.name) is not null
        and not exists (select 1 from pg_catalog.pg_class c
          join pg_catalog.pg_policy p on p.polrelid = c.oid
          where c.oid = pg_catalog.to_regclass('public.' || tables.name)
            and c.relrowsecurity
            and p.polname = 'Active account required' and not p.polpermissive)
    ));
$$;
revoke all on function public.account_deletion_status() from public, anon;
grant execute on function public.account_deletion_status() to authenticated;

commit;
