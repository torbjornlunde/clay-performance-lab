create table if not exists public.session_post_targets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  post_number integer not null check (post_number > 0),
  target_position integer not null check (target_position > 0),
  presentation_number integer not null check (presentation_number > 0),
  presentation_type text not null check (presentation_type in ('single', 'report_pair', 'simultaneous_pair', 'other_pair', 'unknown')),
  position_in_presentation integer not null check (position_in_presentation > 0),
  target_label text,
  target_type text,
  direction text,
  speed text,
  distance text,
  difficulty text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint session_post_targets_unique_position unique (session_id, post_number, target_position),
  constraint session_post_targets_single_position check (presentation_type <> 'single' or position_in_presentation = 1),
  constraint session_post_targets_pair_position check (presentation_type in ('single', 'unknown') or position_in_presentation in (1, 2))
);

create index if not exists session_post_targets_session_idx on public.session_post_targets(session_id);
create index if not exists session_post_targets_session_post_idx on public.session_post_targets(session_id, post_number);
create index if not exists session_post_targets_order_idx on public.session_post_targets(session_id, post_number, target_position);

alter table public.session_post_targets enable row level security;

drop policy if exists "post_targets_select_own" on public.session_post_targets;
create policy "post_targets_select_own" on public.session_post_targets for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_targets.session_id and s.user_id = auth.uid()));

drop policy if exists "post_targets_insert_own" on public.session_post_targets;
create policy "post_targets_insert_own" on public.session_post_targets for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_targets.session_id and s.user_id = auth.uid()));

drop policy if exists "post_targets_update_own" on public.session_post_targets;
create policy "post_targets_update_own" on public.session_post_targets for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_targets.session_id and s.user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_targets.session_id and s.user_id = auth.uid()));

drop policy if exists "post_targets_delete_own" on public.session_post_targets;
create policy "post_targets_delete_own" on public.session_post_targets for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_targets.session_id and s.user_id = auth.uid()));
