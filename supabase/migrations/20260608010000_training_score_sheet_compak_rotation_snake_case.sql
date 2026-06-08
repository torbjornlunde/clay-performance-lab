update public.training_score_sheets
set compak_rotation_mode = case compak_rotation_mode
  when 'Waiting shooter' then 'waiting_shooter'
  when 'Continuous rotation' then 'continuous_rotation'
  else compak_rotation_mode
end
where compak_rotation_mode in ('Waiting shooter', 'Continuous rotation');

alter table public.training_score_sheets
  drop constraint if exists training_score_sheets_compak_rotation_mode_check;

alter table public.training_score_sheets
  add constraint training_score_sheets_compak_rotation_mode_check
  check (compak_rotation_mode is null or compak_rotation_mode in ('waiting_shooter', 'continuous_rotation'));

comment on column public.training_score_sheets.compak_rotation_mode is
  'Compak Sporting training flow for extra/waiting shooters. Allowed values: waiting_shooter, continuous_rotation. Null for non-Compak sheets.';
