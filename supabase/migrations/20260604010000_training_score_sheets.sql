create table if not exists public.training_score_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  session_date date not null,
  location text,
  discipline text not null,
  session_type text not null default 'training',
  number_of_posts integer not null,
  targets_per_post integer not null,
  total_targets integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_score_sheets_session_type_check check (session_type in ('training', 'shared_training')),
  constraint training_score_sheets_posts_check check (number_of_posts > 0),
  constraint training_score_sheets_targets_check check (targets_per_post > 0 and total_targets > 0)
);

create table if not exists public.training_score_sheet_shooters (
  id uuid primary key default gen_random_uuid(),
  score_sheet_id uuid not null references public.training_score_sheets(id) on delete cascade,
  shooter_name text not null,
  linked_user_id uuid references auth.users(id) on delete set null,
  display_order integer not null default 1,
  total_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_score_sheet_scores (
  id uuid primary key default gen_random_uuid(),
  score_sheet_id uuid not null references public.training_score_sheets(id) on delete cascade,
  shooter_id uuid not null references public.training_score_sheet_shooters(id) on delete cascade,
  post_number integer not null,
  score integer not null,
  max_score integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shooter_id, post_number),
  constraint training_score_sheet_scores_post_check check (post_number > 0),
  constraint training_score_sheet_scores_score_check check (score >= 0 and max_score > 0 and score <= max_score)
);

create index if not exists training_score_sheets_owner_date_idx on public.training_score_sheets(owner_user_id, session_date desc, created_at desc);
create index if not exists training_score_sheet_shooters_sheet_order_idx on public.training_score_sheet_shooters(score_sheet_id, display_order);
create index if not exists training_score_sheet_scores_sheet_shooter_idx on public.training_score_sheet_scores(score_sheet_id, shooter_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists training_score_sheets_set_updated_at on public.training_score_sheets;
create trigger training_score_sheets_set_updated_at
  before update on public.training_score_sheets
  for each row
  execute function public.set_updated_at();

drop trigger if exists training_score_sheet_shooters_set_updated_at on public.training_score_sheet_shooters;
create trigger training_score_sheet_shooters_set_updated_at
  before update on public.training_score_sheet_shooters
  for each row
  execute function public.set_updated_at();

drop trigger if exists training_score_sheet_scores_set_updated_at on public.training_score_sheet_scores;
create trigger training_score_sheet_scores_set_updated_at
  before update on public.training_score_sheet_scores
  for each row
  execute function public.set_updated_at();

alter table public.training_score_sheets enable row level security;
alter table public.training_score_sheet_shooters enable row level security;
alter table public.training_score_sheet_scores enable row level security;

drop policy if exists "training_score_sheets_select_own" on public.training_score_sheets;
create policy "training_score_sheets_select_own" on public.training_score_sheets for select using (auth.uid() = owner_user_id);
drop policy if exists "training_score_sheets_insert_own" on public.training_score_sheets;
create policy "training_score_sheets_insert_own" on public.training_score_sheets for insert with check (auth.uid() = owner_user_id);
drop policy if exists "training_score_sheets_update_own" on public.training_score_sheets;
create policy "training_score_sheets_update_own" on public.training_score_sheets for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists "training_score_sheets_delete_own" on public.training_score_sheets;
create policy "training_score_sheets_delete_own" on public.training_score_sheets for delete using (auth.uid() = owner_user_id);

drop policy if exists "training_score_sheet_shooters_select_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_select_own" on public.training_score_sheet_shooters for select using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_insert_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_insert_own" on public.training_score_sheet_shooters for insert with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_update_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_update_own" on public.training_score_sheet_shooters for update using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid())) with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_shooters_delete_own" on public.training_score_sheet_shooters;
create policy "training_score_sheet_shooters_delete_own" on public.training_score_sheet_shooters for delete using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_shooters.score_sheet_id and s.owner_user_id = auth.uid()));

drop policy if exists "training_score_sheet_scores_select_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_select_own" on public.training_score_sheet_scores for select using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_insert_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_insert_own" on public.training_score_sheet_scores for insert with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_update_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_update_own" on public.training_score_sheet_scores for update using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid())) with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_scores_delete_own" on public.training_score_sheet_scores;
create policy "training_score_sheet_scores_delete_own" on public.training_score_sheet_scores for delete using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_scores.score_sheet_id and s.owner_user_id = auth.uid()));
