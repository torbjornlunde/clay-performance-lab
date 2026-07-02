-- Published competition setup templates. Additive only; existing sessions/targets are untouched.
create table if not exists public.competition_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_session_id uuid references public.sessions(id) on delete set null,
  name text not null,
  normalized_name text not null,
  competition_date date not null,
  shooting_ground text,
  normalized_shooting_ground text,
  discipline text not null,
  visibility text not null default 'private' check (visibility in ('private','link','searchable')),
  show_creator_name boolean not null default false,
  creator_display_name_snapshot text,
  template_version integer not null default 1 check (template_version > 0),
  template_payload jsonb not null,
  post_count integer not null default 0 check (post_count >= 0),
  target_count integer not null default 0 check (target_count >= 0),
  is_complete boolean not null default false,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint competition_templates_name_present check (btrim(name) <> ''),
  constraint competition_templates_payload_object check (jsonb_typeof(template_payload) = 'object')
);

create table if not exists public.competition_template_copies (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.competition_templates(id) on delete restrict,
  template_version integer not null,
  copied_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_session_id uuid not null references public.sessions(id) on delete cascade,
  copied_at timestamptz not null default now()
);

alter table public.sessions add column if not exists copied_from_competition_template_id uuid references public.competition_templates(id) on delete set null;
alter table public.sessions add column if not exists copied_from_competition_template_version integer;

create index if not exists competition_templates_visibility_idx on public.competition_templates(visibility) where withdrawn_at is null;
create index if not exists competition_templates_discipline_idx on public.competition_templates(discipline) where withdrawn_at is null;
create index if not exists competition_templates_date_idx on public.competition_templates(competition_date) where withdrawn_at is null;
create index if not exists competition_templates_normalized_name_idx on public.competition_templates(normalized_name text_pattern_ops) where withdrawn_at is null;
create index if not exists competition_templates_normalized_ground_idx on public.competition_templates(normalized_shooting_ground text_pattern_ops) where withdrawn_at is null;
create index if not exists competition_templates_owner_idx on public.competition_templates(owner_user_id, source_session_id, updated_at desc);
create index if not exists competition_template_copies_user_idx on public.competition_template_copies(copied_by_user_id, copied_at desc);

create or replace function public.normalize_competition_template_search_text(value text) returns text language sql immutable as $$ select regexp_replace(lower(btrim(coalesce(value,''))), '\s+', ' ', 'g') $$;
create or replace function public.competition_template_creator_label(show_name boolean, snapshot text) returns text language sql immutable as $$ select case when show_name and nullif(snapshot,'') is not null then 'Created by ' || snapshot else 'Created by another user' end $$;
create or replace function public.is_post_based_template_discipline(value text) returns boolean language sql immutable as $$ select lower(btrim(coalesce(value,''))) in ('leirduesti','sporting','english sporting','engelsk sporting') $$;
create or replace function public.is_physical_template_discipline(value text) returns boolean language sql immutable as $$ select lower(btrim(coalesce(value,''))) in ('compak sporting','kompakt leirduesti','sporttrap') $$;

create or replace function public.set_competition_template_search_fields() returns trigger language plpgsql set search_path = public as $$
begin
  new.normalized_name := public.normalize_competition_template_search_text(new.name);
  new.normalized_shooting_ground := nullif(public.normalize_competition_template_search_text(new.shooting_ground), '');
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists competition_templates_set_search_fields on public.competition_templates;
create trigger competition_templates_set_search_fields before insert or update on public.competition_templates for each row execute function public.set_competition_template_search_fields();

alter table public.competition_templates enable row level security;
alter table public.competition_template_copies enable row level security;

drop policy if exists "competition_templates_select_own" on public.competition_templates;
create policy "competition_templates_select_own" on public.competition_templates for select using (public.has_approved_access(auth.uid()) and auth.uid() = owner_user_id);
drop policy if exists "competition_templates_insert_own" on public.competition_templates;
create policy "competition_templates_insert_own" on public.competition_templates for insert with check (false);
drop policy if exists "competition_templates_update_own" on public.competition_templates;
create policy "competition_templates_update_own" on public.competition_templates for update using (false) with check (false);
drop policy if exists "competition_templates_delete_none" on public.competition_templates;
create policy "competition_templates_delete_none" on public.competition_templates for delete using (false);

