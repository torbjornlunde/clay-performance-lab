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
