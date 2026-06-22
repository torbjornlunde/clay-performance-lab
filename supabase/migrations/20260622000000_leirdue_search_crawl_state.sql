create table if not exists public.leirdue_search_crawl_state (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  selected_year integer not null,
  shooter_name_normalized text not null,
  selected_disciplines text[] not null default '{}',
  status text not null default 'incomplete' check (status in ('incomplete', 'complete', 'failed')),
  continuation_token text,
  scanned_event_ids text[] not null default '{}',
  scanned_liste_id_keys text[] not null default '{}',
  total_discovered_work integer,
  processed_work_count integer not null default 0,
  remaining_work_count integer,
  last_stop_reason text,
  last_completed_batch integer,
  last_run_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leirdue_search_crawl_state_lookup_idx
  on public.leirdue_search_crawl_state(selected_year, shooter_name_normalized);

alter table public.leirdue_search_crawl_state enable row level security;

create policy "Authenticated users can read Leirdue crawl progress"
  on public.leirdue_search_crawl_state for select
  to authenticated
  using (true);
