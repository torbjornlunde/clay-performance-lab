create extension if not exists "pgcrypto";
create table if not exists public.sessions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null,discipline text not null,session_type text not null,shooting_format text,course_count integer,total_targets integer,notes text,leirdue_result_url text,created_at timestamptz not null default now());
alter table public.sessions add column if not exists leirdue_result_url text;
alter table public.sessions add column if not exists shooting_ground text;
alter table public.sessions enable row level security;
drop policy if exists "sessions_select_own" on public.sessions; create policy "sessions_select_own" on public.sessions for select using (auth.uid()=user_id);
drop policy if exists "sessions_insert_own" on public.sessions; create policy "sessions_insert_own" on public.sessions for insert with check (auth.uid()=user_id);
drop policy if exists "sessions_update_own" on public.sessions; create policy "sessions_update_own" on public.sessions for update using (auth.uid()=user_id);
drop policy if exists "sessions_delete_own" on public.sessions; create policy "sessions_delete_own" on public.sessions for delete using (auth.uid()=user_id);
create table if not exists public.session_courses(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.sessions(id) on delete cascade,course_number integer not null,fitasc_scheme integer,shooter_number integer,start_plate integer,created_at timestamptz not null default now());
alter table public.session_courses enable row level security;
drop policy if exists "session_courses_select_own" on public.session_courses; create policy "session_courses_select_own" on public.session_courses for select using (exists(select 1 from public.sessions s where s.id=session_courses.session_id and s.user_id=auth.uid()));
drop policy if exists "session_courses_insert_own" on public.session_courses; create policy "session_courses_insert_own" on public.session_courses for insert with check (exists(select 1 from public.sessions s where s.id=session_courses.session_id and s.user_id=auth.uid()));
drop policy if exists "session_courses_update_own" on public.session_courses; create policy "session_courses_update_own" on public.session_courses for update using (exists(select 1 from public.sessions s where s.id=session_courses.session_id and s.user_id=auth.uid()));
drop policy if exists "session_courses_delete_own" on public.session_courses; create policy "session_courses_delete_own" on public.session_courses for delete using (exists(select 1 from public.sessions s where s.id=session_courses.session_id and s.user_id=auth.uid()));
create table if not exists public.misses(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.sessions(id) on delete cascade,course_number integer,plate integer,target_number integer,target_label text,target_type text,missed_target text not null,where_miss text,main_reason text,target_read text,comment text,first_where_miss text,first_main_reason text,first_target_read text,first_comment text,second_where_miss text,second_main_reason text,second_target_read text,second_comment text,created_at timestamptz not null default now());
alter table public.misses add column if not exists first_where_miss text;
alter table public.misses add column if not exists first_main_reason text;
alter table public.misses add column if not exists first_target_read text;
alter table public.misses add column if not exists first_comment text;
alter table public.misses add column if not exists second_where_miss text;
alter table public.misses add column if not exists second_main_reason text;
alter table public.misses add column if not exists second_target_read text;
alter table public.misses add column if not exists second_comment text;
alter table public.misses enable row level security;
drop policy if exists "misses_select_own" on public.misses; create policy "misses_select_own" on public.misses for select using (exists(select 1 from public.sessions s where s.id=misses.session_id and s.user_id=auth.uid()));
drop policy if exists "misses_insert_own" on public.misses; create policy "misses_insert_own" on public.misses for insert with check (exists(select 1 from public.sessions s where s.id=misses.session_id and s.user_id=auth.uid()));
drop policy if exists "misses_update_own" on public.misses; create policy "misses_update_own" on public.misses for update using (exists(select 1 from public.sessions s where s.id=misses.session_id and s.user_id=auth.uid()));
drop policy if exists "misses_delete_own" on public.misses; create policy "misses_delete_own" on public.misses for delete using (exists(select 1 from public.sessions s where s.id=misses.session_id and s.user_id=auth.uid()));

