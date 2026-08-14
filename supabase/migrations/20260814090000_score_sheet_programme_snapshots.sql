-- Event-specific programme snapshots. JSONB keeps ordered menus and provenance
-- together on the existing optimistic-revision/lifecycle serialization row.
alter table public.training_score_sheets add column programme_snapshot jsonb;

alter table public.training_score_sheets add constraint training_score_sheets_programme_snapshot_shape check (
  programme_snapshot is null or (
    jsonb_typeof(programme_snapshot) = 'object' and
    programme_snapshot->>'schemaVersion' = '1' and
    jsonb_typeof(programme_snapshot->'areas') = 'array' and
    coalesce(programme_snapshot->>'snapshotId','') <> ''
  )
);

comment on column public.training_score_sheets.programme_snapshot is
  'Independent event programme snapshot with template provenance and ordered presentations; never resolved dynamically from current built-ins.';

create or replace function public.validate_competition_programme_on_finalize() returns trigger
language plpgsql set search_path=public as $$
begin
  -- Legacy competitions without a snapshot remain finalizable. Once a snapshot
  -- is attached, concrete presentations must be complete before it is authoritative.
  if new.session_type = 'competition' and new.competition_status = 'finalized' and
     old.competition_status is distinct from 'finalized' and new.programme_snapshot is not null and exists (
       select 1
       from jsonb_array_elements(new.programme_snapshot->'areas') area,
            jsonb_array_elements(area->'presentations') presentation
       where presentation->>'type' <> 'unknown' and (
         nullif(presentation->>'firstMachine','') is null or
         (presentation->>'type' in ('report_pair','simultaneous_pair') and nullif(presentation->>'secondMachine','') is null)
       )
     ) then
    raise exception using errcode='22023', message='Complete the event programme before finalizing.';
  end if;
  return new;
end $$;

create trigger competition_programme_finalize_guard before update on public.training_score_sheets
for each row execute function public.validate_competition_programme_on_finalize();
revoke execute on function public.validate_competition_programme_on_finalize() from public,anon,authenticated;
