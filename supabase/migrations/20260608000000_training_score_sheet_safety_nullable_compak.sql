alter table public.training_score_sheets
  alter column compak_scheme_id drop not null,
  alter column compak_shooting_mode drop not null,
  alter column compak_rotation_mode drop not null;

comment on column public.training_score_sheets.compak_scheme_id is
  'Nullable Compak-only scheme/program id. Ordinary Leirduesti and Sporting training score sheets may leave this empty.';

comment on column public.training_score_sheets.compak_shooting_mode is
  'Nullable Compak-only live scoring order mode. Ordinary Leirduesti and Sporting training score sheets may leave this empty.';

comment on column public.training_score_sheets.compak_rotation_mode is
  'Nullable Compak-only training flow for extra/waiting shooters. Ordinary Leirduesti and Sporting training score sheets may leave this empty.';
