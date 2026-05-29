create table if not exists public.fitasc_compak_schemes(
  id uuid primary key default gen_random_uuid(),
  scheme_number integer not null,
  plate_number integer not null,
  event_number integer not null,
  presentation text not null,
  first_machine text,
  second_machine text,
  is_verified boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scheme_number, plate_number, event_number)
);

alter table public.fitasc_compak_schemes enable row level security;

grant select on public.fitasc_compak_schemes to anon, authenticated;
grant insert, update on public.fitasc_compak_schemes to authenticated;

drop policy if exists "fitasc_compak_schemes_select_all" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_select_all" on public.fitasc_compak_schemes for select using (true);

drop policy if exists "fitasc_compak_schemes_insert_authenticated" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_insert_authenticated" on public.fitasc_compak_schemes for insert to authenticated with check (true);

drop policy if exists "fitasc_compak_schemes_update_authenticated" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_update_authenticated" on public.fitasc_compak_schemes for update to authenticated using (true) with check (true);
