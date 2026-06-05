alter table public.training_score_sheets
  add column if not exists compak_rotation_mode text;

alter table public.training_score_sheets
  drop constraint if exists training_score_sheets_compak_rotation_mode_check;

alter table public.training_score_sheets
  add constraint training_score_sheets_compak_rotation_mode_check
  check (compak_rotation_mode is null or compak_rotation_mode in ('Waiting shooter', 'Continuous rotation'));

comment on column public.training_score_sheets.compak_rotation_mode is
  'Compak Sporting training flow for extra/waiting shooters. Waiting shooter keeps order stable; Continuous rotation is stored for training flow handling.';
