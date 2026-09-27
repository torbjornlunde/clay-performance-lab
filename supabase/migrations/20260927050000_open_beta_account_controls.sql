-- Open beta: new verified signups get app access; existing account restrictions remain.
alter table public.user_access_profiles alter column access_status set default 'approved';
alter table public.user_access_profiles add column if not exists removed_at timestamptz;
alter table public.user_access_profiles drop constraint if exists user_access_profiles_access_status_check;
alter table public.user_access_profiles add constraint user_access_profiles_access_status_check
  check (access_status in ('pending', 'approved', 'paused', 'rejected', 'revoked', 'removed'));

-- Keep removed accounts from signing up again with the same email.
-- This contains hashes only and has no client access policies.
create table if not exists public.beta_blocked_emails (
  email_hash bytea primary key,
  created_at timestamptz not null default now()
);
alter table public.beta_blocked_emails enable row level security;
revoke all on public.beta_blocked_emails from anon, authenticated;
grant all on public.beta_blocked_emails to service_role;

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

  if exists (select 1 from public.beta_blocked_emails b
    where b.email_hash = extensions.digest(public.normalize_beta_email(email_value), 'sha256')) then
    access_status := 'revoked';
    system_role := 'user';
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

  access_status := 'approved';
  system_role := 'user';
  approved_by := null;
  return next;
end;
$$;

revoke all on function public.resolve_beta_access(text, text) from public, anon, authenticated;
grant execute on function public.resolve_beta_access(text, text) to service_role;

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

  next_status := coalesce(existing.access_status, resolved.access_status, 'approved');
  next_role := coalesce(existing.system_role, resolved.system_role, 'user');
  next_approved_by := existing.approved_by;
  next_approved_at := existing.approved_at;

  if public.is_protected_owner_email(target_user.email) then
    next_status := 'approved';
    next_role := 'owner';
    next_approved_by := null;
    next_approved_at := coalesce(existing.approved_at, now());
  elsif existing.user_id is null or existing.access_status = 'pending' then
    next_status := coalesce(resolved.access_status, 'approved');
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

  if new_access_status not in ('pending', 'approved', 'paused', 'rejected', 'revoked') then
    raise exception 'Invalid access status';
  end if;

  perform public.sync_access_profile_for_user(target_user_id);
  select * into existing from public.user_access_profiles where user_id = target_user_id;

  if existing.user_id is null then
    raise exception 'User access profile not found';
  end if;

  if existing.access_status = 'removed' then
    raise exception 'Removed accounts cannot be restored';
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


-- Pending users were waiting for a decision in the old closed beta. Only release
-- this group; never restore a rejected, revoked, or paused account.
update public.user_access_profiles set access_status = 'approved',
  approved_at = coalesce(approved_at, now()) where access_status = 'pending';

-- Do not let a direct table UPDATE bypass the protected admin RPC or its owner checks.
drop policy if exists "user_access_profiles_admin_update" on public.user_access_profiles;

-- The status gate reads the profile on each data request, so active sessions lose
-- app-data access immediately when paused or revoked.
