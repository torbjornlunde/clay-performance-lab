-- Explicit, private snapshots of finalized Competition Score Sheet results.
create table public.competition_score_sheet_claims (
  id uuid primary key default gen_random_uuid(),
  score_sheet_id uuid not null references public.training_score_sheets(id) on delete cascade,
  shooter_id uuid not null references public.training_score_sheet_shooters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  source_finalized_at timestamptz not null,
  source_reopen_count integer not null,
  source_updated_at timestamptz not null,
  claimed_at timestamptz not null default now(),
  constraint competition_score_sheet_claims_source_unique unique (score_sheet_id, shooter_id),
  constraint competition_score_sheet_claims_session_unique unique (session_id),
  constraint competition_score_sheet_claims_reopen_count_check check (source_reopen_count >= 0)
);

create index competition_score_sheet_claims_user_idx on public.competition_score_sheet_claims(user_id, claimed_at desc);
alter table public.competition_score_sheet_claims enable row level security;
create policy "competition_score_sheet_claims_select_own" on public.competition_score_sheet_claims
  for select to authenticated using (user_id = auth.uid() and public.has_approved_access(auth.uid()));
create policy "competition_score_sheet_claims_no_direct_insert" on public.competition_score_sheet_claims for insert to authenticated with check (false);
create policy "competition_score_sheet_claims_no_direct_update" on public.competition_score_sheet_claims for update to authenticated using (false) with check (false);
create policy "competition_score_sheet_claims_no_direct_delete" on public.competition_score_sheet_claims for delete to authenticated using (false);

create unique index misses_competition_claim_target_unique
  on public.misses(session_id, course_number, target_position)
  where source_type = 'competition_score_sheet_claim' and target_position is not null;

create function public.get_my_competition_score_sheet_results()
returns table(
  score_sheet_id uuid, shooter_id uuid, event_title text, event_date date, location text,
  discipline text, shooter_name text, own_score integer, expected_targets integer,
  scored_targets integer, known_misses integer, post_scores jsonb, finalized_at timestamptz,
  reopen_count integer, claimed_session_id uuid, source_changed boolean
)
language sql security definer stable
set search_path = pg_catalog, public, pg_temp
as $$
  with mine as (
    select s.*, sh.id as linked_shooter_id, sh.shooter_name,
      case when s.expected_targets_by_post is not null
        then (select sum(value::integer) from jsonb_array_elements_text(to_jsonb(s.expected_targets_by_post)))
        else s.number_of_posts * s.targets_per_post end as expected,
      c.session_id as claimed_id, c.source_finalized_at, c.source_reopen_count, c.source_updated_at
    from public.training_score_sheets s
    join public.training_score_sheet_shooters sh on sh.score_sheet_id=s.id and sh.linked_user_id=auth.uid()
    left join public.competition_score_sheet_claims c on c.score_sheet_id=s.id and c.shooter_id=sh.id and c.user_id=auth.uid()
    where auth.uid() is not null and public.has_approved_access(auth.uid())
      and s.session_type='competition' and s.competition_status='finalized'
  ), facts as (
    select m.*,
      (select count(*)::integer from public.training_score_sheet_target_results r where r.score_sheet_id=m.id and r.shooter_id=m.linked_shooter_id) as target_count,
      (select count(*)::integer from public.training_score_sheet_target_results r where r.score_sheet_id=m.id and r.shooter_id=m.linked_shooter_id and r.result='miss') as miss_count,
      (select count(*)::integer from public.training_score_sheet_target_results r where r.score_sheet_id=m.id and r.shooter_id=m.linked_shooter_id and r.result='hit') as hit_count,
      (select count(*)::integer from public.training_score_sheet_scores x where x.score_sheet_id=m.id and x.shooter_id=m.linked_shooter_id) as score_count,
      (select coalesce(sum(x.score),0)::integer from public.training_score_sheet_scores x where x.score_sheet_id=m.id and x.shooter_id=m.linked_shooter_id) as score_sum,
      (select coalesce(sum(x.max_score),0)::integer from public.training_score_sheet_scores x where x.score_sheet_id=m.id and x.shooter_id=m.linked_shooter_id) as max_sum,
      (select coalesce(jsonb_agg(jsonb_build_object('post',x.post_number,'score',x.score,'maximum',x.max_score) order by x.post_number),'[]'::jsonb) from public.training_score_sheet_scores x where x.score_sheet_id=m.id and x.shooter_id=m.linked_shooter_id) as breakdown
    from mine m
  )
  select f.id, f.linked_shooter_id, f.title, f.session_date, f.location, f.discipline,
    f.shooter_name, case when f.target_count=f.expected then f.hit_count else f.score_sum end,
    f.expected, f.target_count, f.miss_count, f.breakdown, f.competition_finalized_at,
    f.competition_reopen_count, f.claimed_id,
    f.claimed_id is not null and (f.source_finalized_at is distinct from f.competition_finalized_at or f.source_reopen_count is distinct from f.competition_reopen_count or f.source_updated_at is distinct from f.updated_at)
  from facts f
  where f.target_count=f.expected or (f.score_count=f.number_of_posts and f.max_sum=f.expected)
  order by f.session_date desc, f.competition_finalized_at desc;
$$;

