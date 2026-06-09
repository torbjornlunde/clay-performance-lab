create extension if not exists "pgcrypto";

create or replace function public.normalize_beta_email(value text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(value)), '')
$$;

create or replace function public.normalize_beta_full_name(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(value)), '\s+', ' ', 'g'), '')
$$;

create or replace function public.is_protected_owner_email(value text)
returns boolean
language sql
immutable
as $$
  select public.normalize_beta_email(value) in (
    'noenlunde85@gmail.com',
    'torbjorn.lunde@icloud.com',
    'noenlunde@hotmail.com'
  )
$$;

create table if not exists public.user_access_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  access_status text not null default 'pending',
  system_role text not null default 'user',
  account_type text not null default 'personal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  constraint user_access_profiles_access_status_check check (access_status in ('pending', 'approved', 'rejected', 'revoked')),
  constraint user_access_profiles_system_role_check check (system_role in ('owner', 'admin', 'user')),
  constraint user_access_profiles_account_type_check check (account_type = 'personal')
);

create table if not exists public.beta_access_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  normalized_email text,
  full_name text,
  normalized_full_name text,
  access_status_to_grant text not null default 'approved',
  system_role_to_grant text not null default 'user',
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint beta_access_list_has_match_value check (public.normalize_beta_email(email) is not null or public.normalize_beta_full_name(full_name) is not null),
  constraint beta_access_list_access_status_check check (access_status_to_grant = 'approved'),
  constraint beta_access_list_system_role_check check (system_role_to_grant in ('owner', 'admin', 'user'))
);

create unique index if not exists beta_access_list_normalized_email_unique_idx
  on public.beta_access_list(normalized_email)
  where normalized_email is not null;

create index if not exists beta_access_list_normalized_full_name_idx
  on public.beta_access_list(normalized_full_name)
  where normalized_full_name is not null;

create or replace function public.set_beta_access_list_normalized_values()
returns trigger
language plpgsql
as $$
begin
  new.normalized_email := public.normalize_beta_email(new.email);
  new.normalized_full_name := public.normalize_beta_full_name(new.full_name);

  if public.is_protected_owner_email(new.email) then
    new.access_status_to_grant := 'approved';
    new.system_role_to_grant := 'owner';
  end if;

  return new;
end;
$$;

drop trigger if exists beta_access_list_normalize_values on public.beta_access_list;
create trigger beta_access_list_normalize_values
  before insert or update on public.beta_access_list
  for each row
  execute function public.set_beta_access_list_normalized_values();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_access_profiles_set_updated_at on public.user_access_profiles;
create trigger user_access_profiles_set_updated_at
  before update on public.user_access_profiles
  for each row
  execute function public.set_updated_at();

create or replace function public.is_access_admin()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_email text;
  has_admin_access boolean;
begin
  select u.email into current_email from auth.users u where u.id = auth.uid();

  if public.is_protected_owner_email(current_email) then
    return true;
  end if;

  select exists(
    select 1
    from public.user_access_profiles p
    where p.user_id = auth.uid()
      and p.access_status = 'approved'
      and p.system_role in ('owner', 'admin')
  ) into has_admin_access;

  return coalesce(has_admin_access, false);
end;
$$;

