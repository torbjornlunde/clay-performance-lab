create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'internal', 'tester')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  source text,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.feature_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.feature_usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  period_key text not null,
  used_count integer not null default 0 check (used_count >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, feature_key, period_key)
);

alter table public.user_entitlements enable row level security;
alter table public.feature_usage_events enable row level security;
alter table public.feature_usage_counters enable row level security;

create policy "Users can read their own entitlement" on public.user_entitlements for select using (auth.uid() = user_id);
create policy "Users can read their own feature usage events" on public.feature_usage_events for select using (auth.uid() = user_id);
create policy "Users can insert their own feature usage events" on public.feature_usage_events for insert with check (auth.uid() = user_id);
create policy "Users can read their own feature usage counters" on public.feature_usage_counters for select using (auth.uid() = user_id);

create index if not exists feature_usage_events_user_feature_created_idx on public.feature_usage_events (user_id, feature_key, created_at desc);
create index if not exists feature_usage_counters_user_feature_period_idx on public.feature_usage_counters (user_id, feature_key, period_key);

create or replace function public.set_current_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_user_entitlements_updated_at before update on public.user_entitlements for each row execute function public.set_current_updated_at();
create trigger set_feature_usage_counters_updated_at before update on public.feature_usage_counters for each row execute function public.set_current_updated_at();
