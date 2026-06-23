-- Safe, idempotent reclassification for migrated shared Leirdue rows.
-- The earlier draft was too broad because it treated words such as "Cup" and
-- "sammenlagt" anywhere in the combined evidence as invalid. This version keeps
-- event title separate from list/raw/reason evidence and does not invalidate a
-- row merely because the event title contains Cup or a single-event list is
-- called "Resultater sammenlagt".

create or replace view public.leirdue_shared_result_reclassification_preview as
with source_evidence as (
  select
    s.id,
    s.year,
    s.normalized_name,
    s.event_id,
    s.liste_id,
    s.event_title,
    coalesce(l.list_title, '') as list_title,
    coalesce(l.list_type, '') as list_type,
    s.score,
    s.total_targets,
    s.validation_status as old_validation_status,
    p.candidate_quality,
    p.not_importable_reason,
    lower(coalesce(s.event_title, '')) as event_text,
    lower(concat_ws(' ', l.list_title, l.list_type, s.source_url)) as list_context,
    lower(concat_ws(' ', s.raw_row, p.raw_row_text)) as row_context,
    lower(concat_ws(' ', p.candidate_quality, p.not_importable_reason)) as parser_context,
    s.source_url,
    s.result_identity
  from public.leirdue_shared_shooter_results s
  left join public.leirdue_parsed_result_cache p
    on p.source_url = s.source_url
   and p.shooter_name_normalized = s.normalized_name
   and coalesce(p.event_id, '') = coalesce(s.event_id, '')
   and coalesce(p.liste_id, '') = coalesce(s.liste_id, '')
   and coalesce(p.own_score, -1) = coalesce(s.score, -1)
   and coalesce(p.total_targets, -1) = coalesce(s.total_targets, -1)
  left join public.leirdue_result_list_index l
    on coalesce(l.event_id, '') = coalesce(s.event_id, '')
   and coalesce(l.liste_id, '') = coalesce(s.liste_id, '')
), classified as (
  select
    *,
    case
      when row_context ~ '(prosent|percentage|%)' or list_context ~ '(ranking|rankering|kontroll|control|deltakerliste|påmelding|pamelding|startliste)' or parser_context ~ '(ranking|control|kontroll|registration|participant)' then 'invalid'
      when list_context ~ '(sum etter|etter [0-9]+ stevner|etter [0-9]+ runder|rankingpoeng|ranking points)' or row_context ~ '(sum etter|etter [0-9]+ stevner|etter [0-9]+ runder|rankingpoeng|ranking points)' then 'invalid'
      when score is null or total_targets is null or score <= 0 or total_targets <= 0 or score > total_targets then 'failed'
      when source_url is null or liste_id is null then 'needs_review'
      when candidate_quality like 'recommended/high%' and coalesce(not_importable_reason, '') = '' then 'valid'
      when candidate_quality like 'recommended/%' and parser_context !~ '(uncertain|review|class/unknown|could not|missing|ukjent)' and list_context !~ '(klassevis|klasse result|class result)' then 'valid'
      else 'needs_review'
    end as proposed_validation_status,
    case
      when row_context ~ '(prosent|percentage|%)' then 'row contains percentage rather than target score evidence'
      when list_context ~ '(ranking|rankering|kontroll|control|deltakerliste|påmelding|pamelding|startliste)' or parser_context ~ '(ranking|control|kontroll|registration|participant)' then 'known ranking/control/registration list context'
      when list_context ~ '(sum etter|etter [0-9]+ stevner|etter [0-9]+ runder|rankingpoeng|ranking points)' or row_context ~ '(sum etter|etter [0-9]+ stevner|etter [0-9]+ runder|rankingpoeng|ranking points)' then 'positive multi-event summary evidence'
      when score is null or total_targets is null or score <= 0 or total_targets <= 0 or score > total_targets then 'invalid score/target pair'
      when source_url is null or liste_id is null then 'missing source list identity'
      when candidate_quality like 'recommended/high%' and coalesce(not_importable_reason, '') = '' then 'high-confidence recommended parsed result'
      when candidate_quality like 'recommended/%' and parser_context !~ '(uncertain|review|class/unknown|could not|missing|ukjent)' and list_context !~ '(klassevis|klasse result|class result)' then 'recommended parsed result without review markers'
      else 'plausible result requiring review'
    end as classification_reason
  from source_evidence
), duplicate_reviewable as (
  select
    id,
    row_number() over (
      partition by normalized_name, year, coalesce(event_id, ''), coalesce(liste_id, ''), coalesce(discipline, ''), coalesce(event_date::text, ''), coalesce(score, -1), coalesce(total_targets, -1)
      order by case validation_status when 'valid' then 0 when 'needs_review' then 1 else 2 end, updated_at desc, id
    ) as duplicate_rank
  from public.leirdue_shared_shooter_results
  where validation_status in ('valid', 'needs_review')
)
select
  c.year,
  c.normalized_name,
  c.event_id,
  c.liste_id,
  c.event_title,
  c.list_title,
  c.list_type,
  c.score,
  c.total_targets,
  c.old_validation_status,
  case when d.duplicate_rank > 1 then 'invalid' else c.proposed_validation_status end as proposed_validation_status,
  case when d.duplicate_rank > 1 then 'duplicate exact same event/list/result identity for shooter' else c.classification_reason end as classification_reason,
  c.result_identity,
  c.id
from classified c
left join duplicate_reviewable d on d.id = c.id;

create or replace view public.leirdue_shared_result_reclassification_torbjorn_summary as
select
  year,
  count(*) filter (where proposed_validation_status = 'valid') as proposed_valid_count,
  count(*) filter (where proposed_validation_status = 'needs_review') as proposed_needs_review_count,
  count(*) filter (where proposed_validation_status = 'invalid') as proposed_invalid_count,
  count(*) filter (where proposed_validation_status = 'failed') as proposed_failed_count,
  count(*) filter (where proposed_validation_status in ('valid', 'needs_review')) as proposed_reviewable_count
from public.leirdue_shared_result_reclassification_preview
where normalized_name = 'torbjorn lunde'
group by year;

with fixture_guard as (
  select
    coalesce(max(proposed_reviewable_count) filter (where year = 2023), -1) = 21
    and coalesce(max(proposed_reviewable_count) filter (where year = 2024), -1) = 23 as ok
  from public.leirdue_shared_result_reclassification_torbjorn_summary
  where year in (2023, 2024)
)
update public.leirdue_shared_shooter_results s
set
  validation_status = p.proposed_validation_status,
  parser_version = case
    when s.parser_version like 'migrated-leirdue-search-cache%' then 'migrated-leirdue-search-cache-v2'
    else s.parser_version
  end,
  updated_at = now()
from public.leirdue_shared_result_reclassification_preview p, fixture_guard g
where g.ok
  and s.id = p.id
  and s.validation_status is distinct from p.proposed_validation_status;
