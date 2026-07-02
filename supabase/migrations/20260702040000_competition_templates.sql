-- Published competition setup templates. Additive only; existing sessions/targets are untouched.
create table if not exists public.competition_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_session_id uuid references public.sessions(id) on delete set null,
  name text not null,
  normalized_name text not null,
  competition_date date not null,
  shooting_ground text,
  normalized_shooting_ground text,
  discipline text not null,
  visibility text not null default 'private' check (visibility in ('private','link','searchable')),
  show_creator_name boolean not null default false,
  creator_display_name_snapshot text,
  template_version integer not null default 1 check (template_version > 0),
  template_payload jsonb not null,
  post_count integer not null default 0 check (post_count >= 0),
  target_count integer not null default 0 check (target_count >= 0),
  is_complete boolean not null default false,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint competition_templates_name_present check (btrim(name) <> ''),
  constraint competition_templates_payload_object check (jsonb_typeof(template_payload) = 'object')
);

create table if not exists public.competition_template_copies (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.competition_templates(id) on delete restrict,
  template_version integer not null,
  copied_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_session_id uuid not null references public.sessions(id) on delete cascade,
  copied_at timestamptz not null default now()
);

alter table public.sessions add column if not exists copied_from_competition_template_id uuid references public.competition_templates(id) on delete set null;
alter table public.sessions add column if not exists copied_from_competition_template_version integer;

create index if not exists competition_templates_visibility_idx on public.competition_templates(visibility) where withdrawn_at is null;
create index if not exists competition_templates_discipline_idx on public.competition_templates(discipline) where withdrawn_at is null;
create index if not exists competition_templates_date_idx on public.competition_templates(competition_date) where withdrawn_at is null;
create index if not exists competition_templates_normalized_name_idx on public.competition_templates(normalized_name text_pattern_ops) where withdrawn_at is null;
create index if not exists competition_templates_normalized_ground_idx on public.competition_templates(normalized_shooting_ground text_pattern_ops) where withdrawn_at is null;
create index if not exists competition_templates_owner_idx on public.competition_templates(owner_user_id, updated_at desc);
create index if not exists competition_template_copies_user_idx on public.competition_template_copies(copied_by_user_id, copied_at desc);

create or replace function public.normalize_competition_template_search_text(value text) returns text language sql immutable as $$ select regexp_replace(lower(btrim(coalesce(value,''))), '\s+', ' ', 'g') $$;

create or replace function public.set_competition_template_search_fields() returns trigger language plpgsql as $$
begin
  new.normalized_name := public.normalize_competition_template_search_text(new.name);
  new.normalized_shooting_ground := nullif(public.normalize_competition_template_search_text(new.shooting_ground), '');
  new.updated_at := now();
  if new.visibility <> 'searchable' and tg_op = 'INSERT' and new.show_creator_name is null then new.show_creator_name := false; end if;
  return new;
end $$;

drop trigger if exists competition_templates_set_search_fields on public.competition_templates;
create trigger competition_templates_set_search_fields before insert or update on public.competition_templates for each row execute function public.set_competition_template_search_fields();

alter table public.competition_templates enable row level security;
alter table public.competition_template_copies enable row level security;

drop policy if exists "competition_templates_select_own" on public.competition_templates;
create policy "competition_templates_select_own" on public.competition_templates for select using (public.has_approved_access(auth.uid()) and auth.uid() = owner_user_id);
drop policy if exists "competition_templates_insert_own" on public.competition_templates;
create policy "competition_templates_insert_own" on public.competition_templates for insert with check (public.has_approved_access(auth.uid()) and auth.uid() = owner_user_id);
drop policy if exists "competition_templates_update_own" on public.competition_templates;
create policy "competition_templates_update_own" on public.competition_templates for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists "competition_templates_delete_none" on public.competition_templates;
create policy "competition_templates_delete_none" on public.competition_templates for delete using (false);

drop policy if exists "competition_template_copies_select_own" on public.competition_template_copies;
create policy "competition_template_copies_select_own" on public.competition_template_copies for select using (public.has_approved_access(auth.uid()) and copied_by_user_id = auth.uid());
drop policy if exists "competition_template_copies_insert_own" on public.competition_template_copies;
create policy "competition_template_copies_insert_own" on public.competition_template_copies for insert with check (public.has_approved_access(auth.uid()) and copied_by_user_id = auth.uid());

