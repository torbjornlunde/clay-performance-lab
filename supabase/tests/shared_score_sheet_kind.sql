-- Disposable regression: run after migrations against a local Supabase DB.
-- Every mutation is rolled back.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000262', 'issue262-owner@example.test'),
  ('00000000-0000-0000-0000-000000000246', 'issue262-other@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000262', true);

insert into public.training_score_sheets (id, owner_user_id, title, session_date, discipline, session_type, number_of_posts, targets_per_post, total_targets) values
  ('10000000-0000-0000-0000-000000000001', auth.uid(), 'Training', current_date, 'Sporting', 'training', 1, 2, 2),
  ('10000000-0000-0000-0000-000000000002', auth.uid(), 'Shared', current_date, 'Sporting', 'shared_training', 1, 2, 2),
  ('10000000-0000-0000-0000-000000000003', auth.uid(), 'Competition foundation', current_date, 'Sporting', 'competition', 1, 2, 2);

do $$ begin
  begin
    insert into public.training_score_sheets (owner_user_id, title, session_date, discipline, session_type, number_of_posts, targets_per_post, total_targets)
    values (auth.uid(), 'Invalid', current_date, 'Sporting', 'invalid', 1, 1, 1);
    raise exception 'invalid kind was accepted';
  exception when check_violation then null; end;
end $$;

insert into public.training_score_sheet_shooters (id, score_sheet_id, shooter_name, display_order)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Owner', 1);
insert into public.training_score_sheet_target_results (score_sheet_id, shooter_id, post_number, target_number, result)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 1, 'hit')
on conflict (score_sheet_id, shooter_id, post_number, target_number) do update set result = excluded.result;
insert into public.training_score_sheet_target_results (score_sheet_id, shooter_id, post_number, target_number, result)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 1, 'hit')
on conflict (score_sheet_id, shooter_id, post_number, target_number) do update set result = excluded.result;
do $$ begin
  if (select count(*) from public.training_score_sheet_target_results where score_sheet_id = '10000000-0000-0000-0000-000000000001') <> 1 then raise exception 'retry duplicated target result'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000246', true);
do $$ begin
  if exists (select 1 from public.training_score_sheets where id = '10000000-0000-0000-0000-000000000001') then raise exception 'cross-user sheet read allowed'; end if;
  begin
    update public.training_score_sheets set title = 'Guessed' where id = '10000000-0000-0000-0000-000000000001';
    if found then raise exception 'cross-user sheet update allowed'; end if;
  end;
  begin
    update public.training_score_sheet_target_results set result = 'miss' where score_sheet_id = '10000000-0000-0000-0000-000000000001';
    if found then raise exception 'cross-user target update allowed'; end if;
  end;
end $$;

reset role;
do $$ declare weakened integer; begin
  select count(*) into weakened from pg_policies where schemaname='public' and tablename in ('training_score_sheets','training_score_sheet_shooters','training_score_sheet_scores','training_score_sheet_target_results') and (coalesce(qual,'') = 'true' or coalesce(with_check,'') = 'true');
  if weakened <> 0 then raise exception 'broad RLS write/read policy detected'; end if;
end $$;
rollback;
