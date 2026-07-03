alter table public.shooter_profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

create or replace function public.safe_creator_snapshot(p_show_creator_name boolean)
returns table(show_creator_name boolean, creator_display_name_snapshot text)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_name text;
begin
  if v_user is null or not public.has_approved_access(v_user) then raise exception 'Access required'; end if;
  select nullif(btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))), '') into v_name from public.shooter_profiles where user_id = v_user;
  if v_name is null then
    select nullif(btrim(shooter_name), '') into v_name from public.shooter_profiles where user_id = v_user;
  end if;
  show_creator_name := p_show_creator_name and v_name is not null;
  creator_display_name_snapshot := case when show_creator_name then v_name else null end;
  return next;
end $$;