create or replace function public.search_competition_templates(p_name text default null, p_date date default null, p_discipline text default null, p_shooting_ground text default null)
returns table (id uuid, name text, competition_date date, shooting_ground text, discipline text, creator_label text, post_count integer, target_count integer, is_complete boolean, template_version integer, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.competition_date, t.shooting_ground, t.discipline,
    case when t.show_creator_name and nullif(t.creator_display_name_snapshot,'') is not null then 'Created by ' || t.creator_display_name_snapshot else 'Created by another user' end,
    t.post_count, t.target_count, t.is_complete, t.template_version, t.updated_at
  from public.competition_templates t
  where public.has_approved_access(auth.uid())
    and t.visibility = 'searchable'
    and t.withdrawn_at is null
    and (p_name is null or t.normalized_name like '%' || public.normalize_competition_template_search_text(p_name) || '%')
    and (p_date is null or t.competition_date = p_date)
    and (p_discipline is null or t.discipline = p_discipline)
    and (p_shooting_ground is null or coalesce(t.normalized_shooting_ground,'') like '%' || public.normalize_competition_template_search_text(p_shooting_ground) || '%')
  order by t.updated_at desc
  limit 50;
$$;

create or replace function public.get_competition_template_preview(p_template_id uuid)
returns table (id uuid, name text, competition_date date, shooting_ground text, discipline text, creator_label text, post_count integer, target_count integer, is_complete boolean, template_version integer, template_payload jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.competition_date, t.shooting_ground, t.discipline,
    case when t.show_creator_name and nullif(t.creator_display_name_snapshot,'') is not null then 'Created by ' || t.creator_display_name_snapshot else 'Created by another user' end,
    t.post_count, t.target_count, t.is_complete, t.template_version, t.template_payload, t.updated_at
  from public.competition_templates t
  where public.has_approved_access(auth.uid())
    and t.id = p_template_id
    and t.withdrawn_at is null
    and (t.owner_user_id = auth.uid() or t.visibility in ('searchable','link'));
$$;

create or replace function public.copy_competition_template_to_new_session(p_template_id uuid, p_name text default null, p_competition_date date default null, p_shooting_ground text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.competition_templates%rowtype; new_session_id uuid; post_item jsonb; pres_item jsonb; target_item jsonb; physical_item jsonb; course_item jsonb;
begin
  if not public.has_approved_access(auth.uid()) then raise exception 'Access required'; end if;
  select * into t from public.competition_templates where id = p_template_id and withdrawn_at is null and (visibility in ('searchable','link') or owner_user_id = auth.uid());
  if not found then raise exception 'Template not available'; end if;
  insert into public.sessions(user_id,name,discipline,session_type,shooting_format,course_count,total_targets,competition_date,shooting_ground,post_count,targets_per_post,default_post_format,copied_from_competition_template_id,copied_from_competition_template_version)
  values(auth.uid(), coalesce(nullif(btrim(p_name),''), t.name), t.discipline, 'Competition', t.template_payload#>>'{metadata,shootingFormat}', nullif(t.template_payload#>>'{metadata,postCount}','')::integer, t.target_count, coalesce(p_competition_date,t.competition_date), coalesce(nullif(btrim(p_shooting_ground),''), t.shooting_ground), nullif(t.template_payload#>>'{metadata,postCount}','')::integer, nullif(t.template_payload#>>'{metadata,targetsPerPost}','')::integer, t.template_payload#>>'{metadata,defaultPostFormat}', t.id, t.template_version) returning id into new_session_id;
  for course_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,program,courses}','[]'::jsonb)) loop
    insert into public.session_courses(session_id,course_number,fitasc_scheme,shooter_number,start_plate) values(new_session_id,(course_item->>'courseNumber')::integer,nullif(course_item->>'fitascScheme','')::integer,nullif(course_item->>'shooterNumber','')::integer,nullif(course_item->>'startPlate','')::integer);
  end loop;
  for post_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,posts}','[]'::jsonb)) loop
    insert into public.session_post_details(session_id,post_number,instructions,source_text) values(new_session_id,(post_item->>'postNumber')::integer,nullif(post_item->>'instructions',''),nullif(post_item->>'sourceText','')) on conflict (session_id,post_number) do update set instructions=excluded.instructions, source_text=excluded.source_text, updated_at=now();
    for pres_item in select * from jsonb_array_elements(coalesce(post_item->'presentations','[]'::jsonb)) loop
      for target_item in select * from jsonb_array_elements(coalesce(pres_item->'targets','[]'::jsonb)) loop
        insert into public.session_post_targets(session_id,post_number,target_position,presentation_number,presentation_type,position_in_presentation,target_label,target_type,direction,angle,speed,distance,difficulty,notes)
        values(new_session_id,(post_item->>'postNumber')::integer,(target_item->>'targetPosition')::integer,(pres_item->>'presentationNumber')::integer,pres_item->>'presentationType',(target_item->>'positionInPresentation')::integer,target_item#>>'{details,label}',target_item#>>'{details,targetType}',target_item#>>'{details,direction}',target_item#>>'{details,angle}',target_item#>>'{details,speed}',target_item#>>'{details,distance}',target_item#>>'{details,difficulty}',target_item#>>'{details,notes}');
      end loop;
    end loop;
  end loop;
  for physical_item in select * from jsonb_array_elements(coalesce(t.template_payload#>'{setup,physicalTargets}','[]'::jsonb)) loop
    insert into public.session_target_definitions(session_id,course_number,machine,target_type,direction,angle,speed,distance,difficulty,notes)
    values(new_session_id,(physical_item->>'courseNumber')::integer,physical_item->>'machine',physical_item#>>'{details,targetType}',physical_item#>>'{details,direction}',physical_item#>>'{details,angle}',physical_item#>>'{details,speed}',physical_item#>>'{details,distance}',physical_item#>>'{details,difficulty}',physical_item#>>'{details,notes}');
  end loop;
  insert into public.competition_template_copies(template_id,template_version,copied_by_user_id,created_session_id) values(t.id,t.template_version,auth.uid(),new_session_id);
  return new_session_id;
end $$;

comment on table public.competition_templates is 'Versioned, explicitly published competition setup snapshots. Payload is whitelisted application JSON and excludes scores, misses, equipment, participants, owner emails and source session IDs.';
