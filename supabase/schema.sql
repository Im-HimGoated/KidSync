create table if not exists public.family_schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schedule jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.family_schedules enable row level security;

revoke all on table public.family_schedules from anon;
grant select, insert, update on table public.family_schedules to authenticated;
grant select (user_id, schedule) on table public.family_schedules to anon;

create table if not exists public.calendar_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  calendar_id text not null,
  member_email text not null,
  member_user_id uuid references auth.users(id) on delete cascade,
  calendar_name text not null default 'Family',
  invite_token uuid not null default gen_random_uuid(),
  role text not null default 'viewer' check (role in ('editor', 'commenter', 'viewer')),
  invitation_note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'banned')),
  created_at timestamptz not null default now(),
  unique (owner_id, calendar_id, member_email)
);

alter table public.calendar_members add column if not exists calendar_name text not null default 'Family';
alter table public.calendar_members add column if not exists owner_email text not null default '';
alter table public.calendar_members add column if not exists invite_token uuid not null default gen_random_uuid();
alter table public.calendar_members add column if not exists role text not null default 'viewer';
alter table public.calendar_members add column if not exists invitation_note text not null default '';
create unique index if not exists calendar_members_invite_token_idx on public.calendar_members (invite_token);
alter table public.calendar_members drop constraint if exists calendar_members_role_check;
alter table public.calendar_members add constraint calendar_members_role_check
  check (role in ('editor', 'commenter', 'viewer'));
alter table public.calendar_members drop constraint if exists calendar_members_invitation_note_length;
alter table public.calendar_members add constraint calendar_members_invitation_note_length
  check (char_length(invitation_note) <= 500);
alter table public.calendar_members alter column status set default 'pending';
alter table public.calendar_members drop constraint if exists calendar_members_status_check;
alter table public.calendar_members add constraint calendar_members_status_check
  check (status in ('pending', 'active', 'declined', 'banned'));

alter table public.calendar_members enable row level security;
revoke all on table public.calendar_members from anon;
grant select (owner_id, calendar_id, calendar_name, invite_token, role, status) on table public.calendar_members to anon;
revoke update on table public.calendar_members from authenticated;
grant select, insert, delete on table public.calendar_members to authenticated;
grant update (status, role, invitation_note) on table public.calendar_members to authenticated;

drop policy if exists "Owners can view calendar members" on public.calendar_members;
create policy "Owners can view calendar members"
on public.calendar_members for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Invitees can view their invitations" on public.calendar_members;
create policy "Invitees can view their invitations"
on public.calendar_members for select to authenticated
using (lower(member_email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));

drop policy if exists "Owners can add calendar members" on public.calendar_members;
create policy "Owners can add calendar members"
on public.calendar_members for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Invitees can answer their invitations" on public.calendar_members;
-- Invitation responses use respond_calendar_invitation(), which validates the
-- recipient and can bind member_user_id without exposing that column for updates.

drop policy if exists "Owners can update calendar members" on public.calendar_members;
create policy "Owners can update calendar members"
on public.calendar_members for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can remove calendar members" on public.calendar_members;
create policy "Owners can remove calendar members"
on public.calendar_members for delete to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Invite tokens can preview calendar members" on public.calendar_members;
create policy "Invite tokens can preview calendar members"
on public.calendar_members for select to anon, authenticated
using (
  status in ('pending', 'active')
  and invite_token::text = coalesce(current_setting('kidssync.shared_invite_token', true), '')
);

create or replace function public.respond_calendar_invitation(invitation_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if next_status not in ('active', 'declined') then
    raise exception 'Invalid invitation response';
  end if;

  update public.calendar_members
  set status = next_status,
      member_user_id = (select auth.uid())
  where id = invitation_id
    and status <> 'banned'
    and lower(member_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''));

  if not found then
    raise exception 'Invitation not found';
  end if;
end;
$$;

