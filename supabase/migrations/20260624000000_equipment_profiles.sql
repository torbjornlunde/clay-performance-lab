create extension if not exists "pgcrypto";

create table if not exists public.equipment_weapons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  manufacturer text,
  model text,
  weapon_type text not null,
  gauge text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_weapons_display_name_check check (length(btrim(display_name)) > 0),
  constraint equipment_weapons_weapon_type_check check (weapon_type in ('over_under', 'side_by_side', 'semi_automatic', 'pump_action'))
);

create unique index if not exists equipment_weapons_one_default_per_user on public.equipment_weapons(user_id) where is_default;
create index if not exists equipment_weapons_user_id_idx on public.equipment_weapons(user_id);

create table if not exists public.equipment_weapon_chokes (
  id uuid primary key default gen_random_uuid(),
  weapon_id uuid not null references public.equipment_weapons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  manufacturer text,
  choke_system text,
  constriction text,
  choke_kind text not null default 'interchangeable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_weapon_chokes_label_check check (length(btrim(label)) > 0),
  constraint equipment_weapon_chokes_kind_check check (choke_kind in ('fixed', 'interchangeable')),
  constraint equipment_weapon_chokes_weapon_user_unique unique (id, weapon_id, user_id)
);

create index if not exists equipment_weapon_chokes_weapon_id_idx on public.equipment_weapon_chokes(weapon_id);
create index if not exists equipment_weapon_chokes_user_id_idx on public.equipment_weapon_chokes(user_id);

create table if not exists public.equipment_weapon_current_choke_assignments (
  id uuid primary key default gen_random_uuid(),
  weapon_id uuid not null references public.equipment_weapons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null,
  choke_id uuid,
  fixed_choke_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_current_choke_slot_check check (slot in ('upper', 'lower', 'left', 'right', 'single')),
  constraint equipment_current_choke_assignment_value_check check (choke_id is not null or fixed_choke_label is null or length(btrim(fixed_choke_label)) > 0),
  constraint equipment_current_choke_assignment_unique unique (weapon_id, slot),
  constraint equipment_current_choke_weapon_user_unique unique (id, weapon_id, user_id),
  constraint equipment_weapon_choke_same_weapon foreign key (choke_id, weapon_id, user_id) references public.equipment_weapon_chokes(id, weapon_id, user_id) on delete set null (choke_id)
);

create index if not exists equipment_current_choke_weapon_id_idx on public.equipment_weapon_current_choke_assignments(weapon_id);
create index if not exists equipment_current_choke_user_id_idx on public.equipment_weapon_current_choke_assignments(user_id);

create table if not exists public.equipment_ammunition_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manufacturer text not null,
  product_name text,
  gauge text,
  payload_grams numeric(5,2) not null,
  shot_size text,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_ammunition_manufacturer_check check (length(btrim(manufacturer)) > 0),
  constraint equipment_ammunition_payload_check check (payload_grams > 0)
);

create unique index if not exists equipment_ammunition_one_default_per_user on public.equipment_ammunition_profiles(user_id) where is_default;
create index if not exists equipment_ammunition_user_id_idx on public.equipment_ammunition_profiles(user_id);

create or replace function public.equipment_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.equipment_clear_other_default_weapons()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.equipment_weapons set is_default = false where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

create or replace function public.equipment_clear_other_default_ammunition()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.equipment_ammunition_profiles set is_default = false where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

create or replace function public.equipment_validate_weapon_owner()
returns trigger
language plpgsql
as $$
declare
  selected_weapon_type text;
begin
  select w.weapon_type into selected_weapon_type
  from public.equipment_weapons w
  where w.id = new.weapon_id and w.user_id = new.user_id;

  if selected_weapon_type is null then
    raise exception 'Equipment record must belong to the same user as its weapon.';
  end if;

  if tg_table_name = 'equipment_weapon_current_choke_assignments' then
    if selected_weapon_type = 'over_under' and new.slot not in ('upper', 'lower') then
      raise exception 'Invalid choke slot for over/under weapon.';
    elsif selected_weapon_type = 'side_by_side' and new.slot not in ('left', 'right') then
      raise exception 'Invalid choke slot for side-by-side weapon.';
    elsif selected_weapon_type in ('semi_automatic', 'pump_action') and new.slot <> 'single' then
      raise exception 'Invalid choke slot for single-barrel weapon.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists equipment_weapons_set_updated_at on public.equipment_weapons;
create trigger equipment_weapons_set_updated_at before update on public.equipment_weapons for each row execute function public.equipment_touch_updated_at();
drop trigger if exists equipment_weapon_chokes_set_updated_at on public.equipment_weapon_chokes;
create trigger equipment_weapon_chokes_set_updated_at before update on public.equipment_weapon_chokes for each row execute function public.equipment_touch_updated_at();
drop trigger if exists equipment_current_chokes_set_updated_at on public.equipment_weapon_current_choke_assignments;
create trigger equipment_current_chokes_set_updated_at before update on public.equipment_weapon_current_choke_assignments for each row execute function public.equipment_touch_updated_at();
drop trigger if exists equipment_ammunition_set_updated_at on public.equipment_ammunition_profiles;
create trigger equipment_ammunition_set_updated_at before update on public.equipment_ammunition_profiles for each row execute function public.equipment_touch_updated_at();

