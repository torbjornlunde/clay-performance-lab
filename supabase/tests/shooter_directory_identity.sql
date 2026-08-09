-- Disposable Issue #270 privacy/identity regression. Run after all migrations.
-- Every schema/data mutation is rolled back.
begin;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000270','issue270-approved@example.test'),
 ('00000000-0000-0000-0000-000000000271','issue270-private@example.test'),
 ('00000000-0000-0000-0000-000000000272','issue270-visible@example.test'),
 ('00000000-0000-0000-0000-000000000273','issue270-unapproved@example.test');

-- Use the real closed-beta access model: only the directory caller is approved.
insert into public.user_access_profiles(user_id,email,access_status,system_role,account_type,approved_at) values
 ('00000000-0000-0000-0000-000000000270','issue270-approved@example.test','approved','user','personal',now()),
 ('00000000-0000-0000-0000-000000000271','issue270-private@example.test','pending','user','personal',null),
 ('00000000-0000-0000-0000-000000000272','issue270-visible@example.test','pending','user','personal',null),
 ('00000000-0000-0000-0000-000000000273','issue270-unapproved@example.test','pending','user','personal',null)
on conflict(user_id) do update set access_status=excluded.access_status,system_role=excluded.system_role,approved_at=excluded.approved_at;

insert into public.shooter_profiles(user_id,first_name,last_name,shooter_name,country,shooter_directory_visible) values
 ('00000000-0000-0000-0000-000000000270','Alice','Organizer','Alice Organizer','NO',false),
 ('00000000-0000-0000-0000-000000000271','Bob','Private','Bob Private','SE',false),
 ('00000000-0000-0000-0000-000000000272','Carol','Visible','Carol Legacy','DE',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000270',true);
do $$ declare row_json jsonb; begin
 if not has_function_privilege('authenticated','public.search_shooter_directory(text,integer)','EXECUTE') then raise exception 'authenticated execute missing'; end if;
 if exists(select 1 from public.shooter_profiles where user_id='00000000-0000-0000-0000-000000000271') then raise exception 'direct private cross-user profile SELECT allowed'; end if;
 if exists(select 1 from public.shooter_profiles where user_id='00000000-0000-0000-0000-000000000272') then raise exception 'direct visible cross-user profile SELECT allowed'; end if;
 if exists(select 1 from public.search_shooter_directory('Bob',8)) then raise exception 'opted-out profile returned'; end if;
 if not exists(select 1 from public.search_shooter_directory('car',8) where display_name='Carol Visible' and country='DE') then raise exception 'approved caller could not find opted-in canonical profile'; end if;
 select to_jsonb(d) into row_json from public.search_shooter_directory('car',8) d limit 1;
 if (select array_agg(key order by key) from jsonb_each(row_json)) <> array['country','display_name','user_id'] then raise exception 'directory returned extra fields'; end if;
 if exists(select 1 from public.search_shooter_directory('',8)) or exists(select 1 from public.search_shooter_directory('c',8)) or exists(select 1 from public.search_shooter_directory('%',8)) or exists(select 1 from public.search_shooter_directory('_',8)) then raise exception 'short/wildcard enumeration allowed'; end if;
 if (select count(*) from public.search_shooter_directory('ar',100)) > 10 then raise exception 'limit cap failed'; end if;
end $$;

-- An authenticated PostgreSQL role has EXECUTE, but an unapproved account is
-- rejected by the function's runtime closed-beta gate and learns no rows.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000273',true);
do $$ declare denied boolean := false; begin
 begin perform 1 from public.search_shooter_directory('Carol',8); exception when insufficient_privilege then denied := true; end;
 if not denied then raise exception 'unapproved authenticated directory call was not denied'; end if;
end $$;

