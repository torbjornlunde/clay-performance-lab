-- Optional equipment references and immutable snapshots for personal shooting logs.
-- Applies to personal sessions/results and simple training logs only; shared Training Score Sheet tables are intentionally unchanged.

alter table public.sessions
  add column if not exists equipment_weapon_id uuid references public.equipment_weapons(id) on delete set null,
  add column if not exists equipment_ammunition_profile_id uuid references public.equipment_ammunition_profiles(id) on delete set null,
  add column if not exists equipment_snapshot jsonb;

alter table public.training_logs
  add column if not exists equipment_weapon_id uuid references public.equipment_weapons(id) on delete set null,
  add column if not exists equipment_ammunition_profile_id uuid references public.equipment_ammunition_profiles(id) on delete set null,
  add column if not exists equipment_snapshot jsonb;

create index if not exists sessions_equipment_weapon_id_idx on public.sessions(equipment_weapon_id);
create index if not exists sessions_equipment_ammunition_profile_id_idx on public.sessions(equipment_ammunition_profile_id);
create index if not exists training_logs_equipment_weapon_id_idx on public.training_logs(equipment_weapon_id);
create index if not exists training_logs_equipment_ammunition_profile_id_idx on public.training_logs(equipment_ammunition_profile_id);

comment on column public.sessions.equipment_weapon_id is 'Optional live reference to the equipment weapon selected for this personal log. Null is allowed and on-delete-set-null preserves the historical snapshot.';
comment on column public.sessions.equipment_ammunition_profile_id is 'Optional live reference to the ammunition profile selected for this personal log. Null is allowed and on-delete-set-null preserves the historical snapshot.';
comment on column public.sessions.equipment_snapshot is 'Immutable historical JSON snapshot of selected weapon, ammunition and choke setup at save time for personal logs.';
comment on column public.training_logs.equipment_weapon_id is 'Optional live reference to the equipment weapon selected for this simple personal training log. Null is allowed and on-delete-set-null preserves the historical snapshot.';
comment on column public.training_logs.equipment_ammunition_profile_id is 'Optional live reference to the ammunition profile selected for this simple personal training log. Null is allowed and on-delete-set-null preserves the historical snapshot.';
comment on column public.training_logs.equipment_snapshot is 'Immutable historical JSON snapshot of selected weapon, ammunition and choke setup at save time for simple personal training logs.';

create or replace function public.validate_personal_log_equipment_owner()
returns trigger
language plpgsql
as $$
declare
  log_user_id uuid;
begin
  log_user_id = case when tg_table_name = 'sessions' then new.user_id else new.owner_user_id end;

  if new.equipment_weapon_id is not null and not exists (
    select 1 from public.equipment_weapons w where w.id = new.equipment_weapon_id and w.user_id = log_user_id
  ) then
    raise exception 'Selected weapon must belong to the log owner.';
  end if;

  if new.equipment_ammunition_profile_id is not null and not exists (
    select 1 from public.equipment_ammunition_profiles a where a.id = new.equipment_ammunition_profile_id and a.user_id = log_user_id
  ) then
    raise exception 'Selected ammunition must belong to the log owner.';
  end if;

  return new;
end;
$$;

drop trigger if exists sessions_equipment_owner_guard on public.sessions;
create trigger sessions_equipment_owner_guard
  before insert or update of user_id, equipment_weapon_id, equipment_ammunition_profile_id
  on public.sessions
  for each row
  execute function public.validate_personal_log_equipment_owner();

drop trigger if exists training_logs_equipment_owner_guard on public.training_logs;
create trigger training_logs_equipment_owner_guard
  before insert or update of owner_user_id, equipment_weapon_id, equipment_ammunition_profile_id
  on public.training_logs
  for each row
  execute function public.validate_personal_log_equipment_owner();
