create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  event_name text not null,
  occurred_at timestamptz not null default now(),
  route text null,
  feature text null,
  discipline text null,
  session_id uuid null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_occurred_at_desc_idx on public.analytics_events (occurred_at desc);
create index if not exists analytics_events_event_name_idx on public.analytics_events (event_name);
create index if not exists analytics_events_user_id_idx on public.analytics_events (user_id);
create index if not exists analytics_events_feature_idx on public.analytics_events (feature);

alter table public.analytics_events enable row level security;

revoke all on public.analytics_events from anon;
grant insert on public.analytics_events to authenticated;
grant select on public.analytics_events to authenticated;

create policy "analytics_events_insert_own" on public.analytics_events
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "analytics_events_admin_select" on public.analytics_events
  for select to authenticated
  using (public.is_access_admin());

comment on table public.analytics_events is 'First-party privacy-limited product usage events for owner/admin beta operations dashboards.';
comment on column public.analytics_events.metadata is 'Allowlisted non-private event attributes only; do not store IPs, user agents, emails, notes, names, URLs, images, or free-text comments.';
