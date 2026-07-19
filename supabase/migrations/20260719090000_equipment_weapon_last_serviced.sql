-- Add optional date-only last service tracking for Equipment weapons.
-- Existing guns remain valid; no default or inferred service date is applied.
alter table public.equipment_weapons
  add column if not exists last_serviced_on date;

alter table public.equipment_weapons
  drop constraint if exists equipment_weapons_last_serviced_not_future;

alter table public.equipment_weapons
  add constraint equipment_weapons_last_serviced_not_future
  check (last_serviced_on is null or last_serviced_on <= current_date);

comment on column public.equipment_weapons.last_serviced_on is 'Optional date-only record of the most recent completed service for this weapon. Null means not recorded.';
