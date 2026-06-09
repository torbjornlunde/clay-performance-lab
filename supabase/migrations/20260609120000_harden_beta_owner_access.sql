-- Harden closed beta owner protections and remove the misspelled owner email.

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

-- Remove the misspelled email from automatic owner/pre-approval handling.
delete from public.beta_access_list
where normalized_email = 'noelunde@hotmail.com'
   or public.normalize_beta_email(email) = 'noelunde@hotmail.com';

-- Existing profiles for the misspelled email may stay approved, but must no longer be owner/protected.
update public.user_access_profiles
set system_role = 'user',
    account_type = 'personal'
where public.normalize_beta_email(email) = 'noelunde@hotmail.com'
  and system_role = 'owner';

-- Re-assert the correct protected owner pre-approvals without touching other access-list rows.
insert into public.beta_access_list (email, full_name, access_status_to_grant, system_role_to_grant, note)
values
  ('noenlunde85@gmail.com', null, 'approved', 'owner', 'Protected owner account'),
  ('torbjorn.lunde@icloud.com', null, 'approved', 'owner', 'Protected owner account'),
  ('noenlunde@hotmail.com', null, 'approved', 'owner', 'Protected owner account')
on conflict (normalized_email) where normalized_email is not null do update set
  access_status_to_grant = 'approved',
  system_role_to_grant = 'owner',
  note = excluded.note;

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
