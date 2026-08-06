alter table public.session_courses
  add column if not exists compak_programme_type text,
  add column if not exists compak_conflict_resolution text;

alter table public.session_courses
  add constraint session_courses_compak_programme_type_check
  check (compak_programme_type is null or compak_programme_type in (
    'five_singles',
    'three_singles_one_report_pair',
    'three_singles_one_simultaneous_pair',
    'one_single_two_report_pairs',
    'one_single_two_simultaneous_pairs'
  )),
  add constraint session_courses_compak_conflict_resolution_check
  check (compak_conflict_resolution is null or compak_conflict_resolution in (
    'exact_authoritative',
    'remembered_discrepancy'
  )),
  add constraint session_courses_compak_resolution_has_sources_check
  check (compak_conflict_resolution is null or (fitasc_scheme is not null and compak_programme_type is not null));

comment on column public.session_courses.compak_programme_type is
  'Optional remembered Compak presentation pattern; it does not define machines, target order, or scores.';
comment on column public.session_courses.compak_conflict_resolution is
  'Explicit user choice when the remembered pattern differs from the selected exact FITASC scheme.';
