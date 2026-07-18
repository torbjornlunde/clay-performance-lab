create or replace function public.normalize_user_shooting_ground_name(value text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]åæøäöüéèáàíìóòúùñç]+', ' ', 'g') as text_value
  ), jff_normalized as (
    select regexp_replace(text_value, '(^|[[:space:]])j[[:space:]]*f[[:space:]]*f([[:space:]]|$)', '\1jff\2', 'g') as text_value
    from cleaned
  ), tokens as (
    select token, ord
    from jff_normalized, unnest(regexp_split_to_array(text_value, '[[:space:]]+')) with ordinality as split(token, ord)
  )
  select nullif(string_agg(token, ' ' order by ord), '')
  from tokens
  where token <> ''
    and token not in ('shooting','ground','clay','target','range','club','association','venue','bane','leirduebane','leirduebanen')
$$;

create table if not exists public.user_shooting_grounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  normalized_display_name text not null,
  country_code text,
  municipality text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, normalized_display_name)
);

create table if not exists public.user_shooting_ground_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_shooting_ground_id uuid not null references public.user_shooting_grounds(id) on delete cascade,
  alias_name text not null,
  normalized_alias text not null,
  source text,
  created_at timestamptz not null default now(),
  unique(user_id, normalized_alias, source)
);

alter table public.sessions add column if not exists user_shooting_ground_id uuid references public.user_shooting_grounds(id) on delete set null;
alter table public.training_logs add column if not exists user_shooting_ground_id uuid references public.user_shooting_grounds(id) on delete set null;
alter table public.training_score_sheets add column if not exists user_shooting_ground_id uuid references public.user_shooting_grounds(id) on delete set null;

create index if not exists user_shooting_grounds_user_idx on public.user_shooting_grounds(user_id, display_name);
create index if not exists user_shooting_ground_aliases_ground_idx on public.user_shooting_ground_aliases(user_shooting_ground_id);
create index if not exists sessions_user_shooting_ground_idx on public.sessions(user_id, user_shooting_ground_id);
create index if not exists training_logs_user_shooting_ground_idx on public.training_logs(owner_user_id, user_shooting_ground_id);
create index if not exists training_score_sheets_user_shooting_ground_idx on public.training_score_sheets(owner_user_id, user_shooting_ground_id);

drop trigger if exists user_shooting_grounds_set_updated_at on public.user_shooting_grounds;
create trigger user_shooting_grounds_set_updated_at before update on public.user_shooting_grounds for each row execute function public.set_updated_at();

create or replace function public.ensure_own_user_shooting_ground()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if tg_table_name = 'sessions' then owner_id := new.user_id;
  else owner_id := new.owner_user_id;
  end if;
  if new.user_shooting_ground_id is not null and not exists (
    select 1 from public.user_shooting_grounds g where g.id = new.user_shooting_ground_id and g.user_id = owner_id
  ) then
    raise exception 'user_shooting_ground_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_ensure_own_user_shooting_ground on public.sessions;
create trigger sessions_ensure_own_user_shooting_ground before insert or update of user_id, user_shooting_ground_id on public.sessions for each row execute function public.ensure_own_user_shooting_ground();
drop trigger if exists training_logs_ensure_own_user_shooting_ground on public.training_logs;
create trigger training_logs_ensure_own_user_shooting_ground before insert or update of owner_user_id, user_shooting_ground_id on public.training_logs for each row execute function public.ensure_own_user_shooting_ground();
drop trigger if exists training_score_sheets_ensure_own_user_shooting_ground on public.training_score_sheets;
create trigger training_score_sheets_ensure_own_user_shooting_ground before insert or update of owner_user_id, user_shooting_ground_id on public.training_score_sheets for each row execute function public.ensure_own_user_shooting_ground();

alter table public.user_shooting_grounds enable row level security;
alter table public.user_shooting_ground_aliases enable row level security;

