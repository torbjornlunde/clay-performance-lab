-- Track Resend acceptance separately from confirmed delivery for beta approval emails.
-- Existing rows remain NULL because their historical delivery cannot be verified.
alter table public.beta_interest_submissions
  add column if not exists approval_email_message_id text,
  add column if not exists approval_email_delivery_status text,
  add column if not exists approval_email_status_updated_at timestamptz,
  add column if not exists approval_email_webhook_event_id text;

alter table public.beta_interest_submissions
  add constraint beta_interest_submissions_approval_email_delivery_status_check
  check (approval_email_delivery_status is null or approval_email_delivery_status in ('accepted', 'delivered', 'bounced', 'failed', 'suppressed'));

create unique index if not exists beta_interest_submissions_approval_email_message_id_idx
  on public.beta_interest_submissions(approval_email_message_id)
  where approval_email_message_id is not null;

comment on column public.beta_interest_submissions.approval_email_delivery_status is
  'Resend delivery state. NULL means unknown, including legacy sends; accepted is not confirmed delivery.';
