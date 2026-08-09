-- Deliberate, owner-only Competition result finalization and correction lifecycle.
alter table public.training_score_sheets
  add column competition_status text,
  add column competition_finalized_at timestamptz,
  add column competition_finalized_by uuid references auth.users(id) on delete restrict,
  add column competition_finalized_with_incomplete boolean,
  add column competition_finalized_unscored_targets integer,
  add column competition_reopened_at timestamptz,
  add column competition_reopened_by uuid references auth.users(id) on delete restrict,
  add column competition_reopen_count integer not null default 0;

update public.training_score_sheets set competition_status = 'live' where session_type = 'competition' and competition_status is null;

alter table public.training_score_sheets
  add constraint training_score_sheets_competition_status_check check (competition_status is null or competition_status in ('live','finalized')),
  add constraint training_score_sheets_competition_reopen_count_check check (competition_reopen_count >= 0),
  add constraint training_score_sheets_competition_unscored_check check (competition_finalized_unscored_targets is null or competition_finalized_unscored_targets >= 0),
  add constraint training_score_sheets_competition_kind_lifecycle_check check (
    (session_type = 'competition' and competition_status is not null) or
    (session_type in ('training','shared_training') and competition_status is null and competition_finalized_at is null and competition_finalized_by is null and competition_finalized_with_incomplete is null and competition_finalized_unscored_targets is null and competition_reopened_at is null and competition_reopened_by is null and competition_reopen_count = 0)
  ),
  add constraint training_score_sheets_competition_finalized_check check (
    competition_status <> 'finalized' or (competition_finalized_at is not null and competition_finalized_by is not null and competition_finalized_with_incomplete is not null and competition_finalized_unscored_targets is not null)
  ),
  add constraint training_score_sheets_competition_coverage_check check (
    competition_finalized_with_incomplete is null or
    (competition_finalized_with_incomplete = false and competition_finalized_unscored_targets = 0) or
    (competition_finalized_with_incomplete = true and competition_finalized_unscored_targets > 0)
  );

create or replace function public.guard_competition_score_sheet_lifecycle() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'INSERT' then
    if new.session_type = 'competition' then new.competition_status := coalesce(new.competition_status, 'live'); end if;
    if coalesce(current_setting('app.competition_lifecycle_transition', true),'') = '' and
       (new.competition_status is distinct from case when new.session_type='competition' then 'live' else null end
        or new.competition_finalized_at is not null
        or new.competition_finalized_by is not null
        or new.competition_finalized_with_incomplete is not null
        or new.competition_finalized_unscored_targets is not null
        or new.competition_reopened_at is not null
        or new.competition_reopened_by is not null
        or new.competition_reopen_count <> 0) then
      raise exception using errcode='42501', message='Competition lifecycle fields can only be changed by lifecycle operations.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.session_type='competition' and old.competition_status='finalized' then raise exception using errcode='55000', message='Finalized Competition Score Sheets must be reopened before deletion.'; end if;
    return old;
  end if;
  if old.session_type is distinct from new.session_type and (old.session_type='competition' or new.session_type='competition') then raise exception using errcode='55000', message='Competition Score Sheet type cannot be changed.'; end if;
  if old.session_type='competition' and old.competition_status='finalized' and coalesce(current_setting('app.competition_lifecycle_transition',true),'') <> 'reopen' then raise exception using errcode='55000', message='Finalized Competition Score Sheets are read-only.'; end if;
  if coalesce(current_setting('app.competition_lifecycle_transition',true),'') = '' and
    (new.competition_status,new.competition_finalized_at,new.competition_finalized_by,new.competition_finalized_with_incomplete,new.competition_finalized_unscored_targets,new.competition_reopened_at,new.competition_reopened_by,new.competition_reopen_count)
    is distinct from
    (old.competition_status,old.competition_finalized_at,old.competition_finalized_by,old.competition_finalized_with_incomplete,old.competition_finalized_unscored_targets,old.competition_reopened_at,old.competition_reopened_by,old.competition_reopen_count)
  then raise exception using errcode='42501', message='Competition lifecycle fields can only be changed by lifecycle operations.'; end if;
  return new;
