-- Searchable competition template candidate suggestions. Additive RPC only.
create or replace function public.competition_template_token_overlap_score(p_left text, p_right text, p_max integer)
returns integer language sql immutable as $$
  with left_tokens as (
    select distinct token from regexp_split_to_table(public.normalize_competition_template_search_text(p_left), ' ') token where length(token) >= 2
  ), right_tokens as (
    select distinct token from regexp_split_to_table(public.normalize_competition_template_search_text(p_right), ' ') token where length(token) >= 2
  ), counts as (
    select (select count(*) from left_tokens l join right_tokens r on l.token = r.token)::numeric as overlap,
           greatest((select count(*) from left_tokens), (select count(*) from right_tokens), 1)::numeric as total
  )
  select least(p_max, round(p_max * overlap / total)::integer) from counts;
$$;

create or replace function public.find_competition_template_candidates(
  p_name text,
  p_competition_date date,
  p_shooting_ground text,
  p_discipline text,
  p_target_count integer,
  p_limit integer default 5
)
returns table (
  id uuid,
  name text,
  competition_date date,
  shooting_ground text,
  discipline text,
  creator_label text,
  post_count integer,
  target_count integer,
  is_complete boolean,
  template_version integer,
  updated_at timestamptz,
  match_score integer,
  match_reasons text[]
)
language sql security definer set search_path = public as $$
  with input as (
    select
      public.normalize_competition_template_search_text(p_name) as q_name,
      public.normalize_competition_template_search_text(p_shooting_ground) as q_ground,
      nullif(btrim(coalesce(p_discipline,'')), '') as q_discipline,
      greatest(1, least(coalesce(p_limit, 5), 8)) as result_limit
  ), scored as (
    select
      t.id, t.name, t.competition_date, t.shooting_ground, t.discipline,
      public.competition_template_creator_label(t.show_creator_name, t.creator_display_name_snapshot) as creator_label,
      t.post_count, t.target_count, t.is_complete, t.template_version, t.updated_at,
      case when t.competition_date = p_competition_date then 40
           when abs(t.competition_date - p_competition_date) = 1 then 15 else 0 end as date_score,
      case when i.q_name = '' then 0
           when t.normalized_name = i.q_name then 30
           when t.normalized_name like i.q_name || '%' or i.q_name like t.normalized_name || '%' or t.normalized_name like '%' || i.q_name || '%' or i.q_name like '%' || t.normalized_name || '%' then 25
           else public.competition_template_token_overlap_score(t.normalized_name, i.q_name, 25) end as name_score,
      case when i.q_ground = '' or coalesce(t.normalized_shooting_ground,'') = '' then 0
           when t.normalized_shooting_ground = i.q_ground then 15
           when t.normalized_shooting_ground like '%' || i.q_ground || '%' or i.q_ground like '%' || t.normalized_shooting_ground || '%' then 10
           else public.competition_template_token_overlap_score(t.normalized_shooting_ground, i.q_ground, 10) end as ground_score,
      case when p_target_count is null or p_target_count <= 0 or t.target_count is null or t.target_count <= 0 then 0
           when t.target_count = p_target_count then 15
           when abs(t.target_count - p_target_count) <= greatest(2, ceil(p_target_count * 0.1)::integer) then 5 else 0 end as target_score,
      case when t.is_complete then 5 else 0 end as complete_score
    from public.competition_templates t cross join input i
    where auth.uid() is not null
      and public.has_approved_access(auth.uid())
      and p_competition_date is not null
      and i.q_discipline is not null
      and t.visibility = 'searchable'
      and t.withdrawn_at is null
      and t.discipline = i.q_discipline
      and lower(btrim(t.discipline)) <> 'fitasc sporting'
  ), final as (
    select *, least(100, date_score + name_score + ground_score + target_score + complete_score) as score from scored
  )
  select f.id, f.name, f.competition_date, f.shooting_ground, f.discipline, f.creator_label,
         f.post_count, f.target_count, f.is_complete, f.template_version, f.updated_at, f.score as match_score,
         array_remove(array[
           'Same discipline',
           case when f.date_score = 40 then 'Same date' when f.date_score = 15 then 'Date within 1 day' end,
           case when f.name_score = 30 then 'Same competition name' when f.name_score > 0 then 'Similar competition name' end,
           case when f.ground_score = 15 then 'Same shooting ground' when f.ground_score > 0 then 'Similar shooting ground' end,
           case when f.target_score = 15 then 'Same number of targets' when f.target_score > 0 then 'Similar number of targets' end,
           case when f.complete_score > 0 then 'Complete setup' end
         ], null) as match_reasons
  from final f cross join input i
  where f.score >= 45 and (f.date_score > 0 or f.name_score > 0 or f.ground_score > 0 or f.target_score > 0)
  order by f.score desc, f.is_complete desc, f.updated_at desc, f.template_version desc, f.id asc
  limit (select result_limit from input);
$$;

revoke execute on function public.competition_template_token_overlap_score(text,text,integer) from public, anon;
revoke execute on function public.find_competition_template_candidates(text,date,text,text,integer,integer) from public, anon;
grant execute on function public.find_competition_template_candidates(text,date,text,text,integer,integer) to authenticated;

comment on function public.find_competition_template_candidates(text,date,text,text,integer,integer) is 'Returns at most 8 searchable, same-discipline, non-withdrawn competition template candidates with explainable scores; excludes owner/source IDs, payload, emails, private/link-only templates and FITASC Sporting.';

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
    or exists(select 1 from public.session_courses x where x.session_id = p_session_id)
    or exists(select 1 from public.session_course_overrides x where x.session_id = p_session_id)
    or exists(select 1 from public.misses x where x.session_id = p_session_id)
    or exists(select 1 from public.scorecard_imports x where x.session_id = p_session_id) then
    raise exception 'This setup can only be applied to a new, empty competition.';
  end if;

  for course_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,program,courses}','[]'::jsonb)) loop
    insert into public.session_courses(session_id,course_number,fitasc_scheme,shooter_number,start_plate)
    values(p_session_id,(course_item->>'courseNumber')::integer,nullif(course_item->>'fitascScheme','')::integer,nullif(course_item->>'shooterNumber','')::integer,nullif(course_item->>'startPlate','')::integer);
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

revoke execute on function public.apply_competition_template_to_empty_session(uuid,uuid) from public, anon;
grant execute on function public.apply_competition_template_to_empty_session(uuid,uuid) to authenticated;

comment on function public.apply_competition_template_to_empty_session(uuid,uuid) is 'Atomically copies a validated template setup into an existing user-owned empty session while preserving session metadata, scores, notes and equipment.';
