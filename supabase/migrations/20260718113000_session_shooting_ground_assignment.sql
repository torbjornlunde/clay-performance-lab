create or replace function public.assign_session_to_user_shooting_ground(
  p_session_id uuid,
  p_ground_id uuid
)
returns void
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'login_required';
  end if;

  if not exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.user_id = auth.uid()
  ) then
    raise exception 'session_not_found';
  end if;

  if not exists (
    select 1
    from public.user_shooting_grounds g
    where g.id = p_ground_id
      and g.user_id = auth.uid()
  ) then
    raise exception 'ground_not_found';
  end if;

  update public.sessions
  set user_shooting_ground_id = p_ground_id
  where id = p_session_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.unassign_session_from_user_shooting_ground(
  p_session_id uuid
)
returns void
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'login_required';
  end if;

  if not exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.user_id = auth.uid()
  ) then
    raise exception 'session_not_found';
  end if;

  update public.sessions
  set user_shooting_ground_id = null
  where id = p_session_id
    and user_id = auth.uid();
end;
$$;
