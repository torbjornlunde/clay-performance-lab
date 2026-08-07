-- Permanent private scorecard evidence for Competition sessions (issue #257).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('competition-scorecard-evidence', 'competition-scorecard-evidence', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create table public.competition_scorecard_evidence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_number integer,
  storage_path text not null unique,
  original_filename text,
  content_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_scorecard_evidence_course_check check (course_number is null or course_number > 0),
  constraint competition_scorecard_evidence_type_check check (content_type in ('image/jpeg','image/png','image/webp')),
  constraint competition_scorecard_evidence_size_check check (size_bytes > 0 and size_bytes <= 10485760),
  constraint competition_scorecard_evidence_path_check check (
    storage_path ~ ('^' || user_id::text || '/' || session_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$')
    and right(storage_path, 4) = case content_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then 'webp' end
  )
);
create index competition_scorecard_evidence_session_idx on public.competition_scorecard_evidence(session_id, created_at);
alter table public.competition_scorecard_evidence enable row level security;
revoke all on public.competition_scorecard_evidence from anon;
grant select, insert, update, delete on public.competition_scorecard_evidence to authenticated;

drop trigger if exists competition_scorecard_evidence_set_updated_at on public.competition_scorecard_evidence;
create trigger competition_scorecard_evidence_set_updated_at before update on public.competition_scorecard_evidence
for each row execute function public.set_updated_at();

create policy "competition_scorecard_evidence_select_own" on public.competition_scorecard_evidence for select to authenticated
using (user_id = auth.uid() and exists(select 1 from public.sessions s where s.id=session_id and s.user_id=auth.uid() and s.session_type='Competition'));
create policy "competition_scorecard_evidence_insert_own" on public.competition_scorecard_evidence for insert to authenticated
with check (user_id = auth.uid() and exists(select 1 from public.sessions s where s.id=session_id and s.user_id=auth.uid() and s.session_type='Competition'));
create policy "competition_scorecard_evidence_update_own" on public.competition_scorecard_evidence for update to authenticated
using (user_id = auth.uid() and exists(select 1 from public.sessions s where s.id=session_id and s.user_id=auth.uid() and s.session_type='Competition'))
with check (user_id = auth.uid() and exists(select 1 from public.sessions s where s.id=session_id and s.user_id=auth.uid() and s.session_type='Competition'));
create policy "competition_scorecard_evidence_delete_own" on public.competition_scorecard_evidence for delete to authenticated
using (user_id = auth.uid() and exists(select 1 from public.sessions s where s.id=session_id and s.user_id=auth.uid() and s.session_type='Competition'));

-- Uploads require both the owner's top-level folder and a Competition owned by
-- that user in the second folder. Qualify storage.objects.name inside the
-- sessions subquery so it cannot be shadowed by sessions.name.
create policy "competition_scorecard_storage_insert_own_session" on storage.objects for insert to authenticated with check (
  bucket_id='competition-scorecard-evidence' and (storage.foldername(storage.objects.name))[1]=auth.uid()::text
  and exists(select 1 from public.sessions s where s.id::text=(storage.foldername(storage.objects.name))[2] and s.user_id=auth.uid() and s.session_type='Competition'));
create policy "competition_scorecard_storage_select_own_session" on storage.objects for select to authenticated using (
  bucket_id='competition-scorecard-evidence' and (storage.foldername(storage.objects.name))[1]=auth.uid()::text
  and exists(select 1 from public.sessions s where s.id::text=(storage.foldername(storage.objects.name))[2] and s.user_id=auth.uid() and s.session_type='Competition'));
create policy "competition_scorecard_storage_update_own_session" on storage.objects for update to authenticated using (
  bucket_id='competition-scorecard-evidence' and (storage.foldername(storage.objects.name))[1]=auth.uid()::text
  and exists(select 1 from public.sessions s where s.id::text=(storage.foldername(storage.objects.name))[2] and s.user_id=auth.uid() and s.session_type='Competition'));
-- Owner-folder-only delete deliberately permits post-session-delete orphan cleanup;
-- it grants no read or write access and cannot reach another user's objects.
create policy "competition_scorecard_storage_delete_own" on storage.objects for delete to authenticated using (
  bucket_id='competition-scorecard-evidence' and (storage.foldername(storage.objects.name))[1]=auth.uid()::text);

comment on table public.competition_scorecard_evidence is 'Owner-only metadata for permanent private Competition scorecard originals; never analysis input.';
