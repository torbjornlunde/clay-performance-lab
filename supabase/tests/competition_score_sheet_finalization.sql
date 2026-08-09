-- Disposable regression for Issue #266. Run after all migrations; rolls back all data.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000266','issue266-owner@example.test'),
 ('00000000-0000-0000-0000-000000000267','issue266-other@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000266',true);

-- Canonical inserts: Competition defaults live and Training has no lifecycle.
insert into public.training_score_sheets(id,owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets) values
 ('10000000-0000-0000-0000-000000000266',auth.uid(),'Competition A',current_date,'Sporting','competition',1,2,2),
 ('10000000-0000-0000-0000-000000000267',auth.uid(),'Competition B',current_date,'Sporting','competition',1,2,2),
 ('10000000-0000-0000-0000-000000000268',auth.uid(),'Incomplete',current_date,'Sporting','competition',1,3,3),
 ('10000000-0000-0000-0000-000000000269',auth.uid(),'Training',current_date,'Sporting','training',1,2,2);
do $$ begin
 if (select competition_status from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266') <> 'live' then raise exception 'new Competition did not default live'; end if;
 if (select competition_status from public.training_score_sheets where id='10000000-0000-0000-0000-000000000269') is not null then raise exception 'Training gained Competition lifecycle'; end if;
end $$;

-- A normal owner insert cannot seed any fake lifecycle history.
do $$ begin
 begin insert into public.training_score_sheets(owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets,competition_finalized_by) values(auth.uid(),'fake actor',current_date,'Sporting','competition',1,1,1,auth.uid()); raise exception 'fake finalized_by accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.training_score_sheets(owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets,competition_finalized_with_incomplete,competition_finalized_unscored_targets) values(auth.uid(),'fake coverage',current_date,'Sporting','competition',1,1,1,true,1); raise exception 'fake finalization coverage accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.training_score_sheets(owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets,competition_reopened_by) values(auth.uid(),'fake reopen actor',current_date,'Sporting','competition',1,1,1,auth.uid()); raise exception 'fake reopened_by accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.training_score_sheets(owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets,competition_reopened_at) values(auth.uid(),'fake reopen time',current_date,'Sporting','competition',1,1,1,now()); raise exception 'fake reopened_at accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.training_score_sheets(owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets,competition_reopen_count) values(auth.uid(),'fake count',current_date,'Sporting','competition',1,1,1,1); raise exception 'fake reopen count accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.training_score_sheets(owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets,competition_status,competition_finalized_at,competition_finalized_by,competition_finalized_with_incomplete,competition_finalized_unscored_targets) values(auth.uid(),'fake finalized',current_date,'Sporting','competition',1,1,1,'finalized',now(),auth.uid(),false,0); raise exception 'fake finalized row accepted'; exception when insufficient_privilege then null; end;
end $$;

-- Direct lifecycle mutation and either Competition kind conversion are forbidden.
do $$ begin
 begin update public.training_score_sheets set competition_status='finalized',competition_finalized_at=now(),competition_finalized_by=auth.uid(),competition_finalized_with_incomplete=false,competition_finalized_unscored_targets=0,competition_reopened_at=now(),competition_reopened_by=auth.uid(),competition_reopen_count=1 where id='10000000-0000-0000-0000-000000000267'; raise exception 'direct lifecycle update accepted'; exception when insufficient_privilege then null; end;
 begin update public.training_score_sheets set session_type='training' where id='10000000-0000-0000-0000-000000000267'; raise exception 'Competition -> Training accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheets set session_type='competition' where id='10000000-0000-0000-0000-000000000269'; raise exception 'Training -> Competition accepted'; exception when object_not_in_prerequisite_state then null; end;
end $$;

insert into public.training_score_sheet_shooters(id,score_sheet_id,shooter_name,display_order) values
 ('20000000-0000-0000-0000-000000000266','10000000-0000-0000-0000-000000000266','A shooter',1),
 ('20000000-0000-0000-0000-000000000267','10000000-0000-0000-0000-000000000267','B shooter',1),
 ('20000000-0000-0000-0000-000000000268','10000000-0000-0000-0000-000000000268','Incomplete shooter',1),
 ('20000000-0000-0000-0000-000000000269','10000000-0000-0000-0000-000000000269','Training shooter',1);
insert into public.training_score_sheet_scores(id,score_sheet_id,shooter_id,post_number,score,max_score) values
 ('30000000-0000-0000-0000-000000000266','10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',1,1,2),
 ('30000000-0000-0000-0000-000000000267','10000000-0000-0000-0000-000000000267','20000000-0000-0000-0000-000000000267',1,1,2),
 ('30000000-0000-0000-0000-000000000269','10000000-0000-0000-0000-000000000269','20000000-0000-0000-0000-000000000269',1,1,2);
insert into public.training_score_sheet_target_results(id,score_sheet_id,shooter_id,post_number,target_number,result) values
 ('40000000-0000-0000-0000-000000000266','10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',1,1,'hit'),
 ('40000000-0000-0000-0000-000000000265','10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',1,2,'miss'),
 ('40000000-0000-0000-0000-000000000267','10000000-0000-0000-0000-000000000267','20000000-0000-0000-0000-000000000267',1,1,'hit'),
 ('40000000-0000-0000-0000-000000000264','10000000-0000-0000-0000-000000000267','20000000-0000-0000-0000-000000000267',1,2,'miss'),
 ('40000000-0000-0000-0000-000000000268','10000000-0000-0000-0000-000000000268','20000000-0000-0000-0000-000000000268',1,1,'hit'),
 ('40000000-0000-0000-0000-000000000269','10000000-0000-0000-0000-000000000269','20000000-0000-0000-0000-000000000269',1,1,'hit');

-- T1 -> finalize T2 -> reopen T3 -> correction -> re-finalize T4.
do $$ declare t1 timestamptz; t2 timestamptz; t3 timestamptz; tcurrent timestamptz; t4 timestamptz; begin
 select updated_at into t1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266';
 perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000266',t1,false);
 select updated_at into t2 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266'; if t2<=t1 then raise exception 'T2 > T1 failed'; end if;
 if not exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266' and competition_status='finalized' and competition_finalized_at is not null and competition_finalized_by=auth.uid() and competition_finalized_with_incomplete=false and competition_finalized_unscored_targets=0) then raise exception 'finalization metadata invalid'; end if;
 begin perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000266',t1); raise exception 'stale reopen accepted'; exception when serialization_failure then null; end;
 perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000266',t2);
 select updated_at into t3 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266'; if t3<=t2 then raise exception 'T3 > T2 failed'; end if;
 if not exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266' and competition_status='live' and competition_reopen_count=1 and competition_reopened_by=auth.uid() and competition_reopened_at is not null) then raise exception 'reopen metadata invalid'; end if;
 update public.training_score_sheet_target_results set result='hit' where id='40000000-0000-0000-0000-000000000265';
 update public.training_score_sheets set title='Corrected A' where id='10000000-0000-0000-0000-000000000266';
 select updated_at into tcurrent from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266';
 begin perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000266',t2,false); raise exception 'stale finalize accepted'; exception when serialization_failure then null; end;
 perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000266',tcurrent,false);
 select updated_at into t4 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266'; if t4<=t3 then raise exception 'T4 > T3 failed'; end if;
 if (select competition_reopen_count from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266')<>1 then raise exception 'reopen count not preserved'; end if;
end $$;

-- Finalized same-parent writes and OLD/NEW reassignment bypasses are rejected.
do $$ begin
 begin update public.training_score_sheets set title='blocked' where id='10000000-0000-0000-0000-000000000266'; raise exception 'finalized parent update allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin delete from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266'; raise exception 'finalized parent delete allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin insert into public.training_score_sheet_shooters(score_sheet_id,shooter_name) values('10000000-0000-0000-0000-000000000266','blocked'); raise exception 'finalized shooter insert allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_shooters set shooter_name='blocked' where id='20000000-0000-0000-0000-000000000266'; raise exception 'finalized shooter update allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin delete from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000266'; raise exception 'finalized shooter delete allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_shooters set score_sheet_id='10000000-0000-0000-0000-000000000267' where id='20000000-0000-0000-0000-000000000266'; raise exception 'finalized shooter A -> live B move allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_shooters set score_sheet_id='10000000-0000-0000-0000-000000000266' where id='20000000-0000-0000-0000-000000000267'; raise exception 'live shooter B -> finalized A move allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin insert into public.training_score_sheet_scores(score_sheet_id,shooter_id,post_number,score,max_score) values('10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',2,0,1); raise exception 'finalized score insert allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_scores set score=0 where id='30000000-0000-0000-0000-000000000266'; raise exception 'finalized score update allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin delete from public.training_score_sheet_scores where id='30000000-0000-0000-0000-000000000266'; raise exception 'finalized score delete allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_scores set score_sheet_id='10000000-0000-0000-0000-000000000267',shooter_id='20000000-0000-0000-0000-000000000267' where id='30000000-0000-0000-0000-000000000266'; raise exception 'finalized score A -> live B move allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_scores set score_sheet_id='10000000-0000-0000-0000-000000000266',shooter_id='20000000-0000-0000-0000-000000000266' where id='30000000-0000-0000-0000-000000000267'; raise exception 'live score B -> finalized A move allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin insert into public.training_score_sheet_target_results(score_sheet_id,shooter_id,post_number,target_number,result) values('10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',1,3,'miss'); raise exception 'finalized target insert allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_target_results set result='miss' where id='40000000-0000-0000-0000-000000000266'; raise exception 'finalized target update allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin delete from public.training_score_sheet_target_results where id='40000000-0000-0000-0000-000000000266'; raise exception 'finalized target delete allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_target_results set score_sheet_id='10000000-0000-0000-0000-000000000267',shooter_id='20000000-0000-0000-0000-000000000267' where id='40000000-0000-0000-0000-000000000266'; raise exception 'finalized target A -> live B move allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_target_results set score_sheet_id='10000000-0000-0000-0000-000000000266',shooter_id='20000000-0000-0000-0000-000000000266' where id='40000000-0000-0000-0000-000000000267'; raise exception 'live target B -> finalized A move allowed'; exception when object_not_in_prerequisite_state then null; end;
end $$;

-- Incomplete targets remain unknown unless explicitly accepted; exact count is stored.
do $$ declare rev timestamptz; accepted boolean := false; begin
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000268';
 begin perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000268',rev,false); accepted := true; exception when raise_exception then null; end;
 if accepted then raise exception 'incomplete finalize accepted without acknowledgement'; end if;
 perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000268',rev,true);
 if not exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000268' and competition_finalized_with_incomplete and competition_finalized_unscored_targets=2) then raise exception 'canonical incomplete snapshot wrong'; end if;
end $$;

-- Training parent and every child type remain normally editable.
update public.training_score_sheets set title='Training edited' where id='10000000-0000-0000-0000-000000000269';
update public.training_score_sheet_shooters set shooter_name='Training edited' where id='20000000-0000-0000-0000-000000000269';
update public.training_score_sheet_scores set score=0 where id='30000000-0000-0000-0000-000000000269';
update public.training_score_sheet_target_results set result='miss' where id='40000000-0000-0000-0000-000000000269';

-- Cross-user RLS/owner enforcement remains intact.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000267',true);
do $$ begin
 if exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266') then raise exception 'cross-user read allowed'; end if;
 begin perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000267',now(),false); raise exception 'cross-user finalize allowed'; exception when insufficient_privilege then null; end;
 begin perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000266',now()); raise exception 'cross-user reopen allowed'; exception when insufficient_privilege then null; end;
 update public.training_score_sheets set competition_status='finalized' where id='10000000-0000-0000-0000-000000000267'; if found then raise exception 'cross-user lifecycle mutation allowed'; end if;
end $$;
reset role;

-- RPC grants and RLS remain narrow.
do $$ begin
 if has_function_privilege('anon','public.finalize_competition_score_sheet(uuid,timestamptz,boolean)','execute') then raise exception 'anon finalize execute allowed'; end if;
 if has_function_privilege('anon','public.reopen_competition_score_sheet(uuid,timestamptz)','execute') then raise exception 'anon reopen execute allowed'; end if;
 if not has_function_privilege('authenticated','public.finalize_competition_score_sheet(uuid,timestamptz,boolean)','execute') or not has_function_privilege('authenticated','public.reopen_competition_score_sheet(uuid,timestamptz)','execute') then raise exception 'authenticated lifecycle execute missing'; end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename in ('training_score_sheets','training_score_sheet_shooters','training_score_sheet_scores','training_score_sheet_target_results') and (coalesce(qual,'')='true' or coalesce(with_check,'')='true')) then raise exception 'broad RLS policy found'; end if;
end $$;
rollback;
