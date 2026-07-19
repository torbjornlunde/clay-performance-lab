-- Add optional date-only last service tracking for Equipment weapons.
-- Existing guns remain valid; no default or inferred service date is applied.
alter table public.equipment_weapons
  add column if not exists last_serviced_on date;

comment on column public.equipment_weapons.last_serviced_on is 'Optional date-only record of the most recent completed service for this weapon. Null means not recorded.';
