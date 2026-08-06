-- Regression test for 20260806120000_compak_partial_programmes.sql.
-- Run against a disposable database with all repository migrations applied.
begin;

do $$
declare
  test_user constant uuid := '25500000-0000-4000-8000-000000000001';
  test_session uuid;
  policy_count integer;
  definition text;
begin
  insert into auth.users(id,email) values(test_user,'issue255@example.test');
  insert into public.sessions(user_id,name,discipline,session_type,competition_date)
  values(test_user,'Issue 255 SQL test','Compak Sporting','Competition',current_date) returning id into test_session;

  -- Existing and Unknown rows remain valid.
  insert into public.session_courses(session_id,course_number) values(test_session,1);
  -- Partial and Exact+remembered are both valid.
  insert into public.session_courses(session_id,course_number,compak_programme_type) values(test_session,2,'three_singles_one_report_pair');
  insert into public.session_courses(session_id,course_number,fitasc_scheme,compak_programme_type,compak_conflict_resolution)
  values(test_session,3,17,'three_singles_one_report_pair','exact_authoritative');

  begin
    insert into public.session_courses(session_id,course_number,compak_programme_type) values(test_session,4,'unsupported');
    raise exception 'unsupported programme code was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.session_courses(session_id,course_number,fitasc_scheme,compak_programme_type,compak_conflict_resolution) values(test_session,4,17,'five_singles','unsupported');
    raise exception 'unsupported resolution was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.session_courses(session_id,course_number,compak_conflict_resolution) values(test_session,4,'exact_authoritative');
    raise exception 'resolution without both sources was accepted';
  exception when check_violation then null; end;

  select pg_get_functiondef('public.build_competition_template_snapshot(uuid)'::regprocedure) into definition;
  if definition not like '%compakProgrammeType%' or definition not like '%compakConflictResolution%' then raise exception 'snapshot omits Compak partial fields'; end if;
  select pg_get_functiondef('public.copy_competition_template_to_new_session(uuid,text,date,text)'::regprocedure) into definition;
  if definition not like '%compak_programme_type%' or definition not like '%compak_conflict_resolution%' then raise exception 'copy omits Compak partial fields'; end if;
  select pg_get_functiondef('public.apply_competition_template_to_empty_session(uuid,uuid)'::regprocedure) into definition;
  if definition not like '%compak_programme_type%' or definition not like '%compak_conflict_resolution%' or definition not like '%s.user_id <> v_user%' then raise exception 'apply omits fields or ownership check'; end if;

  select count(*) into policy_count from pg_policies where schemaname='public' and tablename='session_courses';
  if policy_count <> 4 then raise exception 'session_courses RLS policy count changed: %', policy_count; end if;
  if not (select relrowsecurity from pg_class where oid='public.session_courses'::regclass) then raise exception 'session_courses RLS is disabled'; end if;
end $$;

rollback;
