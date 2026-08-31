-- Disposable Issue #276 security/idempotency regression. Run after all migrations.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000276','issue276-organizer@example.test'),
 ('00000000-0000-0000-0000-000000000277','issue276-linked@example.test'),
 ('00000000-0000-0000-0000-000000000278','issue276-other@example.test');
insert into public.user_access_profiles(user_id,email,access_status,system_role,account_type,approved_at) values
 ('00000000-0000-0000-0000-000000000276','issue276-organizer@example.test','approved','user','personal',now()),
 ('00000000-0000-0000-0000-000000000277','issue276-linked@example.test','approved','user','personal',now()),
 ('00000000-0000-0000-0000-000000000278','issue276-other@example.test','approved','user','personal',now())
on conflict(user_id) do update set access_status='approved',approved_at=now();

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000276',true);
insert into public.training_score_sheets(id,owner_user_id,title,session_date,location,discipline,session_type,number_of_posts,targets_per_post,total_targets) values
 ('10000000-0000-0000-0000-000000000276',auth.uid(),'Issue 276 Cup','2026-08-31','CPL Range','Compak Sporting','competition',5,5,25),
 ('10000000-0000-0000-0000-000000000277',auth.uid(),'Incomplete Cup','2026-08-30',null,'Sporting','competition',1,2,2),
 ('10000000-0000-0000-0000-000000000278',auth.uid(),'Live Cup','2026-08-29',null,'Sporting','competition',1,1,1),
 ('10000000-0000-0000-0000-000000000280',auth.uid(),'Sporttrap Cup','2026-08-28',null,'Sporttrap','competition',5,5,25),
 ('10000000-0000-0000-0000-000000000281',auth.uid(),'Kompakt Cup','2026-08-27',null,'Kompakt leirduesti','competition',5,5,25),
 ('10000000-0000-0000-0000-000000000282',auth.uid(),'Leirduesti Cup','2026-08-26',null,'Leirduesti','competition',5,10,50),
 ('10000000-0000-0000-0000-000000000283',auth.uid(),'Trap Cup','2026-08-25',null,'Trap','competition',5,5,25);
insert into public.training_score_sheet_shooters(id,score_sheet_id,shooter_name,linked_user_id,display_order) values
 ('20000000-0000-0000-0000-000000000276','10000000-0000-0000-0000-000000000276','Linked Snapshot','00000000-0000-0000-0000-000000000277',1),
 ('20000000-0000-0000-0000-000000000277','10000000-0000-0000-0000-000000000276','Other Snapshot','00000000-0000-0000-0000-000000000278',2),
 ('20000000-0000-0000-0000-000000000278','10000000-0000-0000-0000-000000000277','Incomplete Snapshot','00000000-0000-0000-0000-000000000277',1),
 ('20000000-0000-0000-0000-000000000279','10000000-0000-0000-0000-000000000278','Live Snapshot','00000000-0000-0000-0000-000000000277',1),
 ('20000000-0000-0000-0000-000000000280','10000000-0000-0000-0000-000000000280','Sporttrap Snapshot','00000000-0000-0000-0000-000000000277',1),
 ('20000000-0000-0000-0000-000000000281','10000000-0000-0000-0000-000000000281','Kompakt Snapshot','00000000-0000-0000-0000-000000000277',1),
 ('20000000-0000-0000-0000-000000000282','10000000-0000-0000-0000-000000000282','Leirduesti Snapshot','00000000-0000-0000-0000-000000000277',1),
 ('20000000-0000-0000-0000-000000000283','10000000-0000-0000-0000-000000000283','Trap Snapshot','00000000-0000-0000-0000-000000000277',1);
insert into public.training_score_sheet_scores(score_sheet_id,shooter_id,post_number,score,max_score)
select '10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000276',n,case when n=1 then 4 else 5 end,5 from generate_series(1,5) n;
insert into public.training_score_sheet_scores(score_sheet_id,shooter_id,post_number,score,max_score) values
 ('10000000-0000-0000-0000-000000000277','20000000-0000-0000-0000-000000000278',1,1,1);
insert into public.training_score_sheet_scores(score_sheet_id,shooter_id,post_number,score,max_score)
select sheet,shooter,n,max_score-1,max_score from (values
 ('10000000-0000-0000-0000-000000000280'::uuid,'20000000-0000-0000-0000-000000000280'::uuid,5),
 ('10000000-0000-0000-0000-000000000281'::uuid,'20000000-0000-0000-0000-000000000281'::uuid,5),
 ('10000000-0000-0000-0000-000000000282'::uuid,'20000000-0000-0000-0000-000000000282'::uuid,10),
 ('10000000-0000-0000-0000-000000000283'::uuid,'20000000-0000-0000-0000-000000000283'::uuid,5)
) fixture(sheet,shooter,max_score) cross join generate_series(1,5) n;
insert into public.training_score_sheet_target_results(score_sheet_id,shooter_id,post_number,target_number,result) values
 ('10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000276',1,1,'hit'),
 ('10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000276',1,2,'miss'),
 ('10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000277',1,1,'hit'),
 ('10000000-0000-0000-0000-000000000277','20000000-0000-0000-0000-000000000278',1,1,'hit'),
 ('10000000-0000-0000-0000-000000000280','20000000-0000-0000-0000-000000000280',3,2,'miss'),
 ('10000000-0000-0000-0000-000000000281','20000000-0000-0000-0000-000000000281',4,1,'miss');
