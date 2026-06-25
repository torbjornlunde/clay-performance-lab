-- Fix the personal log equipment ownership trigger after the initial migration was applied.
-- `sessions` stores the owner in `user_id`, while `training_logs` stores it in
-- `owner_user_id`. Access the correct field only for the table that fired the
-- trigger so PostgreSQL does not try to read a field that is absent from NEW.

create or replace function public.validate_personal_log_equipment_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  log_user_id uuid;
begin
  if tg_table_name = 'sessions' then
    log_user_id := new.user_id;
  elsif tg_table_name = 'training_logs' then
    log_user_id := new.owner_user_id;
  else
    raise exception 'Unsupported table for personal log equipment validation: %', tg_table_name;
  end if;

  if new.equipment_weapon_id is not null and not exists (
    select 1
    from public.equipment_weapons w
    where w.id = new.equipment_weapon_id
      and w.user_id = log_user_id
  ) then
    raise exception 'Selected weapon must belong to the log owner.';
  end if;

  if new.equipment_ammunition_profile_id is not null and not exists (
    select 1
    from public.equipment_ammunition_profiles a
    where a.id = new.equipment_ammunition_profile_id
      and a.user_id = log_user_id
  ) then
    raise exception 'Selected ammunition must belong to the log owner.';
  end if;

  return new;
end;
$$;
