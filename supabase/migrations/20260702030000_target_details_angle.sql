alter table public.session_post_targets
  add column if not exists angle text;

comment on column public.session_post_targets.angle is
  'Optional normalized target angle category for post/stand based sporting target details. Null means not described.';

alter table public.session_target_definitions
  add column if not exists angle text;

comment on column public.session_target_definitions.angle is
  'Optional normalized target angle category for physical A-F machine target details. Null means not described.';
