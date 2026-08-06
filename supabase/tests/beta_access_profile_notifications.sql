-- Production-like regression test for 20260806090000_notify_beta_access_profile_requests.sql.
-- Run against a disposable database with all repository migrations applied.
begin;

do $$
declare
  test_admin constant uuid := '24400000-0000-4000-8000-000000000001';
  second_admin constant uuid := '24400000-0000-4000-8000-000000000008';
  direct_user constant uuid := '24400000-0000-4000-8000-000000000002';
  approved_user constant uuid := '24400000-0000-4000-8000-000000000003';
  owner_user constant uuid := '24400000-0000-4000-8000-000000000004';
  interest_first_user constant uuid := '24400000-0000-4000-8000-000000000005';
  account_first_user constant uuid := '24400000-0000-4000-8000-000000000006';
  failure_user constant uuid := '24400000-0000-4000-8000-000000000007';
  legacy_unnotified_user constant uuid := '24400000-0000-4000-8000-000000000009';
  legacy_covered_user constant uuid := '24400000-0000-4000-8000-000000000010';
  interest_id uuid;
  legacy_interest_id uuid;
  feedback_id uuid;
  direct_notification_id uuid;
  before_count integer;
  after_count integer;
begin
  insert into auth.users (id, email) values
    (test_admin, 'issue244-admin@example.test'),
    (second_admin, 'issue244-second-admin@example.test'),
    (direct_user, 'issue244-direct@example.test'),
    (approved_user, 'issue244-approved@example.test'),
    (owner_user, 'issue244-owner@example.test'),
    (interest_first_user, 'issue244-interest-first@example.test'),
    (account_first_user, 'issue244-account-first@example.test'),
    (failure_user, 'issue244-failure@example.test'),
    (legacy_unnotified_user, 'issue244-legacy-unnotified@example.test'),
    (legacy_covered_user, 'issue244-legacy-covered@example.test');

  update public.user_access_profiles
  set access_status = 'approved', system_role = 'admin', approved_at = now()
  where user_id in (test_admin, second_admin);

  -- Reinsert fixtures after the auth trigger so this test controls each INSERT.
  delete from public.user_notifications
  where metadata->>'normalized_email' like 'issue244-%@example.test';
  delete from public.user_access_profiles
  where user_id not in (test_admin, second_admin) and user_id in (
    direct_user, approved_user, owner_user, interest_first_user,
    account_first_user, failure_user, legacy_unnotified_user,
    legacy_covered_user
  );

  insert into public.user_access_profiles
    (user_id, email, access_status, system_role, account_type)
  values (direct_user, ' ISSUE244-DIRECT@example.test ', 'pending', 'user', 'personal');

  select id into direct_notification_id
  from public.user_notifications
  where user_id = test_admin
    and dedupe_key = 'beta-access-request:email:issue244-direct@example.test';
  if direct_notification_id is null then
    raise exception 'direct pending profile did not notify the approved admin';
  end if;
  if not exists (
    select 1 from public.web_push_delivery_jobs job
    where job.notification_id = direct_notification_id
  ) then
    raise exception 'existing Web Push trigger did not enqueue the notification';
  end if;
  if exists (
    select 1 from public.user_notifications
    where dedupe_key = 'beta-access-request:email:issue244-direct@example.test'
      and (notification_type <> 'beta_access_request' or href <> '/beta/admin')
  ) then
    raise exception 'notification type or safe internal href is incorrect';
  end if;
  if exists (
    select 1
    from public.user_access_profiles recipient
    where recipient.access_status = 'approved'
      and recipient.system_role in ('owner', 'admin')
      and not exists (
        select 1 from public.user_notifications notification
        where notification.user_id = recipient.user_id
          and notification.dedupe_key = 'beta-access-request:email:issue244-direct@example.test'
      )
  ) then
    raise exception 'direct request did not notify every approved owner/admin';
  end if;

  select count(*) into before_count from public.user_notifications
  where dedupe_key = 'beta-access-request:email:issue244-direct@example.test';
  update public.user_access_profiles set full_name = 'Unrelated edit'
  where user_id = direct_user;
  update public.user_access_profiles set email = lower(email)
  where user_id = direct_user;
  select count(*) into after_count from public.user_notifications
  where dedupe_key = 'beta-access-request:email:issue244-direct@example.test';
  if after_count <> before_count then
    raise exception 'pending profile updates created duplicate notifications';
  end if;

  insert into public.user_access_profiles
    (user_id, email, access_status, system_role, account_type, approved_at)
  values (approved_user, 'issue244-approved@example.test', 'approved', 'user', 'personal', now());
  insert into public.user_access_profiles
    (user_id, email, access_status, system_role, account_type, approved_at)
  values (owner_user, 'issue244-owner@example.test', 'approved', 'owner', 'personal', now());
  if exists (
    select 1 from public.user_notifications
    where metadata->>'user_access_profile_user_id' in (approved_user::text, owner_user::text)
  ) then
    raise exception 'approved or owner seed rows created request notifications';
  end if;

  insert into public.beta_interest_submissions
    (name, email, country, main_discipline)
  values ('Interest First', 'Issue244-Interest-First@example.test', 'Norway', 'Sporting')
  returning id into interest_id;
  insert into public.user_access_profiles
    (user_id, email, access_status, system_role, account_type)
  values (interest_first_user, 'issue244-interest-first@example.test', 'pending', 'user', 'personal');
  if (select count(*) from public.user_notifications
      where user_id = test_admin
        and dedupe_key = 'beta-access-request:email:issue244-interest-first@example.test') <> 1 then
    raise exception 'interest-first person produced duplicate or missing alert';
  end if;

  insert into public.user_access_profiles
    (user_id, email, access_status, system_role, account_type)
  values (account_first_user, 'issue244-account-first@example.test', 'pending', 'user', 'personal');
  insert into public.beta_interest_submissions
    (name, email, country, main_discipline)
  values ('Account First', 'ISSUE244-ACCOUNT-FIRST@example.test', 'Norway', 'Trap');
  if (select count(*) from public.user_notifications
      where user_id = test_admin
        and dedupe_key = 'beta-access-request:email:issue244-account-first@example.test') <> 1 then
    raise exception 'account-first person produced duplicate or missing alert';
  end if;

  -- A historical interest row is not notification coverage by itself.
  insert into public.beta_interest_submissions
    (name, email, country, main_discipline)
  values ('Legacy Unnotified', 'issue244-legacy-unnotified@example.test', 'Norway', 'Skeet')
  returning id into legacy_interest_id;
  delete from public.user_notifications
  where dedupe_key = 'beta-access-request:email:issue244-legacy-unnotified@example.test';

  insert into public.user_access_profiles
    (user_id, email, access_status, system_role, account_type)
  values (legacy_unnotified_user, 'issue244-legacy-unnotified@example.test', 'pending', 'user', 'personal');
  if exists (
    select 1
    from public.user_access_profiles recipient
    where recipient.access_status = 'approved'
      and recipient.system_role in ('owner', 'admin')
      and not exists (
        select 1 from public.user_notifications notification
        join public.web_push_delivery_jobs job on job.notification_id = notification.id
        where notification.user_id = recipient.user_id
          and notification.dedupe_key = 'beta-access-request:email:issue244-legacy-unnotified@example.test'
      )
  ) then
    raise exception 'legacy interest without notifications did not notify every admin';
  end if;

  -- Legacy row-id coverage suppresses only the recipient who actually has it.
  insert into public.beta_interest_submissions
    (name, email, country, main_discipline)
  values ('Legacy Covered', 'issue244-legacy-covered@example.test', 'Norway', 'Compak Sporting')
  returning id into legacy_interest_id;
  delete from public.user_notifications
  where dedupe_key = 'beta-access-request:email:issue244-legacy-covered@example.test';
  insert into public.user_notifications
    (user_id, notification_type, title, href, metadata, dedupe_key)
  values (
    test_admin,
    'beta_access_request',
    'New beta access request',
    '/beta/admin',
    jsonb_build_object('beta_interest_submission_id', legacy_interest_id),
    'beta-access-request:' || legacy_interest_id::text
  );

  insert into public.user_access_profiles
    (user_id, email, access_status, system_role, account_type)
  values (legacy_covered_user, 'issue244-legacy-covered@example.test', 'pending', 'user', 'personal');
  if (select count(*) from public.user_notifications
      where user_id = test_admin
        and notification_type = 'beta_access_request'
        and (
          dedupe_key = 'beta-access-request:' || legacy_interest_id::text
          or dedupe_key = 'beta-access-request:email:issue244-legacy-covered@example.test'
        )) <> 1 then
    raise exception 'admin with legacy coverage received a duplicate';
  end if;
  if not exists (
    select 1 from public.user_notifications
    where user_id = second_admin
      and dedupe_key = 'beta-access-request:email:issue244-legacy-covered@example.test'
  ) then
    raise exception 'missing admin did not receive canonical coverage';
  end if;

  insert into public.beta_feedback
    (user_id, email, feedback_type, message)
  values (direct_user, 'issue244-direct@example.test', 'Bug', 'Issue 244 regression')
  returning id into feedback_id;
  if not exists (
    select 1 from public.user_notifications
    where user_id = test_admin and dedupe_key = 'beta-feedback:' || feedback_id::text
  ) then
    raise exception 'beta feedback notifications changed';
  end if;

  -- Force the downstream queue path to fail and prove the profile INSERT survives.
  execute $ddl$
    create function public.issue244_reject_push_job() returns trigger
    language plpgsql as $body$ begin raise exception 'expected queue failure'; end $body$
  $ddl$;
  execute $ddl$
    create trigger issue244_reject_push_job before insert on public.web_push_delivery_jobs
    for each row execute function public.issue244_reject_push_job()
  $ddl$;

  insert into public.user_access_profiles
    (user_id, email, access_status, system_role, account_type)
  values (failure_user, 'issue244-failure@example.test', 'pending', 'user', 'personal');
  if not exists (select 1 from public.user_access_profiles where user_id = failure_user) then
    raise exception 'push failure blocked the access-profile write';
  end if;

  execute 'drop trigger issue244_reject_push_job on public.web_push_delivery_jobs';
  execute 'drop function public.issue244_reject_push_job()';
end;
$$;

rollback;
