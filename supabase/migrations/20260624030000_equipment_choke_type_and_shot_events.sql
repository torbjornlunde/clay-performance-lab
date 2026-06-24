-- Additive gun-level choke configuration and manual shot adjustment ledger.
-- Backfill logic:
-- 1) guns with any current assignment containing choke_id become interchangeable.
-- 2) guns with fixed labels/designations and no choke_id become fixed.
-- 3) ambiguous guns default to interchangeable. No choke inventory is deleted.
-- Future logging integration should create source-linked equipment_shot_events for explicit shots/cartridges fired, never infer shots from target count, and preserve historical equipment snapshots.

alter table public.equipment_weapons
  add column if not exists choke_configuration_type text not null default 'interchangeable';

alter table public.equipment_weapons
  drop constraint if exists equipment_weapons_choke_configuration_type_check;
alter table public.equipment_weapons
  add constraint equipment_weapons_choke_configuration_type_check
  check (choke_configuration_type in ('interchangeable', 'fixed'));

update public.equipment_weapons w
set choke_configuration_type = case
  when exists (
    select 1 from public.equipment_weapon_current_choke_assignments a
    where a.weapon_id = w.id and a.choke_id is not null
  ) then 'interchangeable'
  when exists (
    select 1 from public.equipment_weapon_current_choke_assignments a
    where a.weapon_id = w.id
      and a.choke_id is null
      and (a.fixed_choke_label is not null or a.fixed_standard_designation is not null)
  ) then 'fixed'
  else 'interchangeable'
end
where w.choke_configuration_type = 'interchangeable';

create table if not exists public.equipment_shot_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weapon_id uuid references public.equipment_weapons(id) on delete cascade,
  ammunition_profile_id uuid references public.equipment_ammunition_profiles(id) on delete cascade,
  shot_delta bigint not null,
  event_type text not null default 'manual_adjustment',
  source_type text,
  source_id uuid,
  event_date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_shot_events_owner_target_check check (weapon_id is not null or ammunition_profile_id is not null),
  constraint equipment_shot_events_single_target_check check (not (weapon_id is not null and ammunition_profile_id is not null)),
  constraint equipment_shot_events_delta_check check (shot_delta <> 0),
  constraint equipment_shot_events_type_check check (event_type in ('manual_adjustment', 'training_log', 'competition_log', 'correction'))
);

create index if not exists equipment_shot_events_user_id_idx on public.equipment_shot_events(user_id);
create index if not exists equipment_shot_events_weapon_id_idx on public.equipment_shot_events(weapon_id);
create index if not exists equipment_shot_events_ammunition_profile_id_idx on public.equipment_shot_events(ammunition_profile_id);
create index if not exists equipment_shot_events_source_idx on public.equipment_shot_events(source_type, source_id);
create unique index if not exists equipment_shot_events_source_weapon_unique
  on public.equipment_shot_events(source_type, source_id, weapon_id)
  where source_type is not null and source_id is not null and weapon_id is not null;
create unique index if not exists equipment_shot_events_source_ammunition_unique
  on public.equipment_shot_events(source_type, source_id, ammunition_profile_id)
  where source_type is not null and source_id is not null and ammunition_profile_id is not null;

drop trigger if exists equipment_shot_events_set_updated_at on public.equipment_shot_events;
create trigger equipment_shot_events_set_updated_at
  before update on public.equipment_shot_events
  for each row
  execute function public.equipment_touch_updated_at();

alter table public.equipment_shot_events enable row level security;

drop policy if exists "equipment_shot_events_select_own" on public.equipment_shot_events;
create policy "equipment_shot_events_select_own" on public.equipment_shot_events for select using (auth.uid() = user_id);
drop policy if exists "equipment_shot_events_insert_own" on public.equipment_shot_events;
create policy "equipment_shot_events_insert_own" on public.equipment_shot_events for insert with check (auth.uid() = user_id);
drop policy if exists "equipment_shot_events_update_own" on public.equipment_shot_events;
create policy "equipment_shot_events_update_own" on public.equipment_shot_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "equipment_shot_events_delete_own" on public.equipment_shot_events;
create policy "equipment_shot_events_delete_own" on public.equipment_shot_events for delete using (auth.uid() = user_id);
