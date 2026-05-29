-- Example/test data only. These rows are NOT a complete official FITASC A-F registry.
-- Replace machine labels, presentation values, verification flags, and source with verified scheme data before production use.

insert into public.fitasc_compak_schemes
  (scheme_number, plate_number, event_number, presentation, first_machine, second_machine, is_verified, source)
values
  (1, 1, 1, 'single', 'A', null, false, 'EXAMPLE TEST DATA - replace with verified source'),
  (1, 1, 2, 'single', 'B', null, false, 'EXAMPLE TEST DATA - replace with verified source'),
  (1, 1, 3, 'single', 'C', null, false, 'EXAMPLE TEST DATA - replace with verified source'),
  (1, 1, 4, 'single', 'D', null, false, 'EXAMPLE TEST DATA - replace with verified source'),
  (1, 1, 5, 'single', 'E', null, false, 'EXAMPLE TEST DATA - replace with verified source')
on conflict (scheme_number, plate_number, event_number) do update set
  presentation = excluded.presentation,
  first_machine = excluded.first_machine,
  second_machine = excluded.second_machine,
  is_verified = excluded.is_verified,
  source = excluded.source,
  updated_at = now();
