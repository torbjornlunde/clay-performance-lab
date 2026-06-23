-- Reclassify migrated shared Leirdue rows using the richer evidence that existed in
-- leirdue_parsed_result_cache. The first shared-cache migration incorrectly trusted
-- is_importable by itself, but that flag had been broadened to include uncertain
-- score/target rows that should not all be Confirmed.

with source_evidence as (
  select
    s.id,
    p.candidate_quality,
    p.not_importable_reason,
    lower(concat_ws(' ', s.event_title, s.raw_row, s.source_url, p.raw_row_text, p.candidate_quality, p.not_importable_reason)) as evidence,
    s.score,
    s.total_targets,
    s.source_url,
    s.liste_id
  from public.leirdue_shared_shooter_results s
  left join public.leirdue_parsed_result_cache p
    on p.source_url = s.source_url
   and p.shooter_name_normalized = s.normalized_name
   and coalesce(p.event_id, '') = coalesce(s.event_id, '')
   and coalesce(p.liste_id, '') = coalesce(s.liste_id, '')
   and coalesce(p.own_score, -1) = coalesce(s.score, -1)
   and coalesce(p.total_targets, -1) = coalesce(s.total_targets, -1)
), classified as (
  select
    id,
    case
      when evidence ~ '(ranking|prosent|percentage|%|klassef|sum etter|sammenlagt|cup|kontroll|control|uttak|deltakerliste|påmelding|pamelding)' then 'invalid'
      when score is null or total_targets is null or score <= 0 or total_targets <= 0 or score > total_targets then 'failed'
      when source_url is null or liste_id is null then 'needs_review'
      when candidate_quality like 'recommended/high%' and coalesce(not_importable_reason, '') = '' then 'valid'
      when candidate_quality like 'recommended/%' and evidence !~ '(uncertain|review|class/unknown|klasse|could not|missing|ukjent)' then 'valid'
      else 'needs_review'
    end as repaired_status
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
update public.leirdue_shared_shooter_results s
set
  validation_status = case
    when d.duplicate_rank > 1 then 'invalid'
    else c.repaired_status
  end,
  parser_version = case
    when s.parser_version like 'migrated-leirdue-search-cache%' then 'migrated-leirdue-search-cache-v2'
    else s.parser_version
  end,
  updated_at = now()
from classified c
left join duplicate_reviewable d on d.id = c.id
where s.id = c.id;