drop trigger if exists equipment_weapons_default_guard on public.equipment_weapons;
create trigger equipment_weapons_default_guard before insert or update of is_default on public.equipment_weapons for each row execute function public.equipment_clear_other_default_weapons();
drop trigger if exists equipment_ammunition_default_guard on public.equipment_ammunition_profiles;
create trigger equipment_ammunition_default_guard before insert or update of is_default on public.equipment_ammunition_profiles for each row execute function public.equipment_clear_other_default_ammunition();

drop trigger if exists equipment_weapon_chokes_owner_guard on public.equipment_weapon_chokes;
create trigger equipment_weapon_chokes_owner_guard before insert or update of weapon_id, user_id on public.equipment_weapon_chokes for each row execute function public.equipment_validate_weapon_owner();
drop trigger if exists equipment_current_chokes_owner_guard on public.equipment_weapon_current_choke_assignments;
create trigger equipment_current_chokes_owner_guard before insert or update of weapon_id, user_id on public.equipment_weapon_current_choke_assignments for each row execute function public.equipment_validate_weapon_owner();

alter table public.equipment_weapons enable row level security;
alter table public.equipment_weapon_chokes enable row level security;
alter table public.equipment_weapon_current_choke_assignments enable row level security;
alter table public.equipment_ammunition_profiles enable row level security;

drop policy if exists "equipment_weapons_select_own" on public.equipment_weapons;
create policy "equipment_weapons_select_own" on public.equipment_weapons for select using (auth.uid() = user_id);
drop policy if exists "equipment_weapons_insert_own" on public.equipment_weapons;
create policy "equipment_weapons_insert_own" on public.equipment_weapons for insert with check (auth.uid() = user_id);
drop policy if exists "equipment_weapons_update_own" on public.equipment_weapons;
create policy "equipment_weapons_update_own" on public.equipment_weapons for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "equipment_weapons_delete_own" on public.equipment_weapons;
create policy "equipment_weapons_delete_own" on public.equipment_weapons for delete using (auth.uid() = user_id);

drop policy if exists "equipment_weapon_chokes_select_own" on public.equipment_weapon_chokes;
create policy "equipment_weapon_chokes_select_own" on public.equipment_weapon_chokes for select using (auth.uid() = user_id);
drop policy if exists "equipment_weapon_chokes_insert_own" on public.equipment_weapon_chokes;
create policy "equipment_weapon_chokes_insert_own" on public.equipment_weapon_chokes for insert with check (auth.uid() = user_id);
drop policy if exists "equipment_weapon_chokes_update_own" on public.equipment_weapon_chokes;
create policy "equipment_weapon_chokes_update_own" on public.equipment_weapon_chokes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "equipment_weapon_chokes_delete_own" on public.equipment_weapon_chokes;
create policy "equipment_weapon_chokes_delete_own" on public.equipment_weapon_chokes for delete using (auth.uid() = user_id);

drop policy if exists "equipment_current_chokes_select_own" on public.equipment_weapon_current_choke_assignments;
create policy "equipment_current_chokes_select_own" on public.equipment_weapon_current_choke_assignments for select using (auth.uid() = user_id);
drop policy if exists "equipment_current_chokes_insert_own" on public.equipment_weapon_current_choke_assignments;
create policy "equipment_current_chokes_insert_own" on public.equipment_weapon_current_choke_assignments for insert with check (auth.uid() = user_id);
drop policy if exists "equipment_current_chokes_update_own" on public.equipment_weapon_current_choke_assignments;
create policy "equipment_current_chokes_update_own" on public.equipment_weapon_current_choke_assignments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "equipment_current_chokes_delete_own" on public.equipment_weapon_current_choke_assignments;
create policy "equipment_current_chokes_delete_own" on public.equipment_weapon_current_choke_assignments for delete using (auth.uid() = user_id);

drop policy if exists "equipment_ammunition_select_own" on public.equipment_ammunition_profiles;
create policy "equipment_ammunition_select_own" on public.equipment_ammunition_profiles for select using (auth.uid() = user_id);
drop policy if exists "equipment_ammunition_insert_own" on public.equipment_ammunition_profiles;
create policy "equipment_ammunition_insert_own" on public.equipment_ammunition_profiles for insert with check (auth.uid() = user_id);
drop policy if exists "equipment_ammunition_update_own" on public.equipment_ammunition_profiles;
create policy "equipment_ammunition_update_own" on public.equipment_ammunition_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "equipment_ammunition_delete_own" on public.equipment_ammunition_profiles;
create policy "equipment_ammunition_delete_own" on public.equipment_ammunition_profiles for delete using (auth.uid() = user_id);