create or replace function public.resolve_beta_access(email_value text, full_name_value text)
returns table(access_status text, system_role text, approved_by uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  matched_email public.beta_access_list%rowtype;
  matched_name public.beta_access_list%rowtype;
begin
  if public.is_protected_owner_email(email_value) then
    access_status := 'approved';
    system_role := 'owner';
    approved_by := null;
    return next;
    return;
  end if;

  select * into matched_email
  from public.beta_access_list b
  where b.normalized_email = public.normalize_beta_email(email_value)
  order by b.created_at asc
  limit 1;

  if matched_email.id is not null then
    access_status := matched_email.access_status_to_grant;
    system_role := matched_email.system_role_to_grant;
    approved_by := matched_email.created_by;
    return next;
    return;
  end if;

  select * into matched_name
  from public.beta_access_list b
  where b.normalized_full_name = public.normalize_beta_full_name(full_name_value)
  order by b.created_at asc
  limit 1;

  if matched_name.id is not null then
    access_status := matched_name.access_status_to_grant;
    system_role := 'user';
    approved_by := matched_name.created_by;
    return next;
    return;
  end if;

  access_status := 'pending';
  system_role := 'user';
  approved_by := null;
  return next;
end;
$$;

create or replace function public.sync_access_profile_for_user(target_user_id uuid)
returns public.user_access_profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user auth.users%rowtype;
  metadata_name text;
  resolved record;
  existing public.user_access_profiles%rowtype;
  next_status text;
  next_role text;
  next_approved_by uuid;
  next_approved_at timestamptz;
  synced public.user_access_profiles%rowtype;
begin
  select * into target_user from auth.users where id = target_user_id;
  if target_user.id is null then
    raise exception 'User not found';
  end if;

  metadata_name := coalesce(
    target_user.raw_user_meta_data->>'full_name',
    target_user.raw_user_meta_data->>'display_name',
    target_user.raw_user_meta_data->>'name'
  );

  select * into resolved from public.resolve_beta_access(target_user.email, metadata_name) limit 1;
  select * into existing from public.user_access_profiles where user_id = target_user.id;

  next_status := coalesce(existing.access_status, resolved.access_status, 'pending');
  next_role := coalesce(existing.system_role, resolved.system_role, 'user');
  next_approved_by := existing.approved_by;
  next_approved_at := existing.approved_at;

  if public.is_protected_owner_email(target_user.email) then
    next_status := 'approved';
    next_role := 'owner';
    next_approved_by := null;
    next_approved_at := coalesce(existing.approved_at, now());
  elsif existing.user_id is null or existing.access_status = 'pending' then
    next_status := coalesce(resolved.access_status, 'pending');
    next_role := coalesce(resolved.system_role, 'user');
    next_approved_by := resolved.approved_by;
    if next_status = 'approved' then
      next_approved_at := coalesce(existing.approved_at, now());
    else
      next_approved_at := null;
      next_approved_by := null;
    end if;
  end if;

  insert into public.user_access_profiles (
    user_id,
    email,
    full_name,
    access_status,
    system_role,
    account_type,
    approved_at,
    approved_by
  ) values (
    target_user.id,
    public.normalize_beta_email(target_user.email),
    nullif(trim(metadata_name), ''),
    next_status,
    next_role,
    'personal',
    next_approved_at,
    next_approved_by
  )
  on conflict (user_id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.user_access_profiles.full_name),
    access_status = excluded.access_status,
    system_role = excluded.system_role,
    account_type = 'personal',
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by
  returning * into synced;

  return synced;
end;
$$;

create or replace function public.sync_my_access_profile()
returns public.user_access_profiles
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return public.sync_access_profile_for_user(auth.uid());
end;
$$;

create or replace function public.handle_auth_user_access_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.sync_access_profile_for_user(new.id);
  return new;
end;
$$;

drop trigger if exists auth_users_access_profile_after_insert on auth.users;
create trigger auth_users_access_profile_after_insert
  after insert on auth.users
  for each row
  execute function public.handle_auth_user_access_profile();

drop trigger if exists auth_users_access_profile_after_update on auth.users;
create trigger auth_users_access_profile_after_update
  after update of email, raw_user_meta_data on auth.users
  for each row
  execute function public.handle_auth_user_access_profile();

create or replace function public.admin_update_user_access(target_user_id uuid, new_access_status text, new_system_role text default null)
returns public.user_access_profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing public.user_access_profiles%rowtype;
  next_role text;
  updated_profile public.user_access_profiles%rowtype;
  removes_owner_access boolean;
  remaining_approved_owners integer;
begin
  if not public.is_access_admin() then
    raise exception 'Not authorized';
  end if;

  if new_access_status not in ('pending', 'approved', 'rejected', 'revoked') then
    raise exception 'Invalid access status';
  end if;

  perform public.sync_access_profile_for_user(target_user_id);
  select * into existing from public.user_access_profiles where user_id = target_user_id;

  if existing.user_id is null then
    raise exception 'User access profile not found';
  end if;

  next_role := coalesce(new_system_role, existing.system_role, 'user');
  if next_role not in ('owner', 'admin', 'user') then
    raise exception 'Invalid system role';
  end if;

  removes_owner_access := existing.access_status = 'approved'
    and existing.system_role = 'owner'
    and (new_access_status <> 'approved' or next_role <> 'owner');

  if public.is_protected_owner_email(existing.email) and removes_owner_access then
    raise exception 'Protected owner access cannot be downgraded or revoked';
  end if;

  if target_user_id = auth.uid() and removes_owner_access then
    raise exception 'You cannot revoke your own owner access';
  end if;

  if removes_owner_access then
    select count(*) into remaining_approved_owners
    from public.user_access_profiles p
    where p.user_id <> target_user_id
      and p.access_status = 'approved'
      and p.system_role = 'owner';

    if coalesce(remaining_approved_owners, 0) = 0 then
      raise exception 'Cannot remove the last approved owner';
    end if;
  end if;

  if public.is_protected_owner_email(existing.email) then
    new_access_status := 'approved';
    next_role := 'owner';
  end if;

  update public.user_access_profiles
  set access_status = new_access_status,
      system_role = next_role,
      account_type = 'personal',
      approved_at = case when new_access_status = 'approved' then coalesce(approved_at, now()) else null end,
      approved_by = case when new_access_status = 'approved' then auth.uid() else null end
  where user_id = target_user_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

alter table public.user_access_profiles enable row level security;
alter table public.beta_access_list enable row level security;

drop policy if exists "user_access_profiles_select_own" on public.user_access_profiles;
create policy "user_access_profiles_select_own" on public.user_access_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "user_access_profiles_admin_select" on public.user_access_profiles;
create policy "user_access_profiles_admin_select" on public.user_access_profiles
  for select using (public.is_access_admin());

drop policy if exists "user_access_profiles_admin_update" on public.user_access_profiles;
create policy "user_access_profiles_admin_update" on public.user_access_profiles
  for update using (public.is_access_admin()) with check (public.is_access_admin());

drop policy if exists "beta_access_list_admin_select" on public.beta_access_list;
create policy "beta_access_list_admin_select" on public.beta_access_list
  for select using (public.is_access_admin());

drop policy if exists "beta_access_list_admin_insert" on public.beta_access_list;
create policy "beta_access_list_admin_insert" on public.beta_access_list
  for insert with check (public.is_access_admin());

drop policy if exists "beta_access_list_admin_update" on public.beta_access_list;
create policy "beta_access_list_admin_update" on public.beta_access_list
  for update using (public.is_access_admin()) with check (public.is_access_admin());

drop policy if exists "beta_access_list_admin_delete" on public.beta_access_list;
create policy "beta_access_list_admin_delete" on public.beta_access_list
  for delete using (public.is_access_admin());

insert into public.beta_access_list (email, full_name, access_status_to_grant, system_role_to_grant, note)
values
  ('noenlunde85@gmail.com', null, 'approved', 'owner', 'Protected owner account'),
  ('torbjorn.lunde@icloud.com', null, 'approved', 'owner', 'Protected owner account'),
  ('noenlunde@hotmail.com', null, 'approved', 'owner', 'Protected owner account')
on conflict (normalized_email) where normalized_email is not null do update set
  access_status_to_grant = 'approved',
  system_role_to_grant = 'owner',
  note = excluded.note;

insert into public.user_access_profiles (user_id, email, full_name, access_status, system_role, account_type, approved_at)
select
  u.id,
  public.normalize_beta_email(u.email),
  nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'name')), ''),
  case when public.is_protected_owner_email(u.email) then 'approved' else coalesce((select r.access_status from public.resolve_beta_access(u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'name')) r limit 1), 'pending') end,
  case when public.is_protected_owner_email(u.email) then 'owner' else coalesce((select r.system_role from public.resolve_beta_access(u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'name')) r limit 1), 'user') end,
  'personal',
  case when public.is_protected_owner_email(u.email) or coalesce((select r.access_status from public.resolve_beta_access(u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'name')) r limit 1), 'pending') = 'approved' then now() else null end
