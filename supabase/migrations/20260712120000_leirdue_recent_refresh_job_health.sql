-- Health/status foundation for automatic recent Leirdue cache refresh jobs.
create table if not exists public.leirdue_job_health (
  job_name text primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('success','partial','failed')),
  refreshed_count integer not null default 0,
  error_count integer not null default 0,
  last_success_at timestamptz,
  failure_reason text,
  affected_scope jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists leirdue_job_health_status_idx on public.leirdue_job_health (status, updated_at desc);

alter table public.leirdue_job_health enable row level security;

drop policy if exists "Admins read Leirdue job health" on public.leirdue_job_health;
create policy "Admins read Leirdue job health"
  on public.leirdue_job_health for select
  using (
    exists (
      select 1 from public.user_access_profiles uap
      where uap.user_id = auth.uid()
        and uap.access_status = 'active'
        and uap.system_role in ('owner','admin')
    )
  );

drop policy if exists "Admins manage Leirdue job health" on public.leirdue_job_health;
create policy "Admins manage Leirdue job health"
  on public.leirdue_job_health for all
  using (
    exists (
      select 1 from public.user_access_profiles uap
      where uap.user_id = auth.uid()
        and uap.access_status = 'active'
        and uap.system_role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_access_profiles uap
      where uap.user_id = auth.uid()
        and uap.access_status = 'active'
        and uap.system_role in ('owner','admin')
    )
  );