create function public.claim_competition_score_sheet_result(p_score_sheet_id uuid, p_shooter_id uuid)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user uuid := auth.uid(); v_sheet public.training_score_sheets%rowtype;
  v_shooter public.training_score_sheet_shooters%rowtype; v_existing uuid; v_session uuid;
  v_expected integer; v_target_count integer; v_hits integer; v_score_count integer; v_score integer; v_max integer;
  v_course_count integer; v_sporttrap_series_count integer; v_post_count integer;
  v_targets_per_post integer; v_shooting_format text; v_compact boolean; v_sporttrap boolean;
begin
  if v_user is null then raise exception using errcode='42501',message='Authentication required.'; end if;
  if not public.has_approved_access(v_user) then raise exception using errcode='42501',message='Access denied.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_score_sheet_id::text || ':' || p_shooter_id::text, 276));
  select c.session_id into v_existing from public.competition_score_sheet_claims c where c.score_sheet_id=p_score_sheet_id and c.shooter_id=p_shooter_id;
  if found then
    if exists(select 1 from public.competition_score_sheet_claims c where c.session_id=v_existing and c.user_id=v_user) then return v_existing; end if;
    raise exception using errcode='42501',message='Result claim access denied.';
  end if;
  select * into v_sheet from public.training_score_sheets where id=p_score_sheet_id for key share;
  if not found or v_sheet.session_type<>'competition' or v_sheet.competition_status<>'finalized' then raise exception using errcode='55000',message='A finalized Competition Score Sheet is required.'; end if;
  select * into v_shooter from public.training_score_sheet_shooters where id=p_shooter_id and score_sheet_id=p_score_sheet_id;
  if not found or v_shooter.linked_user_id is distinct from v_user then raise exception using errcode='42501',message='Result claim access denied.'; end if;
  v_expected := case when v_sheet.expected_targets_by_post is not null then (select sum(value::integer) from jsonb_array_elements_text(to_jsonb(v_sheet.expected_targets_by_post))) else v_sheet.number_of_posts*v_sheet.targets_per_post end;
  select count(*)::integer,count(*) filter(where result='hit')::integer into v_target_count,v_hits from public.training_score_sheet_target_results where score_sheet_id=p_score_sheet_id and shooter_id=p_shooter_id;
  select count(*)::integer,coalesce(sum(score),0)::integer,coalesce(sum(max_score),0)::integer into v_score_count,v_score,v_max from public.training_score_sheet_scores where score_sheet_id=p_score_sheet_id and shooter_id=p_shooter_id;
  if v_target_count=v_expected then v_score:=v_hits;
  elsif not (v_score_count=v_sheet.number_of_posts and v_max=v_expected) then raise exception using errcode='22023',message='This shooter result is incomplete.';
  end if;
  v_compact := lower(btrim(v_sheet.discipline)) in ('compak sporting','kompakt leirduesti');
  v_sporttrap := lower(btrim(v_sheet.discipline)) = 'sporttrap';
  if (v_compact or v_sporttrap) and v_expected % 25 <> 0 then
    raise exception using errcode='22023',message='This result cannot be mapped to complete 25-target courses or series.';
  end if;
  v_course_count := case when v_compact then v_expected/25 when v_sporttrap then 1 else v_sheet.number_of_posts end;
  v_sporttrap_series_count := case when v_sporttrap then v_expected/25 else null end;
  v_post_count := case when not v_compact and not v_sporttrap then v_sheet.number_of_posts else null end;
  v_targets_per_post := case when v_post_count is not null and v_sheet.expected_targets_by_post is null then v_sheet.targets_per_post else null end;
  v_shooting_format := case when v_sporttrap then 'Sporttrap' when not v_compact then 'Post-based' else null end;
  insert into public.sessions(user_id,name,discipline,session_type,shooting_format,course_count,sporttrap_series_count,total_targets,competition_date,shooting_ground,own_score,winning_score,post_count,targets_per_post,notes)
  values(v_user,v_sheet.title,v_sheet.discipline,'Competition',v_shooting_format,v_course_count,v_sporttrap_series_count,v_expected,v_sheet.session_date,nullif(btrim(v_sheet.location),''),v_score,null,v_post_count,v_targets_per_post,'Source: Competition Score Sheet claim. Official score is an organizer-owned snapshot.') returning id into v_session;
  insert into public.misses(session_id,course_number,target_position,target_number,target_label,target_type,missed_target,where_miss,main_reason,target_read,source_type)
  select v_session,
    case when v_compact or v_sporttrap then ((r.post_number-1)/5)+1 else r.post_number end,
    case when v_compact or v_sporttrap then ((r.post_number-1)%5)*coalesce(v_sheet.targets_per_post,5)+r.target_number else r.target_number end,
    r.target_number,'Target '||r.target_number,'Unknown','Unknown','Not sure','Unknown','Unknown','competition_score_sheet_claim'
  from public.training_score_sheet_target_results r where r.score_sheet_id=p_score_sheet_id and r.shooter_id=p_shooter_id and r.result='miss';
  insert into public.competition_score_sheet_claims(score_sheet_id,shooter_id,user_id,session_id,source_finalized_at,source_reopen_count,source_updated_at)
  values(p_score_sheet_id,p_shooter_id,v_user,v_session,v_sheet.competition_finalized_at,v_sheet.competition_reopen_count,v_sheet.updated_at);
  return v_session;
end;
$$;

revoke all on function public.get_my_competition_score_sheet_results() from public, anon;
revoke all on function public.claim_competition_score_sheet_result(uuid,uuid) from public, anon;
grant execute on function public.get_my_competition_score_sheet_results() to authenticated;
grant execute on function public.claim_competition_score_sheet_result(uuid,uuid) to authenticated;
grant select on public.competition_score_sheet_claims to authenticated;