drop policy if exists "competition_template_copies_select_own" on public.competition_template_copies;
create policy "competition_template_copies_select_own" on public.competition_template_copies for select using (public.has_approved_access(auth.uid()) and copied_by_user_id = auth.uid());
drop policy if exists "competition_template_copies_insert_blocked" on public.competition_template_copies;
create policy "competition_template_copies_insert_blocked" on public.competition_template_copies for insert with check (false);

create or replace function public.build_competition_template_snapshot(p_source_session_id uuid)
returns table (
  name text,
  competition_date date,
  shooting_ground text,
  discipline text,
  template_payload jsonb,
  post_count integer,
  target_count integer,
  is_complete boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  s public.sessions%rowtype;
  v_courses jsonb := '[]'::jsonb;
  v_posts jsonb := '[]'::jsonb;
  v_physical jsonb := '[]'::jsonb;
  expected_posts integer;
  expected_targets_per_post integer;
  expected_total integer;
  rows_total integer := 0;
  complete_posts integer := 0;
  target_rows integer := 0;
  physical_rows integer := 0;
begin
  if v_user is null or not public.has_approved_access(v_user) then raise exception 'Access required'; end if;
  select * into s from public.sessions where id = p_source_session_id and user_id = v_user;
  if not found then raise exception 'Source session not found'; end if;
  if nullif(btrim(s.name),'') is null then raise exception 'Competition name is required'; end if;
  if s.competition_date is null then raise exception 'Competition date is required'; end if;
  if not (public.is_post_based_template_discipline(s.discipline) or public.is_physical_template_discipline(s.discipline)) then raise exception 'This discipline is not supported for templates'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('courseNumber', c.course_number, 'fitascScheme', c.fitasc_scheme, 'shooterNumber', c.shooter_number, 'startPlate', c.start_plate) order by c.course_number), '[]'::jsonb)
    into v_courses
  from public.session_courses c where c.session_id = s.id;

  if public.is_post_based_template_discipline(s.discipline) then
    expected_posts := greatest(coalesce(s.post_count, s.course_count, 0), 0);
    expected_targets_per_post := greatest(coalesce(s.targets_per_post, case when s.total_targets is not null and coalesce(s.post_count, s.course_count, 0) > 0 then round(s.total_targets::numeric / coalesce(s.post_count, s.course_count))::integer end, 0), 0);
    select count(*) into target_rows from public.session_post_targets t where t.session_id = s.id;
    select coalesce(jsonb_agg(post_json order by post_number), '[]'::jsonb) into v_posts
    from (
      select p.post_number,
        jsonb_build_object(
          'postNumber', p.post_number,
          'instructions', coalesce(d.instructions,''),
          'sourceText', coalesce(d.source_text,''),
          'presentations', coalesce(jsonb_agg(p.presentation_json order by p.presentation_number), '[]'::jsonb)
        ) as post_json
      from (
        select t.post_number, t.presentation_number,
          jsonb_build_object(
            'presentationNumber', t.presentation_number,
            'presentationType', min(t.presentation_type),
            'targets', jsonb_agg(jsonb_build_object(
              'targetPosition', t.target_position,
              'positionInPresentation', t.position_in_presentation,
              'details', jsonb_build_object(
                'label', nullif(t.target_label,''),
                'targetType', nullif(t.target_type,''),
                'direction', nullif(t.direction,''),
                'angle', nullif(t.angle,''),
                'speed', nullif(t.speed,''),
                'distance', nullif(t.distance,''),
                'difficulty', nullif(t.difficulty,''),
                'notes', nullif(t.notes,'')
              )
            ) order by t.target_position)
          ) as presentation_json
        from public.session_post_targets t
        where t.session_id = s.id
        group by t.post_number, t.presentation_number
      ) p
      left join public.session_post_details d on d.session_id = s.id and d.post_number = p.post_number
      group by p.post_number, d.instructions, d.source_text
    ) post_rows;

    select count(*) into complete_posts
    from (
      select t.post_number, count(*) as row_count, min(t.target_position) as min_pos, max(t.target_position) as max_pos, count(distinct t.target_position) as distinct_pos,
        bool_and(t.presentation_type in ('single','report_pair','simultaneous_pair','other_pair','unknown')) as valid_presentations,
        bool_and((t.presentation_type in ('single','unknown') and t.position_in_presentation = 1) or (t.presentation_type not in ('single','unknown') and t.position_in_presentation in (1,2))) as valid_pair_positions
      from public.session_post_targets t where t.session_id = s.id group by t.post_number
    ) checked
    where checked.post_number between 1 and expected_posts
      and checked.min_pos = 1
      and checked.max_pos = checked.row_count
      and checked.distinct_pos = checked.row_count
      and (expected_targets_per_post = 0 or checked.row_count = expected_targets_per_post)
      and checked.valid_presentations and checked.valid_pair_positions;
    rows_total := target_rows;
    expected_total := coalesce(s.total_targets, case when expected_posts > 0 and expected_targets_per_post > 0 then expected_posts * expected_targets_per_post end, target_rows);
    is_complete := expected_posts > 0 and target_rows > 0 and complete_posts = expected_posts and target_rows = expected_total;
    post_count := expected_posts;
    target_count := target_rows;
  else
    expected_posts := greatest(coalesce(s.course_count, case when s.discipline = 'Sporttrap' then 1 end, 0), 0);
    expected_total := coalesce(s.total_targets, case when s.discipline = 'Sporttrap' then coalesce(s.sporttrap_series_count,1) * 25 when expected_posts > 0 then expected_posts * 25 end, 0);
    select count(*) into physical_rows from public.session_target_definitions d where d.session_id = s.id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'courseNumber', d.course_number,
      'machine', d.machine,
      'details', jsonb_build_object('label', d.machine, 'targetType', nullif(d.target_type,''), 'direction', nullif(d.direction,''), 'angle', nullif(d.angle,''), 'speed', nullif(d.speed,''), 'distance', nullif(d.distance,''), 'difficulty', nullif(d.difficulty,''), 'notes', nullif(d.notes,''))
    ) order by d.course_number, d.machine), '[]'::jsonb) into v_physical
    from public.session_target_definitions d where d.session_id = s.id;
    post_count := expected_posts;
    target_count := expected_total;
    is_complete := expected_posts > 0 and expected_total > 0 and jsonb_array_length(v_courses) >= expected_posts and physical_rows >= case when s.discipline in ('Compak Sporting','Kompakt leirduesti') then expected_posts * 6 else 1 end;
  end if;

  name := s.name;
  competition_date := s.competition_date;
  shooting_ground := s.shooting_ground;
  discipline := s.discipline;
  template_payload := jsonb_build_object(
    'schemaVersion', 1,
    'metadata', jsonb_build_object(
      'name', s.name,
      'competitionDate', s.competition_date,
      'shootingGround', s.shooting_ground,
      'discipline', s.discipline,
      'shootingFormat', s.shooting_format,
      'postCount', post_count,
      'targetCount', target_count,
      'targetsPerPost', s.targets_per_post,
      'defaultPostFormat', s.default_post_format
    ),
    'setup', jsonb_build_object('posts', v_posts, 'physicalTargets', v_physical, 'program', jsonb_build_object('courses', v_courses, 'sporttrapSeriesCount', s.sporttrap_series_count))
  );
  return next;
