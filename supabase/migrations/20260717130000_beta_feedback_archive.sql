-- Add non-destructive archive fields for beta feedback admin triage.

alter table public.beta_feedback
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists beta_feedback_active_status_created_at_idx
  on public.beta_feedback(admin_status, created_at desc)
  where archived_at is null;

create index if not exists beta_feedback_archived_at_idx
  on public.beta_feedback(archived_at desc)
  where archived_at is not null;
