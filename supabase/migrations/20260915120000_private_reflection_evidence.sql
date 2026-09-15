create table if not exists public.private_reflection_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  source_note_id uuid not null references public.private_session_notes(id) on delete cascade,
  source_note_updated_at timestamptz not null,
  category text not null check (category in ('physical_state','mental_state','conditions','target_type','direction','speed','location','equipment_change','possible_issue')),
  normalized_value text not null check (char_length(normalized_value) between 1 and 80),
  label text not null check (char_length(label) between 1 and 160),
  evidence_basis text not null check (evidence_basis in ('self_report','ai_inference')),
  confidence text not null check (confidence in ('high','medium','low')),
  reference text null check (reference is null or char_length(reference) between 1 and 60),
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists private_reflection_evidence_owner_session_idx on public.private_reflection_evidence(user_id, session_id);
alter table public.private_reflection_evidence enable row level security;
revoke all on public.private_reflection_evidence from anon;
grant select, insert, update, delete on public.private_reflection_evidence to authenticated;
create policy "private_reflection_evidence_select_own" on public.private_reflection_evidence for select using (auth.uid() = user_id and public.has_approved_access(auth.uid()) and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "private_reflection_evidence_insert_own" on public.private_reflection_evidence for insert with check (auth.uid() = user_id and public.has_approved_access(auth.uid()) and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()) and exists (select 1 from public.private_session_notes n where n.id = source_note_id and n.user_id = auth.uid() and n.session_id = session_id and n.note_scope = 'session' and n.updated_at = source_note_updated_at));
create policy "private_reflection_evidence_update_own" on public.private_reflection_evidence for update using (auth.uid() = user_id and public.has_approved_access(auth.uid())) with check (auth.uid() = user_id and public.has_approved_access(auth.uid()));
create policy "private_reflection_evidence_delete_own" on public.private_reflection_evidence for delete using (auth.uid() = user_id and public.has_approved_access(auth.uid()));
create or replace function public.protect_private_reflection_evidence_update() returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if (new.user_id, new.session_id, new.source_note_id, new.source_note_updated_at, new.category, new.evidence_basis, new.confidence)
     is distinct from
     (old.user_id, old.session_id, old.source_note_id, old.source_note_updated_at, old.category, old.evidence_basis, old.confidence) then
    raise exception 'Reflection evidence provenance is immutable';
  end if;
  if new.review_status = 'accepted' and old.review_status <> 'accepted' and not exists (
    select 1 from public.private_session_notes n where n.id = new.source_note_id and n.user_id = auth.uid()
      and n.session_id = new.session_id and n.updated_at = new.source_note_updated_at
  ) then raise exception 'Reflection evidence is stale'; end if;
  return new;
end $$;
create trigger private_reflection_evidence_protect_update before update on public.private_reflection_evidence for each row execute function public.protect_private_reflection_evidence_update();
create trigger private_reflection_evidence_set_updated_at before update on public.private_reflection_evidence for each row execute function public.set_updated_at();
comment on table public.private_reflection_evidence is 'Owner-only, reviewable structured evidence proposed from an explicitly interpreted private competition reflection.';
