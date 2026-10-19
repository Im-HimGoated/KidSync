-- Run after schema.sql. Additive migration; does not replace existing schedule policies.
begin;

create or replace function public.family_calendar_access(p_owner uuid, p_calendar text, p_edit boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (auth.uid() = p_owner or exists (
    select 1 from public.calendar_members m where m.owner_id = p_owner and m.calendar_id = p_calendar
      and m.member_user_id = auth.uid() and m.status = 'active' and (not p_edit or m.role = 'editor')
  ));
$$;
revoke all on function public.family_calendar_access(uuid,text,boolean) from public, anon;
grant execute on function public.family_calendar_access(uuid,text,boolean) to authenticated;

create table if not exists public.calendar_changes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  event_id text not null,
  actor_id uuid,
  actor_email text not null default '',
  before_event jsonb,
  after_event jsonb,
  created_at timestamptz not null default now()
);
create index if not exists calendar_changes_scope on public.calendar_changes(owner_id,calendar_id,created_at desc);
alter table public.calendar_changes enable row level security;
revoke all on public.calendar_changes from public, anon, authenticated;
grant select on public.calendar_changes to authenticated;
drop policy if exists "Participants read changes" on public.calendar_changes;
create policy "Participants read changes" on public.calendar_changes for select to authenticated
using (public.family_calendar_access(owner_id,calendar_id));

create table if not exists public.calendar_acknowledgements (
  change_id uuid not null references public.calendar_changes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null default lower(coalesce(auth.jwt()->>'email','')),
  acknowledged_at timestamptz not null default now(),
  primary key(change_id,user_id)
);
alter table public.calendar_acknowledgements enable row level security;
revoke all on public.calendar_acknowledgements from public, anon, authenticated;
grant select on public.calendar_acknowledgements to authenticated;
grant insert (change_id,user_id) on public.calendar_acknowledgements to authenticated;
drop policy if exists "Participants read acknowledgements" on public.calendar_acknowledgements;
create policy "Participants read acknowledgements" on public.calendar_acknowledgements for select to authenticated
using (exists (select 1 from public.calendar_changes c where c.id = change_id and public.family_calendar_access(c.owner_id,c.calendar_id)));
drop policy if exists "Members acknowledge only for themselves" on public.calendar_acknowledgements;
create policy "Members acknowledge only for themselves" on public.calendar_acknowledgements for insert to authenticated
with check (user_id = auth.uid() and exists (select 1 from public.calendar_changes c where c.id = change_id and public.family_calendar_access(c.owner_id,c.calendar_id)));

create or replace function public.capture_family_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_data jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else coalesce(old.schedule->'calendarData','{}'::jsonb) end;
  new_data jsonb := coalesce(new.schedule->'calendarData','{}'::jsonb);
  cal text; eid text; previous jsonb; upcoming jsonb;
begin
  for cal in select key from jsonb_object_keys(old_data || new_data) as keys(key) loop
    for eid in select distinct item->>'id' from (
      select value item from jsonb_array_elements(coalesce(old_data->cal->'activities','[]'::jsonb))
      union all select value item from jsonb_array_elements(coalesce(new_data->cal->'activities','[]'::jsonb))
    ) events where coalesce(item->>'id','') <> '' loop
      select value into previous from jsonb_array_elements(coalesce(old_data->cal->'activities','[]'::jsonb)) where value->>'id' = eid limit 1;
      select value into upcoming from jsonb_array_elements(coalesce(new_data->cal->'activities','[]'::jsonb)) where value->>'id' = eid limit 1;
      if previous is distinct from upcoming then
        insert into public.calendar_changes(owner_id,calendar_id,event_id,actor_id,actor_email,before_event,after_event)
        values (new.user_id,cal,eid,auth.uid(),coalesce(auth.jwt()->>'email',''),previous,upcoming);
        -- A changed event invalidates an earlier pickup promise; the recipient must reconfirm.
        update public.calendar_pickups set status = case when upcoming is null then 'cancelled' else 'pending' end, responded_at = null, updated_at = clock_timestamp()
        where owner_id = new.user_id and calendar_id = cal and event_id = eid;
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
revoke all on function public.capture_family_changes() from public, anon, authenticated;

create table if not exists public.calendar_pickups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  event_id text not null,
  occurrence_date date not null,
  assignee_email text not null check (char_length(assignee_email) between 3 and 254),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  assigned_by uuid not null references auth.users(id),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(owner_id,calendar_id,event_id,occurrence_date)
);
create index if not exists calendar_pickups_scope on public.calendar_pickups(owner_id,calendar_id,occurrence_date);
alter table public.calendar_pickups enable row level security;
revoke all on public.calendar_pickups from public, anon, authenticated;
grant select on public.calendar_pickups to authenticated;
drop policy if exists "Participants read pickups" on public.calendar_pickups;
create policy "Participants read pickups" on public.calendar_pickups for select to authenticated
using (public.family_calendar_access(owner_id,calendar_id));

create or replace function public.assign_calendar_pickup(p_owner uuid,p_calendar text,p_event text,p_day date,p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare doc jsonb; recipient_email text := lower(trim(p_email));
begin
  if not public.family_calendar_access(p_owner,p_calendar,true) then raise exception 'Editor access required'; end if;
  select schedule into doc from public.family_schedules where user_id = p_owner;
  if p_day is null or not exists (select 1 from jsonb_array_elements(coalesce(doc->'calendarData'->p_calendar->'activities','[]'::jsonb)) e where e->>'id' = p_event) then
    raise exception 'Save this event before assigning pickup';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_owner and lower(u.email) = recipient_email)
    and not exists (select 1 from public.calendar_members m where m.owner_id = p_owner and m.calendar_id = p_calendar and m.status = 'active' and lower(m.member_email) = recipient_email) then
    raise exception 'Choose the owner or an accepted calendar member';
  end if;
  insert into public.calendar_pickups(owner_id,calendar_id,event_id,occurrence_date,assignee_email,assigned_by)
  values (p_owner,p_calendar,p_event,p_day,recipient_email,auth.uid())
  on conflict(owner_id,calendar_id,event_id,occurrence_date) do update
  set assignee_email = excluded.assignee_email,status = 'pending',assigned_by = auth.uid(),responded_at = null,updated_at = clock_timestamp();
end;
$$;
revoke all on function public.assign_calendar_pickup(uuid,text,text,date,text) from public, anon;
grant execute on function public.assign_calendar_pickup(uuid,text,text,date,text) to authenticated;

create or replace function public.respond_calendar_pickup(p_id uuid,p_status text,p_version timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('accepted','declined') then raise exception 'Invalid response'; end if;
  update public.calendar_pickups set status = p_status,responded_at = clock_timestamp(),updated_at = clock_timestamp()
  where id = p_id and updated_at = p_version and status = 'pending'
    and assignee_email = lower(coalesce(auth.jwt()->>'email',''))
    and public.family_calendar_access(owner_id,calendar_id);
  if not found then raise exception 'Assignment changed, or you are not the assigned recipient'; end if;
end;
$$;
revoke all on function public.respond_calendar_pickup(uuid,text,timestamptz) from public, anon;
grant execute on function public.respond_calendar_pickup(uuid,text,timestamptz) to authenticated;

drop trigger if exists family_changes_capture on public.family_schedules;
create trigger family_changes_capture after insert or update of schedule on public.family_schedules
for each row execute function public.capture_family_changes();
commit;
