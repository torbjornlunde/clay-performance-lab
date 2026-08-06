alter table public.session_courses
  add column if not exists compak_programme_type text,
  add column if not exists compak_conflict_resolution text;

alter table public.session_courses
  add constraint session_courses_compak_programme_type_check
  check (compak_programme_type is null or compak_programme_type in (
    'five_singles',
    'three_singles_one_report_pair',
    'three_singles_one_simultaneous_pair',
    'one_single_two_report_pairs',
    'one_single_two_simultaneous_pairs'
  )),
  add constraint session_courses_compak_conflict_resolution_check
  check (compak_conflict_resolution is null or compak_conflict_resolution in (
    'exact_authoritative',
    'remembered_discrepancy'
  )),
  add constraint session_courses_compak_resolution_has_sources_check
  check (compak_conflict_resolution is null or (fitasc_scheme is not null and compak_programme_type is not null));

comment on column public.session_courses.compak_programme_type is
  'Optional remembered Compak presentation pattern; it does not define machines, target order, or scores.';
comment on column public.session_courses.compak_conflict_resolution is
  'Explicit user choice when the remembered pattern differs from the selected exact FITASC scheme.';

-- Keep partial programme facts through the authoritative template snapshot and copy paths.

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

  select coalesce(jsonb_agg(jsonb_build_object('courseNumber', c.course_number, 'fitascScheme', c.fitasc_scheme, 'compakProgrammeType', c.compak_programme_type, 'compakConflictResolution', c.compak_conflict_resolution, 'shooterNumber', c.shooter_number, 'startPlate', c.start_plate) order by c.course_number), '[]'::jsonb)
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
    insert into public.session_courses(session_id,course_number,fitasc_scheme,compak_programme_type,compak_conflict_resolution,shooter_number,start_plate) values(new_session_id,(course_item->>'courseNumber')::integer,nullif(course_item->>'fitascScheme','')::integer,nullif(course_item->>'compakProgrammeType',''),nullif(course_item->>'compakConflictResolution',''),nullif(course_item->>'shooterNumber','')::integer,nullif(course_item->>'startPlate','')::integer);
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

create or replace function public.apply_competition_template_to_empty_session(p_template_id uuid, p_session_id uuid)
returns table (session_id uuid, template_id uuid, template_version integer, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  s public.sessions%rowtype;
  t public.competition_templates%rowtype;
  post_item jsonb;
  pres_item jsonb;
  target_item jsonb;
  physical_item jsonb;
  course_item jsonb;
begin
  if v_user is null or not public.has_approved_access(v_user) then raise exception 'Access required'; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.user_id <> v_user then raise exception 'Session not found'; end if;
  select * into t from public.competition_templates where id = p_template_id and withdrawn_at is null and (visibility in ('searchable','link') or owner_user_id = v_user) for share;
  if not found then raise exception 'Template not available'; end if;
  if t.discipline <> s.discipline then raise exception 'Template discipline does not match this competition'; end if;
  if s.copied_from_competition_template_id is not null or exists(select 1 from public.competition_template_copies c where c.created_session_id = p_session_id) then
    raise exception 'This competition already uses a shared setup';
  end if;
  if exists(select 1 from public.session_post_targets x where x.session_id = p_session_id)
    or exists(select 1 from public.session_post_details x where x.session_id = p_session_id)
    or exists(select 1 from public.session_target_definitions x where x.session_id = p_session_id)
    or exists(select 1 from public.session_course_overrides x where x.session_id = p_session_id)
    or exists(select 1 from public.misses x where x.session_id = p_session_id)
    or exists(select 1 from public.scorecard_imports x where x.session_id = p_session_id) then
    raise exception 'This setup can only be applied to a new, empty competition.';
  end if;
  if exists(select 1 from public.session_courses x where x.session_id = p_session_id and (x.fitasc_scheme is not null or x.compak_programme_type is not null or x.compak_conflict_resolution is not null or x.shooter_number is not null or x.start_plate is not null)) then
    raise exception 'This setup can only be applied to a new, empty competition.';
  end if;

  delete from public.session_courses where session_id = p_session_id;

  for course_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,program,courses}','[]'::jsonb)) loop
    insert into public.session_courses(session_id,course_number,fitasc_scheme,compak_programme_type,compak_conflict_resolution,shooter_number,start_plate)
    values(p_session_id,(course_item->>'courseNumber')::integer,nullif(course_item->>'fitascScheme','')::integer,nullif(course_item->>'compakProgrammeType',''),nullif(course_item->>'compakConflictResolution',''),nullif(course_item->>'shooterNumber','')::integer,nullif(course_item->>'startPlate','')::integer);
  end loop;
  for post_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,posts}','[]'::jsonb)) loop
    insert into public.session_post_details(session_id,post_number,instructions,source_text)
    values(p_session_id,(post_item->>'postNumber')::integer,nullif(post_item->>'instructions',''),nullif(post_item->>'sourceText',''));
    for pres_item in select * from jsonb_array_elements(coalesce(post_item->'presentations','[]'::jsonb)) loop
      for target_item in select * from jsonb_array_elements(coalesce(pres_item->'targets','[]'::jsonb)) loop
        insert into public.session_post_targets(session_id,post_number,target_position,presentation_number,presentation_type,position_in_presentation,target_label,target_type,direction,angle,speed,distance,difficulty,notes)
        values(p_session_id,(post_item->>'postNumber')::integer,(target_item->>'targetPosition')::integer,(pres_item->>'presentationNumber')::integer,pres_item->>'presentationType',(target_item->>'positionInPresentation')::integer,target_item#>>'{details,label}',target_item#>>'{details,targetType}',target_item#>>'{details,direction}',target_item#>>'{details,angle}',target_item#>>'{details,speed}',target_item#>>'{details,distance}',target_item#>>'{details,difficulty}',target_item#>>'{details,notes}');
      end loop;
    end loop;
  end loop;
  for physical_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,physicalTargets}','[]'::jsonb)) loop
    insert into public.session_target_definitions(session_id,course_number,machine,target_type,direction,angle,speed,distance,difficulty,notes)
    values(p_session_id,(physical_item->>'courseNumber')::integer,physical_item->>'machine',physical_item#>>'{details,targetType}',physical_item#>>'{details,direction}',physical_item#>>'{details,angle}',physical_item#>>'{details,speed}',physical_item#>>'{details,distance}',physical_item#>>'{details,difficulty}',physical_item#>>'{details,notes}');
  end loop;

  update public.sessions set copied_from_competition_template_id = t.id, copied_from_competition_template_version = t.template_version where id = p_session_id;
  insert into public.competition_template_copies(template_id,template_version,copied_by_user_id,created_session_id) values(t.id,t.template_version,v_user,p_session_id);
  session_id := p_session_id; template_id := t.id; template_version := t.template_version; status := 'applied';
  return next;
end $$;

revoke execute on function public.build_competition_template_snapshot(uuid) from public, anon;
revoke execute on function public.copy_competition_template_to_new_session(uuid,text,date,text) from public, anon;
revoke execute on function public.apply_competition_template_to_empty_session(uuid,uuid) from public, anon;
grant execute on function public.copy_competition_template_to_new_session(uuid,text,date,text) to authenticated;
grant execute on function public.apply_competition_template_to_empty_session(uuid,uuid) to authenticated;
