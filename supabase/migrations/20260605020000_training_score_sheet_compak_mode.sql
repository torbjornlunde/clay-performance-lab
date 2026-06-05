alter table public.training_score_sheets
  add column if not exists compak_shooting_mode text;

alter table public.training_score_sheets
  drop constraint if exists training_score_sheets_compak_shooting_mode_check;

alter table public.training_score_sheets
  add constraint training_score_sheets_compak_shooting_mode_check
  check (compak_shooting_mode is null or compak_shooting_mode in ('Squad', 'Inline'));

comment on column public.training_score_sheets.compak_shooting_mode is
  'Compak Sporting training live scoring order mode. Squad rotates all shooters through each scheme sequence; Inline is a basic per-shooter sequence flow.';
