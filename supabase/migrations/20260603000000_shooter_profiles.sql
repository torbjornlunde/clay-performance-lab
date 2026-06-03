create extension if not exists "pgcrypto";

create table if not exists public.shooter_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shooter_name text,
  country text,
  my_disciplines text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shooter_profiles_set_updated_at on public.shooter_profiles;
create trigger shooter_profiles_set_updated_at
  before update on public.shooter_profiles
  for each row
  execute function public.set_updated_at();

alter table public.shooter_profiles enable row level security;

drop policy if exists "shooter_profiles_select_own" on public.shooter_profiles;
create policy "shooter_profiles_select_own" on public.shooter_profiles for select using (auth.uid() = user_id);

drop policy if exists "shooter_profiles_insert_own" on public.shooter_profiles;
create policy "shooter_profiles_insert_own" on public.shooter_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "shooter_profiles_update_own" on public.shooter_profiles;
create policy "shooter_profiles_update_own" on public.shooter_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shooter_profiles_delete_own" on public.shooter_profiles;
create policy "shooter_profiles_delete_own" on public.shooter_profiles for delete using (auth.uid() = user_id);
