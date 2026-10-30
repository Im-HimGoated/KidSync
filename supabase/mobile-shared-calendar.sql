-- Additive source migration. Review and deploy separately after schema.sql.
-- This file does not change table grants or RLS policies. Native shared writes
-- stay disabled until this checked RPC is actually installed.
begin;

create or replace function public.mobile_shared_date_valid(value text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  begin
    return pg_catalog.to_char(value::date, 'YYYY-MM-DD') = value;
  exception when others then return false;
  end;
end;
$$;

create or replace function public.mobile_shared_display_fields_valid(activity jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_typeof(activity) = 'object' and not exists (
    select 1 from pg_catalog.jsonb_each(case when pg_catalog.jsonb_typeof(activity) = 'object' then activity else '{}'::jsonb end) field
    where field.key = any(array['location','responsible','items','notes','icon','start','end'])
      and pg_catalog.jsonb_typeof(field.value) not in ('string','null')
  ),false);
$$;

create or replace function public.mobile_shared_event_valid(activity jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare starts text; ends text; first_day text; last_day text;
begin
  if not public.mobile_shared_display_fields_valid(activity)
    or not coalesce((pg_catalog.jsonb_typeof(activity->'id') = 'string' and length(trim(activity->>'id')) between 1 and 300)
      or pg_catalog.jsonb_typeof(activity->'id') = 'number', false)
    or pg_catalog.jsonb_typeof(activity->'title') is distinct from 'string'
    or length(trim(activity->>'title')) = 0 then return false; end if;
  first_day := activity->>'startDate'; last_day := activity->>'endDate';
  if not public.mobile_shared_date_valid(first_day) then return false; end if;
  if last_day is not null and last_day <> '' and
    (not public.mobile_shared_date_valid(last_day) or last_day < first_day) then return false; end if;
  if activity ? 'allDay' and pg_catalog.jsonb_typeof(activity->'allDay') not in ('boolean','null') then return false; end if;
  if coalesce((activity->>'allDay')::boolean,false) then return true; end if;
  starts := activity->>'start'; ends := activity->>'end';
  return coalesce(starts ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and ends ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and (last_day > first_day or ends > starts), false);
end;
$$;
revoke all on function public.mobile_shared_date_valid(text) from public, anon, authenticated, service_role;
revoke all on function public.mobile_shared_display_fields_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.mobile_shared_event_valid(jsonb) from public, anon, authenticated, service_role;

create or replace function public.mutate_shared_calendar_activities_checked(
  calendar_owner_id uuid,
  shared_calendar_id text,
  expected_updated_at timestamptz,
  changes jsonb,
  undo_token jsonb default null,
  expected_actor_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); actor_email text := lower(coalesce(auth.jwt()->>'email',''));
  member record; member_count integer := 0; actor_role text; may_write boolean;
  doc jsonb; version_at timestamptz; saved_at timestamptz; selected jsonb;
  modern boolean; mirrored boolean; was_mirrored boolean := false; undoing boolean := false;
  requests jsonb; receipt jsonb := '[]'::jsonb; seen jsonb := '[]'::jsonb;
  activities jsonb; mirrors jsonb; metadata jsonb; title text := 'Family';
  operation record; change jsonb; event_id jsonb; before_event jsonb; patch jsonb; after_event jsonb;
  actual_event jsonb; event_index integer; matches integer;
  mirror_event jsonb; mirror_before jsonb; mirror_after jsonb; mirror_index integer; restore_index integer;
  exclusions_only boolean; inverse_position integer; receipt_safe boolean := true;
begin
  if actor is null or expected_actor_id is null or actor <> expected_actor_id then
    raise exception using errcode = '42501', message = 'Sign in with the expected account';
  end if;
  if shared_calendar_id is null or length(trim(shared_calendar_id)) not between 1 and 300
    or pg_catalog.jsonb_typeof(changes) is distinct from 'array' or pg_catalog.jsonb_array_length(changes) > 20 then
    raise exception using errcode = '22023', message = 'Invalid calendar changes';
  end if;

  -- SHARE, rather than KEY SHARE, blocks changes to role/status and deletion
  -- until this transaction ends. Case-variant duplicate invitations fail closed.
  if actor = calendar_owner_id then actor_role := 'owner';
  else
    for member in select m.id,m.role,m.status from public.calendar_members m
      where m.owner_id = calendar_owner_id and m.calendar_id = shared_calendar_id
        and m.member_user_id = actor and lower(m.member_email) = actor_email
      order by m.id for share
    loop
      member_count := member_count + 1;
      actor_role := case when member.status = 'active' then member.role else null end;
    end loop;
    if member_count <> 1 or actor_role is null or actor_role not in ('viewer','commenter','editor') then
      raise exception using errcode = '42501', message = 'Active calendar membership required';
    end if;
  end if;
  may_write := actor_role in ('owner','editor');

  select f.schedule,f.updated_at into doc,version_at from public.family_schedules f
    where f.user_id = calendar_owner_id for update;
  if not found or pg_catalog.jsonb_typeof(doc) is distinct from 'object' then
    raise exception using errcode = 'P0002', message = 'Shared calendar not found';
  end if;
  modern := doc ? 'calendarData';
  if modern then
    if pg_catalog.jsonb_typeof(doc->'calendarData') is distinct from 'object'
      or not (doc->'calendarData' ? shared_calendar_id)
      or pg_catalog.jsonb_typeof(doc->'calendarData'->shared_calendar_id) is distinct from 'object'
      or pg_catalog.jsonb_typeof(doc->'calendars') is distinct from 'array' then
      raise exception using errcode = 'P0002', message = 'Shared calendar not found';
    end if;
    select count(*),min(c.value::text)::jsonb into matches,metadata
      from pg_catalog.jsonb_array_elements(doc->'calendars') c
      where c.value->>'id' = shared_calendar_id;
    if matches <> 1 then raise exception using errcode = 'P0002', message = 'Ambiguous shared calendar'; end if;
    selected := doc->'calendarData'->shared_calendar_id;
    title := coalesce(nullif(metadata->>'name',''),'Family');
  else
    -- Pre-v2 snapshots have one root calendar. If metadata is present it must
    -- identify only the selected calendar; never fall back from modern data.
    if doc ? 'calendars' then
      if pg_catalog.jsonb_typeof(doc->'calendars') is distinct from 'array'
        or pg_catalog.jsonb_array_length(doc->'calendars') <> 1
        or doc->'calendars'->0->>'id' is distinct from shared_calendar_id then
        raise exception using errcode = 'P0002', message = 'Shared calendar not found';
      end if;
      title := coalesce(nullif(doc->'calendars'->0->>'name',''),'Family');
    elsif shared_calendar_id <> 'family' then
      raise exception using errcode = 'P0002', message = 'Shared calendar not found';
    end if;
    selected := doc;
  end if;
  if selected ? 'activities' and pg_catalog.jsonb_typeof(selected->'activities') not in ('array','null') then
    raise exception using errcode = 'P0002', message = 'Invalid shared calendar data';
  end if;
  activities := coalesce(nullif(selected->'activities','null'::jsonb),'[]'::jsonb);
  mirrored := coalesce(modern and doc->>'activeCalendarId' = shared_calendar_id and pg_catalog.jsonb_typeof(doc->'activities') = 'array',false);
  mirrors := case when mirrored then doc->'activities' else '[]'::jsonb end;
  undoing := undo_token is not null and undo_token <> 'null'::jsonb;
  requests := changes;
  if undoing then
    if pg_catalog.jsonb_array_length(changes) <> 0 or pg_catalog.jsonb_typeof(undo_token) is distinct from 'object'
      or undo_token->'version' is distinct from '1'::jsonb
      or undo_token->>'userId' is distinct from actor::text
      or undo_token->>'ownerId' is distinct from calendar_owner_id::text
      or undo_token->>'calendarId' is distinct from shared_calendar_id
      or pg_catalog.jsonb_typeof(undo_token->'changes') is distinct from 'array'
      or pg_catalog.jsonb_array_length(undo_token->'changes') not between 1 and 20
      or pg_catalog.jsonb_typeof(undo_token->'mirrored') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Invalid undo receipt';
    end if;
    requests := undo_token->'changes'; was_mirrored := (undo_token->>'mirrored')::boolean;
  end if;
  if pg_catalog.jsonb_array_length(requests) > 0 then
    if not may_write then raise exception using errcode = '42501', message = 'Editor access required'; end if;
    if expected_updated_at is null or version_at is distinct from expected_updated_at then
      raise exception using errcode = '40001', message = 'Shared calendar changed';
    end if;
  end if;

  for operation in select r.value,r.ordinality from pg_catalog.jsonb_array_elements(requests) with ordinality r
    order by case when undoing then -r.ordinality else r.ordinality end
  loop
    change := operation.value;
    if pg_catalog.jsonb_typeof(change) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'Invalid activity change';
    end if;
    if undoing then
      if not (change ?& array['id','before','after','index','mirrorIndex','mirrorBefore','mirrorAfter'])
        or pg_catalog.jsonb_typeof(change->'index') is distinct from 'number'
        or pg_catalog.jsonb_typeof(change->'mirrorIndex') is distinct from 'number'
        or change->>'index' !~ '^-?[0-9]+$' or change->>'mirrorIndex' !~ '^-?[0-9]+$' then
        raise exception using errcode = '22023', message = 'Invalid undo receipt';
      end if;
      event_id := change->'id'; before_event := change->'after'; patch := change->'before';
      inverse_position := (change->>'index')::integer;
    else
      if not (change ?& array['original','event']) then raise exception using errcode = '22023', message = 'Original activity required'; end if;
      before_event := change->'original'; patch := change->'event';
      event_id := coalesce(nullif(before_event,'null'::jsonb)->'id',patch->'id');
    end if;
    if not coalesce((pg_catalog.jsonb_typeof(event_id) = 'string' and length(trim(event_id#>>'{}')) between 1 and 300)
        or pg_catalog.jsonb_typeof(event_id) = 'number',false)
      or seen @> pg_catalog.jsonb_build_array(event_id)
      or before_event = 'null'::jsonb and patch = 'null'::jsonb
      or before_event <> 'null'::jsonb and (pg_catalog.jsonb_typeof(before_event) is distinct from 'object' or before_event->'id' is distinct from event_id)
      or patch <> 'null'::jsonb and (pg_catalog.jsonb_typeof(patch) is distinct from 'object' or patch->'id' is distinct from event_id) then
      raise exception using errcode = '22023', message = 'Invalid activity identity';
    end if;
    seen := seen || pg_catalog.jsonb_build_array(event_id);
    if coalesce(before_event->'externalSource','null'::jsonb) not in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
      or coalesce(before_event->'isBuiltInHoliday','null'::jsonb) not in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
      or coalesce(patch->'externalSource','null'::jsonb) not in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
      or coalesce(patch->'isBuiltInHoliday','null'::jsonb) not in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb) then
      raise exception using errcode = '42501', message = 'Source-managed activity is read-only';
    end if;
    select count(*),min(a.ordinality)::integer-1,min(a.value::text)::jsonb into matches,event_index,actual_event
      from pg_catalog.jsonb_array_elements(activities) with ordinality a where a.value->'id' = event_id;
    if matches > 1 or (before_event = 'null'::jsonb and matches <> 0)
      or (before_event <> 'null'::jsonb and (matches <> 1 or actual_event is distinct from before_event)) then
      raise exception using errcode = '40001', message = 'Activity changed';
    end if;
    event_index := coalesce(event_index,-1); actual_event := coalesce(actual_event,'null'::jsonb);
    after_event := case when patch = 'null'::jsonb then 'null'::jsonb
      when undoing or before_event = 'null'::jsonb then patch else before_event || patch end;
    if after_event <> 'null'::jsonb and not public.mobile_shared_display_fields_valid(after_event) then
      raise exception using errcode = '22023', message = 'Invalid activity display fields';
    end if;
    exclusions_only := false;
    if not undoing and before_event <> 'null'::jsonb and after_event <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(after_event->'excludedDates') = 'array'
      and (before_event-'excludedDates') = (after_event-'excludedDates') then
      select not exists(select 1 from pg_catalog.jsonb_array_elements(after_event->'excludedDates') x
        where pg_catalog.jsonb_typeof(x.value) <> 'string' or not public.mobile_shared_date_valid(x.value#>>'{}')) into exclusions_only;
    end if;
    if after_event <> 'null'::jsonb and not exclusions_only and not public.mobile_shared_event_valid(after_event) then
      raise exception using errcode = '22023', message = 'Invalid activity details';
    end if;

    mirror_index := -1; mirror_event := 'null'::jsonb; mirror_before := 'null'::jsonb; mirror_after := 'null'::jsonb;
    if mirrored then
      select count(*),min(a.ordinality)::integer-1,min(a.value::text)::jsonb into matches,mirror_index,mirror_event
        from pg_catalog.jsonb_array_elements(mirrors) with ordinality a where a.value->'id' = event_id;
      if matches > 1 then raise exception using errcode = '40001', message = 'Compatibility activity changed'; end if;
      mirror_index := coalesce(mirror_index,-1); mirror_event := coalesce(mirror_event,'null'::jsonb); mirror_before := mirror_event;
      if undoing and was_mirrored then
        if pg_catalog.jsonb_typeof(change->'mirrorBefore') not in ('object','null')
          or pg_catalog.jsonb_typeof(change->'mirrorAfter') not in ('object','null')
          or (change->'mirrorBefore' <> 'null'::jsonb and change->'mirrorBefore'->'id' is distinct from event_id)
          or (change->'mirrorAfter' <> 'null'::jsonb and change->'mirrorAfter'->'id' is distinct from event_id)
          or mirror_event is distinct from change->'mirrorAfter' then
          raise exception using errcode = '40001', message = 'Compatibility activity changed';
        end if;
        mirror_after := change->'mirrorBefore'; restore_index := (change->>'mirrorIndex')::integer;
      elsif undoing then
        if before_event = 'null'::jsonb and mirror_event <> 'null'::jsonb
          or before_event <> 'null'::jsonb and (mirror_event = 'null'::jsonb or exists (
            select 1 from pg_catalog.jsonb_each(before_event) kv
              where not (mirror_event ? kv.key) or mirror_event->kv.key is distinct from kv.value)) then
          raise exception using errcode = '40001', message = 'Compatibility activity changed';
        end if;
        mirror_after := case when patch = 'null'::jsonb then 'null'::jsonb else
          (case when mirror_event = 'null'::jsonb then '{}'::jsonb else mirror_event end
            - array(select pg_catalog.jsonb_object_keys(case when before_event = 'null'::jsonb then '{}'::jsonb else before_event end))) || patch end;
        restore_index := inverse_position;
      else
        if before_event = 'null'::jsonb and mirror_index >= 0 then raise exception using errcode = '40001', message = 'Activity ID already used'; end if;
        mirror_after := case when patch = 'null'::jsonb then 'null'::jsonb
          when mirror_event = 'null'::jsonb then after_event else mirror_event || patch end;
        restore_index := mirror_index;
      end if;
      if mirror_after <> 'null'::jsonb and undoing and not public.mobile_shared_event_valid(mirror_after) then
        raise exception using errcode = '22023', message = 'Invalid undo activity';
      end if;
      if mirror_after = 'null'::jsonb then
        select coalesce(pg_catalog.jsonb_agg(a.value order by a.ordinality),'[]'::jsonb) into mirrors
          from pg_catalog.jsonb_array_elements(mirrors) with ordinality a where a.value->'id' is distinct from event_id;
      elsif mirror_index >= 0 then
        mirrors := pg_catalog.jsonb_set(mirrors,array[mirror_index::text],mirror_after,false);
      else
        restore_index := case when undoing then greatest(0,least(pg_catalog.jsonb_array_length(mirrors),restore_index)) else pg_catalog.jsonb_array_length(mirrors) end;
        mirrors := pg_catalog.jsonb_insert(mirrors,array[restore_index::text],mirror_after,false);
      end if;
    end if;

    -- A compatibility mirror can contain legacy-only fields that are not part
    -- of this shared calendar. Never expose those fields through an Undo token.
    -- Such writes still preserve them, but do not advertise an unsafe Undo.
    receipt_safe := receipt_safe and (actual_event = 'null'::jsonb or public.mobile_shared_event_valid(actual_event))
      and (mirror_before = 'null'::jsonb or public.mobile_shared_event_valid(mirror_before))
      and (not mirrored or (mirror_before = actual_event and mirror_after = after_event));
    receipt := receipt || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',event_id,
      'before',actual_event,'after',after_event,'index',event_index,'mirrorIndex',mirror_index,
      'mirrorBefore',mirror_before,'mirrorAfter',mirror_after));
    if after_event = 'null'::jsonb then
      select coalesce(pg_catalog.jsonb_agg(a.value order by a.ordinality),'[]'::jsonb) into activities
        from pg_catalog.jsonb_array_elements(activities) with ordinality a where a.value->'id' is distinct from event_id;
    elsif event_index >= 0 then activities := pg_catalog.jsonb_set(activities,array[event_index::text],after_event,false);
    else
      restore_index := case when undoing then greatest(0,least(pg_catalog.jsonb_array_length(activities),inverse_position)) else pg_catalog.jsonb_array_length(activities) end;
      activities := pg_catalog.jsonb_insert(activities,array[restore_index::text],after_event,false);
    end if;
  end loop;

  saved_at := version_at;
  if pg_catalog.jsonb_array_length(requests) > 0 then
    if modern then
      doc := pg_catalog.jsonb_set(doc,array['calendarData',shared_calendar_id,'activities'],activities,true);
      if mirrored then doc := pg_catalog.jsonb_set(doc,'{activities}',mirrors,false); end if;
    else doc := pg_catalog.jsonb_set(doc,'{activities}',activities,true);
    end if;
    saved_at := greatest(pg_catalog.clock_timestamp(),version_at + interval '1 microsecond');
    update public.family_schedules f set schedule = doc,updated_at = saved_at
      where f.user_id = calendar_owner_id and f.updated_at = expected_updated_at;
    if not found then raise exception using errcode = '40001', message = 'Shared calendar changed'; end if;
  end if;
  return pg_catalog.jsonb_build_object('ownerId',calendar_owner_id,'calendarId',shared_calendar_id,
    'role',actor_role,'canWrite',may_write,'updated_at',saved_at,
    'calendar',pg_catalog.jsonb_build_object('id',shared_calendar_id,'ownerId',calendar_owner_id,'role',actor_role,
      'name',title,'updatedAt',saved_at,'data',pg_catalog.jsonb_build_object('activities',activities,
        'kids',case when pg_catalog.jsonb_typeof(selected->'kids') = 'array' then selected->'kids' else '[]'::jsonb end)),
    'undoToken',case when not undoing and receipt_safe and pg_catalog.jsonb_array_length(receipt) > 0 then
      pg_catalog.jsonb_build_object('version',1,'userId',actor,'ownerId',calendar_owner_id,'calendarId',shared_calendar_id,
        'mirrored',mirrored,'changes',receipt) else null end);
end;
$$;
revoke all on function public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid) to authenticated;
comment on function public.mutate_shared_calendar_activities_checked(uuid,text,timestamptz,jsonb,jsonb,uuid) is
  'Selected-calendar native mutation with locked active editor membership, expected actor/revision, exact originals and checked Undo. Empty changes is a read-only capability probe. Legacy blind writers remain outside this protocol.';
commit;
