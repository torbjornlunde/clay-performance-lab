alter table public.training_score_sheets
  add column if not exists compak_scheme_id text;

comment on column public.training_score_sheets.compak_scheme_id is
  'Selected Compak/FITASC scheme number for Compak Sporting training score sheets. Stored as text for forward compatibility with non-numeric program ids.';