create or replace function public.update_calendar_member_access(member_id uuid, next_status text, next_role text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if next_status not in ('pending', 'active', 'declined', 'banned') then
    raise exception 'Invalid member status';
  end if;
  if next_role not in ('editor', 'commenter', 'viewer') then
    raise exception 'Invalid calendar role';
  end if;

  update public.calendar_members
  set status = next_status,
      role = next_role
  where id = member_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'Calendar member not found';
  end if;
end;
$$;

create or replace function public.update_calendar_member_share(member_id uuid, next_status text, next_role text, next_note text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if next_status not in ('pending', 'active', 'declined', 'banned') then
    raise exception 'Invalid member status';
  end if;
  if next_role not in ('editor', 'commenter', 'viewer') then
    raise exception 'Invalid calendar role';
  end if;
  if char_length(coalesce(next_note, '')) > 500 then
    raise exception 'Invitation note is too long';
  end if;

  update public.calendar_members
  set status = next_status,
      role = next_role,
      invitation_note = coalesce(next_note, '')
  where id = member_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'Calendar member not found';
  end if;
end;
$$;

revoke all on function public.respond_calendar_invitation(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.update_calendar_member_access(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_calendar_member_share(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.respond_calendar_invitation(uuid, text) to authenticated;
grant execute on function public.update_calendar_member_access(uuid, text, text) to authenticated;
grant execute on function public.update_calendar_member_share(uuid, text, text, text) to authenticated;

comment on function public.respond_calendar_invitation(uuid, text) is
  'SECURITY DEFINER is required to bind an invitation to its authenticated recipient. The function validates auth.uid(), JWT email, status, and invitation ownership.';
comment on function public.update_calendar_member_access(uuid, text, text) is
  'SECURITY INVOKER owner-managed access update. Authorization is enforced by the calendar_members owner RLS policy and restricted column grants.';
comment on function public.update_calendar_member_share(uuid, text, text, text) is
  'SECURITY INVOKER owner-managed invitation update. Authorization is enforced by the calendar_members owner RLS policy and restricted column grants.';

create or replace function public.get_shared_calendar_preview(shared_invite_token uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation_record record;
  shared_data jsonb;
  safe_kids jsonb;
  safe_activities jsonb;
begin
  perform pg_catalog.set_config('kidssync.shared_invite_token', shared_invite_token::text, true);

  select
    member.calendar_id,
    member.calendar_name,
    member.role,
    schedule.schedule
  into invitation_record
  from public.calendar_members member
  join public.family_schedules schedule on schedule.user_id = member.owner_id
  where member.invite_token = shared_invite_token
    and member.status in ('pending', 'active')
  limit 1;

  if not found then
    return null;
  end if;

  shared_data := case
    when invitation_record.schedule ? 'calendarData'
      then coalesce(invitation_record.schedule #> array['calendarData', invitation_record.calendar_id], '{}'::jsonb)
    else invitation_record.schedule
  end;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', kid -> 'id',
    'name', kid -> 'name',
    'avatar', kid -> 'avatar',
    'palette', kid -> 'palette'
  ))), '[]'::jsonb)
  into safe_kids
  from jsonb_array_elements(case
    when jsonb_typeof(shared_data -> 'kids') = 'array' then shared_data -> 'kids'
    else '[]'::jsonb
  end) kid;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', activity -> 'id',
    'title', activity -> 'title',
    'icon', activity -> 'icon',
    'child', activity -> 'child',
    'startDate', activity -> 'startDate',
    'allDay', activity -> 'allDay',
    'start', activity -> 'start',
    'end', activity -> 'end',
    'eventType', activity -> 'eventType',
    'status', activity -> 'status'
  ))), '[]'::jsonb)
  into safe_activities
  from jsonb_array_elements(case
    when jsonb_typeof(shared_data -> 'activities') = 'array' then shared_data -> 'activities'
    else '[]'::jsonb
  end) activity;

  return jsonb_build_object(
    'calendar_name', invitation_record.calendar_name,
    'role', invitation_record.role,
    'shared', jsonb_build_object(
      'kids', safe_kids,
      'activities', safe_activities
    )
  );
end;
$$;