end $$;

create or replace function public.preview_competition_template_source(p_source_session_id uuid)
returns table (name text, competition_date date, shooting_ground text, discipline text, post_count integer, target_count integer, is_complete boolean)
language sql security definer set search_path = public as $$
  select s.name, s.competition_date, s.shooting_ground, s.discipline, s.post_count, s.target_count, s.is_complete
  from public.build_competition_template_snapshot(p_source_session_id) s;
$$;

create or replace function public.safe_creator_snapshot(p_show_creator_name boolean)
returns table(show_creator_name boolean, creator_display_name_snapshot text)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_name text;
begin
  if v_user is null or not public.has_approved_access(v_user) then raise exception 'Access required'; end if;
  select nullif(btrim(coalesce(display_name, full_name)), '') into v_name from public.shooter_profiles where user_id = v_user;
  show_creator_name := p_show_creator_name and v_name is not null;
  creator_display_name_snapshot := case when show_creator_name then v_name else null end;
  return next;
end $$;

create or replace function public.publish_competition_template(p_source_session_id uuid, p_visibility text default 'private', p_show_creator_name boolean default false)
returns table(template_id uuid, template_version integer, visibility text, is_complete boolean)
language plpgsql security definer set search_path = public as $$
declare snap record; creator record; v_id uuid;
begin
  if auth.uid() is null or not public.has_approved_access(auth.uid()) then raise exception 'Access required'; end if;
  if p_visibility not in ('private','link','searchable') then raise exception 'Invalid visibility'; end if;
  select * into snap from public.build_competition_template_snapshot(p_source_session_id);
  select * into creator from public.safe_creator_snapshot(p_show_creator_name);
  insert into public.competition_templates(owner_user_id, source_session_id, name, competition_date, shooting_ground, discipline, visibility, show_creator_name, creator_display_name_snapshot, template_payload, post_count, target_count, is_complete)
  values(auth.uid(), p_source_session_id, snap.name, snap.competition_date, snap.shooting_ground, snap.discipline, p_visibility, creator.show_creator_name, creator.creator_display_name_snapshot, snap.template_payload, snap.post_count, snap.target_count, snap.is_complete)
  returning id, public.competition_templates.template_version into v_id, template_version;
  template_id := v_id; visibility := p_visibility; is_complete := snap.is_complete; return next;
