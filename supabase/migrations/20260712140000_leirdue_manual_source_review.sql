-- Manual user-controlled review state for saved Leirdue-linked results.
alter table public.sessions
  add column if not exists last_source_checked_at timestamptz,
  add column if not exists last_source_status text,
  add column if not exists source_change_summary jsonb;

comment on column public.sessions.last_source_checked_at is 'Most recent user-triggered check of a linked Leirdue.net source result.';
comment on column public.sessions.last_source_status is 'Latest manual Leirdue source check status, for example no_changes, changed, could_not_match, fetch_failed, or applied.';
comment on column public.sessions.source_change_summary is 'Structured summary of the latest manual Leirdue source check or user-confirmed applied update.';