-- Opt-in changes remain owner-controlled and take effect on future searches.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000271',true);
update public.shooter_profiles set shooter_directory_visible=true where user_id=auth.uid();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000270',true);
do $$ begin if not exists(select 1 from public.search_shooter_directory('Bob',8)) then raise exception 'opt-in did not take effect'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000271',true);
update public.shooter_profiles set shooter_directory_visible=false where user_id=auth.uid();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000270',true);
do $$ begin if exists(select 1 from public.search_shooter_directory('Bob',8)) then raise exception 'opt-out did not take effect'; end if; end $$;

insert into public.training_score_sheets(id,owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets) values
 ('10000000-0000-0000-0000-000000000270',auth.uid(),'Identity transfer',current_date,'Sporting','training',1,1,1),
 ('10000000-0000-0000-0000-000000000271',auth.uid(),'Other sheet',current_date,'Sporting','training',1,1,1),
 ('10000000-0000-0000-0000-000000000272',auth.uid(),'Finalized identity',current_date,'Sporting','competition',1,1,1);
insert into public.training_score_sheet_shooters(id,score_sheet_id,shooter_name,linked_user_id,display_order) values
 ('20000000-0000-0000-0000-000000000270','10000000-0000-0000-0000-000000000270','Row A snapshot','00000000-0000-0000-0000-000000000272',1),
 ('20000000-0000-0000-0000-000000000271','10000000-0000-0000-0000-000000000270','Row B snapshot',null,2),
 ('20000000-0000-0000-0000-000000000272','10000000-0000-0000-0000-000000000270','Guest snapshot',null,3),
 ('20000000-0000-0000-0000-000000000273','10000000-0000-0000-0000-000000000271','Same user elsewhere','00000000-0000-0000-0000-000000000272',1),
 ('20000000-0000-0000-0000-000000000274','10000000-0000-0000-0000-000000000272','Final snapshot','00000000-0000-0000-0000-000000000272',1);
insert into public.training_score_sheet_scores(id,score_sheet_id,shooter_id,post_number,score,max_score) values
 ('30000000-0000-0000-0000-000000000270','10000000-0000-0000-0000-000000000270','20000000-0000-0000-0000-000000000270',1,1,1),
 ('30000000-0000-0000-0000-000000000271','10000000-0000-0000-0000-000000000270','20000000-0000-0000-0000-000000000271',1,0,1);

-- Transfer X from A to B in one adverse-order statement. The deferrable
-- constraint validates the final statement state, not the temporary row order.
insert into public.training_score_sheet_shooters(id,score_sheet_id,shooter_name,linked_user_id,display_order) values
 ('20000000-0000-0000-0000-000000000271','10000000-0000-0000-0000-000000000270','ignored B','00000000-0000-0000-0000-000000000272',2),
 ('20000000-0000-0000-0000-000000000270','10000000-0000-0000-0000-000000000270','ignored A',null,1)
