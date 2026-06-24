-- Additive shot-count foundation for equipment profiles.
-- Future total rule: total shots fired = initial_shot_count + explicit equipment usage recorded in logs after shot_tracking_started_at.
-- Future logging must count actual shots/cartridges fired, not blindly equate targets with shots, avoid double-counting imported history, and preserve historical equipment snapshots.

alter table public.equipment_weapons
  add column if not exists initial_shot_count bigint not null default 0,
  add column if not exists shot_tracking_started_at timestamptz not null default now();

alter table public.equipment_ammunition_profiles
  add column if not exists initial_shot_count bigint not null default 0,
  add column if not exists shot_tracking_started_at timestamptz not null default now();

alter table public.equipment_weapons
  drop constraint if exists equipment_weapons_initial_shot_count_check;
alter table public.equipment_weapons
  add constraint equipment_weapons_initial_shot_count_check check (initial_shot_count >= 0);

alter table public.equipment_ammunition_profiles
  drop constraint if exists equipment_ammunition_initial_shot_count_check;
alter table public.equipment_ammunition_profiles
  add constraint equipment_ammunition_initial_shot_count_check check (initial_shot_count >= 0);