from auth.users u
on conflict (user_id) do update set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, public.user_access_profiles.full_name),
  access_status = case when public.is_protected_owner_email(excluded.email) then 'approved' else public.user_access_profiles.access_status end,
  system_role = case when public.is_protected_owner_email(excluded.email) then 'owner' else public.user_access_profiles.system_role end,
  account_type = 'personal',
  approved_at = case when public.is_protected_owner_email(excluded.email) then coalesce(public.user_access_profiles.approved_at, now()) else public.user_access_profiles.approved_at end;

create or replace function public.has_approved_access(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_email text;
  approved boolean;
begin
  if target_user_id is null then
    return false;
  end if;

  select u.email into target_email from auth.users u where u.id = target_user_id;
  if public.is_protected_owner_email(target_email) then
    return true;
  end if;

  select exists(
    select 1
    from public.user_access_profiles p
    where p.user_id = target_user_id
      and p.access_status = 'approved'
  ) into approved;

  return coalesce(approved, false);
end;
$$;

-- Re-scope app data RLS so authenticated but unapproved beta users cannot use app data APIs directly.
drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own" on public.sessions for select using (auth.uid() = user_id and public.has_approved_access(auth.uid()));
drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own" on public.sessions for insert with check (auth.uid() = user_id and public.has_approved_access(auth.uid()));
drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own" on public.sessions for update using (auth.uid() = user_id and public.has_approved_access(auth.uid())) with check (auth.uid() = user_id and public.has_approved_access(auth.uid()));
drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own" on public.sessions for delete using (auth.uid() = user_id and public.has_approved_access(auth.uid()));

drop policy if exists "session_courses_select_own" on public.session_courses;
create policy "session_courses_select_own" on public.session_courses for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_courses.session_id and s.user_id = auth.uid()));
drop policy if exists "session_courses_insert_own" on public.session_courses;
create policy "session_courses_insert_own" on public.session_courses for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_courses.session_id and s.user_id = auth.uid()));
drop policy if exists "session_courses_update_own" on public.session_courses;
create policy "session_courses_update_own" on public.session_courses for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_courses.session_id and s.user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_courses.session_id and s.user_id = auth.uid()));
drop policy if exists "session_courses_delete_own" on public.session_courses;
create policy "session_courses_delete_own" on public.session_courses for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_courses.session_id and s.user_id = auth.uid()));

