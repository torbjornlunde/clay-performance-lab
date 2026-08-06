-- Review fixes for simple-training upgrades: permanent upgraded state on session deletion
-- and canonical Training session discipline fallback.

alter table public.training_logs
  drop constraint if exists training_logs_upgraded_session_id_fkey;

alter table public.training_logs
  add constraint training_logs_upgraded_session_id_fkey
  foreign key (upgraded_session_id)
  references public.sessions(id)
  on delete cascade;

create or replace function public.upgrade_simple_training_log(p_log_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_log public.training_logs%rowtype;
  v_session_id uuid;
begin
  select * into v_log
  from public.training_logs
  where id = p_log_id
    and owner_user_id = auth.uid()
    and source_type = 'simple_training'
  for update;

  if not found then
    raise exception 'simple_training_log_not_found';
  end if;

  if v_log.upgraded_session_id is not null then
    return v_log.upgraded_session_id;
  end if;

  insert into public.sessions (
    user_id,
    name,
    discipline,
    session_type,
    shooting_format,
    course_count,
    total_targets,
    notes,
    competition_date,
    shooting_ground,
    own_score,
    winning_score,
    equipment_weapon_id,
    equipment_ammunition_profile_id,
    equipment_snapshot
  ) values (
    v_log.owner_user_id,
    'Training · ' || v_log.date::text,
    coalesce(nullif(btrim(v_log.discipline), ''), 'Other'),
    'Training',
    null,
    null,
    v_log.targets_fired,
    v_log.notes,
    v_log.date,
    v_log.location,
    v_log.hits,
    null,
    v_log.equipment_weapon_id,
    v_log.equipment_ammunition_profile_id,
    v_log.equipment_snapshot
  )
  returning id into v_session_id;

  update public.training_logs
  set upgraded_session_id = v_session_id,
      upgraded_at = now()
  where id = v_log.id;

  return v_session_id;
end;
$$;
