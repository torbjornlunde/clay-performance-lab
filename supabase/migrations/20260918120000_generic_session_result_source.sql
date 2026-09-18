alter table public.sessions add column if not exists result_source_provider text;
alter table public.sessions add column if not exists result_source_competition_id text;
alter table public.sessions add column if not exists result_source_identity text;
alter table public.sessions add column if not exists result_source_url text;

create unique index if not exists sessions_user_result_source_identity_unique
  on public.sessions (user_id, result_source_provider, result_source_identity)
  where result_source_provider is not null and result_source_identity is not null;
