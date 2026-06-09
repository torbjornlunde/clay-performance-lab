-- Add an upgrade-friendly training log table for lightweight practice volume tracking.
create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  targets_fired integer not null,
  hits integer,
  discipline text,
  location text,
  notes text,
  source_type text not null default 'simple_training',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_logs_targets_fired_check check (targets_fired > 0),
  constraint training_logs_hits_check check (hits is null or (hits >= 0 and hits <= targets_fired)),
  constraint training_logs_source_type_check check (length(trim(source_type)) > 0)
);

comment on table public.training_logs is
  'Upgrade-friendly user-owned training log entries. simple_training rows support minimum date and targets_fired only, with optional details that can be extended later.';
comment on column public.training_logs.source_type is
  'Entry source/type marker. This PR writes simple_training rows only; future migrations can add richer training log types or detail tables.';

create index if not exists training_logs_owner_date_idx
  on public.training_logs(owner_user_id, date desc, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists training_logs_set_updated_at on public.training_logs;
create trigger training_logs_set_updated_at
  before update on public.training_logs
  for each row
  execute function public.set_updated_at();

alter table public.training_logs enable row level security;

drop policy if exists "training_logs_select_own" on public.training_logs;
create policy "training_logs_select_own" on public.training_logs
  for select
  using (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()));

drop policy if exists "training_logs_insert_own" on public.training_logs;
create policy "training_logs_insert_own" on public.training_logs
  for insert
  with check (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()));

drop policy if exists "training_logs_update_own" on public.training_logs;
create policy "training_logs_update_own" on public.training_logs
  for update
  using (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()))
  with check (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()));

drop policy if exists "training_logs_delete_own" on public.training_logs;
create policy "training_logs_delete_own" on public.training_logs
  for delete
  using (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()));
