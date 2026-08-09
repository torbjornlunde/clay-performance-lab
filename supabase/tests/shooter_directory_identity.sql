-- Disposable Issue #270 privacy/identity regression. Run after all migrations.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000270','issue270-a@example.test'),
 ('00000000-0000-0000-0000-000000000271','issue270-b@example.test'),
 ('00000000-0000-0000-0000-000000000272','issue270-c@example.test');
insert into public.shooter_profiles(user_id,first_name,last_name,shooter_name,country,shooter_directory_visible) values
 ('00000000-0000-0000-0000-000000000270','Alice','Organizer','Alice Organizer','NO',false),
 ('00000000-0000-0000-0000-000000000271','Bob','Private','Bob Private','SE',false),
 ('00000000-0000-0000-0000-000000000272','Carol','Visible','Carol Legacy','DE',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000270',true);
do $$ declare row_json jsonb; begin
 if exists(select 1 from public.shooter_profiles where user_id in ('00000000-0000-0000-0000-000000000271','00000000-0000-0000-0000-000000000272')) then raise exception 'direct cross-user profile SELECT allowed'; end if;
 if exists(select 1 from public.search_shooter_directory('Bob',8)) then raise exception 'opted-out profile returned'; end if;
 if not exists(select 1 from public.search_shooter_directory('car',8) where display_name='Carol Visible' and country='DE') then raise exception 'opted-in canonical profile missing'; end if;
 select to_jsonb(d) into row_json from public.search_shooter_directory('car',8) d limit 1;
 if (select array_agg(key order by key) from jsonb_each(row_json)) <> array['country','display_name','user_id'] then raise exception 'directory returned extra fields'; end if;
 if exists(select 1 from public.search_shooter_directory('',8)) or exists(select 1 from public.search_shooter_directory('c',8)) or exists(select 1 from public.search_shooter_directory('%',8)) or exists(select 1 from public.search_shooter_directory('_',8)) then raise exception 'short/wildcard enumeration allowed'; end if;
 if (select count(*) from public.search_shooter_directory('ar',100)) > 10 then raise exception 'limit cap failed'; end if;
 if not has_function_privilege('authenticated','public.search_shooter_directory(text,integer)','EXECUTE') then raise exception 'authenticated execute missing'; end if;
 if has_function_privilege('anon','public.search_shooter_directory(text,integer)','EXECUTE') then raise exception 'anon execute retained'; end if;
 if exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a where p.oid='public.search_shooter_directory(text,integer)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC execute retained'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000271',true);
update public.shooter_profiles set shooter_directory_visible=true where user_id=auth.uid();
do $$ begin if not exists(select 1 from public.search_shooter_directory('Bob',8)) then raise exception 'opt-in did not take effect'; end if; end $$;
update public.shooter_profiles set shooter_directory_visible=false where user_id=auth.uid();
do $$ begin if exists(select 1 from public.search_shooter_directory('Bob',8)) then raise exception 'opt-out did not take effect'; end if; end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000270',true);
insert into public.training_score_sheets(id,owner_user_id,title,session_date,discipline,session_type,number_of_posts,targets_per_post,total_targets) values
 ('10000000-0000-0000-0000-000000000270',auth.uid(),'Identity one',current_date,'Sporting','training',1,1,1),
 ('10000000-0000-0000-0000-000000000271',auth.uid(),'Identity two',current_date,'Sporting','training',1,1,1),
 ('10000000-0000-0000-0000-000000000272',auth.uid(),'Identity final',current_date,'Sporting','competition',1,1,1);
insert into public.training_score_sheet_shooters(id,score_sheet_id,shooter_name,linked_user_id) values
 ('20000000-0000-0000-0000-000000000270','10000000-0000-0000-0000-000000000270','Guest',null),
 ('20000000-0000-0000-0000-000000000271','10000000-0000-0000-0000-000000000270','Carol event snapshot','00000000-0000-0000-0000-000000000272'),
 ('20000000-0000-0000-0000-000000000272','10000000-0000-0000-0000-000000000271','Carol another event','00000000-0000-0000-0000-000000000272'),
 ('20000000-0000-0000-0000-000000000273','10000000-0000-0000-0000-000000000270','Guest',null),
 ('20000000-0000-0000-0000-000000000274','10000000-0000-0000-0000-000000000272','Carol final snapshot','00000000-0000-0000-0000-000000000272');
do $$ begin
 begin insert into public.training_score_sheet_shooters(score_sheet_id,shooter_name,linked_user_id) values('10000000-0000-0000-0000-000000000270','Duplicate','00000000-0000-0000-0000-000000000272'); raise exception 'duplicate linked identity accepted'; exception when unique_violation then null; end;
 if exists(select 1 from public.sessions where user_id='00000000-0000-0000-0000-000000000272') then raise exception 'link created session'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000272',true);
do $$ begin
 if exists(select 1 from public.training_score_sheets where id='10000000-0000-0000-0000-000000000270') then raise exception 'link granted parent access'; end if;
 update public.training_score_sheet_shooters set linked_user_id=null where id='20000000-0000-0000-0000-000000000271'; if found then raise exception 'linked user updated organizer row'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000270',true);
do $$ declare rev timestamptz; begin
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000272';
 perform public.finalize_competition_score_sheet('10000000-0000-0000-0000-000000000272',rev,true);
 begin update public.training_score_sheet_shooters set linked_user_id=null where id='20000000-0000-0000-0000-000000000274'; raise exception 'finalized unlink accepted'; exception when object_not_in_prerequisite_state then null; end;
 select updated_at into rev from public.training_score_sheets where id='10000000-0000-0000-0000-000000000272';
 perform public.reopen_competition_score_sheet('10000000-0000-0000-0000-000000000272',rev);
 update public.training_score_sheet_shooters set linked_user_id=null where id='20000000-0000-0000-0000-000000000274';
end $$;
reset role;
do $$ begin
 if (select qual from pg_policies where schemaname='public' and tablename='shooter_profiles' and policyname='shooter_profiles_select_own') not like '%auth.uid()%user_id%' then raise exception 'owner-only profile RLS changed'; end if;
end $$;
delete from auth.users where id='00000000-0000-0000-0000-000000000272';
do $$ begin
 if not exists(select 1 from public.training_score_sheet_shooters where id='20000000-0000-0000-0000-000000000271' and linked_user_id is null and shooter_name='Carol event snapshot') then raise exception 'auth deletion did not preserve snapshot with SET NULL'; end if;
end $$;
rollback;
