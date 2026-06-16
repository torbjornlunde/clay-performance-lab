create table if not exists public.leirdue_event_index (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  source_url text,
  year integer,
  event_date date,
  event_title text,
  organizer text,
  detected_disciplines text[] not null default '{}',
  raw_overview_text text,
  is_ranking_or_control boolean not null default false,
  is_multi_event_or_cup boolean not null default false,
  last_seen_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leirdue_result_list_index (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  liste_id text not null,
  source_url text,
  list_title text,
  list_type text,
  is_valid_single_event_result boolean not null default false,
  is_ranking_or_control boolean not null default false,
  is_multi_event_or_cup boolean not null default false,
  detected_disciplines text[] not null default '{}',
  last_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, liste_id)
);

create table if not exists public.leirdue_parsed_result_cache (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  liste_id text,
  source_url text not null,
  year integer not null,
  event_date date,
  event_title text,
  organizer text,
  discipline text,
  shooter_name_normalized text not null,
  shooter_name_display text,
  club text,
  own_score integer,
  total_targets integer,
  winning_score integer,
  placement integer,
  row_fingerprint text not null,
  candidate_quality text,
  is_importable boolean not null default false,
  not_importable_reason text,
  raw_row_text text,
  parsed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_url, row_fingerprint)
);

create index if not exists leirdue_event_index_year_idx on public.leirdue_event_index(year);
create index if not exists leirdue_result_list_index_event_idx on public.leirdue_result_list_index(event_id);
create index if not exists leirdue_parsed_result_cache_lookup_idx on public.leirdue_parsed_result_cache(year, shooter_name_normalized, discipline);
create index if not exists leirdue_parsed_result_cache_parsed_at_idx on public.leirdue_parsed_result_cache(parsed_at);

alter table public.leirdue_event_index enable row level security;
alter table public.leirdue_result_list_index enable row level security;
alter table public.leirdue_parsed_result_cache enable row level security;

create policy "Authenticated users can read public Leirdue event cache"
  on public.leirdue_event_index for select
  to authenticated
  using (true);

create policy "Authenticated users can read public Leirdue result-list cache"
  on public.leirdue_result_list_index for select
  to authenticated
  using (true);

create policy "Authenticated users can read public Leirdue parsed result cache"
  on public.leirdue_parsed_result_cache for select
  to authenticated
  using (true);