drop policy if exists "user_shooting_grounds_select_own" on public.user_shooting_grounds;
create policy "user_shooting_grounds_select_own" on public.user_shooting_grounds for select using (auth.uid() = user_id and public.has_approved_access(auth.uid()));
drop policy if exists "user_shooting_grounds_insert_own" on public.user_shooting_grounds;
create policy "user_shooting_grounds_insert_own" on public.user_shooting_grounds for insert with check (auth.uid() = user_id and public.has_approved_access(auth.uid()) and normalized_display_name = public.normalize_user_shooting_ground_name(display_name));
drop policy if exists "user_shooting_grounds_update_own" on public.user_shooting_grounds;
create policy "user_shooting_grounds_update_own" on public.user_shooting_grounds for update using (auth.uid() = user_id and public.has_approved_access(auth.uid())) with check (auth.uid() = user_id and public.has_approved_access(auth.uid()) and normalized_display_name = public.normalize_user_shooting_ground_name(display_name));
drop policy if exists "user_shooting_grounds_delete_own" on public.user_shooting_grounds;
create policy "user_shooting_grounds_delete_own" on public.user_shooting_grounds for delete using (auth.uid() = user_id and public.has_approved_access(auth.uid()));

drop policy if exists "user_shooting_ground_aliases_select_own" on public.user_shooting_ground_aliases;
create policy "user_shooting_ground_aliases_select_own" on public.user_shooting_ground_aliases for select using (auth.uid() = user_id and public.has_approved_access(auth.uid()));
drop policy if exists "user_shooting_ground_aliases_insert_own" on public.user_shooting_ground_aliases;
create policy "user_shooting_ground_aliases_insert_own" on public.user_shooting_ground_aliases for insert with check (auth.uid() = user_id and public.has_approved_access(auth.uid()) and normalized_alias = public.normalize_user_shooting_ground_name(alias_name) and exists (select 1 from public.user_shooting_grounds g where g.id = user_shooting_ground_id and g.user_id = auth.uid()));
drop policy if exists "user_shooting_ground_aliases_update_own" on public.user_shooting_ground_aliases;
create policy "user_shooting_ground_aliases_update_own" on public.user_shooting_ground_aliases for update using (auth.uid() = user_id and public.has_approved_access(auth.uid())) with check (auth.uid() = user_id and public.has_approved_access(auth.uid()) and normalized_alias = public.normalize_user_shooting_ground_name(alias_name) and exists (select 1 from public.user_shooting_grounds g where g.id = user_shooting_ground_id and g.user_id = auth.uid()));
drop policy if exists "user_shooting_ground_aliases_delete_own" on public.user_shooting_ground_aliases;
create policy "user_shooting_ground_aliases_delete_own" on public.user_shooting_ground_aliases for delete using (auth.uid() = user_id and public.has_approved_access(auth.uid()));

create or replace function public.list_user_shooting_ground_names()
returns table (source text, alias_name text, normalized_alias text, record_count bigint, latest_date date, user_shooting_ground_id uuid)
language sql
stable
as $$
  select 'sessions', btrim(shooting_ground), public.normalize_user_shooting_ground_name(shooting_ground), count(*), max(coalesce(competition_date, created_at::date)), user_shooting_ground_id
  from public.sessions
  where user_id = auth.uid() and nullif(btrim(coalesce(shooting_ground, '')), '') is not null
  group by btrim(shooting_ground), public.normalize_user_shooting_ground_name(shooting_ground), user_shooting_ground_id
  union all
  select 'training_logs', btrim(location), public.normalize_user_shooting_ground_name(location), count(*), max(coalesce(date, created_at::date)), user_shooting_ground_id
  from public.training_logs
  where owner_user_id = auth.uid() and nullif(btrim(coalesce(location, '')), '') is not null
  group by btrim(location), public.normalize_user_shooting_ground_name(location), user_shooting_ground_id
  union all
  select 'training_score_sheets', btrim(location), public.normalize_user_shooting_ground_name(location), count(*), max(coalesce(session_date, created_at::date)), user_shooting_ground_id
  from public.training_score_sheets
  where owner_user_id = auth.uid() and nullif(btrim(coalesce(location, '')), '') is not null
  group by btrim(location), public.normalize_user_shooting_ground_name(location), user_shooting_ground_id;
