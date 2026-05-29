create extension if not exists "pgcrypto";
create table if not exists public.sessions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null,discipline text not null,session_type text not null,shooting_format text,course_count integer,total_targets integer,notes text,leirdue_result_url text,created_at timestamptz not null default now());
alter table public.sessions add column if not exists leirdue_result_url text;
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
alter table public.sessions add column if not exists sporttrap_series_count integer;
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
