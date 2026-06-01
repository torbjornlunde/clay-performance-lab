create table if not exists public.leirdue_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  year integer not null,
  title text not null,
  date date,
  organizer text,
  url text not null,
  discipline_guess text,
  area text,
  raw_text_snippet text,
  last_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leirdue_events_year_idx on public.leirdue_events(year);
create index if not exists leirdue_events_date_idx on public.leirdue_events(date);

create table if not exists public.leirdue_result_lists (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.leirdue_events(event_id) on delete cascade,
  liste_id text not null,
  url text not null,
  title text,
  list_type text,
  priority integer not null default 0,
  raw_text_snippet text,
  last_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, liste_id)
);

create index if not exists leirdue_result_lists_liste_id_idx on public.leirdue_result_lists(liste_id);
create index if not exists leirdue_result_lists_event_id_idx on public.leirdue_result_lists(event_id);

create table if not exists public.leirdue_result_rows (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  liste_id text,
  year integer not null,
  date date,
  event_title text,
  discipline text,
  shooter_name_raw text not null,
  shooter_name_normalized text not null,
  club text,
  own_score integer,
  total_targets integer,
  winning_score integer,
  series_scores integer[] not null default '{}',
  row_type text not null default 'candidate',
  confidence text,
  hidden_reason text,
  control_reason text,
  source_url text not null,
  raw_row text,
  parsed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, liste_id, shooter_name_normalized, own_score, total_targets)
);

create index if not exists leirdue_result_rows_year_idx on public.leirdue_result_rows(year);
create index if not exists leirdue_result_rows_shooter_year_idx on public.leirdue_result_rows(shooter_name_normalized, year);
create index if not exists leirdue_result_rows_event_liste_idx on public.leirdue_result_rows(event_id, liste_id);

create table if not exists public.leirdue_index_jobs (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  disciplines text[] not null default '{}',
  status text not null default 'not_started',
  cursor jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  pages_fetched integer not null default 0,
  events_indexed integer not null default 0,
  result_lists_indexed integer not null default 0,
  rows_parsed integer not null default 0,
  error_log text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leirdue_index_jobs_year_status_idx on public.leirdue_index_jobs(year, status);