$$;

create or replace function public.create_user_shooting_ground(p_display_name text)
returns uuid
language plpgsql
as $$
declare
  ground_id uuid;
  normalized text := public.normalize_user_shooting_ground_name(p_display_name);
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if normalized is null then raise exception 'display_name_required'; end if;
  insert into public.user_shooting_grounds(user_id, display_name, normalized_display_name)
  values (auth.uid(), btrim(p_display_name), normalized)
  on conflict (user_id, normalized_display_name) do update set display_name = excluded.display_name
  returning id into ground_id;
  return ground_id;
end;
$$;

create or replace function public.attach_user_shooting_ground_alias(p_ground_id uuid, p_alias_name text, p_source text)
returns uuid
language plpgsql
as $$
declare
  alias_id uuid;
  normalized text := public.normalize_user_shooting_ground_name(p_alias_name);
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if normalized is null then raise exception 'alias_name_required'; end if;
  if not exists (select 1 from public.user_shooting_grounds where id = p_ground_id and user_id = auth.uid()) then raise exception 'ground_not_found'; end if;
  insert into public.user_shooting_ground_aliases(user_id, user_shooting_ground_id, alias_name, normalized_alias, source)
  values (auth.uid(), p_ground_id, btrim(p_alias_name), normalized, p_source)
  on conflict (user_id, normalized_alias, source) do update set user_shooting_ground_id = excluded.user_shooting_ground_id, alias_name = excluded.alias_name
  returning id into alias_id;
  return alias_id;
end;
$$;

create or replace function public.assign_user_shooting_ground_alias(p_ground_id uuid, p_alias_name text, p_source text)
returns integer
language plpgsql
as $$
declare
  affected integer := 0;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if not exists (select 1 from public.user_shooting_grounds where id = p_ground_id and user_id = auth.uid()) then raise exception 'ground_not_found'; end if;
  if p_source = 'sessions' then
    update public.sessions set user_shooting_ground_id = p_ground_id where user_id = auth.uid() and btrim(shooting_ground) = btrim(p_alias_name);
    get diagnostics affected = row_count;
  elsif p_source = 'training_logs' then
    update public.training_logs set user_shooting_ground_id = p_ground_id where owner_user_id = auth.uid() and btrim(location) = btrim(p_alias_name);
    get diagnostics affected = row_count;
  elsif p_source = 'training_score_sheets' then
    update public.training_score_sheets set user_shooting_ground_id = p_ground_id where owner_user_id = auth.uid() and btrim(location) = btrim(p_alias_name);
    get diagnostics affected = row_count;
  end if;
  return affected;
end;
$$;

create or replace function public.remove_user_shooting_ground_alias(p_alias_id uuid)
returns void
language plpgsql
as $$
declare
  removed record;
begin
  delete from public.user_shooting_ground_aliases where id = p_alias_id and user_id = auth.uid() returning * into removed;
  if removed.id is null then return; end if;
  if removed.source = 'sessions' then
    update public.sessions set user_shooting_ground_id = null where user_id = auth.uid() and user_shooting_ground_id = removed.user_shooting_ground_id and btrim(shooting_ground) = btrim(removed.alias_name);
  elsif removed.source = 'training_logs' then
    update public.training_logs set user_shooting_ground_id = null where owner_user_id = auth.uid() and user_shooting_ground_id = removed.user_shooting_ground_id and btrim(location) = btrim(removed.alias_name);
  elsif removed.source = 'training_score_sheets' then
    update public.training_score_sheets set user_shooting_ground_id = null where owner_user_id = auth.uid() and user_shooting_ground_id = removed.user_shooting_ground_id and btrim(location) = btrim(removed.alias_name);
  end if;
end;
$$;