revoke all on function public.get_shared_calendar_preview(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_shared_calendar_preview(uuid) to anon, authenticated;

comment on function public.get_shared_calendar_preview(uuid) is
  'SECURITY INVOKER preview for bearer invite links. A transaction-local token activates narrowly scoped RLS policies, and the result excludes account identifiers, emails, comments, notes, settings, and unshared calendars.';

create table if not exists public.calendar_comments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_email text not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists calendar_comments_calendar_idx
  on public.calendar_comments (owner_id, calendar_id, created_at);

alter table public.calendar_comments enable row level security;
revoke all on table public.calendar_comments from anon;
grant select, insert, delete on table public.calendar_comments to authenticated;

drop policy if exists "Calendar participants can read comments" on public.calendar_comments;
create policy "Calendar participants can read comments"
on public.calendar_comments for select to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.calendar_members member
    where member.owner_id = calendar_comments.owner_id
      and member.calendar_id = calendar_comments.calendar_id
      and member.member_user_id = (select auth.uid())
      and lower(member.member_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.status = 'active'
  )
);

drop policy if exists "Commenters can add calendar comments" on public.calendar_comments;
create policy "Commenters can add calendar comments"
on public.calendar_comments for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and lower(author_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.calendar_members member
      where member.owner_id = calendar_comments.owner_id
        and member.calendar_id = calendar_comments.calendar_id
        and member.member_user_id = (select auth.uid())
        and lower(member.member_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        and member.status = 'active'
        and member.role in ('commenter', 'editor')
    )
  )
);

drop policy if exists "Comment authors and owners can delete comments" on public.calendar_comments;
create policy "Comment authors and owners can delete comments"
on public.calendar_comments for delete to authenticated
using (
  author_user_id = (select auth.uid())
  or owner_id = (select auth.uid())
);

drop policy if exists "Families can read their own schedule" on public.family_schedules;
create policy "Families can read their own schedule"
on public.family_schedules
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1 from public.calendar_members member
    where member.owner_id = family_schedules.user_id
      and lower(member.member_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.status = 'active'
  )
);

drop policy if exists "Invite tokens can preview family schedules" on public.family_schedules;
create policy "Invite tokens can preview family schedules"
on public.family_schedules for select to anon, authenticated
using (
  exists (
    select 1
    from public.calendar_members member
    where member.owner_id = family_schedules.user_id
      and member.status in ('pending', 'active')
      and member.invite_token::text = coalesce(current_setting('kidssync.shared_invite_token', true), '')
  )
);

drop policy if exists "Families can create their own schedule" on public.family_schedules;
create policy "Families can create their own schedule"
on public.family_schedules
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Families can update their own schedule" on public.family_schedules;
create policy "Families can update their own schedule"
on public.family_schedules
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.update_shared_calendar_activities(calendar_owner_id uuid, shared_calendar_id text, next_activities jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(next_activities) <> 'array' then
    raise exception 'Activities must be a JSON array';
  end if;
  if not exists (
    select 1
    from public.calendar_members member
    where member.owner_id = calendar_owner_id
      and member.calendar_id = shared_calendar_id
      and member.member_user_id = (select auth.uid())
      and lower(member.member_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      and member.status = 'active'
      and member.role = 'editor'
  ) then
    raise exception 'Editor access required';
  end if;

  update public.family_schedules
  set schedule = case
        when schedule ? 'calendarData'
          then jsonb_set(schedule, array['calendarData', shared_calendar_id, 'activities'], next_activities, true)
        else jsonb_set(schedule, '{activities}', next_activities, true)
      end,
      updated_at = now()
  where user_id = calendar_owner_id
  returning updated_at into saved_at;

  if saved_at is null then
    raise exception 'Shared calendar not found';
  end if;
  return saved_at;
end;
$$;

revoke all on function public.update_shared_calendar_activities(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_shared_calendar_activities(uuid, text, jsonb) to authenticated;

comment on function public.update_shared_calendar_activities(uuid, text, jsonb) is
  'SECURITY DEFINER is required for editor writes to an owner schedule. Access requires an active editor row bound to both auth.uid() and the JWT email.';

-- New functions should not become callable through the Data API by default.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Keep this database-maintenance helper out of PostgREST. It may exist in
-- deployed projects even though KidsSync does not create or call it.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all privileges on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$$;
