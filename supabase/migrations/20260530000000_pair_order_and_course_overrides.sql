alter table public.misses
  add column if not exists base_presentation text,
  add column if not exists actual_presentation text,
  add column if not exists presented_pair_label text,
  add column if not exists shooting_order_label text,
  add column if not exists is_reversed_order boolean default false;

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

drop policy if exists "Users can select their own session course overrides" on public.session_course_overrides;
create policy "Users can select their own session course overrides"
  on public.session_course_overrides
  for select
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_course_overrides.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert their own session course overrides" on public.session_course_overrides;
create policy "Users can insert their own session course overrides"
  on public.session_course_overrides
  for insert
  with check (
    exists (
      select 1 from public.sessions
      where sessions.id = session_course_overrides.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own session course overrides" on public.session_course_overrides;
create policy "Users can update their own session course overrides"
  on public.session_course_overrides
  for update
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_course_overrides.session_id
        and sessions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions
      where sessions.id = session_course_overrides.session_id
        and sessions.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own session course overrides" on public.session_course_overrides;
create policy "Users can delete their own session course overrides"
  on public.session_course_overrides
  for delete
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_course_overrides.session_id
        and sessions.user_id = auth.uid()
    )
  );
