-- Additive structured choke/catalog fields for Equipment Profile MVP corrections.
-- Preserves existing user-entered label, choke_system, constriction, and fixed_choke_label data.

alter table public.equipment_weapon_chokes
  add column if not exists standard_designation text,
  add column if not exists fraction_designation text,
  add column if not exists model_or_series text,
  add column if not exists compatible_choke_system text,
  add column if not exists manufacturer_marking text,
  add column if not exists constriction_mm numeric(7, 3),
  add column if not exists constriction_inches numeric(7, 4);

alter table public.equipment_weapon_chokes
  drop constraint if exists equipment_weapon_chokes_standard_designation_check;
alter table public.equipment_weapon_chokes
  add constraint equipment_weapon_chokes_standard_designation_check
  check (
    standard_designation is null or standard_designation in (
      'cylinder',
      'skeet',
      'improved_cylinder',
      'light_modified',
      'modified',
      'intermediate',
      'improved_modified',
      'light_full',
      'full',
      'extra_full',
      'spreader_diffusion',
      'other_custom'
    )
  );

alter table public.equipment_weapon_chokes
  drop constraint if exists equipment_weapon_chokes_fraction_designation_check;
alter table public.equipment_weapon_chokes
  add constraint equipment_weapon_chokes_fraction_designation_check
  check (fraction_designation is null or fraction_designation in ('0', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', '1/1'));

alter table public.equipment_weapon_chokes
  drop constraint if exists equipment_weapon_chokes_constriction_mm_check;
alter table public.equipment_weapon_chokes
  add constraint equipment_weapon_chokes_constriction_mm_check check (constriction_mm is null or constriction_mm >= 0);

alter table public.equipment_weapon_chokes
  drop constraint if exists equipment_weapon_chokes_constriction_inches_check;
alter table public.equipment_weapon_chokes
  add constraint equipment_weapon_chokes_constriction_inches_check check (constriction_inches is null or constriction_inches >= 0);

alter table public.equipment_weapon_current_choke_assignments
  add column if not exists setup_mode text,
  add column if not exists fixed_standard_designation text,
  add column if not exists fixed_fraction_designation text,
  add column if not exists fixed_manufacturer_marking text;

alter table public.equipment_weapon_current_choke_assignments
  drop constraint if exists equipment_current_choke_setup_mode_check;
alter table public.equipment_weapon_current_choke_assignments
  add constraint equipment_current_choke_setup_mode_check
  check (setup_mode is null or setup_mode in ('interchangeable', 'fixed', 'not_set'));

alter table public.equipment_weapon_current_choke_assignments
  drop constraint if exists equipment_current_choke_fixed_standard_check;
alter table public.equipment_weapon_current_choke_assignments
  add constraint equipment_current_choke_fixed_standard_check
  check (
    fixed_standard_designation is null or fixed_standard_designation in (
      'cylinder',
      'skeet',
      'improved_cylinder',
      'light_modified',
      'modified',
      'intermediate',
      'improved_modified',
      'light_full',
      'full',
      'extra_full',
      'spreader_diffusion',
      'other_custom'
    )
  );

alter table public.equipment_weapon_current_choke_assignments
  drop constraint if exists equipment_current_choke_fixed_fraction_check;
alter table public.equipment_weapon_current_choke_assignments
  add constraint equipment_current_choke_fixed_fraction_check
  check (fixed_fraction_designation is null or fixed_fraction_designation in ('0', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', '1/1'));

create or replace function public.equipment_choke_standard_from_label(input_label text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(input_label, '')))
    when 'c' then 'cylinder'
    when 'cyl' then 'cylinder'
    when 'cylinder' then 'cylinder'
    when '0' then 'cylinder'
    when 'sk' then 'skeet'
    when 'skeet' then 'skeet'
    when '1/8' then 'skeet'
    when 'ic' then 'improved_cylinder'
    when 'improved cylinder' then 'improved_cylinder'
    when '1/4' then 'improved_cylinder'
    when 'lm' then 'light_modified'
    when 'light modified' then 'light_modified'
    when '3/8' then 'light_modified'
    when 'm' then 'modified'
    when 'mod' then 'modified'
    when 'modified' then 'modified'
    when '1/2' then 'modified'
    when 'intermediate' then 'intermediate'
    when '5/8' then 'intermediate'
    when 'im' then 'improved_modified'
    when 'improved modified' then 'improved_modified'
    when '3/4' then 'improved_modified'
    when 'lf' then 'light_full'
    when 'light full' then 'light_full'
    when '7/8' then 'light_full'
    when 'f' then 'full'
    when 'full' then 'full'
    when '1/1' then 'full'
    when 'xf' then 'extra_full'
    when 'extra full' then 'extra_full'
    when 'spreader' then 'spreader_diffusion'
    when 'diffusion' then 'spreader_diffusion'
    when 'spreader / diffusion' then 'spreader_diffusion'
    else null
  end
$$;

create or replace function public.equipment_choke_fraction_for_standard(input_standard text)
returns text
language sql
immutable
as $$
  select case input_standard
    when 'cylinder' then '0'
    when 'skeet' then '1/8'
    when 'improved_cylinder' then '1/4'
    when 'light_modified' then '3/8'
    when 'modified' then '1/2'
    when 'intermediate' then '5/8'
    when 'improved_modified' then '3/4'
    when 'light_full' then '7/8'
    when 'full' then '1/1'
    else null
  end
$$;

update public.equipment_weapon_chokes
set
  standard_designation = public.equipment_choke_standard_from_label(label),
  fraction_designation = public.equipment_choke_fraction_for_standard(public.equipment_choke_standard_from_label(label)),
  compatible_choke_system = coalesce(compatible_choke_system, choke_system)
where standard_designation is null
  and public.equipment_choke_standard_from_label(label) is not null;

update public.equipment_weapon_current_choke_assignments
set
  setup_mode = case
    when choke_id is not null then 'interchangeable'
    when fixed_choke_label is not null then 'fixed'
    else 'not_set'
  end,
  fixed_standard_designation = case
    when choke_id is null then public.equipment_choke_standard_from_label(fixed_choke_label)
    else null
  end,
  fixed_fraction_designation = case
    when choke_id is null then public.equipment_choke_fraction_for_standard(public.equipment_choke_standard_from_label(fixed_choke_label))
    else null
  end
where setup_mode is null;

create or replace function public.equipment_validate_current_choke_setup()
returns trigger
language plpgsql
as $$
begin
  if new.setup_mode is null then
    if new.choke_id is not null then
      new.setup_mode = 'interchangeable';
    elsif new.fixed_choke_label is not null then
      new.setup_mode = 'fixed';
    else
      new.setup_mode = 'not_set';
    end if;
  end if;

  if new.setup_mode = 'interchangeable' then
    if new.choke_id is null then
      raise exception 'Select an interchangeable choke or choose another setup mode.';
    end if;
    new.fixed_choke_label = null;
    new.fixed_standard_designation = null;
    new.fixed_fraction_designation = null;
    new.fixed_manufacturer_marking = null;
  elsif new.setup_mode = 'fixed' then
    new.choke_id = null;
    if new.fixed_choke_label is null and new.fixed_standard_designation is null then
      raise exception 'Choose a fixed choke designation or enter a fixed choke label.';
    end if;
  elsif new.setup_mode = 'not_set' then
    new.choke_id = null;
    new.fixed_choke_label = null;
    new.fixed_standard_designation = null;
    new.fixed_fraction_designation = null;
    new.fixed_manufacturer_marking = null;
  end if;

  return new;
end;
$$;

drop trigger if exists equipment_current_chokes_setup_guard on public.equipment_weapon_current_choke_assignments;
create trigger equipment_current_chokes_setup_guard
  before insert or update of setup_mode, choke_id, fixed_choke_label, fixed_standard_designation, fixed_fraction_designation, fixed_manufacturer_marking
  on public.equipment_weapon_current_choke_assignments
  for each row
  execute function public.equipment_validate_current_choke_setup();
