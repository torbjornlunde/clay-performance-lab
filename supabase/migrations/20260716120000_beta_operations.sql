-- Beta operations: interest approvals and internal beta feedback.

alter table public.beta_interest_submissions
  add column if not exists admin_status text not null default 'new',
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by uuid references auth.users(id) on delete set null,
  add column if not exists access_list_entry_id uuid references public.beta_access_list(id) on delete set null,
  add column if not exists admin_note text,
  add column if not exists approval_email_sent_at timestamptz,
  add column if not exists approval_email_error text;

alter table public.beta_interest_submissions
  drop constraint if exists beta_interest_submissions_admin_status_check;
alter table public.beta_interest_submissions
  add constraint beta_interest_submissions_admin_status_check
  check (admin_status in ('new', 'pre_approved', 'approved_existing_user', 'contacted', 'rejected'));

create index if not exists beta_interest_submissions_admin_status_idx
  on public.beta_interest_submissions(admin_status, created_at desc);

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  feedback_type text not null,
  severity text not null default 'Normal',
  message text not null,
  page_path text,
  user_agent text,
  app_context jsonb not null default '{}'::jsonb,
  admin_status text not null default 'new',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_feedback_type_check check (feedback_type in ('Bug', 'Feature request', 'Confusing flow', 'Data/import problem', 'Other')),
  constraint beta_feedback_severity_check check (severity in ('Low', 'Normal', 'High', 'Blocker')),
  constraint beta_feedback_admin_status_check check (admin_status in ('new', 'reviewed', 'resolved')),
  constraint beta_feedback_message_required check (length(trim(message)) between 1 and 4000)
);

create index if not exists beta_feedback_created_at_idx on public.beta_feedback(created_at desc);
create index if not exists beta_feedback_admin_status_idx on public.beta_feedback(admin_status, created_at desc);

drop trigger if exists beta_feedback_set_updated_at on public.beta_feedback;
create trigger beta_feedback_set_updated_at
  before update on public.beta_feedback
  for each row execute function public.set_updated_at();

alter table public.beta_feedback enable row level security;

drop policy if exists "beta_feedback_insert_own" on public.beta_feedback;
create policy "beta_feedback_insert_own" on public.beta_feedback
  for insert to authenticated
  with check (auth.uid() = user_id and length(trim(message)) between 1 and 4000);

drop policy if exists "beta_feedback_select_own" on public.beta_feedback;
create policy "beta_feedback_select_own" on public.beta_feedback
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "beta_feedback_admin_select" on public.beta_feedback;
create policy "beta_feedback_admin_select" on public.beta_feedback
  for select using (public.is_access_admin());

drop policy if exists "beta_feedback_admin_update" on public.beta_feedback;
create policy "beta_feedback_admin_update" on public.beta_feedback
  for update using (public.is_access_admin()) with check (public.is_access_admin());

create or replace function public.admin_preapprove_beta_interest(target_interest_id uuid, admin_note_value text default null)
returns public.beta_interest_submissions
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  interest public.beta_interest_submissions%rowtype;
  existing_profile public.user_access_profiles%rowtype;
  entry public.beta_access_list%rowtype;
  note_text text;
begin
  if not public.is_access_admin() then
    raise exception 'Owner/admin access required.';
  end if;

  select * into interest from public.beta_interest_submissions where id = target_interest_id for update;
  if not found then
    raise exception 'Beta interest submission not found.';
  end if;

  select * into existing_profile
  from public.user_access_profiles
  where public.normalize_beta_email(email) = interest.normalized_email
  order by created_at asc
  limit 1;

  if found then
    perform public.admin_update_user_access(existing_profile.user_id, 'approved', 'user');
    update public.beta_interest_submissions
      set admin_status = 'approved_existing_user',
          handled_at = now(),
          handled_by = auth.uid(),
          admin_note = nullif(trim(admin_note_value), '')
      where id = interest.id
      returning * into interest;
    return interest;
  end if;

  note_text := concat_ws(E'\n',
    'Pre-approved from beta interest submission.',
    'Country: ' || interest.country,
    'Main discipline: ' || interest.main_discipline,
    case when nullif(trim(coalesce(interest.instagram_handle, '')), '') is not null then 'Instagram: ' || interest.instagram_handle end,
    case when nullif(trim(coalesce(interest.level_comment, '')), '') is not null then 'Comment: ' || interest.level_comment end,
    case when nullif(trim(coalesce(admin_note_value, '')), '') is not null then 'Admin note: ' || admin_note_value end
  );

  insert into public.beta_access_list (email, full_name, access_status_to_grant, system_role_to_grant, note, created_by)
  values (interest.email, interest.name, 'approved', 'user', note_text, auth.uid())
  on conflict (normalized_email) where normalized_email is not null do update
    set full_name = coalesce(excluded.full_name, public.beta_access_list.full_name),
        access_status_to_grant = 'approved',
        system_role_to_grant = 'user',
        note = excluded.note,
        created_by = coalesce(public.beta_access_list.created_by, excluded.created_by)
  returning * into entry;

  update public.beta_interest_submissions
    set admin_status = 'pre_approved',
        handled_at = now(),
        handled_by = auth.uid(),
        access_list_entry_id = entry.id,
        admin_note = nullif(trim(admin_note_value), '')
    where id = interest.id
    returning * into interest;

  return interest;
end;
$$;

comment on table public.beta_feedback is 'Internal closed beta feedback submitted from the app.';
comment on function public.admin_preapprove_beta_interest(uuid, text) is 'Approves existing users or pre-approves interest submitters as regular beta users only.';