do $$ declare rev timestamptz; sheet record; begin
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000276'; perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000276',rev,true);
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000277'; perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000277',rev,true);
 for sheet in select id,updated_at from public.training_score_sheets where id in ('10000000-0000-0000-0000-000000000280','10000000-0000-0000-0000-000000000281','10000000-0000-0000-0000-000000000282','10000000-0000-0000-0000-000000000283') order by id loop
   perform public.finalize_competition_score_sheet(sheet.id,sheet.updated_at,true);
 end loop;
end $$;

-- Linked users retain no direct organizer-table visibility.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000277',true);
do $$ begin
 if exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000276') then raise exception 'linked user read parent'; end if;
 if exists(select 1 from public.training_score_sheet_shooters where score_sheet_id='10000000-0000-0000-0000-000000000276') then raise exception 'linked user read shooters'; end if;
 if exists(select 1 from public.training_score_sheet_target_results where score_sheet_id='10000000-0000-0000-0000-000000000276') then raise exception 'linked user read targets'; end if;
 if (select count(*) from public.get_my_competition_score_sheet_results())<>5 then raise exception 'claim projection leaked or omitted rows'; end if;
 if exists(select 1 from public.get_my_competition_score_sheet_results() where shooter_id='20000000-0000-0000-0000-000000000277') then raise exception 'another user discovered'; end if;
 if exists(select 1 from public.get_my_competition_score_sheet_results() where score_sheet_id in ('10000000-0000-0000-0000-000000000277','10000000-0000-0000-0000-000000000278')) then raise exception 'incomplete/live result claimable'; end if;
 begin perform public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000278','20000000-0000-0000-0000-000000000279'); raise exception 'live claim accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin perform public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000277','20000000-0000-0000-0000-000000000278'); raise exception 'incomplete claim accepted'; exception when invalid_parameter_value then null; end;
end $$;

-- Every programme family maps Score Sheet stands/plates to established personal Result dimensions.
do $$ declare sporttrap_id uuid; kompakt_id uuid; leirduesti_id uuid; trap_id uuid; begin
 sporttrap_id:=public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000280','20000000-0000-0000-0000-000000000280');
 kompakt_id:=public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000281','20000000-0000-0000-0000-000000000281');
 leirduesti_id:=public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000282','20000000-0000-0000-0000-000000000282');
 trap_id:=public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000283','20000000-0000-0000-0000-000000000283');
 if not exists(select 1 from public.sessions where id=sporttrap_id and shooting_format='Sporttrap' and course_count=1 and sporttrap_series_count=1 and post_count is null and total_targets=25) then raise exception 'Sporttrap session mapping wrong'; end if;
 if not exists(select 1 from public.sessions where id=kompakt_id and shooting_format is null and course_count=1 and sporttrap_series_count is null and post_count is null and total_targets=25) then raise exception 'Kompakt session mapping wrong'; end if;
 if not exists(select 1 from public.sessions where id=leirduesti_id and shooting_format='Post-based' and course_count=5 and post_count=5 and targets_per_post=10 and total_targets=50) then raise exception 'Leirduesti session mapping wrong'; end if;
 if not exists(select 1 from public.sessions where id=trap_id and discipline='Trap' and own_score=20 and total_targets=25 and shooting_format is null and course_count is null and post_count is null and targets_per_post is null) then raise exception 'Trap total-only mapping wrong'; end if;
 if not exists(select 1 from public.misses where session_id=sporttrap_id and plate=3 and course_number=1 and target_position=12) then raise exception 'Sporttrap stand identity lost'; end if;
 if not exists(select 1 from public.misses where session_id=kompakt_id and plate=4 and course_number=1 and target_position=16) then raise exception 'Kompakt plate identity lost'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000278',true);
do $$ begin
 if exists(select 1 from public.get_my_competition_score_sheet_results() where shooter_id='20000000-0000-0000-0000-000000000276') then raise exception 'other user discovered linked result'; end if;
 begin perform public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000276'); raise exception 'wrong user claimed'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000277',true);
