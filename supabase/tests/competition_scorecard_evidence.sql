-- Run against a disposable database with all migrations applied.
begin;
do $$
declare
  owner_id constant uuid := '25700000-0000-4000-8000-000000000001';
  other_id constant uuid := '25700000-0000-4000-8000-000000000002';
  competition_id uuid;
  policy_count integer;
begin
  insert into auth.users(id,email) values(owner_id,'evidence-owner@example.test'),(other_id,'evidence-other@example.test');
  insert into public.sessions(user_id,name,discipline,session_type,competition_date) values(owner_id,'Evidence test','Sporting','Competition',current_date) returning id into competition_id;
  insert into public.competition_scorecard_evidence(session_id,user_id,course_number,storage_path,original_filename,content_type,size_bytes)
  values(competition_id,owner_id,null,owner_id::text||'/'||competition_id::text||'/whole.webp','whole.webp','image/webp',123);
  insert into public.competition_scorecard_evidence(session_id,user_id,course_number,storage_path,original_filename,content_type,size_bytes)
  values(competition_id,owner_id,1,owner_id::text||'/'||competition_id::text||'/course-1.jpg','course-1.jpg','image/jpeg',456);
  -- Multiple rows per course and NULL assignment are intentionally allowed.
  insert into public.competition_scorecard_evidence(session_id,user_id,course_number,storage_path,original_filename,content_type,size_bytes)
  values(competition_id,owner_id,1,owner_id::text||'/'||competition_id::text||'/course-1-b.png','course-1-b.png','image/png',789);
  select count(*) into policy_count from pg_policies where schemaname='public' and tablename='competition_scorecard_evidence';
  if policy_count <> 4 then raise exception 'expected four metadata policies, got %',policy_count; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='competition_scorecard_evidence' and coalesce(qual,with_check,'') not like '%auth.uid()%') then raise exception 'metadata policy without owner restriction permits cross-user metadata'; end if;
  if not (select relrowsecurity from pg_class where oid='public.competition_scorecard_evidence'::regclass) then raise exception 'metadata RLS disabled'; end if;
  if (select public from storage.buckets where id='competition-scorecard-evidence') then raise exception 'bucket is public'; end if;
  if (select file_size_limit from storage.buckets where id='competition-scorecard-evidence') <> 10485760 then raise exception 'wrong bucket limit'; end if;
  if (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'competition_scorecard_storage_%') <> 4 then raise exception 'storage policies missing'; end if;
end $$;
rollback;
