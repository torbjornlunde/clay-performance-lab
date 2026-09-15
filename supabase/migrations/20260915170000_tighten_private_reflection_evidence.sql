-- Keep AI-proposed references structured and prevent duplicate proposals for one saved note version.
alter table public.private_reflection_evidence
  add constraint private_reflection_evidence_reference_format
  check (reference is null or reference ~* '^(post|stand|course) [1-9][0-9]?$') not valid;

create unique index if not exists private_reflection_evidence_note_version_proposal_unique
  on public.private_reflection_evidence
  (source_note_id, source_note_updated_at, category, normalized_value, label, evidence_basis, confidence, coalesce(reference, ''));
