create or replace function public.apply_scorecard_import_v2(
  p_session_id uuid,
  p_client_import_id uuid,
  p_image_fingerprint text,
  p_post_count integer,
  p_targets_per_post integer,
  p_targets_per_post_by_post integer[],
  p_reviewed_hits integer,
  p_reviewed_misses integer,
  p_reviewed_miss_positions jsonb,
  p_use_scorecard_score boolean,
  p_expected_own_score integer,
  p_misses jsonb,
  p_discovery_mode boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_existing public.scorecard_imports%rowtype;
  v_import_id uuid;
  v_total integer := 0;
  v_expected_count integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_item jsonb;
  v_own_updated boolean := false;
  v_reviewed_seen text[] := array[]::text[];
  v_payload_seen text[] := array[]::text[];
  v_key text;
  v_course integer;
  v_position integer;
  v_target_number integer;
  v_is_existing boolean;
begin
  if v_user_id is null then raise exception 'login_required'; end if;
  if not public.has_approved_access(v_user_id) then raise exception 'access_not_approved'; end if;
  if p_client_import_id is null or p_image_fingerprint !~ '^[a-fA-F0-9]{64}$' then raise exception 'invalid_import_identifiers'; end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.user_id <> v_user_id then raise exception 'forbidden'; end if;
  if lower(coalesce(v_session.discipline,'')) not in ('leirduesti','sporting','english sporting','engelsk sporting','compak sporting','sporttrap') then raise exception 'unsupported_discipline'; end if;

  select * into v_existing from public.scorecard_imports where session_id = p_session_id and (client_import_id = p_client_import_id or image_fingerprint = lower(p_image_fingerprint)) order by created_at limit 1;
  if found then
    return jsonb_build_object('importId', v_existing.id, 'insertedMisses', v_existing.inserted_misses, 'skippedDuplicates', v_existing.skipped_duplicates, 'score', v_existing.reviewed_hits, 'totalTargets', v_existing.reviewed_total_targets, 'ownScoreUpdated', false, 'alreadyImported', true);
  end if;

  if p_post_count < 1 or p_post_count > 100 or array_length(p_targets_per_post_by_post,1) <> p_post_count then raise exception 'dimension_mismatch'; end if;
  if p_discovery_mode then
    if lower(coalesce(v_session.discipline,'')) not in ('leirduesti','sporting','english sporting','engelsk sporting') then raise exception 'unsupported_discovery_discipline'; end if;
    if v_session.post_count is not null or v_session.course_count is not null or v_session.targets_per_post is not null then raise exception 'setup_created_after_analysis'; end if;
    if exists(select 1 from public.session_post_targets where session_id = p_session_id) then raise exception 'setup_created_after_analysis'; end if;
  elsif lower(coalesce(v_session.discipline,'')) = 'compak sporting' then
    if coalesce(v_session.course_count, v_session.post_count) <> p_post_count or p_targets_per_post <> 25 then raise exception 'dimension_mismatch'; end if;
  elsif lower(coalesce(v_session.discipline,'')) = 'sporttrap' then
    if coalesce(v_session.sporttrap_series_count, v_session.course_count) <> p_post_count or p_targets_per_post <> 25 then raise exception 'dimension_mismatch'; end if;
  elsif coalesce(v_session.post_count, v_session.course_count) <> p_post_count or v_session.targets_per_post <> p_targets_per_post then
    raise exception 'dimension_mismatch';
  end if;
  for v_course in 1..p_post_count loop
    v_expected_count := p_targets_per_post_by_post[v_course];
    if v_expected_count is null or v_expected_count < 1 or v_expected_count > 100 then raise exception 'dimension_mismatch'; end if;
    v_total := v_total + v_expected_count;
  end loop;
  if v_total > 500 or v_total < 1 then raise exception 'dimension_mismatch'; end if;
  if v_session.total_targets is not null and v_session.total_targets <> v_total then raise exception 'total_targets_conflict'; end if;
  if p_reviewed_hits < 0 or p_reviewed_misses < 0 or p_reviewed_hits + p_reviewed_misses <> v_total then raise exception 'invalid_counts'; end if;

  if v_session.own_score is distinct from p_expected_own_score then raise exception 'stale_score'; end if;
  if jsonb_typeof(coalesce(p_reviewed_miss_positions,'null'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_misses,'null'::jsonb)) <> 'array' then raise exception 'invalid_misses_payload'; end if;
  if jsonb_array_length(p_reviewed_miss_positions) <> p_reviewed_misses then raise exception 'reviewed_miss_count_mismatch'; end if;

  for v_item in select * from jsonb_array_elements(p_misses) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'invalid_miss_row'; end if;
    begin
      v_course := (v_item->>'course_number')::integer;
      v_position := (v_item->>'target_position')::integer;
      v_target_number := (v_item->>'target_number')::integer;
    exception when others then raise exception 'invalid_miss_coordinate'; end;
    if v_course < 1 or v_course > p_post_count or v_position < 1 or v_position > p_targets_per_post_by_post[v_course] or v_target_number < 1 or v_target_number > p_targets_per_post_by_post[v_course] then raise exception 'miss_coordinate_out_of_range'; end if;
    v_key := v_course::text || ':' || v_position::text;
    if v_key = any(v_payload_seen) then raise exception 'duplicate_miss_coordinate'; end if;
    v_payload_seen := array_append(v_payload_seen, v_key);
    if lower(coalesce(v_item->>'base_presentation','')) not in ('single','report_pair','simultaneous_pair','other_pair','unknown') or lower(coalesce(v_item->>'actual_presentation','')) not in ('single','report_pair','simultaneous_pair','other_pair','unknown') then raise exception 'invalid_presentation'; end if;
    if coalesce(v_item->>'missed_target','') not in ('Single target','First target in pair','Second target in pair','Unknown') then raise exception 'invalid_missed_target'; end if;
    if coalesce(v_item->>'where_miss','Not sure') <> 'Not sure' or coalesce(v_item->>'main_reason','Unknown') <> 'Unknown' or coalesce(v_item->>'target_read','Unknown') <> 'Unknown' then raise exception 'invalid_import_details'; end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_reviewed_miss_positions) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'invalid_reviewed_miss'; end if;
    begin
      v_course := (v_item->>'course_number')::integer;
      v_position := (v_item->>'target_position')::integer;
    exception when others then raise exception 'invalid_reviewed_miss_coordinate'; end;
    if v_course < 1 or v_course > p_post_count or v_position < 1 or v_position > p_targets_per_post_by_post[v_course] then raise exception 'reviewed_miss_coordinate_out_of_range'; end if;
    v_key := v_course::text || ':' || v_position::text;
    if v_key = any(v_reviewed_seen) then raise exception 'duplicate_reviewed_miss_coordinate'; end if;
    v_reviewed_seen := array_append(v_reviewed_seen, v_key);

    select exists (
      select 1 from public.misses m
      where m.session_id = p_session_id and m.course_number = v_course and (
        m.target_position = v_position or (
          m.target_position is null and m.target_number is not null and exists (
            select 1 from public.session_post_targets t
            where t.session_id = p_session_id and t.post_number = m.course_number and t.presentation_number = m.target_number and t.target_position = v_position and (
              (m.missed_target = 'Both targets in pair' and t.position_in_presentation in (1,2)) or
              (m.missed_target = 'First target in pair' and t.position_in_presentation = 1) or
              (m.missed_target = 'Second target in pair' and t.position_in_presentation = 2) or
              (m.missed_target = 'Single target' and t.presentation_type = 'single' and t.position_in_presentation = 1)
            )
          )
        )
      )
    ) into v_is_existing;

    if v_is_existing then
      if v_key = any(v_payload_seen) then raise exception 'existing_duplicate_in_insert_payload'; end if;
      v_skipped := v_skipped + 1;
    elsif not (v_key = any(v_payload_seen)) then
      raise exception 'missing_miss_payload';
    end if;
  end loop;

  if exists (select 1 from unnest(v_payload_seen) k where not (k = any(v_reviewed_seen))) then raise exception 'unreviewed_miss_payload'; end if;
  if coalesce(array_length(v_payload_seen,1),0) <> p_reviewed_misses - v_skipped then raise exception 'miss_count_mismatch'; end if;

  insert into public.scorecard_imports(session_id,user_id,client_import_id,image_fingerprint,reviewed_total_targets,reviewed_hits,reviewed_misses)
  values(p_session_id,v_user_id,p_client_import_id,lower(p_image_fingerprint),v_total,p_reviewed_hits,p_reviewed_misses) returning id into v_import_id;

  for v_item in select * from jsonb_array_elements(p_misses) loop
    v_course := (v_item->>'course_number')::integer;
    v_position := (v_item->>'target_position')::integer;
    v_target_number := (v_item->>'target_number')::integer;
    begin
      insert into public.misses(session_id,course_number,target_position,target_number,target_label,target_type,base_presentation,actual_presentation,missed_target,where_miss,main_reason,target_read,comment,source_type,scorecard_import_id)
      values(p_session_id,v_course,v_position,v_target_number,left(coalesce(v_item->>'target_label',''),160),left(coalesce(v_item->>'target_type','Unknown'),80),coalesce(v_item->>'base_presentation','Unknown'),coalesce(v_item->>'actual_presentation','Unknown'),v_item->>'missed_target','Not sure','Unknown','Unknown',null,'scorecard_import',v_import_id);
      v_inserted := v_inserted + 1;
    exception when unique_violation then v_skipped := v_skipped + 1; end;
  end loop;

  if v_inserted + v_skipped <> p_reviewed_misses then raise exception 'final_miss_count_mismatch'; end if;
  if p_discovery_mode then
    update public.sessions set post_count = p_post_count, course_count = coalesce(course_count, p_post_count), targets_per_post = p_targets_per_post, total_targets = v_total where id = p_session_id;
    for v_course in 1..p_post_count loop
      for v_position in 1..p_targets_per_post_by_post[v_course] loop
        insert into public.session_post_targets(session_id, post_number, target_position, presentation_number, presentation_type, position_in_presentation)
        values (p_session_id, v_course, v_position, v_position, 'unknown', 1);
      end loop;
    end loop;
  elsif v_session.total_targets is null then update public.sessions set total_targets = v_total where id = p_session_id; end if;
  if p_use_scorecard_score then update public.sessions set own_score = p_reviewed_hits where id = p_session_id; v_own_updated := true; end if;
  update public.scorecard_imports set inserted_misses = v_inserted, skipped_duplicates = v_skipped where id = v_import_id;
  return jsonb_build_object('importId', v_import_id, 'insertedMisses', v_inserted, 'skippedDuplicates', v_skipped, 'score', p_reviewed_hits, 'totalTargets', v_total, 'ownScoreUpdated', v_own_updated, 'alreadyImported', false);
end;
$$;

revoke all on function public.apply_scorecard_import_v2(uuid,uuid,text,integer,integer,integer[],integer,integer,jsonb,boolean,integer,jsonb,boolean) from public, anon;
grant execute on function public.apply_scorecard_import_v2(uuid,uuid,text,integer,integer,integer[],integer,integer,jsonb,boolean,integer,jsonb,boolean) to authenticated;