on conflict(id) do update set linked_user_id=excluded.linked_user_id;
do $$ begin
 if not exists(select 1 from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000270' and linked_user_id is null and shooter_name='Row A snapshot') then raise exception 'A was not unlinked without snapshot loss'; end if;
 if not exists(select 1 from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000271' and linked_user_id='00000000-0000-0000-0000-000000000272' and shooter_name='Row B snapshot') then raise exception 'B did not receive transferred identity'; end if;
 if (select count(*) from public.training_score_sheet_scores where shooter_id in ('20000000-0000-0000-0000-000000000270','20000000-0000-0000-0000-000000000271'))<>2 then raise exception 'identity transfer deleted score history'; end if;
end $$;

-- Reverse the transfer, again putting the receiving row first.
insert into public.training_score_sheet_shooters(id,score_sheet_id,shooter_name,linked_user_id,display_order) values
 ('20000000-0000-0000-0000-000000000270','10000000-0000-0000-0000-000000000270','ignored A','00000000-0000-0000-0000-000000000272',1),
 ('20000000-0000-0000-0000-000000000271','10000000-0000-0000-0000-000000000270','ignored B',null,2)
on conflict(id) do update set linked_user_id=excluded.linked_user_id;
do $$ begin
 if not exists(select 1 from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000270' and linked_user_id='00000000-0000-0000-0000-000000000272') then raise exception 'reverse transfer did not relink A'; end if;
 if not exists(select 1 from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000271' and linked_user_id is null) then raise exception 'reverse transfer did not unlink B'; end if;
end $$;
do $$ begin
 begin update public.training_score_sheet_shooters set linked_user_id='00000000-0000-0000-0000-000000000272' where id='20000000-0000-0000-0000-000000000271'; raise exception 'duplicate final linked state accepted'; exception when unique_violation then null; end;
 begin insert into public.training_score_sheet_shooters(score_sheet_id,shooter_name,linked_user_id) values('10000000-0000-0000-0000-000000000270','Duplicate','00000000-0000-0000-0000-000000000272'); raise exception 'duplicate linked insert accepted'; exception when unique_violation then null; end;
 if (select count(*) from public.training_score_sheet_shooters where score_sheet_id='10000000-0000-0000-0000-000000000270' and linked_user_id is null) < 2 then raise exception 'multiple NULL guests were not retained'; end if;
 if exists(select 1 from public.sessions where user_id='00000000-0000-0000-0000-000000000272') then raise exception 'link created personal session'; end if;
end $$;

-- Linking grants neither parent visibility nor child mutation rights.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000272',true);
do $$ begin
 if exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000270') then raise exception 'link granted parent access'; end if;
 if exists(select 1 from public.training_score_sheet_shooters where score_sheet_id='10000000-0000-0000-0000-000000000270') then raise exception 'link granted shooter-row access'; end if;
 update public.training_score_sheet_shooters set linked_user_id=null where id='20000000-0000-0000-0000-000000000270'; if found then raise exception 'linked user updated organizer row'; end if;
end $$;

-- The existing Competition child guard remains final enforcement.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000270',true);
do $$ declare rev timestamptz; begin
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000272';
 perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000272',rev,true);
 begin update public.training_score_sheet_shooters set linked_user_id=null where id='20000000-0000-0000-0000-000000000274'; raise exception 'finalized unlink accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin update public.training_score_sheet_shooters set shooter_name='changed' where id='20000000-0000-0000-0000-000000000274'; raise exception 'finalized snapshot edit accepted'; exception when object_not_in_prerequisite_state then null; end;
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000272';
 perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000272',rev);
 update public.training_score_sheet_shooters set linked_user_id=null where id='20000000-0000-0000-0000-000000000274';
end $$;

reset role;
-- Policy-name-independent structural checks complement the behavioral denial.
do $$ declare select_policies integer; unsafe_policies integer; begin
 select count(*) into select_policies from pg_policies where schemaname='public' and tablename='shooter_profiles' and cmd='SELECT';
 select count(*) into unsafe_policies from pg_policies where schemaname='public' and tablename='shooter_profiles' and cmd='SELECT'
   and (lower(coalesce(qual,'')) in ('true','(true)') or lower(coalesce(qual,'')) like '%shooter_directory_visible%');
 if select_policies<1 then raise exception 'shooter_profiles has no SELECT policy'; end if;
 if unsafe_policies<>0 then raise exception 'broad/directory-visible profile SELECT policy detected'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.training_score_sheet_shooters'::regclass and conname='training_score_sheet_shooters_sheet_linked_user_unique' and contype='u' and condeferrable and not condeferred) then raise exception 'identity uniqueness is not DEFERRABLE INITIALLY IMMEDIATE'; end if;
 if has_function_privilege('anon','public.search_shooter_directory(text,integer)','EXECUTE') then raise exception 'anon execute retained'; end if;
 if exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.search_shooter_directory(text,integer)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC execute retained'; end if;
end $$;

-- Verify the existing FK remains ON DELETE SET NULL and keeps event history.
delete from auth.users where id='00000000-0000-0000-0000-000000000272';
do $$ begin
 if not exists(select 1 from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000270' and linked_user_id is null and shooter_name='Row A snapshot') then raise exception 'auth deletion did not preserve snapshot with SET NULL'; end if;
end $$;

rollback;
