-- Apply in the KidsSync Supabase SQL Editor to bring two deployed member
-- management RPCs in line with schema.sql. These functions only need the
-- caller's privileges: the owner RLS policy authorizes their updates.
begin;

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

-- Existing invoker functions must have only the same column-level access
-- required by the application; no broad table UPDATE grant is needed.
revoke update on table public.calendar_members from authenticated;
grant update (status, role, invitation_note) on table public.calendar_members to authenticated;

drop policy if exists "Owners can update calendar members" on public.calendar_members;
create policy "Owners can update calendar members"
on public.calendar_members for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

revoke all on function public.update_calendar_member_access(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_calendar_member_share(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.update_calendar_member_access(uuid, text, text) to authenticated;
grant execute on function public.update_calendar_member_share(uuid, text, text, text) to authenticated;

commit;
