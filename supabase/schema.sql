create table if not exists public.family_schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schedule jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.family_schedules enable row level security;

revoke all on table public.family_schedules from anon;
grant select, insert, update on table public.family_schedules to authenticated;

drop policy if exists "Families can read their own schedule" on public.family_schedules;
create policy "Families can read their own schedule"
on public.family_schedules
for select
to authenticated
using ((select auth.uid()) = user_id);

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
