-- Shared Leirdue ingestion/result cache for database-only shooter searches.

create extension if not exists pgcrypto;

create table if not exists public.leirdue_year_ingestion_status (
  year integer primary key,
  parser_version text not null default 'leirdue-shared-v1',
  status text not null default 'not_started' check (status in ('not_started','incomplete','complete','failed')),
  discovered_events integer not null default 0,
  pending_events integer not null default 0,
  completed_events integer not null default 0,
  failed_events integer not null default 0,
  result_lists_discovered integer not null default 0,
  pending_result_lists integer not null default 0,
  valid_result_lists integer not null default 0,
  invalid_result_lists integer not null default 0,
  needs_review_result_lists integer not null default 0,
  shooter_result_rows integer not null default 0,
  last_batch_duration_ms integer,
  remaining_work_count integer,
  latest_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leirdue_shared_shooter_results (
  id uuid primary key default gen_random_uuid(),
  result_identity text not null,
  year integer not null,
  event_id text,
  liste_id text,
  normalized_name text not null,
  original_name text,
  club text,
  placement integer,
  score integer,
  total_targets integer,
  winning_score integer,
  series_scores jsonb not null default '[]'::jsonb,
  discipline text,
  event_date date,
  event_title text,
  organizer text,
  source_url text not null,
  raw_row text,
  validation_status text not null default 'needs_review' check (validation_status in ('valid','needs_review','invalid','failed')),
  parser_version text not null default 'leirdue-shared-v1',
  parsed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leirdue_shared_results_identity_uidx on public.leirdue_shared_shooter_results (result_identity);
create index if not exists leirdue_shared_results_name_date_idx on public.leirdue_shared_shooter_results (normalized_name, event_date desc, year);
create index if not exists leirdue_shared_results_name_discipline_idx on public.leirdue_shared_shooter_results (normalized_name, discipline);
create index if not exists leirdue_shared_results_event_idx on public.leirdue_shared_shooter_results (event_id);
create index if not exists leirdue_shared_results_liste_idx on public.leirdue_shared_shooter_results (liste_id);
create index if not exists leirdue_shared_results_validation_idx on public.leirdue_shared_shooter_results (validation_status);
create index if not exists leirdue_shared_results_year_idx on public.leirdue_shared_shooter_results (year);
create index if not exists leirdue_year_ingestion_status_status_idx on public.leirdue_year_ingestion_status (status, year);



alter table public.leirdue_event_index add column if not exists ingestion_status text not null default 'pending' check (ingestion_status in ('pending','completed','failed'));
alter table public.leirdue_event_index add column if not exists ingestion_error text;
alter table public.leirdue_result_list_index add column if not exists year integer;
alter table public.leirdue_result_list_index add column if not exists ingestion_status text not null default 'pending' check (ingestion_status in ('pending','completed','failed','needs_review'));
alter table public.leirdue_result_list_index add column if not exists ingestion_error text;
create index if not exists leirdue_event_index_ingestion_status_idx on public.leirdue_event_index(year, ingestion_status);
create index if not exists leirdue_result_list_index_year_status_idx on public.leirdue_result_list_index(year, ingestion_status);
create index if not exists leirdue_result_list_index_ingestion_status_idx on public.leirdue_result_list_index(ingestion_status, event_id);

alter table public.leirdue_year_ingestion_status enable row level security;
alter table public.leirdue_shared_shooter_results enable row level security;

drop policy if exists "Users can read shared Leirdue result rows" on public.leirdue_shared_shooter_results;
create policy "Users can read shared Leirdue result rows"
  on public.leirdue_shared_shooter_results for select
  to authenticated
  using (true);

drop policy if exists "Users can read Leirdue ingestion status" on public.leirdue_year_ingestion_status;
create policy "Users can read Leirdue ingestion status"
  on public.leirdue_year_ingestion_status for select
  to authenticated
  using (true);

drop policy if exists "Admins manage shared Leirdue result rows" on public.leirdue_shared_shooter_results;
create policy "Admins manage shared Leirdue result rows"
  on public.leirdue_shared_shooter_results for all
  to authenticated
  using (exists (select 1 from public.user_access_profiles p where p.user_id = auth.uid() and p.access_status = 'approved' and p.system_role in ('owner','admin')))
  with check (exists (select 1 from public.user_access_profiles p where p.user_id = auth.uid() and p.access_status = 'approved' and p.system_role in ('owner','admin')));

drop policy if exists "Admins manage Leirdue ingestion status" on public.leirdue_year_ingestion_status;
create policy "Admins manage Leirdue ingestion status"
  on public.leirdue_year_ingestion_status for all
  to authenticated
  using (exists (select 1 from public.user_access_profiles p where p.user_id = auth.uid() and p.access_status = 'approved' and p.system_role in ('owner','admin')))
  with check (exists (select 1 from public.user_access_profiles p where p.user_id = auth.uid() and p.access_status = 'approved' and p.system_role in ('owner','admin')));

insert into public.leirdue_shared_shooter_results (
  year, event_id, liste_id, normalized_name, original_name, club, placement, score, total_targets,
  winning_score, series_scores, discipline, event_date, event_title, organizer, source_url,
  raw_row, validation_status, parser_version, parsed_at, updated_at, result_identity
)
select
  year,
  event_id,
  liste_id,
  shooter_name_normalized,
  shooter_name_display,
  club,
  placement,
  own_score,
  total_targets,
  winning_score,
  '[]'::jsonb,
  discipline,
  event_date,
  event_title,
  organizer,
  source_url,
  raw_row_text,
  case when is_importable is true then 'valid' else 'needs_review' end,
  'migrated-leirdue-search-cache-v1',
  coalesce(parsed_at, now()),
  now(),
  encode(digest(concat_ws('|', year::text, coalesce(event_id, ''), coalesce(liste_id, ''), source_url, shooter_name_normalized, coalesce(discipline, ''), coalesce(event_date::text, ''), coalesce(own_score::text, ''), coalesce(total_targets::text, '')), 'sha256'), 'hex')
from public.leirdue_parsed_result_cache
where shooter_name_normalized is not null
  and source_url is not null
  and own_score is not null
  and total_targets is not null
on conflict do nothing;
