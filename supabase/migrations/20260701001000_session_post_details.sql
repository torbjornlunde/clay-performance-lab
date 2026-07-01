create table if not exists public.session_post_details (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  post_number integer not null check (post_number > 0),
  instructions text,
  source_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_post_details_unique_post unique (session_id, post_number)
);

create index if not exists session_post_details_session_idx on public.session_post_details(session_id);
create index if not exists session_post_details_session_post_idx on public.session_post_details(session_id, post_number);

alter table public.session_post_details enable row level security;

drop policy if exists "post_details_select_own" on public.session_post_details;
create policy "post_details_select_own" on public.session_post_details for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_details.session_id and s.user_id = auth.uid()));

drop policy if exists "post_details_insert_own" on public.session_post_details;
create policy "post_details_insert_own" on public.session_post_details for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_details.session_id and s.user_id = auth.uid()));

drop policy if exists "post_details_update_own" on public.session_post_details;
create policy "post_details_update_own" on public.session_post_details for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_details.session_id and s.user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_details.session_id and s.user_id = auth.uid()));

drop policy if exists "post_details_delete_own" on public.session_post_details;
create policy "post_details_delete_own" on public.session_post_details for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_post_details.session_id and s.user_id = auth.uid()));
