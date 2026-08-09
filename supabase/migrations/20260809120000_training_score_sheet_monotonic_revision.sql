-- Ensure the score-sheet parent revision is a reliable optimistic-concurrency token.
create or replace function public.set_training_score_sheet_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := greatest(
    clock_timestamp(),
    old.updated_at + interval '1 microsecond'
  );
  return new;
end;
$$;

drop trigger if exists training_score_sheets_set_updated_at on public.training_score_sheets;
create trigger training_score_sheets_set_updated_at
  before update on public.training_score_sheets
  for each row
  execute function public.set_training_score_sheet_revision();

revoke execute on function public.set_training_score_sheet_revision() from public, anon, authenticated;
