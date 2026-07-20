-- Link simple training logs to detailed personal Training sessions without duplicating the real-world session.

alter table public.training_logs
  add column if not exists upgraded_session_id uuid references public.sessions(id) on delete set null,
  add column if not exists upgraded_at timestamptz;

create unique index if not exists training_logs_upgraded_session_id_unique
  on public.training_logs(upgraded_session_id)
  where upgraded_session_id is not null;

create index if not exists training_logs_active_simple_owner_date_idx
  on public.training_logs(owner_user_id, date desc, created_at desc)
  where source_type = 'simple_training' and upgraded_session_id is null;

comment on column public.training_logs.upgraded_session_id is 'Detailed personal Training session created from this simple log. When set, the simple log is provenance only and must be excluded from normal simple-log aggregates.';
comment on column public.training_logs.upgraded_at is 'Timestamp when this simple log was upgraded to a detailed personal Training session.';

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
    coalesce(nullif(btrim(v_log.discipline), ''), 'Unspecified'),
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