end $$;

create or replace function public.update_competition_template_snapshot(p_template_id uuid, p_visibility text default null, p_show_creator_name boolean default null)
returns table(template_id uuid, template_version integer, visibility text, is_complete boolean)
language plpgsql security definer set search_path = public as $$
declare t public.competition_templates%rowtype; snap record; creator record; next_visibility text;
begin
  if auth.uid() is null or not public.has_approved_access(auth.uid()) then raise exception 'Access required'; end if;
  select * into t from public.competition_templates where id = p_template_id and owner_user_id = auth.uid() for update;
  if not found then raise exception 'Template not found'; end if;
  next_visibility := coalesce(p_visibility, t.visibility);
  if next_visibility not in ('private','link','searchable') then raise exception 'Invalid visibility'; end if;
  select * into snap from public.build_competition_template_snapshot(t.source_session_id);
  select * into creator from public.safe_creator_snapshot(coalesce(p_show_creator_name, t.show_creator_name));
  update public.competition_templates ct set
    name = snap.name,
    competition_date = snap.competition_date,
    shooting_ground = snap.shooting_ground,
    discipline = snap.discipline,
    visibility = next_visibility,
    show_creator_name = creator.show_creator_name,
    creator_display_name_snapshot = creator.creator_display_name_snapshot,
    template_payload = snap.template_payload,
    post_count = snap.post_count,
    target_count = snap.target_count,
    is_complete = snap.is_complete,
    template_version = ct.template_version + 1,
    withdrawn_at = null
  where ct.id = p_template_id and ct.owner_user_id = auth.uid()
  returning ct.id, ct.template_version, ct.visibility, ct.is_complete into template_id, template_version, visibility, is_complete;
  return next;
end $$;

