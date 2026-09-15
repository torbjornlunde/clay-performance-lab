-- Executable RLS and source-freshness regression for reviewable reflection evidence.
-- Run with pgTAP available against a disposable database with all migrations applied.
begin;

insert into auth.users (id, email) values
  ('28500000-0000-4000-8000-000000000001', 'issue285-owner@example.test'),
  ('28500000-0000-4000-8000-000000000002', 'issue285-other@example.test');

update public.user_access_profiles
set access_status = 'approved', system_role = 'user', approved_at = now()
where user_id in (
  '28500000-0000-4000-8000-000000000001',
  '28500000-0000-4000-8000-000000000002'
);

insert into public.sessions (id, user_id, name, discipline, session_type)
values ('28500000-0000-4000-8000-000000000010', '28500000-0000-4000-8000-000000000001', 'Issue 285 competition', 'Sporting', 'Competition');

insert into public.private_session_notes (id, user_id, session_id, note_scope, body, updated_at)
values (
  '28500000-0000-4000-8000-000000000020',
  '28500000-0000-4000-8000-000000000001',
  '28500000-0000-4000-8000-000000000010',
  'session', 'I felt tired late.', '2026-09-15 12:00:00+00'
);

insert into public.private_reflection_evidence
  (id, user_id, session_id, source_note_id, source_note_updated_at, category, normalized_value, label, evidence_basis, confidence)
values (
  '28500000-0000-4000-8000-000000000030',
  '28500000-0000-4000-8000-000000000001',
  '28500000-0000-4000-8000-000000000010',
  '28500000-0000-4000-8000-000000000020',
  '2026-09-15 12:00:00+00', 'physical_state', 'fatigue_late', 'Feeling tired late', 'self_report', 'high'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"28500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from public.private_reflection_evidence) <> 1 then
    raise exception 'owner could not read reflection evidence';
  end if;
  update public.private_reflection_evidence
  set label = 'I felt tired late', review_status = 'accepted'
  where id = '28500000-0000-4000-8000-000000000030';
  if not exists (select 1 from public.private_reflection_evidence where review_status = 'accepted' and label = 'I felt tired late') then
    raise exception 'owner could not edit and accept current evidence';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"28500000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.private_reflection_evidence) then
    raise exception 'non-owner could read reflection evidence';
  end if;
end $$;

reset role;
update public.private_session_notes set body = 'Corrected reflection.' where id = '28500000-0000-4000-8000-000000000020';
update public.private_reflection_evidence set review_status = 'pending' where id = '28500000-0000-4000-8000-000000000030';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"28500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$ begin
  begin
    update public.private_reflection_evidence set review_status = 'accepted'
    where id = '28500000-0000-4000-8000-000000000030';
    raise exception 'stale evidence was accepted';
  exception when others then
    if sqlerrm = 'stale evidence was accepted' then raise; end if;
    if sqlerrm not like '%Reflection evidence is stale%' then raise; end if;
  end;
  update public.private_reflection_evidence set review_status = 'rejected'
  where id = '28500000-0000-4000-8000-000000000030';
  if not exists (select 1 from public.private_reflection_evidence where review_status = 'rejected') then
    raise exception 'owner could not reject evidence';
  end if;
end $$;

rollback;
