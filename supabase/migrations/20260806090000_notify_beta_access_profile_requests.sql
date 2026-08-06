-- Notify access admins when a newly created account is genuinely pending review.
-- Both beta request sources use the combined approval inbox's normalized-email
-- identity so one person produces one actionable alert per recipient.

create or replace function public.beta_access_request_dedupe_key(
  email_value text,
  user_id_value uuid default null
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when public.normalize_beta_email(email_value) is not null
      then 'beta-access-request:email:' || public.normalize_beta_email(email_value)
    when user_id_value is not null
      then 'beta-access-request:user:' || user_id_value::text
    else null
  end;
$$;

create or replace function public.notify_admins_of_new_beta_interest()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  request_dedupe_key text;
begin
  request_dedupe_key := public.beta_access_request_dedupe_key(new.email);

  perform public.notify_access_admins(
    'beta_access_request',
    'New beta access request',
    'A new beta access request is ready for review.',
    '/beta/admin',
    jsonb_build_object(
      'beta_interest_submission_id', new.id,
      'normalized_email', public.normalize_beta_email(new.email)
    ),
    request_dedupe_key
  );
  return new;
exception when others then
  raise warning 'Could not notify access admins about beta interest %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_admins_of_new_access_profile_request()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_request_email text;
  request_dedupe_key text;
begin
  -- Auth signup is the supported request lifecycle: only a brand-new regular
  -- user's pending row is actionable. Approval and later profile edits are not.
  if new.access_status <> 'pending' or new.system_role <> 'user' then
    return new;
  end if;

  normalized_request_email := public.normalize_beta_email(new.email);
  request_dedupe_key := public.beta_access_request_dedupe_key(new.email, new.user_id);

  -- Coverage is checked per recipient. Historical interest rows can predate the
  -- notification foundation, so their existence alone is not proof of coverage.
  insert into public.user_notifications (
    user_id,
    notification_type,
    title,
    body,
    href,
    metadata,
    dedupe_key
  )
  select
    recipient.user_id,
    'beta_access_request',
    'New beta access request',
    'A new beta access request is ready for review.',
    '/beta/admin',
    jsonb_build_object(
      'user_access_profile_user_id', new.user_id,
      'normalized_email', normalized_request_email
    ),
    request_dedupe_key
  from public.user_access_profiles recipient
  where recipient.access_status = 'approved'
    and recipient.system_role in ('owner', 'admin')
    and not exists (
      select 1
      from public.user_notifications notification
      where notification.user_id = recipient.user_id
        and notification.notification_type = 'beta_access_request'
        and (
          notification.dedupe_key = request_dedupe_key
          or (
            normalized_request_email is not null
            and public.normalize_beta_email(notification.metadata->>'normalized_email') = normalized_request_email
          )
          or (
            normalized_request_email is not null
            and exists (
              select 1
              from public.beta_interest_submissions interest
              where interest.normalized_email = normalized_request_email
                and (
                  notification.metadata->>'beta_interest_submission_id' = interest.id::text
                  or notification.dedupe_key = 'beta-access-request:' || interest.id::text
                )
            )
          )
        )
    )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return new;
exception when others then
  -- Notification and downstream push-queue failures must never reject signup.
  raise warning 'Could not notify access admins about access profile %: %', new.user_id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists user_access_profiles_notify_admins on public.user_access_profiles;
create trigger user_access_profiles_notify_admins
  after insert on public.user_access_profiles
  for each row
  execute function public.notify_admins_of_new_access_profile_request();

revoke execute on function public.beta_access_request_dedupe_key(text, uuid) from public, anon, authenticated;
revoke execute on function public.notify_admins_of_new_access_profile_request() from public, anon, authenticated;
revoke execute on function public.notify_admins_of_new_beta_interest() from public, anon, authenticated;

comment on function public.notify_admins_of_new_access_profile_request() is
  'Creates best-effort admin notifications for new pending regular-user access profiles; Web Push is queued by the existing user_notifications trigger.';