create or replace function public.set_competition_template_visibility(p_template_id uuid, p_visibility text)
returns table(template_id uuid, visibility text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_approved_access(auth.uid()) then raise exception 'Access required'; end if;
  if p_visibility not in ('private','link','searchable') then raise exception 'Invalid visibility'; end if;
  update public.competition_templates set visibility = p_visibility where id = p_template_id and owner_user_id = auth.uid() returning id, public.competition_templates.visibility into template_id, visibility;
  if template_id is null then raise exception 'Template not found'; end if;
  return next;
end $$;

create or replace function public.withdraw_competition_template(p_template_id uuid)
returns table(template_id uuid, withdrawn_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_approved_access(auth.uid()) then raise exception 'Access required'; end if;
  update public.competition_templates set withdrawn_at = now(), visibility = 'private' where id = p_template_id and owner_user_id = auth.uid() returning id, public.competition_templates.withdrawn_at into template_id, withdrawn_at;
  if template_id is null then raise exception 'Template not found'; end if;
  return next;
end $$;

create or replace function public.republish_competition_template(p_template_id uuid, p_visibility text default 'private')
returns table(template_id uuid, visibility text, withdrawn_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_approved_access(auth.uid()) then raise exception 'Access required'; end if;
  if p_visibility not in ('private','link','searchable') then raise exception 'Invalid visibility'; end if;
  update public.competition_templates set withdrawn_at = null, visibility = p_visibility where id = p_template_id and owner_user_id = auth.uid() returning id, public.competition_templates.visibility, public.competition_templates.withdrawn_at into template_id, visibility, withdrawn_at;
  if template_id is null then raise exception 'Template not found'; end if;
  return next;
end $$;

create or replace function public.search_competition_templates(p_name text default null, p_date date default null, p_discipline text default null, p_shooting_ground text default null)
returns table (id uuid, name text, competition_date date, shooting_ground text, discipline text, creator_label text, post_count integer, target_count integer, is_complete boolean, template_version integer, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.competition_date, t.shooting_ground, t.discipline,
    public.competition_template_creator_label(t.show_creator_name, t.creator_display_name_snapshot),
    t.post_count, t.target_count, t.is_complete, t.template_version, t.updated_at
  from public.competition_templates t
  where public.has_approved_access(auth.uid())
    and t.visibility = 'searchable'
    and t.withdrawn_at is null
    and (p_name is null or t.normalized_name like '%' || public.normalize_competition_template_search_text(p_name) || '%')
    and (p_date is null or t.competition_date = p_date)
    and (p_discipline is null or t.discipline = p_discipline)
    and (p_shooting_ground is null or coalesce(t.normalized_shooting_ground,'') like '%' || public.normalize_competition_template_search_text(p_shooting_ground) || '%')
  order by t.updated_at desc
  limit 50;
$$;

create or replace function public.get_competition_template_preview(p_template_id uuid)
returns table (id uuid, name text, competition_date date, shooting_ground text, discipline text, creator_label text, post_count integer, target_count integer, is_complete boolean, template_version integer, template_payload jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.competition_date, t.shooting_ground, t.discipline,
    public.competition_template_creator_label(t.show_creator_name, t.creator_display_name_snapshot),
    t.post_count, t.target_count, t.is_complete, t.template_version, t.template_payload, t.updated_at
  from public.competition_templates t
  where public.has_approved_access(auth.uid())
    and t.id = p_template_id
    and t.withdrawn_at is null
    and (t.owner_user_id = auth.uid() or t.visibility in ('searchable','link'));
$$;

create or replace function public.copy_competition_template_to_new_session(p_template_id uuid, p_name text default null, p_competition_date date default null, p_shooting_ground text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.competition_templates%rowtype; new_session_id uuid; post_item jsonb; pres_item jsonb; target_item jsonb; physical_item jsonb; course_item jsonb;
begin
  if auth.uid() is null or not public.has_approved_access(auth.uid()) then raise exception 'Access required'; end if;
  select * into t from public.competition_templates where id = p_template_id and withdrawn_at is null and (visibility in ('searchable','link') or owner_user_id = auth.uid()) for share;
  if not found then raise exception 'Template not available'; end if;
  insert into public.sessions(user_id,name,discipline,session_type,shooting_format,course_count,total_targets,competition_date,shooting_ground,post_count,targets_per_post,default_post_format,copied_from_competition_template_id,copied_from_competition_template_version)
  values(auth.uid(), coalesce(nullif(btrim(p_name),''), t.name), t.discipline, 'Competition', t.template_payload#>>'{metadata,shootingFormat}', nullif(t.template_payload#>>'{metadata,postCount}','')::integer, t.target_count, coalesce(p_competition_date,t.competition_date), coalesce(nullif(btrim(p_shooting_ground),''), t.shooting_ground), nullif(t.template_payload#>>'{metadata,postCount}','')::integer, nullif(t.template_payload#>>'{metadata,targetsPerPost}','')::integer, t.template_payload#>>'{metadata,defaultPostFormat}', t.id, t.template_version) returning id into new_session_id;
  for course_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,program,courses}','[]'::jsonb)) loop
    insert into public.session_courses(session_id,course_number,fitasc_scheme,shooter_number,start_plate) values(new_session_id,(course_item->>'courseNumber')::integer,nullif(course_item->>'fitascScheme','')::integer,nullif(course_item->>'shooterNumber','')::integer,nullif(course_item->>'startPlate','')::integer);
  end loop;
  for post_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,posts}','[]'::jsonb)) loop
    insert into public.session_post_details(session_id,post_number,instructions,source_text) values(new_session_id,(post_item->>'postNumber')::integer,nullif(post_item->>'instructions',''),nullif(post_item->>'sourceText','')) on conflict (session_id,post_number) do update set instructions=excluded.instructions, source_text=excluded.source_text, updated_at=now();
    for pres_item in select * from jsonb_array_elements(coalesce(post_item->'presentations','[]'::jsonb)) loop
      for target_item in select * from jsonb_array_elements(coalesce(pres_item->'targets','[]'::jsonb)) loop
        insert into public.session_post_targets(session_id,post_number,target_position,presentation_number,presentation_type,position_in_presentation,target_label,target_type,direction,angle,speed,distance,difficulty,notes)
        values(new_session_id,(post_item->>'postNumber')::integer,(target_item->>'targetPosition')::integer,(pres_item->>'presentationNumber')::integer,pres_item->>'presentationType',(target_item->>'positionInPresentation')::integer,target_item#>>'{details,label}',target_item#>>'{details,targetType}',target_item#>>'{details,direction}',target_item#>>'{details,angle}',target_item#>>'{details,speed}',target_item#>>'{details,distance}',target_item#>>'{details,difficulty}',target_item#>>'{details,notes}');
      end loop;
    end loop;
  end loop;
  for physical_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,physicalTargets}','[]'::jsonb)) loop
    insert into public.session_target_definitions(session_id,course_number,machine,target_type,direction,angle,speed,distance,difficulty,notes)
    values(new_session_id,(physical_item->>'courseNumber')::integer,physical_item->>'machine',physical_item#>>'{details,targetType}',physical_item#>>'{details,direction}',physical_item#>>'{details,angle}',physical_item#>>'{details,speed}',physical_item#>>'{details,distance}',physical_item#>>'{details,difficulty}',physical_item#>>'{details,notes}');
  end loop;
  insert into public.competition_template_copies(template_id,template_version,copied_by_user_id,created_session_id) values(t.id,t.template_version,auth.uid(),new_session_id);
  return new_session_id;
end $$;

revoke execute on function public.build_competition_template_snapshot(uuid) from public, anon;
revoke execute on function public.safe_creator_snapshot(boolean) from public, anon;
revoke execute on function public.preview_competition_template_source(uuid) from public, anon;
revoke execute on function public.publish_competition_template(uuid,text,boolean) from public, anon;
revoke execute on function public.update_competition_template_snapshot(uuid,text,boolean) from public, anon;
revoke execute on function public.set_competition_template_visibility(uuid,text) from public, anon;
revoke execute on function public.withdraw_competition_template(uuid) from public, anon;
revoke execute on function public.republish_competition_template(uuid,text) from public, anon;
revoke execute on function public.search_competition_templates(text,date,text,text) from public, anon;
revoke execute on function public.get_competition_template_preview(uuid) from public, anon;
revoke execute on function public.copy_competition_template_to_new_session(uuid,text,date,text) from public, anon;
grant execute on function public.preview_competition_template_source(uuid) to authenticated;
grant execute on function public.publish_competition_template(uuid,text,boolean) to authenticated;
grant execute on function public.update_competition_template_snapshot(uuid,text,boolean) to authenticated;
grant execute on function public.set_competition_template_visibility(uuid,text) to authenticated;
grant execute on function public.withdraw_competition_template(uuid) to authenticated;
grant execute on function public.republish_competition_template(uuid,text) to authenticated;
grant execute on function public.search_competition_templates(text,date,text,text) to authenticated;
grant execute on function public.get_competition_template_preview(uuid) to authenticated;
grant execute on function public.copy_competition_template_to_new_session(uuid,text,date,text) to authenticated;

comment on table public.competition_templates is 'Versioned, explicitly published competition setup snapshots. Payload is built by security-definer RPCs from whitelisted session/setup columns and excludes scores, misses, equipment, participants, owner emails and source session IDs.';