drop policy if exists "misses_select_own" on public.misses;
create policy "misses_select_own" on public.misses for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = misses.session_id and s.user_id = auth.uid()));
drop policy if exists "misses_insert_own" on public.misses;
create policy "misses_insert_own" on public.misses for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = misses.session_id and s.user_id = auth.uid()));
drop policy if exists "misses_update_own" on public.misses;
create policy "misses_update_own" on public.misses for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = misses.session_id and s.user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = misses.session_id and s.user_id = auth.uid()));
drop policy if exists "misses_delete_own" on public.misses;
create policy "misses_delete_own" on public.misses for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = misses.session_id and s.user_id = auth.uid()));

drop policy if exists "target_definitions_select_own" on public.session_target_definitions;
create policy "target_definitions_select_own" on public.session_target_definitions for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_target_definitions.session_id and s.user_id = auth.uid()));
drop policy if exists "target_definitions_insert_own" on public.session_target_definitions;
create policy "target_definitions_insert_own" on public.session_target_definitions for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_target_definitions.session_id and s.user_id = auth.uid()));
drop policy if exists "target_definitions_update_own" on public.session_target_definitions;
create policy "target_definitions_update_own" on public.session_target_definitions for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_target_definitions.session_id and s.user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_target_definitions.session_id and s.user_id = auth.uid()));
drop policy if exists "target_definitions_delete_own" on public.session_target_definitions;
create policy "target_definitions_delete_own" on public.session_target_definitions for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_target_definitions.session_id and s.user_id = auth.uid()));

