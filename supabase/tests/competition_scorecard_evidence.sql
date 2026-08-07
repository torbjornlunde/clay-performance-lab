-- Authenticated owner-isolation regression. Run on a disposable fully migrated Supabase database.
begin;
insert into auth.users(id,email) values
 ('25700000-0000-4000-8000-000000000001','evidence-owner@example.test'),
 ('25700000-0000-4000-8000-000000000002','evidence-other@example.test');
-- auth.users has an AFTER INSERT trigger that creates user_access_profiles.
-- Approve those generated profiles instead of inserting duplicate primary keys.
update public.user_access_profiles
set access_status='approved', system_role='user', approved_at=now()
where user_id in (
 '25700000-0000-4000-8000-000000000001',
 '25700000-0000-4000-8000-000000000002'
);
do $$ begin
 if (select count(*) from public.user_access_profiles where user_id in ('25700000-0000-4000-8000-000000000001','25700000-0000-4000-8000-000000000002')) <> 2 then
  raise exception 'auth access-profile trigger fixture failed';
 end if;
end $$;
insert into public.sessions(id,user_id,name,discipline,session_type,competition_date) values
 ('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000001','Evidence test','Sporting','Competition',current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub','25700000-0000-4000-8000-000000000001',true);
insert into public.competition_scorecard_evidence(id,session_id,user_id,course_number,storage_path,original_filename,content_type,size_bytes) values
 ('25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000001',null,'25700000-0000-4000-8000-000000000001/25700000-0000-4000-8000-000000000010/550e8400-e29b-41d4-a716-446655440000.webp','private-name.webp','image/webp',123),
 ('25700000-0000-4000-8000-000000000021','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000001',1,'25700000-0000-4000-8000-000000000001/25700000-0000-4000-8000-000000000010/550e8400-e29b-41d4-a716-446655440001.jpg','course.jpg','image/jpeg',456),
 ('25700000-0000-4000-8000-000000000022','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000001',1,'25700000-0000-4000-8000-000000000001/25700000-0000-4000-8000-000000000010/550e8400-e29b-41d4-a716-446655440002.png','course-two.png','image/png',789);
do $$ begin if (select count(*) from public.competition_scorecard_evidence) <> 3 then raise exception 'owner can select own metadata failed'; end if; end $$;
update public.competition_scorecard_evidence set course_number=2 where id='25700000-0000-4000-8000-000000000020';
do $$ begin if (select course_number from public.competition_scorecard_evidence where id='25700000-0000-4000-8000-000000000020') <> 2 then raise exception 'owner can update own course assignment failed'; end if; end $$;
delete from public.competition_scorecard_evidence where id='25700000-0000-4000-8000-000000000022';
do $$ begin if exists(select 1 from public.competition_scorecard_evidence where id='25700000-0000-4000-8000-000000000022') then raise exception 'owner can delete own metadata failed'; end if; end $$;
insert into storage.objects(bucket_id,name,owner_id) values ('competition-scorecard-evidence','25700000-0000-4000-8000-000000000001/25700000-0000-4000-8000-000000000010/550e8400-e29b-41d4-a716-446655440001.jpg','25700000-0000-4000-8000-000000000001');
do $$ begin
  if (select count(*) from storage.objects where bucket_id='competition-scorecard-evidence') <> 1 then raise exception 'owner cannot read own storage object'; end if;
  begin insert into storage.objects(bucket_id,name,owner_id) values ('competition-scorecard-evidence','25700000-0000-4000-8000-000000000002/25700000-0000-4000-8000-000000000010/550e8400-e29b-41d4-a716-446655440099.jpg','25700000-0000-4000-8000-000000000001'); raise exception 'owner created object in another user folder'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','25700000-0000-4000-8000-000000000002',true);
do $$ declare affected integer; begin
  if exists(select 1 from public.competition_scorecard_evidence) then raise exception 'other user cannot select owner metadata failed'; end if;
  begin insert into public.competition_scorecard_evidence(session_id,user_id,storage_path,original_filename,content_type,size_bytes) values ('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002','25700000-0000-4000-8000-000000000002/25700000-0000-4000-8000-000000000010/550e8400-e29b-41d4-a716-446655440098.jpg','x.jpg','image/jpeg',1); raise exception 'other inserted against owner Competition'; exception when insufficient_privilege then null; end;
  update public.competition_scorecard_evidence set course_number=4 where id='25700000-0000-4000-8000-000000000020'; get diagnostics affected=row_count; if affected<>0 then raise exception 'other user updated owner metadata'; end if;
  delete from public.competition_scorecard_evidence where id='25700000-0000-4000-8000-000000000020'; get diagnostics affected=row_count; if affected<>0 then raise exception 'other user deleted owner metadata'; end if;
  if exists(select 1 from storage.objects where bucket_id='competition-scorecard-evidence') then raise exception 'other user read owner object'; end if;
  begin insert into storage.objects(bucket_id,name,owner_id) values ('competition-scorecard-evidence','25700000-0000-4000-8000-000000000001/25700000-0000-4000-8000-000000000010/550e8400-e29b-41d4-a716-446655440097.jpg','25700000-0000-4000-8000-000000000002'); raise exception 'other inserted into owner folder'; exception when insufficient_privilege then null; end;
  update storage.objects set name=name||'.moved' where bucket_id='competition-scorecard-evidence'; get diagnostics affected=row_count; if affected<>0 then raise exception 'other updated owner object'; end if;
end $$;
reset role;

-- Supabase's storage.protect_delete() intentionally blocks direct SQL DELETE on
-- storage.objects, so delete-policy behavior is verified structurally here and
-- exercised through the Storage API in application-level helper tests.
do $$ declare policy_count integer; delete_qual text; begin
 select count(*) into policy_count from pg_policies where schemaname='public' and tablename='competition_scorecard_evidence'; if policy_count<>4 then raise exception 'expected four metadata policies'; end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='competition_scorecard_evidence' and coalesce(qual,with_check,'') not like '%auth.uid()%') then raise exception 'metadata policy missing auth.uid'; end if;
 if not (select relrowsecurity from pg_class where oid='public.competition_scorecard_evidence'::regclass) then raise exception 'metadata RLS disabled'; end if;
 if (select public from storage.buckets where id='competition-scorecard-evidence') then raise exception 'bucket public'; end if;
 if (select file_size_limit from storage.buckets where id='competition-scorecard-evidence')<>10485760 then raise exception 'wrong size limit'; end if;
 if (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'competition_scorecard_storage_%')<>4 then raise exception 'storage policies missing'; end if;
 select qual into delete_qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='competition_scorecard_storage_delete_own';
 if delete_qual not like '%competition-scorecard-evidence%' or delete_qual not like '%auth.uid()%' or delete_qual not like '%foldername%' then raise exception 'storage delete policy is not owner scoped'; end if;
end $$;
rollback;