end $$;
create trigger competition_score_sheet_lifecycle_guard before insert or update or delete on public.training_score_sheets for each row execute function public.guard_competition_score_sheet_lifecycle();

-- The parent row is the lifecycle serialization point. Child writes take
-- deterministic FOR KEY SHARE locks before checking status; finalize/reopen take
-- FOR UPDATE. Whichever transaction locks first completes first, so canonical
-- coverage can never race across the live -> finalized boundary.
create or replace function public.guard_finalized_competition_child() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
 parent_id uuid;
 relevant_parent_ids uuid[];
 locked_count integer := 0;
begin
 relevant_parent_ids := case
   when tg_op = 'INSERT' then array[new.score_sheet_id]
   when tg_op = 'DELETE' then array[old.score_sheet_id]
   else array[old.score_sheet_id, new.score_sheet_id]
 end;

 -- Lock OLD and NEW parents (when distinct) in UUID order to avoid lock inversion.
 for parent_id in
   select distinct id
   from unnest(relevant_parent_ids) as ids(id)
   where id is not null
   order by id
 loop
   perform 1 from public.training_score_sheets where id = parent_id for key share;
   if found then locked_count := locked_count + 1; end if;
 end loop;

 if locked_count <> (select count(distinct id) from unnest(relevant_parent_ids) as ids(id) where id is not null) then
   raise exception using errcode='23503', message='Score Sheet parent does not exist.';
 end if;

 if exists (
   select 1 from public.training_score_sheets
   where id = any(relevant_parent_ids)
     and session_type = 'competition'
     and competition_status = 'finalized'
 ) then
   raise exception using errcode='55000', message='Finalized Competition Score Sheets are read-only.';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger competition_finalized_shooters_guard before insert or update or delete on public.training_score_sheet_shooters for each row execute function public.guard_finalized_competition_child();
create trigger competition_finalized_scores_guard before insert or update or delete on public.training_score_sheet_scores for each row execute function public.guard_finalized_competition_child();
create trigger competition_finalized_targets_guard before insert or update or delete on public.training_score_sheet_target_results for each row execute function public.guard_finalized_competition_child();

