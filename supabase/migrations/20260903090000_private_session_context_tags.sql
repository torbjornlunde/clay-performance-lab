alter table public.private_session_notes
  add column if not exists context_tags text[] not null default '{}';

alter table public.private_session_notes
  drop constraint if exists private_session_notes_context_tags_check;

alter table public.private_session_notes
  add constraint private_session_notes_context_tags_check check (
    note_scope = 'session'
    or cardinality(context_tags) = 0
  );

comment on column public.private_session_notes.context_tags is
  'Private user-selected competition context identifiers. Owner-only access continues to be enforced by the existing table RLS policies.';
