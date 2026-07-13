create table if not exists public.private_session_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  note_scope text not null check (note_scope in ('session', 'post')),
  post_number integer null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_session_notes_scope_post_check check (
    (note_scope = 'session' and post_number is null)
    or (note_scope = 'post' and post_number is not null and post_number > 0)
  ),
  constraint private_session_notes_unique_scope unique nulls not distinct (user_id, session_id, note_scope, post_number)
);

create index if not exists private_session_notes_user_id_idx on public.private_session_notes(user_id);
create index if not exists private_session_notes_session_id_idx on public.private_session_notes(session_id);
create index if not exists private_session_notes_updated_at_desc_idx on public.private_session_notes(updated_at desc);

alter table public.private_session_notes enable row level security;

revoke all on public.private_session_notes from anon;
grant select, insert, update, delete on public.private_session_notes to authenticated;

drop policy if exists "private_session_notes_select_own" on public.private_session_notes;
create policy "private_session_notes_select_own" on public.private_session_notes
  for select using (auth.uid() = user_id and public.has_approved_access(auth.uid()) and exists (select 1 from public.sessions s where s.id = private_session_notes.session_id and s.user_id = auth.uid()));

drop policy if exists "private_session_notes_insert_own" on public.private_session_notes;
create policy "private_session_notes_insert_own" on public.private_session_notes
  for insert with check (auth.uid() = user_id and public.has_approved_access(auth.uid()) and exists (select 1 from public.sessions s where s.id = private_session_notes.session_id and s.user_id = auth.uid()));

drop policy if exists "private_session_notes_update_own" on public.private_session_notes;
create policy "private_session_notes_update_own" on public.private_session_notes
  for update using (auth.uid() = user_id and public.has_approved_access(auth.uid()) and exists (select 1 from public.sessions s where s.id = private_session_notes.session_id and s.user_id = auth.uid()))
  with check (auth.uid() = user_id and public.has_approved_access(auth.uid()) and exists (select 1 from public.sessions s where s.id = private_session_notes.session_id and s.user_id = auth.uid()));

drop policy if exists "private_session_notes_delete_own" on public.private_session_notes;
create policy "private_session_notes_delete_own" on public.private_session_notes
  for delete using (auth.uid() = user_id and public.has_approved_access(auth.uid()) and exists (select 1 from public.sessions s where s.id = private_session_notes.session_id and s.user_id = auth.uid()));

comment on table public.private_session_notes is 'Private user-owned session and post notes. Not shared, analyzed, or stored in sessions.notes.';
comment on column public.private_session_notes.body is 'Private free-text note body; never send this value to analytics.';

drop trigger if exists private_session_notes_set_updated_at on public.private_session_notes;
create trigger private_session_notes_set_updated_at
  before update on public.private_session_notes
  for each row execute function public.set_updated_at();
