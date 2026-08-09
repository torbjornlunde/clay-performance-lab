-- Disposable owner/security/lifecycle regression. Run after all migrations.
begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000266','issue266-owner@example.test'),('00000000-0000-0000-0000-000000000267','issue266-other@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000266',true);
insert into public.training_score_sheets(id,owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets)
values ('10000000-0000-0000-0000-000000000266',auth.uid(),'Finalization regression',current_date,'Sporting','competition',1,2,2),
('10000000-0000-0000-0000-000000000268',auth.uid(),'Incomplete',current_date,'Sporting','competition',1,3,3),
('10000000-0000-0000-0000-000000000269',auth.uid(),'Training unchanged',current_date,'Sporting','training',1,2,2);
do $$ begin if (select competition_status from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266') <> 'live' then raise exception 'new Competition did not default live'; end if; if (select competition_status from public.training_score_sheets where id='10000000-0000-0000-0000-000000000269') is not null then raise exception 'Training gained lifecycle'; end if; end $$;
insert into public.training_score_sheet_shooters(id,score_sheet_id,shooter_name,display_order) values
('20000000-0000-0000-0000-000000000266','10000000-0000-0000-0000-000000000266','Owner',1),
('20000000-0000-0000-0000-000000000268','10000000-0000-0000-0000-000000000268','Incomplete',1),
('20000000-0000-0000-0000-000000000269','10000000-0000-0000-0000-000000000269','Training',1);
insert into public.training_score_sheet_scores(id,score_sheet_id,shooter_id,post_number,score,max_score) values
('30000000-0000-0000-0000-000000000266','10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',1,1,2),
('30000000-0000-0000-0000-000000000269','10000000-0000-0000-0000-000000000269','20000000-0000-0000-0000-000000000269',1,1,2);
insert into public.training_score_sheet_target_results(id,score_sheet_id,shooter_id,post_number,target_number,result) values
('40000000-0000-0000-0000-000000000266','10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',1,1,'hit'),
('40000000-0000-0000-0000-000000000267','10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',1,2,'miss'),
('40000000-0000-0000-0000-000000000268','10000000-0000-0000-0000-000000000268','20000000-0000-0000-0000-000000000268',1,1,'hit'),
('40000000-0000-0000-0000-000000000269','10000000-0000-0000-0000-000000000269','20000000-0000-0000-0000-000000000269',1,1,'hit');
do $$ declare t1 timestamptz; t2 timestamptz; t3 timestamptz; t4 timestamptz; begin
 select updated_at into t1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266';
 perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000266',t1,false);
 select updated_at into t2 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266'; if t2<=t1 then raise exception 'T2 > T1 failed'; end if;
 if not exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266' and competition_status='finalized' and competition_finalized_at is not null and competition_finalized_by=auth.uid() and competition_finalized_with_incomplete=false and competition_finalized_unscored_targets=0) then raise exception 'finalization metadata invalid'; end if;
 begin perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000266',t1); raise exception 'stale reopen accepted'; exception when serialization_failure then null; end;
 perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000266',t2); select updated_at into t3 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266'; if t3<=t2 then raise exception 'T3 > T2 failed'; end if;
 begin perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000266',t2,false); raise exception 'stale finalize accepted'; exception when serialization_failure then null; end;
 update public.training_score_sheet_target_results set result='hit' where id='40000000-0000-0000-0000-000000000267';
 update public.training_score_sheets set title='Corrected result' where id='10000000-0000-0000-0000-000000000266'; select updated_at into t3 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266';
 perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000266',t3,false); select updated_at into t4 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266'; if t4<=t3 then raise exception 'T4 > T3 failed'; end if;
 if (select competition_reopen_count from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266')<>1 then raise exception 'reopen count not preserved'; end if;
end $$;
-- Every direct parent/child mutation is rejected while finalized.
do $$ begin
 begin update public.training_score_sheets set title='blocked' where id='10000000-0000-0000-0000-000000000266'; raise exception 'parent update allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin delete from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266'; raise exception 'parent delete allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin insert into public.training_score_sheet_shooters(score_sheet_id,shooter_name) values('10000000-0000-0000-0000-000000000266','blocked'); raise exception 'shooter insert allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_shooters set shooter_name='blocked' where id='20000000-0000-0000-0000-000000000266'; raise exception 'shooter update allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin delete from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000266'; raise exception 'shooter delete allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin insert into public.training_score_sheet_scores(score_sheet_id,shooter_id,post_number,score,max_score) values('10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',2,0,1); raise exception 'score insert allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_scores set score=0 where id='30000000-0000-0000-0000-000000000266'; raise exception 'score update allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin delete from public.training_score_sheet_scores where id='30000000-0000-0000-0000-000000000266'; raise exception 'score delete allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin insert into public.training_score_sheet_target_results(score_sheet_id,shooter_id,post_number,target_number,result) values('10000000-0000-0000-0000-000000000266','20000000-0000-0000-0000-000000000266',1,3,'miss'); raise exception 'target insert allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_target_results set result='miss' where id='40000000-0000-0000-0000-000000000266'; raise exception 'target update allowed'; exception when object_not_in_prerequisite_state then null; end;
 begin delete from public.training_score_sheet_target_results where id='40000000-0000-0000-0000-000000000266'; raise exception 'target delete allowed'; exception when object_not_in_prerequisite_state then null; end;
end $$;
do $$ declare rev timestamptz; begin select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000268'; begin perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000268',rev,false); raise exception 'incomplete finalize accepted'; exception when raise_exception then null; end; perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000268',rev,true); if not exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000268' and competition_finalized_with_incomplete and competition_finalized_unscored_targets=2) then raise exception 'canonical incomplete snapshot wrong'; end if; end $$;
-- Training writes remain unaffected.
update public.training_score_sheets set title='Training edited' where id='10000000-0000-0000-0000-000000000269'; update public.training_score_sheet_shooters set shooter_name='Training edited' where id='20000000-0000-0000-0000-000000000269'; update public.training_score_sheet_scores set score=0 where id='30000000-0000-0000-0000-000000000269'; update public.training_score_sheet_target_results set result='miss' where id='40000000-0000-0000-0000-000000000269';
-- Cross-user RLS and owner checks.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000267',true);
do $$ begin if exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000266') then raise exception 'cross-user read allowed'; end if; begin perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000266',now(),false); raise exception 'cross-user finalize allowed'; exception when insufficient_privilege then null; end; begin perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000266',now()); raise exception 'cross-user reopen allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
do $$ begin if has_function_privilege('anon','public.finalize_competition_score_sheet(uuid,timestamptz,boolean)','execute') or has_function_privilege('anon','public.reopen_competition_score_sheet(uuid,timestamptz)','execute') then raise exception 'anon execute allowed'; end if; if not has_function_privilege('authenticated','public.finalize_competition_score_sheet(uuid,timestamptz,boolean)','execute') then raise exception 'authenticated execute missing'; end if; if exists(select 1 from pg_policies where schemaname='public' and tablename like 'training_score_sheet%' and (coalesce(qual,'')='true' or coalesce(with_check,'')='true')) then raise exception 'broad RLS policy found'; end if; end $$;
rollback;
