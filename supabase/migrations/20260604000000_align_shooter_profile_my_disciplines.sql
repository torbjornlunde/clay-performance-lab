-- Keep shooter profile databases aligned with the application column name.
-- Earlier deployments may have created preferred_disciplines instead.
alter table public.shooter_profiles
  add column if not exists my_disciplines text[] default '{}';

-- If an older preferred_disciplines column exists, preserve its values without
-- making the application depend on that legacy column.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shooter_profiles'
      and column_name = 'preferred_disciplines'
  ) then
    execute '
      update public.shooter_profiles
      set my_disciplines = preferred_disciplines
      where preferred_disciplines is not null
        and (my_disciplines is null or cardinality(my_disciplines) = 0)
    ';
  end if;
end $$;

update public.shooter_profiles
set my_disciplines = '{}'
where my_disciplines is null;

alter table public.shooter_profiles
  alter column my_disciplines set default '{}',
  alter column my_disciplines set not null;