drop policy if exists "course_overrides_select_own" on public.session_course_overrides;
create policy "course_overrides_select_own" on public.session_course_overrides for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_course_overrides.session_id and s.user_id = auth.uid()));
drop policy if exists "course_overrides_insert_own" on public.session_course_overrides;
create policy "course_overrides_insert_own" on public.session_course_overrides for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_course_overrides.session_id and s.user_id = auth.uid()));
drop policy if exists "course_overrides_update_own" on public.session_course_overrides;
create policy "course_overrides_update_own" on public.session_course_overrides for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_course_overrides.session_id and s.user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_course_overrides.session_id and s.user_id = auth.uid()));
drop policy if exists "course_overrides_delete_own" on public.session_course_overrides;
create policy "course_overrides_delete_own" on public.session_course_overrides for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id = session_course_overrides.session_id and s.user_id = auth.uid()));

drop policy if exists "fitasc_compak_schemes_insert_authenticated_mvp" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_insert_authenticated_mvp" on public.fitasc_compak_schemes for insert to authenticated with check (public.has_approved_access(auth.uid()));
drop policy if exists "fitasc_compak_schemes_update_authenticated_mvp" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_update_authenticated_mvp" on public.fitasc_compak_schemes for update to authenticated using (public.has_approved_access(auth.uid())) with check (public.has_approved_access(auth.uid()));
drop policy if exists "fitasc_compak_schemes_delete_authenticated_mvp" on public.fitasc_compak_schemes;
create policy "fitasc_compak_schemes_delete_authenticated_mvp" on public.fitasc_compak_schemes for delete to authenticated using (public.has_approved_access(auth.uid()));

drop policy if exists "training_score_sheets_select_own" on public.training_score_sheets;
create policy "training_score_sheets_select_own" on public.training_score_sheets for select using (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()));
drop policy if exists "training_score_sheets_insert_own" on public.training_score_sheets;
create policy "training_score_sheets_insert_own" on public.training_score_sheets for insert with check (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()));
drop policy if exists "training_score_sheets_update_own" on public.training_score_sheets;
create policy "training_score_sheets_update_own" on public.training_score_sheets for update using (auth.uid() = owner_user_id and public.has_approved_access(auth.uid())) with check (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()));
drop policy if exists "training_score_sheets_delete_own" on public.training_score_sheets;
create policy "training_score_sheets_delete_own" on public.training_score_sheets for delete using (auth.uid() = owner_user_id and public.has_approved_access(auth.uid()));

drop policy if exists "training_score_sheet_shooters_select_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_select_own" on public.training_score_sheet_shooters for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_insert_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_insert_own" on public.training_score_sheet_shooters for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_update_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_update_own" on public.training_score_sheet_shooters for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_delete_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_delete_own" on public.training_score_sheet_shooters for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));

drop policy if exists "training_score_sheet_scores_select_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_select_own" on public.training_score_sheet_scores for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_insert_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_insert_own" on public.training_score_sheet_scores for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_update_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_update_own" on public.training_score_sheet_scores for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_delete_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_delete_own" on public.training_score_sheet_scores for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));

drop policy if exists "training_score_sheet_target_results_select_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_select_own" on public.training_score_sheet_target_results for select using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_insert_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_insert_own" on public.training_score_sheet_target_results for insert with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_update_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_update_own" on public.training_score_sheet_target_results for update using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid())) with check (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_delete_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_delete_own" on public.training_score_sheet_target_results for delete using (public.has_approved_access(auth.uid()) and exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
