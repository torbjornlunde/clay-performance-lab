-- Closed beta interest submissions for public waitlist follow-up.
create or replace function public.normalize_beta_email(value text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(value)), '');
$$;

create table if not exists public.beta_interest_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  normalized_email text generated always as (public.normalize_beta_email(email)) stored,
  country text not null,
  main_discipline text not null,
  level_comment text,
  instagram_handle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_interest_submissions_email_required check (public.normalize_beta_email(email) is not null),
  constraint beta_interest_submissions_name_required check (nullif(trim(name), '') is not null),
  constraint beta_interest_submissions_country_required check (nullif(trim(country), '') is not null),
  constraint beta_interest_submissions_main_discipline_check check (main_discipline in ('Sporting', 'Compak Sporting', 'FITASC Sporting', 'Skeet', 'Trap', 'Other'))
);

create unique index if not exists beta_interest_submissions_normalized_email_unique_idx
  on public.beta_interest_submissions(normalized_email);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists beta_interest_submissions_set_updated_at on public.beta_interest_submissions;
create trigger beta_interest_submissions_set_updated_at
  before update on public.beta_interest_submissions
  for each row execute function public.set_updated_at();

alter table public.beta_interest_submissions enable row level security;

drop policy if exists "beta_interest_submissions_admin_select" on public.beta_interest_submissions;
create policy "beta_interest_submissions_admin_select" on public.beta_interest_submissions
  for select using (public.is_access_admin());

drop policy if exists "beta_interest_submissions_admin_update" on public.beta_interest_submissions;
create policy "beta_interest_submissions_admin_update" on public.beta_interest_submissions
  for update using (public.is_access_admin()) with check (public.is_access_admin());

comment on table public.beta_interest_submissions is 'Closed beta interest submissions. Does not create accounts or grant app access.';
