-- Opt-in Web Push subscriptions for existing admin notifications.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_push_subscriptions_endpoint_required check (nullif(trim(endpoint), '') is not null),
  constraint web_push_subscriptions_p256dh_required check (nullif(trim(p256dh), '') is not null),
  constraint web_push_subscriptions_auth_required check (nullif(trim(auth), '') is not null)
);

create unique index if not exists web_push_subscriptions_endpoint_unique_idx
  on public.web_push_subscriptions(endpoint);

create index if not exists web_push_subscriptions_user_active_idx
  on public.web_push_subscriptions(user_id, active, updated_at desc);

alter table public.web_push_subscriptions enable row level security;

create policy "web_push_subscriptions_select_own" on public.web_push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

create policy "web_push_subscriptions_delete_own" on public.web_push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.upsert_my_web_push_subscription(
  subscription_endpoint text,
  subscription_p256dh text,
  subscription_auth text,
  subscription_user_agent text default null
)
returns public.web_push_subscriptions
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_subscription public.web_push_subscriptions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if nullif(trim(subscription_endpoint), '') is null or nullif(trim(subscription_p256dh), '') is null or nullif(trim(subscription_auth), '') is null then
    raise exception 'Complete push subscription is required.';
  end if;

  insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, active, updated_at)
  values (auth.uid(), subscription_endpoint, subscription_p256dh, subscription_auth, nullif(trim(subscription_user_agent), ''), true, now())
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, active = true, updated_at = now()
  returning * into saved_subscription;

  return saved_subscription;
end;
$$;

create or replace function public.delete_my_web_push_subscription(subscription_endpoint text)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare deleted_count integer;
begin
  delete from public.web_push_subscriptions where user_id = auth.uid() and endpoint = subscription_endpoint;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on public.web_push_subscriptions from public, anon;
grant select, delete on public.web_push_subscriptions to authenticated;
revoke execute on function public.upsert_my_web_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.upsert_my_web_push_subscription(text, text, text, text) to authenticated;
revoke execute on function public.delete_my_web_push_subscription(text) from public, anon;
grant execute on function public.delete_my_web_push_subscription(text) to authenticated;

comment on table public.web_push_subscriptions is 'Private per-device browser Push API subscriptions owned by authenticated users.';
