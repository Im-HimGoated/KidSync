create table if not exists public.family_schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schedule jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.family_schedules enable row level security;

revoke all on table public.family_schedules from anon;
grant select, insert, update on table public.family_schedules to authenticated;

create table if not exists public.calendar_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  calendar_id text not null,
  member_email text not null,
  member_user_id uuid references auth.users(id) on delete cascade,
  calendar_name text not null default 'Family',
  invite_token uuid not null default gen_random_uuid(),
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'banned')),
  created_at timestamptz not null default now(),
  unique (owner_id, calendar_id, member_email)
);

alter table public.calendar_members add column if not exists calendar_name text not null default 'Family';
alter table public.calendar_members add column if not exists owner_email text not null default '';
alter table public.calendar_members add column if not exists invite_token uuid not null default gen_random_uuid();
alter table public.calendar_members add column if not exists role text not null default 'viewer';
create unique index if not exists calendar_members_invite_token_idx on public.calendar_members (invite_token);
alter table public.calendar_members drop constraint if exists calendar_members_role_check;
alter table public.calendar_members add constraint calendar_members_role_check
  check (role in ('editor', 'viewer'));
alter table public.calendar_members alter column status set default 'pending';
alter table public.calendar_members drop constraint if exists calendar_members_status_check;
alter table public.calendar_members add constraint calendar_members_status_check
  check (status in ('pending', 'active', 'declined', 'banned'));

alter table public.calendar_members enable row level security;
revoke all on table public.calendar_members from anon;
revoke update on table public.calendar_members from authenticated;
grant select, insert, delete on table public.calendar_members to authenticated;
grant update (status) on table public.calendar_members to authenticated;

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
create policy "Invitees can answer their invitations"
on public.calendar_members for update to authenticated
using (lower(member_email) = lower(coalesce((select auth.jwt() ->> 'email'), '')))
with check (lower(member_email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));

drop policy if exists "Owners can update calendar members" on public.calendar_members;
create policy "Owners can update calendar members"
on public.calendar_members for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can remove calendar members" on public.calendar_members;
create policy "Owners can remove calendar members"
on public.calendar_members for delete to authenticated
using ((select auth.uid()) = owner_id);

create or replace function public.respond_calendar_invitation(invitation_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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
security definer
set search_path = public, pg_temp
as $$
begin
  if next_status not in ('pending', 'active', 'declined', 'banned') then
    raise exception 'Invalid member status';
  end if;
  if next_role not in ('editor', 'viewer') then
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

revoke all on function public.respond_calendar_invitation(uuid, text) from public;
revoke all on function public.update_calendar_member_access(uuid, text, text) from public;
grant execute on function public.respond_calendar_invitation(uuid, text) to authenticated;
grant execute on function public.update_calendar_member_access(uuid, text, text) to authenticated;

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
set search_path = public, pg_temp
as $$
declare
  saved_at timestamptz;
begin
  if jsonb_typeof(next_activities) <> 'array' then
    raise exception 'Activities must be a JSON array';
  end if;
  if not exists (
    select 1
    from public.calendar_members member
    where member.owner_id = calendar_owner_id
      and member.calendar_id = shared_calendar_id
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

revoke all on function public.update_shared_calendar_activities(uuid, text, jsonb) from public;
grant execute on function public.update_shared_calendar_activities(uuid, text, jsonb) to authenticated;
