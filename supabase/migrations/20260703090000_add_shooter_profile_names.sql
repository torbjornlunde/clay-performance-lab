alter table public.shooter_profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

create or replace function public.safe_creator_snapshot(p_show_creator_name boolean)
returns table(show_creator_name boolean, creator_display_name_snapshot text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_first_name text;
  v_last_name text;
  v_name text;
begin
  if v_user is null or not public.has_approved_access(v_user) then raise exception 'Access required'; end if;

  select
    nullif(regexp_replace(btrim(first_name), E'\\s+', ' ', 'g'), ''),
    nullif(regexp_replace(btrim(last_name), E'\\s+', ' ', 'g'), ''),
    nullif(regexp_replace(btrim(shooter_name), E'\\s+', ' ', 'g'), '')
  into v_first_name, v_last_name, v_name
  from public.shooter_profiles
  where user_id = v_user;

  if v_first_name is not null and v_last_name is not null then
    v_name := v_first_name || ' ' || v_last_name;
  end if;

  show_creator_name := p_show_creator_name and v_name is not null;
  creator_display_name_snapshot := case when show_creator_name then v_name else null end;
  return next;
end $$;
