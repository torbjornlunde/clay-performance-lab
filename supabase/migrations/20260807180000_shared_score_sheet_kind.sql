-- Keep the proven training_score_sheets storage and ownership policies. Only
-- extend its explicit discriminator for the future shared competition engine.
alter table public.training_score_sheets
  drop constraint if exists training_score_sheets_session_type_check;

alter table public.training_score_sheets
  add constraint training_score_sheets_session_type_check
  check (session_type in ('training', 'shared_training', 'competition'));

comment on column public.training_score_sheets.session_type is
  'Explicit score-sheet kind: training, shared_training, or competition. Competition UI is not exposed by this migration.';
