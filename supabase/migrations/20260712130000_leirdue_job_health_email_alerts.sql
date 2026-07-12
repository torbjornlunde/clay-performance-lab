alter table public.leirdue_job_health
  add column if not exists last_alert_email_sent_at timestamptz,
  add column if not exists last_alert_email_status text,
  add column if not exists last_alert_email_error text,
  add column if not exists last_alert_incident_key text,
  add column if not exists last_recovery_email_sent_at timestamptz;

comment on column public.leirdue_job_health.last_alert_email_sent_at is 'Most recent admin incident alert email attempt that was sent for this Leirdue job.';
comment on column public.leirdue_job_health.last_alert_email_status is 'Latest admin alert email outcome, for example sent, skipped_not_configured, skipped_rate_limited, skipped_no_recovery, or failed.';
comment on column public.leirdue_job_health.last_alert_email_error is 'Safe operational error message from the latest admin alert email attempt, if any.';
comment on column public.leirdue_job_health.last_alert_incident_key is 'Stable incident key used to rate-limit repeated Leirdue job health emails.';
comment on column public.leirdue_job_health.last_recovery_email_sent_at is 'Most recent admin recovery email sent after a failed or degraded Leirdue refresh recovered.';
