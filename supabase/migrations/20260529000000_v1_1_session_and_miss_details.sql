alter table public.sessions add column if not exists competition_date date;
alter table public.sessions add column if not exists own_score integer;
alter table public.sessions add column if not exists winning_score integer;
alter table public.sessions add column if not exists calculated_score integer;
alter table public.sessions add column if not exists leirdue_result_url text;

alter table public.misses add column if not exists first_where_miss text;
alter table public.misses add column if not exists first_main_reason text;
alter table public.misses add column if not exists first_target_read text;
alter table public.misses add column if not exists first_comment text;
alter table public.misses add column if not exists second_where_miss text;
alter table public.misses add column if not exists second_main_reason text;
alter table public.misses add column if not exists second_target_read text;
alter table public.misses add column if not exists second_comment text;

create table if not exists public.fitasc_compak_schemes(
  id uuid primary key default gen_random_uuid(),
  scheme_number integer not null,
  plate_number integer not null,
  event_number integer not null,
  presentation text not null,
  first_machine text,
  second_machine text,
  is_verified boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scheme_number, plate_number, event_number)
);

alter table public.fitasc_compak_schemes enable row level security;
drop policy if exists "fitasc_compak_schemes_public_select" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_public_select" on public.fitasc_compak_schemes for select using (true);
