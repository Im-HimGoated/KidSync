-- Enables authenticated change notifications without changing grants or RLS.
-- Idempotent: safe to run again on a project already configured for Realtime.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'family_schedules'
  ) then
    alter publication supabase_realtime add table public.family_schedules;
  end if;
end;
$$;
