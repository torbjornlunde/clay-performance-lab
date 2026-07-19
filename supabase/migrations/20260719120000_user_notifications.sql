-- Private in-app notification foundation and first beta admin event notifications.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notifications_type_required check (nullif(trim(notification_type), '') is not null),
  constraint user_notifications_title_required check (nullif(trim(title), '') is not null),
  constraint user_notifications_internal_href_check check (href is null or (href like '/%' and href not like '//%'))
);

create index if not exists user_notifications_user_created_at_idx
  on public.user_notifications(user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications(user_id, created_at desc)
  where read_at is null;

create unique index if not exists user_notifications_user_dedupe_key_unique_idx
  on public.user_notifications(user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.user_notifications enable row level security;

create policy "user_notifications_select_own" on public.user_notifications
  for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.mark_my_notification_read(notification_id uuid)
returns public.user_notifications
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  updated_notification public.user_notifications%rowtype;
begin
  update public.user_notifications
    set read_at = coalesce(read_at, now())
    where id = notification_id
      and user_id = auth.uid()
    returning * into updated_notification;

  if not found then
    raise exception 'Notification not found.';
  end if;

  return updated_notification;
end;
$$;

create or replace function public.mark_all_my_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  updated_count integer;
begin
  update public.user_notifications
    set read_at = coalesce(read_at, now())
    where user_id = auth.uid()
      and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.notify_access_admins(
  notification_type text,
  notification_title text,
  notification_body text,
  notification_href text,
  notification_metadata jsonb,
  notification_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.user_notifications (user_id, notification_type, title, body, href, metadata, dedupe_key)
  select p.user_id, notification_type, notification_title, notification_body, notification_href, coalesce(notification_metadata, '{}'::jsonb), notification_dedupe_key
  from public.user_access_profiles p
  where p.access_status = 'approved'
    and p.system_role in ('owner', 'admin')
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
exception when others then
  raise warning 'Could not create access admin notifications: %', sqlerrm;
end;
$$;

create or replace function public.notify_admins_of_new_beta_interest()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.notify_access_admins(
    'beta_access_request',
    'New beta access request',
    'A new beta access request is ready for review.',
    '/beta/admin',
    jsonb_build_object('beta_interest_submission_id', new.id),
    'beta-access-request:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists beta_interest_submissions_notify_admins on public.beta_interest_submissions;
create trigger beta_interest_submissions_notify_admins
  after insert on public.beta_interest_submissions
  for each row execute function public.notify_admins_of_new_beta_interest();

create or replace function public.notify_admins_of_new_beta_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.notify_access_admins(
    'beta_feedback',
    'New beta feedback',
    'A new beta feedback submission is ready for review.',
    '/admin/feedback',
    jsonb_build_object('beta_feedback_id', new.id),
    'beta-feedback:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists beta_feedback_notify_admins on public.beta_feedback;
create trigger beta_feedback_notify_admins
  after insert on public.beta_feedback
  for each row execute function public.notify_admins_of_new_beta_feedback();

revoke execute on function public.notify_access_admins(text, text, text, text, jsonb, text) from public;
revoke execute on function public.notify_access_admins(text, text, text, text, jsonb, text) from anon;
revoke execute on function public.notify_access_admins(text, text, text, text, jsonb, text) from authenticated;

revoke execute on function public.notify_admins_of_new_beta_interest() from public;
revoke execute on function public.notify_admins_of_new_beta_interest() from anon;
revoke execute on function public.notify_admins_of_new_beta_interest() from authenticated;

revoke execute on function public.notify_admins_of_new_beta_feedback() from public;
revoke execute on function public.notify_admins_of_new_beta_feedback() from anon;
revoke execute on function public.notify_admins_of_new_beta_feedback() from authenticated;

revoke execute on function public.mark_my_notification_read(uuid) from public;
revoke execute on function public.mark_my_notification_read(uuid) from anon;
revoke execute on function public.mark_my_notification_read(uuid) from authenticated;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;

revoke execute on function public.mark_all_my_notifications_read() from public;
revoke execute on function public.mark_all_my_notifications_read() from anon;
revoke execute on function public.mark_all_my_notifications_read() from authenticated;
grant execute on function public.mark_all_my_notifications_read() to authenticated;

comment on table public.user_notifications is 'Private in-app notifications, one row per recipient. Push/device transport is intentionally out of scope.';