create or replace function public.finalize_competition_score_sheet(p_score_sheet_id uuid,p_expected_updated_at timestamptz,p_allow_incomplete boolean default false)
returns table(competition_status text,competition_finalized_at timestamptz,competition_finalized_by uuid,competition_finalized_with_incomplete boolean,competition_finalized_unscored_targets integer,competition_reopened_at timestamptz,competition_reopened_by uuid,competition_reopen_count integer,updated_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.training_score_sheets%rowtype; shooter_count integer; expected_each integer; scored integer; unscored integer; invalid_count integer;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required.'; end if;
 select * into s from public.training_score_sheets where id=p_score_sheet_id for update;
 if not found or s.owner_user_id<>auth.uid() then raise exception using errcode='42501',message='Competition Score Sheet access denied.'; end if;
 if s.session_type<>'competition' then raise exception using errcode='22023',message='This is not a Competition Score Sheet.'; end if;
 if s.competition_status='finalized' then raise exception using errcode='55000',message='Competition Score Sheet is already finalized.'; end if;
 if s.updated_at is distinct from p_expected_updated_at then raise exception using errcode='40001',message='Competition Score Sheet revision conflict.'; end if;
 select count(*) into shooter_count from public.training_score_sheet_shooters where score_sheet_id=s.id;
 if shooter_count=0 then raise exception using errcode='22023',message='Add at least one shooter before finalizing.'; end if;
 expected_each := case when s.expected_targets_by_post is not null then (select sum(greatest(value::integer,0)) from jsonb_array_elements_text(to_jsonb(s.expected_targets_by_post))) else s.number_of_posts*s.targets_per_post end;
 if expected_each < 1 then raise exception using errcode='22023',message='Invalid persisted target coverage.'; end if;
 select count(*) into invalid_count from public.training_score_sheet_target_results r left join public.training_score_sheet_shooters sh on sh.id=r.shooter_id and sh.score_sheet_id=s.id where r.score_sheet_id=s.id and (sh.id is null or r.post_number<1 or r.post_number>s.number_of_posts or r.target_number<1 or r.target_number>case when s.expected_targets_by_post is null then s.targets_per_post else (to_jsonb(s.expected_targets_by_post)->>(r.post_number-1))::integer end);
 if invalid_count>0 then raise exception using errcode='22023',message='Invalid persisted target coverage.'; end if;
 select count(*) into scored from public.training_score_sheet_target_results where score_sheet_id=s.id;
 unscored := shooter_count*expected_each-scored;
 if unscored<0 then raise exception using errcode='22023',message='Invalid persisted target coverage.'; end if;
 if unscored>0 and not coalesce(p_allow_incomplete,false) then raise exception using errcode='P0001',message='Competition Score Sheet has incomplete target coverage.'; end if;
 perform set_config('app.competition_lifecycle_transition','finalize',true);
 return query update public.training_score_sheets x set competition_status='finalized',competition_finalized_at=clock_timestamp(),competition_finalized_by=auth.uid(),competition_finalized_with_incomplete=(unscored>0),competition_finalized_unscored_targets=unscored where x.id=s.id returning x.competition_status,x.competition_finalized_at,x.competition_finalized_by,x.competition_finalized_with_incomplete,x.competition_finalized_unscored_targets,x.competition_reopened_at,x.competition_reopened_by,x.competition_reopen_count,x.updated_at;
 perform set_config('app.competition_lifecycle_transition','',true);
end $$;

create or replace function public.reopen_competition_score_sheet(p_score_sheet_id uuid,p_expected_updated_at timestamptz)
returns table(competition_status text,competition_finalized_at timestamptz,competition_finalized_by uuid,competition_finalized_with_incomplete boolean,competition_finalized_unscored_targets integer,competition_reopened_at timestamptz,competition_reopened_by uuid,competition_reopen_count integer,updated_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.training_score_sheets%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Authentication required.'; end if;
 select * into s from public.training_score_sheets where id=p_score_sheet_id for update;
 if not found or s.owner_user_id<>auth.uid() then raise exception using errcode='42501',message='Competition Score Sheet access denied.'; end if;
 if s.session_type<>'competition' then raise exception using errcode='22023',message='This is not a Competition Score Sheet.'; end if;
 if s.competition_status<>'finalized' then raise exception using errcode='55000',message='Competition Score Sheet is not finalized.'; end if;
 if s.updated_at is distinct from p_expected_updated_at then raise exception using errcode='40001',message='Competition Score Sheet revision conflict.'; end if;
 perform set_config('app.competition_lifecycle_transition','reopen',true);
 return query update public.training_score_sheets x set competition_status='live',competition_reopened_at=clock_timestamp(),competition_reopened_by=auth.uid(),competition_reopen_count=x.competition_reopen_count+1 where x.id=s.id returning x.competition_status,x.competition_finalized_at,x.competition_finalized_by,x.competition_finalized_with_incomplete,x.competition_finalized_unscored_targets,x.competition_reopened_at,x.competition_reopened_by,x.competition_reopen_count,x.updated_at;
 perform set_config('app.competition_lifecycle_transition','',true);
end $$;
revoke execute on function public.finalize_competition_score_sheet(uuid,timestamptz,boolean) from public,anon;
revoke execute on function public.reopen_competition_score_sheet(uuid,timestamptz) from public,anon;
grant execute on function public.finalize_competition_score_sheet(uuid,timestamptz,boolean) to authenticated;
grant execute on function public.reopen_competition_score_sheet(uuid,timestamptz) to authenticated;
revoke execute on function public.guard_competition_score_sheet_lifecycle() from public,anon,authenticated;
revoke execute on function public.guard_finalized_competition_child() from public,anon,authenticated;