do $$ declare first_id uuid; retry_id uuid; begin
 first_id:=public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000276');
 retry_id:=public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000276');
 if first_id<>retry_id then raise exception 'retry returned another session'; end if;
 if (select count(*) from public.sessions where user_id=auth.uid() and name='Issue 276 Cup')<>1 then raise exception 'personal session duplicated'; end if;
 if exists(select 1 from public.sessions where id=first_id and user_id='00000000-0000-0000-0000-000000000276') then raise exception 'organizer owns claim'; end if;
 if not exists(select 1 from public.sessions where id=first_id and name='Issue 276 Cup' and competition_date='2026-08-31' and shooting_ground='CPL Range' and discipline='Compak Sporting' and session_type='Competition' and own_score=24 and total_targets=25 and course_count=1 and post_count is null and sporttrap_series_count is null) then raise exception 'Compak session mapping wrong'; end if;
 if (select count(*) from public.misses where session_id=first_id and source_type='competition_score_sheet_claim' and course_number=1 and target_position=2 and plate=1)<>1 then raise exception 'known Compak miss mapping wrong'; end if;
 if (select count(*) from public.misses where session_id=first_id)<>1 then raise exception 'hit/unknown fabricated miss'; end if;
 if (select count(*) from public.competition_score_sheet_claims where session_id=first_id)<>1 then raise exception 'claim provenance wrong'; end if;
 if not exists(select 1 from public.competition_score_sheet_claims where session_id=first_id and target_detail_complete=false) then raise exception 'partial target coverage not persisted'; end if;
end $$;

-- Another account can neither inspect nor mutate the claimant-owned snapshot/provenance.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000278',true);
do $$ begin
 if exists(select 1 from public.sessions where name='Issue 276 Cup') then raise exception 'other user read session'; end if;
 if exists(select 1 from public.competition_score_sheet_claims) then raise exception 'other user read provenance'; end if;
 update public.sessions set own_score=0 where name='Issue 276 Cup'; if found then raise exception 'other user updated session'; end if;
 delete from public.sessions where name='Issue 276 Cup'; if found then raise exception 'other user deleted session'; end if;
end $$;

-- Organizer correction changes source metadata detection, never the snapshot.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000276',true);
do $$ declare rev timestamptz; begin
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000276'; perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000276',rev);
 delete from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000276';
 if not exists(select 1 from public.competition_score_sheet_claims where score_sheet_id='10000000-0000-0000-0000-000000000276' and shooter_id is null) then raise exception 'shooter replacement deleted claim provenance'; end if;
 insert into public.training_score_sheet_shooters(id,score_sheet_id,shooter_name,linked_user_id,display_order) values
  ('20000000-0000-0000-0000-000000000284','10000000-0000-0000-0000-000000000276','Replacement Snapshot','00000000-0000-0000-0000-000000000277',1);
 insert into public.training_score_sheet_scores(score_sheet_id,shooter_id,post_number,score,max_score)
  select '10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000284',n,5,5 from generate_series(1,5) n;
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000276'; perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000276',rev,true);
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000277',true);
do $$ declare sid uuid; begin
 if not exists(select 1 from public.get_my_competition_score_sheet_results() where source_changed) then raise exception 'source correction not detected'; end if;
 select session_id into sid from public.competition_score_sheet_claims where score_sheet_id='10000000-0000-0000-0000-000000000276';
 if public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000284')<>sid then raise exception 'replacement shooter created duplicate result'; end if;
 if (select count(*) from public.sessions where user_id=auth.uid() and name='Issue 276 Cup')<>1 then raise exception 'replacement shooter duplicated personal session'; end if;
 update public.misses set main_reason='Technique' where session_id=sid;
 if exists(select 1 from public.training_score_sheet_target_results where result='Technique') then raise exception 'personal miss edit affected source'; end if;
 delete from public.sessions where id=sid;
 if exists(select 1 from public.competition_score_sheet_claims where session_id=sid) then raise exception 'claim did not cascade'; end if;
 if public.claim_competition_score_sheet_result('10000000-0000-0000-0000-000000000276','20000000-0000-0000-0000-000000000284')=sid then raise exception 'reclaim reused deleted id'; end if;
end $$;

reset role;
do $$ begin
 if has_function_privilege('anon','public.get_my_competition_score_sheet_results()','EXECUTE') or has_function_privilege('anon','public.claim_competition_score_sheet_result(uuid,uuid)','EXECUTE') then raise exception 'anon execute retained'; end if;
 begin insert into public.competition_score_sheet_claims(score_sheet_id,shooter_id,user_id,session_id,source_finalized_at,source_reopen_count,source_updated_at,target_detail_complete) select score_sheet_id,shooter_id,user_id,session_id,source_finalized_at,source_reopen_count,source_updated_at,target_detail_complete from public.competition_score_sheet_claims limit 1; raise exception 'claim uniqueness not enforced'; exception when unique_violation then null; end;
end $$;
rollback;
