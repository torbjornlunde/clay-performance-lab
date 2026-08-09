-- Privacy-safe, contextual shooter lookup. Direct shooter_profiles RLS remains owner-only.
alter table public.shooter_profiles
  add column shooter_directory_visible boolean not null default false;

comment on column public.shooter_profiles.shooter_directory_visible is
  'Explicit opt-in to authenticated name-and-country score-sheet directory searches.';

alter table public.training_score_sheet_shooters
  add constraint training_score_sheet_shooters_sheet_linked_user_unique
  unique (score_sheet_id, linked_user_id)
  deferrable initially immediate;

create or replace function public.search_shooter_directory(
  search_text text,
  result_limit integer default 8
)
returns table(user_id uuid, display_name text, country text)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  normalized_query text := lower(regexp_replace(btrim(coalesce(search_text, '')), '\s+', ' ', 'g'));
  capped_limit integer := least(greatest(coalesce(result_limit, 8), 1), 10);
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if not public.has_approved_access(auth.uid()) then
    raise exception using errcode = '42501', message = 'Access denied.';
  end if;
  if char_length(normalized_query) < 2 then return; end if;

  return query
  with eligible as (
    select
      p.user_id,
      case
        when nullif(btrim(p.first_name), '') is not null and nullif(btrim(p.last_name), '') is not null
          then regexp_replace(btrim(p.first_name) || ' ' || btrim(p.last_name), '\s+', ' ', 'g')
        else regexp_replace(btrim(coalesce(p.shooter_name, '')), '\s+', ' ', 'g')
      end as resolved_name,
      btrim(p.country) as resolved_country,
      lower(regexp_replace(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '\s+', ' ', 'g')) as canonical_search,
      lower(regexp_replace(btrim(coalesce(p.shooter_name, '')), '\s+', ' ', 'g')) as legacy_search
    from public.shooter_profiles p
    where p.shooter_directory_visible = true
  )
  select e.user_id, e.resolved_name, e.resolved_country
  from eligible e
  where e.resolved_name <> '' and e.resolved_country <> ''
    and (strpos(e.canonical_search, normalized_query) > 0 or strpos(e.legacy_search, normalized_query) > 0)
  order by
    case when strpos(lower(e.resolved_name), normalized_query) = 1 then 0 else 1 end,
    lower(e.resolved_name), e.user_id
  limit capped_limit;
end;
$$;

revoke all on function public.search_shooter_directory(text, integer) from public, anon;
grant execute on function public.search_shooter_directory(text, integer) to authenticated;