-- Additive v1.1 performance/result/FITASC reference data columns.
alter table public.sessions add column if not exists competition_date date;
alter table public.sessions add column if not exists own_score integer;
alter table public.sessions add column if not exists winning_score integer;
alter table public.sessions
add column if not exists sporttrap_series_count integer,
add column if not exists post_count integer,
add column if not exists targets_per_post integer,
add column if not exists default_post_format text;
alter table public.sessions add column if not exists leirdue_result_url text;

alter table public.misses add column if not exists target_label text;
alter table public.misses add column if not exists first_where_miss text;
alter table public.misses add column if not exists first_main_reason text;
alter table public.misses add column if not exists first_target_read text;
alter table public.misses add column if not exists first_comment text;
alter table public.misses add column if not exists second_where_miss text;
alter table public.misses add column if not exists second_main_reason text;
alter table public.misses add column if not exists second_target_read text;
alter table public.misses add column if not exists second_comment text;

create table if not exists public.session_target_definitions(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  course_number integer not null,
  machine text not null,
  target_type text,
  direction text,
  speed text,
  distance text,
  difficulty text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'session_target_definitions_session_course_machine_key'
  ) then
    alter table public.session_target_definitions
      add constraint session_target_definitions_session_course_machine_key unique (session_id, course_number, machine);
  end if;
end $$;

alter table public.session_target_definitions enable row level security;
drop policy if exists "target_definitions_select_own" on public.session_target_definitions;
create policy "target_definitions_select_own" on public.session_target_definitions for select using (exists(select 1 from public.sessions s where s.id=session_target_definitions.session_id and s.user_id=auth.uid()));
drop policy if exists "target_definitions_insert_own" on public.session_target_definitions;
create policy "target_definitions_insert_own" on public.session_target_definitions for insert with check (exists(select 1 from public.sessions s where s.id=session_target_definitions.session_id and s.user_id=auth.uid()));
drop policy if exists "target_definitions_update_own" on public.session_target_definitions;
create policy "target_definitions_update_own" on public.session_target_definitions for update using (exists(select 1 from public.sessions s where s.id=session_target_definitions.session_id and s.user_id=auth.uid()));
drop policy if exists "target_definitions_delete_own" on public.session_target_definitions;
create policy "target_definitions_delete_own" on public.session_target_definitions for delete using (exists(select 1 from public.sessions s where s.id=session_target_definitions.session_id and s.user_id=auth.uid()));

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
drop policy if exists "fitasc_compak_schemes_select_reference" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_select_reference" on public.fitasc_compak_schemes for select using (true);
-- MVP admin page writes directly from the client. Restrict insert/update/delete to admin-only server code before public launch.
drop policy if exists "fitasc_compak_schemes_insert_authenticated_mvp" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_insert_authenticated_mvp" on public.fitasc_compak_schemes for insert to authenticated with check (true);
drop policy if exists "fitasc_compak_schemes_update_authenticated_mvp" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_update_authenticated_mvp" on public.fitasc_compak_schemes for update to authenticated using (true) with check (true);
drop policy if exists "fitasc_compak_schemes_delete_authenticated_mvp" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_delete_authenticated_mvp" on public.fitasc_compak_schemes for delete to authenticated using (true);

-- Additive pair order and presentation override support.
alter table public.misses add column if not exists base_presentation text;
alter table public.misses add column if not exists actual_presentation text;
alter table public.misses add column if not exists presented_pair_label text;
alter table public.misses add column if not exists shooting_order_label text;
alter table public.misses add column if not exists is_reversed_order boolean default false;

create table if not exists public.session_course_overrides (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  course_number integer not null,
  plate_number integer,
  event_number integer,
  base_presentation text,
  actual_presentation text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, course_number, plate_number, event_number)
);

