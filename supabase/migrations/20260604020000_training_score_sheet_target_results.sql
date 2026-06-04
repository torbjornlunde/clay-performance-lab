create table if not exists public.training_score_sheet_target_results (
  id uuid primary key default gen_random_uuid(),
  score_sheet_id uuid not null references public.training_score_sheets(id) on delete cascade,
  shooter_id uuid not null references public.training_score_sheet_shooters(id) on delete cascade,
  post_number integer not null,
  target_number integer not null,
  result text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (score_sheet_id, shooter_id, post_number, target_number),
  constraint training_score_sheet_target_results_post_check check (post_number > 0),
  constraint training_score_sheet_target_results_target_check check (target_number > 0),
  constraint training_score_sheet_target_results_result_check check (result in ('hit', 'miss'))
);

create index if not exists training_score_sheet_target_results_sheet_shooter_post_idx
  on public.training_score_sheet_target_results(score_sheet_id, shooter_id, post_number, target_number);

drop trigger if exists training_score_sheet_target_results_set_updated_at on public.training_score_sheet_target_results;
create trigger training_score_sheet_target_results_set_updated_at
  before update on public.training_score_sheet_target_results
  for each row
  execute function public.set_updated_at();

alter table public.training_score_sheet_target_results enable row level security;

drop policy if exists "training_score_sheet_target_results_select_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_select_own" on public.training_score_sheet_target_results for select using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_insert_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_insert_own" on public.training_score_sheet_target_results for insert with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_update_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_update_own" on public.training_score_sheet_target_results for update using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid())) with check (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
drop policy if exists "training_score_sheet_target_results_delete_own" on public.training_score_sheet_target_results;
create policy "training_score_sheet_target_results_delete_own" on public.training_score_sheet_target_results for delete using (exists(select 1 from public.training_score_sheets s where s.id = training_score_sheet_target_results.score_sheet_id and s.owner_user_id = auth.uid()));
