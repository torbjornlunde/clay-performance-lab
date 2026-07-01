alter table public.misses add column if not exists target_position integer;
alter table public.misses add column if not exists source_type text;
alter table public.misses add column if not exists scorecard_import_id uuid;

create table if not exists public.scorecard_imports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_import_id uuid not null,
  image_fingerprint text not null,
  reviewed_total_targets integer not null,
  reviewed_hits integer not null,
  reviewed_misses integer not null,
  inserted_misses integer not null default 0,
  skipped_duplicates integer not null default 0,
  created_at timestamptz not null default now(),
  constraint scorecard_imports_fingerprint_check check (image_fingerprint ~ '^[a-fA-F0-9]{64}$'),
  constraint scorecard_imports_counts_check check (reviewed_total_targets >= 0 and reviewed_hits >= 0 and reviewed_misses >= 0 and inserted_misses >= 0 and skipped_duplicates >= 0 and reviewed_hits + reviewed_misses = reviewed_total_targets),
  constraint scorecard_imports_session_client_unique unique (session_id, client_import_id),
  constraint scorecard_imports_session_fingerprint_unique unique (session_id, image_fingerprint)
);

alter table public.misses drop constraint if exists misses_scorecard_import_id_fkey;
alter table public.misses add constraint misses_scorecard_import_id_fkey foreign key (scorecard_import_id) references public.scorecard_imports(id) on delete set null;

drop index if exists misses_scorecard_import_target_unique;
create unique index misses_scorecard_import_target_unique on public.misses(session_id, course_number, target_position) where source_type = 'scorecard_import' and target_position is not null;

alter table public.scorecard_imports enable row level security;
drop policy if exists "scorecard_imports_select_own" on public.scorecard_imports;
create policy "scorecard_imports_select_own" on public.scorecard_imports for select using (public.has_approved_access(auth.uid()) and user_id = auth.uid());
drop policy if exists "scorecard_imports_insert_own" on public.scorecard_imports;
create policy "scorecard_imports_insert_own" on public.scorecard_imports for insert with check (false);
drop policy if exists "scorecard_imports_update_own" on public.scorecard_imports;
create policy "scorecard_imports_update_own" on public.scorecard_imports for update using (false) with check (false);
drop policy if exists "scorecard_imports_delete_own" on public.scorecard_imports;
create policy "scorecard_imports_delete_own" on public.scorecard_imports for delete using (false);

drop function if exists public.apply_scorecard_import_v1(uuid,uuid,text,integer,integer,integer,integer,integer,boolean,integer,jsonb);
drop function if exists public.apply_scorecard_import_v1(uuid,uuid,text,integer,integer,integer,integer,jsonb,boolean,integer,jsonb);

create function public.apply_scorecard_import_v1(
  p_session_id uuid,
  p_client_import_id uuid,
  p_image_fingerprint text,
  p_post_count integer,
  p_targets_per_post integer,
  p_reviewed_hits integer,
  p_reviewed_misses integer,
  p_reviewed_miss_positions jsonb,
  p_use_scorecard_score boolean,
  p_expected_own_score integer,
  p_misses jsonb
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
  v_total integer := p_post_count * p_targets_per_post;
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
  if lower(coalesce(v_session.discipline,'')) not in ('leirduesti','sporting','english sporting','engelsk sporting') then raise exception 'unsupported_discipline'; end if;
  if coalesce(v_session.post_count, v_session.course_count) <> p_post_count or v_session.targets_per_post <> p_targets_per_post or v_total > 500 or v_total < 1 then raise exception 'dimension_mismatch'; end if;
  if v_session.total_targets is not null and v_session.total_targets <> v_total then raise exception 'total_targets_conflict'; end if;
  if p_reviewed_hits < 0 or p_reviewed_misses < 0 or p_reviewed_hits + p_reviewed_misses <> v_total then raise exception 'invalid_counts'; end if;

  select * into v_existing from public.scorecard_imports where session_id = p_session_id and (client_import_id = p_client_import_id or image_fingerprint = lower(p_image_fingerprint)) order by created_at limit 1;
  if found then
    return jsonb_build_object('importId', v_existing.id, 'insertedMisses', v_existing.inserted_misses, 'skippedDuplicates', v_existing.skipped_duplicates, 'score', v_existing.reviewed_hits, 'totalTargets', v_existing.reviewed_total_targets, 'ownScoreUpdated', false, 'alreadyImported', true);
  end if;
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
    if v_course < 1 or v_course > p_post_count or v_position < 1 or v_position > p_targets_per_post or v_target_number < 1 or v_target_number > p_targets_per_post then raise exception 'miss_coordinate_out_of_range'; end if;
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
    if v_course < 1 or v_course > p_post_count or v_position < 1 or v_position > p_targets_per_post then raise exception 'reviewed_miss_coordinate_out_of_range'; end if;
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
  if v_session.total_targets is null then update public.sessions set total_targets = v_total where id = p_session_id; end if;
  if p_use_scorecard_score then update public.sessions set own_score = p_reviewed_hits where id = p_session_id; v_own_updated := true; end if;
  update public.scorecard_imports set inserted_misses = v_inserted, skipped_duplicates = v_skipped where id = v_import_id;
  return jsonb_build_object('importId', v_import_id, 'insertedMisses', v_inserted, 'skippedDuplicates', v_skipped, 'score', p_reviewed_hits, 'totalTargets', v_total, 'ownScoreUpdated', v_own_updated, 'alreadyImported', false);
end;
$$;

revoke all on function public.apply_scorecard_import_v1(uuid,uuid,text,integer,integer,integer,integer,jsonb,boolean,integer,jsonb) from public, anon;
grant execute on function public.apply_scorecard_import_v1(uuid,uuid,text,integer,integer,integer,integer,jsonb,boolean,integer,jsonb) to authenticated;