alter table public.session_course_overrides enable row level security;
drop policy if exists "course_overrides_select_own" on public.session_course_overrides;
create policy "course_overrides_select_own" on public.session_course_overrides for select using (exists(select 1 from public.sessions s where s.id=session_course_overrides.session_id and s.user_id=auth.uid()));
drop policy if exists "course_overrides_insert_own" on public.session_course_overrides;
create policy "course_overrides_insert_own" on public.session_course_overrides for insert with check (exists(select 1 from public.sessions s where s.id=session_course_overrides.session_id and s.user_id=auth.uid()));
drop policy if exists "course_overrides_update_own" on public.session_course_overrides;
create policy "course_overrides_update_own" on public.session_course_overrides for update using (exists(select 1 from public.sessions s where s.id=session_course_overrides.session_id and s.user_id=auth.uid())) with check (exists(select 1 from public.sessions s where s.id=session_course_overrides.session_id and s.user_id=auth.uid()));
drop policy if exists "course_overrides_delete_own" on public.session_course_overrides;
create policy "course_overrides_delete_own" on public.session_course_overrides for delete using (exists(select 1 from public.sessions s where s.id=session_course_overrides.session_id and s.user_id=auth.uid()));


create table if not exists public.shooter_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shooter_name text,
  country text,
  my_disciplines text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shooter_profiles_set_updated_at on public.shooter_profiles;
create trigger shooter_profiles_set_updated_at
  before update on public.shooter_profiles
  for each row
  execute function public.set_updated_at();

alter table public.shooter_profiles enable row level security;
drop policy if exists "shooter_profiles_select_own" on public.shooter_profiles;
create policy "shooter_profiles_select_own" on public.shooter_profiles for select using (auth.uid() = user_id);
drop policy if exists "shooter_profiles_insert_own" on public.shooter_profiles;
create policy "shooter_profiles_insert_own" on public.shooter_profiles for insert with check (auth.uid() = user_id);
drop policy if exists "shooter_profiles_update_own" on public.shooter_profiles;
create policy "shooter_profiles_update_own" on public.shooter_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "shooter_profiles_delete_own" on public.shooter_profiles;
create policy "shooter_profiles_delete_own" on public.shooter_profiles for delete using (auth.uid() = user_id);
create table if not exists public.training_score_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  session_date date not null,
  location text,
  discipline text not null,
  session_type text not null default 'training',
  number_of_posts integer not null,
  targets_per_post integer not null,
  total_targets integer not null,
  compak_scheme_id text,
  compak_shooting_mode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_score_sheets_session_type_check check (session_type in ('training', 'shared_training')),
  constraint training_score_sheets_posts_check check (number_of_posts > 0),
  constraint training_score_sheets_targets_check check (targets_per_post > 0 and total_targets > 0),
  constraint training_score_sheets_compak_shooting_mode_check check (compak_shooting_mode is null or compak_shooting_mode in ('Squad', 'Inline'))
);

create table if not exists public.training_score_sheet_shooters (
  id uuid primary key default gen_random_uuid(),
  score_sheet_id uuid not null references public.training_score_sheets(id) on delete cascade,
  shooter_name text not null,
  linked_user_id uuid references auth.users(id) on delete set null,
  display_order integer not null default 1,
  total_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_score_sheet_scores (
  id uuid primary key default gen_random_uuid(),
  score_sheet_id uuid not null references public.training_score_sheets(id) on delete cascade,
  shooter_id uuid not null references public.training_score_sheet_shooters(id) on delete cascade,
  post_number integer not null,
  score integer not null,
  max_score integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shooter_id, post_number),
  constraint training_score_sheet_scores_post_check check (post_number > 0),
  constraint training_score_sheet_scores_score_check check (score >= 0 and max_score > 0 and score <= max_score)
);

