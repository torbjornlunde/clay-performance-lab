create table public.competition_course_scorecard_reviews (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, course_number integer not null check(course_number > 0),
 evidence_id uuid references public.competition_scorecard_evidence(id) on delete set null,
 source_image_fingerprint text not null check(source_image_fingerprint ~ '^[a-f0-9]{64}$'), source_evidence_updated_at timestamptz not null,
 reviewed_total_targets integer not null check(reviewed_total_targets=25), reviewed_score integer check(reviewed_score between 0 and 25),
 reviewed_hits integer not null check(reviewed_hits>=0), reviewed_misses integer not null check(reviewed_misses>=0), reviewed_unknowns integer not null check(reviewed_unknowns>=0),
 reviewed_grid jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(session_id,course_number), check(reviewed_hits+reviewed_misses+reviewed_unknowns=25),
 check(reviewed_score is null or (reviewed_hits<=reviewed_score and reviewed_score<=reviewed_hits+reviewed_unknowns)),
 check(reviewed_score is null or reviewed_unknowns<>0 or reviewed_score=reviewed_hits)
);
alter table public.competition_course_scorecard_reviews enable row level security;
revoke all on public.competition_course_scorecard_reviews from public, anon;
grant select on public.competition_course_scorecard_reviews to authenticated;
create policy competition_course_scorecard_reviews_select_own on public.competition_course_scorecard_reviews for select to authenticated
 using(user_id=auth.uid() and public.has_approved_access(auth.uid()) and exists(select 1 from public.sessions s where s.id=session_id and s.user_id=auth.uid() and s.session_type='Competition'));
create trigger competition_course_scorecard_reviews_set_updated_at before update on public.competition_course_scorecard_reviews for each row execute function public.set_updated_at();

create function public.apply_competition_course_scorecard_review(p_session_id uuid,p_evidence_id uuid,p_course_number integer,p_source_image_fingerprint text,p_expected_evidence_updated_at timestamptz,p_reviewed_score integer,p_reviewed_grid jsonb,p_replace_existing boolean default false)
returns public.competition_course_scorecard_reviews language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare u uuid:=auth.uid(); s public.sessions%rowtype; e public.competition_scorecard_evidence%rowtype; existing public.competition_course_scorecard_reviews%rowtype; hits int; misses_count int; unknowns int;
begin
 if u is null then raise exception 'login_required'; end if; if not public.has_approved_access(u) then raise exception 'access_not_approved'; end if;
 select * into s from public.sessions where id=p_session_id for update;
 if s.id is null or s.user_id<>u then raise exception 'forbidden'; end if;
 if s.session_type<>'Competition' or s.discipline<>'Compak Sporting' then raise exception 'unsupported_session'; end if;
 if p_course_number<1 or p_course_number>coalesce(s.course_count,0) or not exists(select 1 from public.session_courses c where c.session_id=s.id and c.course_number=p_course_number) then raise exception 'course_not_found'; end if;
 select * into e from public.competition_scorecard_evidence where id=p_evidence_id for update;
 if e.id is null or e.user_id<>u or e.session_id<>s.id or e.course_number is distinct from p_course_number then raise exception 'evidence_mismatch'; end if;
 if e.updated_at is distinct from p_expected_evidence_updated_at then raise exception 'stale_evidence'; end if;
 if p_source_image_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid_fingerprint'; end if;
 if jsonb_typeof(p_reviewed_grid)<>'array' or jsonb_array_length(p_reviewed_grid)<>25 then raise exception 'invalid_grid'; end if;
 if exists(select 1 from jsonb_array_elements(p_reviewed_grid) x where
   jsonb_typeof(x)<>'object' or (x-'targetNumber'-'result'-'confidence'-'observedMarkCategory'-'warning') <> '{}'::jsonb
   or jsonb_typeof(x->'targetNumber')<>'number' or (x->>'targetNumber')!~ '^([1-9]|1[0-9]|2[0-5])$'
   or jsonb_typeof(x->'result')<>'string' or x->>'result' not in ('hit','miss','unknown')
   or (x ? 'confidence' and (jsonb_typeof(x->'confidence')<>'string' or x->>'confidence' not in ('high','medium','low')))
   or (x ? 'observedMarkCategory' and x->'observedMarkCategory'<>'null'::jsonb and (jsonb_typeof(x->'observedMarkCategory')<>'string' or x->>'observedMarkCategory' not in ('diagonal_stroke','vertical_stroke','check_mark','circle','zero','horizontal_dash','cross','blank','other','unreadable')))
   or (x ? 'warning' and x->'warning'<>'null'::jsonb and (jsonb_typeof(x->'warning')<>'string' or char_length(x->>'warning')>160))
 ) then raise exception 'invalid_grid'; end if;
 if (select count(distinct (x->>'targetNumber')::int) from jsonb_array_elements(p_reviewed_grid)x)<>25 then raise exception 'invalid_grid'; end if;
 select count(*) filter(where x->>'result'='hit'),count(*) filter(where x->>'result'='miss'),count(*) filter(where x->>'result'='unknown') into hits,misses_count,unknowns from jsonb_array_elements(p_reviewed_grid)x;
 if p_reviewed_score is not null and (p_reviewed_score<0 or p_reviewed_score>25 or p_reviewed_score<hits or p_reviewed_score>hits+unknowns) then raise exception 'invalid_score'; end if;
 if p_reviewed_score is null and unknowns=25 then raise exception 'meaningless_review'; end if;
 select * into existing from public.competition_course_scorecard_reviews where session_id=s.id and course_number=p_course_number for update;
 if existing.id is not null and not p_replace_existing then raise exception 'course_review_exists'; end if;
 insert into public.competition_course_scorecard_reviews(session_id,user_id,course_number,evidence_id,source_image_fingerprint,source_evidence_updated_at,reviewed_total_targets,reviewed_score,reviewed_hits,reviewed_misses,reviewed_unknowns,reviewed_grid)
 values(s.id,u,p_course_number,e.id,p_source_image_fingerprint,e.updated_at,25,p_reviewed_score,hits,misses_count,unknowns,p_reviewed_grid)
 on conflict(session_id,course_number) do update set evidence_id=excluded.evidence_id,source_image_fingerprint=excluded.source_image_fingerprint,source_evidence_updated_at=excluded.source_evidence_updated_at,reviewed_score=excluded.reviewed_score,reviewed_hits=excluded.reviewed_hits,reviewed_misses=excluded.reviewed_misses,reviewed_unknowns=excluded.reviewed_unknowns,reviewed_grid=excluded.reviewed_grid
 returning * into existing; return existing;
end$$;
revoke all on function public.apply_competition_course_scorecard_review(uuid,uuid,integer,text,timestamptz,integer,jsonb,boolean) from public,anon;
grant execute on function public.apply_competition_course_scorecard_review(uuid,uuid,integer,text,timestamptz,integer,jsonb,boolean) to authenticated;
