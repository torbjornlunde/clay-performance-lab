begin;
select plan(4);
select has_column('public', 'private_session_notes', 'context_tags', 'context tags extend private_session_notes');
select col_default_is('public', 'private_session_notes', 'context_tags', '''{}''::text[]', 'old rows receive an empty array');
select policies_are('public', 'private_session_notes', array['private_session_notes_delete_own', 'private_session_notes_insert_own', 'private_session_notes_select_own', 'private_session_notes_update_own'], 'owner-only policies remain');
select is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'private_session_notes' and roles::text like '%anon%'), 0, 'anonymous users receive no context policy');
select * from finish();
rollback;