create index if not exists training_score_sheets_owner_date_idx on public.training_score_sheets(owner_user_id, session_date desc, created_at desc);
create index if not exists training_score_sheet_shooters_sheet_order_idx on public.training_score_sheet_shooters(score_sheet_id, display_order);
create index if not exists training_score_sheet_scores_sheet_shooter_idx on public.training_score_sheet_scores(score_sheet_id, shooter_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists training_score_sheets_set_updated_at on public.training_score_sheets;
create trigger training_score_sheets_set_updated_at
  before update on public.training_score_sheets
  for each row
  execute function public.set_updated_at();

drop trigger if exists training_score_sheet_shooters_set_updated_at on public.training_score_sheet_shooters;
create trigger training_score_sheet_shooters_set_updated_at
  before update on public.training_score_sheet_shooters
  for each row
  execute function public.set_updated_at();

drop trigger if exists training_score_sheet_scores_set_updated_at on public.training_score_sheet_scores;
create trigger training_score_sheet_scores_set_updated_at
  before update on public.training_score_sheet_scores
  for each row
  execute function public.set_updated_at();

alter table public.training_score_sheets enable row level security;
alter table public.training_score_sheet_shooters enable row level security;
alter table public.training_score_sheet_scores enable row level security;

drop policy if exists "training_score_sheets_select_own" on public.training_score_sheets;
create policy "training_score_sheets_select_own" on public.training_score_sheets for select using (auth.uid() = owner_user_id);
drop policy if exists "training_score_sheets_insert_own" on public.training_score_sheets;
create policy "training_score_sheets_insert_own" on public.training_score_sheets for insert with check (auth.uid() = owner_user_id);
drop policy if exists "training_score_sheets_update_own" on public.training_score_sheets;
create policy "training_score_sheets_update_own" on public.training_score_sheets for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists "training_score_sheets_delete_own" on public.training_score_sheets;
create policy "training_score_sheets_delete_own" on public.training_score_sheets for delete using (auth.uid() = owner_user_id);

drop policy if exists "training_score_sheet_shooters_select_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_select_own" on public.training_score_sheet_shooters for select using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_insert_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_insert_own" on public.training_score_sheet_shooters for insert with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_update_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_update_own" on public.training_score_sheet_shooters for update using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid())) with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_delete_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_delete_own" on public.training_score_sheet_shooters for delete using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));

drop policy if exists "training_score_sheet_scores_select_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_select_own" on public.training_score_sheet_scores for select using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_insert_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_insert_own" on public.training_score_sheet_scores for insert with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_update_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_update_own" on public.training_score_sheet_scores for update using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid())) with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_delete_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_delete_own" on public.training_score_sheet_scores for delete using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
create table if not exists public.training_score_sheet_target_results (
  id uuid primary key default gen_random_uuid(),
  score_sheet_id uuid not null references public.training_score_sheets(id) on delete cascade,
  shooter_id uuid not null references public.training_score_sheet_shooters(id) on delete cascade,
  post_number integer not null,
  target_number integer not null,
  result text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (score_sheet_id, shooter_id, post_number, target_number),
  constraint training_score_sheet_target_results_post_check check (post_number > 0),
  constraint training_score_sheet_target_results_target_check check (target_number > 0),
  constraint training_score_sheet_target_results_result_check check (result in ('hit', 'miss'))
);

create index if not exists training_score_sheet_target_results_sheet_shooter_post_idx
  on public.training_score_sheet_target_results(score_sheet_id, shooter_id, post_number, target_number);

drop trigger if exists training_score_sheet_target_results_set_updated_at on public.training_score_sheet_target_results;
create trigger training_score_sheet_target_results_set_updated_at
  before update on public.training_score_sheet_target_results
  for each row
  execute function public.set_updated_at();

alter table public.training_score_sheet_target_results enable row level security;

drop policy if exists "training_score_sheet_target_results_select_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_select_own" on public.training_score_sheet_target_results for select using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_insert_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_insert_own" on public.training_score_sheet_target_results for insert with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_update_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_update_own" on public.training_score_sheet_target_results for update using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid())) with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_delete_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_delete_own" on public.training_score_sheet_target_results for delete using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
