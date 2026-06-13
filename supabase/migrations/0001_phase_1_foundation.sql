create extension if not exists pgcrypto;

create type public.global_role as enum ('admin', 'user');
create type public.shop_role as enum ('shop_lead', 'viewer');
create type public.member_status as enum ('invited', 'active', 'suspended');
create type public.kpi_category as enum ('provision', 'unit', 'quality', 'tnps');
create type public.kpi_value_type as enum ('money', 'count', 'score');
create type public.kpi_status as enum ('draft', 'active', 'archived');
create type public.porting_type as enum ('mobile_pk', 'mobile_gk');
create type public.porting_status as enum ('open', 'planned', 'effective', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  global_role public.global_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  location text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_memberships (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.shop_role not null default 'viewer',
  status public.member_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

create table public.shop_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  role public.shop_role not null default 'viewer',
  token uuid not null default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,80}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  category public.kpi_category not null,
  value_type public.kpi_value_type not null,
  unit text not null,
  sort_order integer not null default 100,
  status public.kpi_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quarterly_targets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kpi_definition_id uuid not null references public.kpi_definitions(id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  target_value numeric not null default 0,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, kpi_definition_id, year, quarter)
);

create table public.daily_kpi_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kpi_definition_id uuid not null references public.kpi_definitions(id) on delete cascade,
  entry_date date not null,
  value numeric not null default 0,
  note text,
  source text not null default 'manual',
  source_ref_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tnps_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  calendar_week integer not null check (calendar_week between 1 and 53),
  value numeric not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, year, calendar_week)
);

create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  porting_type public.porting_type not null,
  provision_amount numeric not null default 0,
  is_active boolean not null default true,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_name text,
  porting_type public.porting_type not null,
  porting_date date,
  date_unknown boolean not null default false,
  tariff_id uuid references public.tariffs(id) on delete set null,
  provision_amount numeric not null default 0,
  kkm text,
  note text,
  status public.porting_status not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((date_unknown = true and porting_date is null) or (date_unknown = false))
);

create table public.porting_kpi_impacts (
  id uuid primary key default gen_random_uuid(),
  porting_id uuid not null references public.portings(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  kpi_definition_id uuid not null references public.kpi_definitions(id) on delete restrict,
  impact_date date not null,
  value numeric not null,
  created_at timestamptz not null default now(),
  unique (porting_id, kpi_definition_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  function_title text,
  is_active boolean not null default true,
  start_date date,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sick_days (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  day_count integer generated always as ((end_date - start_date) + 1) stored,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.special_opening_days (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  date date not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, date)
);

create table public.special_closing_days (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  date date not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, date)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  shop_id uuid references public.shops(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.kpi_definitions (code, name, category, value_type, unit, sort_order)
values
  ('provision_broadband', 'Breitband', 'provision', 'money', 'EUR', 10),
  ('provision_tv', 'TV', 'provision', 'money', 'EUR', 20),
  ('provision_mobile', 'Mobilfunk', 'provision', 'money', 'EUR', 30),
  ('units_broadband_pk', 'Breitband PK', 'unit', 'count', 'Stueck', 110),
  ('units_tv', 'TV', 'unit', 'count', 'Stueck', 120),
  ('units_speedup', 'SpeedUp', 'unit', 'count', 'Stueck', 130),
  ('units_mobile_pk', 'Mobilfunk PK', 'unit', 'count', 'Stueck', 140),
  ('units_broadband_gk', 'Breitband GK', 'unit', 'count', 'Stueck', 150),
  ('units_mobile_gk', 'Mobilfunk GK', 'unit', 'count', 'Stueck', 160),
  ('quality_app_activation', 'App-Aktivierung', 'quality', 'count', 'Stueck', 210),
  ('quality_leads', 'Leads', 'quality', 'count', 'Stueck', 220),
  ('quality_kek', 'KeK', 'quality', 'count', 'Stueck', 230),
  ('quality_pom', 'POM', 'quality', 'count', 'Stueck', 240),
  ('tnps', 'tNPS', 'tnps', 'score', 'Score', 310)
on conflict (code) do nothing;

create index shop_memberships_user_id_idx on public.shop_memberships(user_id);
create index shop_memberships_shop_role_idx on public.shop_memberships(shop_id, role);
create index shop_invites_email_idx on public.shop_invites(email);
create unique index shop_invites_shop_email_unique on public.shop_invites(shop_id, lower(email));
create index quarterly_targets_shop_period_idx on public.quarterly_targets(shop_id, year, quarter);
create index daily_kpi_entries_shop_date_idx on public.daily_kpi_entries(shop_id, entry_date);
create unique index daily_entries_manual_unique
  on public.daily_kpi_entries(shop_id, kpi_definition_id, entry_date, source)
  where source_ref_id is null;
create unique index daily_entries_source_unique
  on public.daily_kpi_entries(shop_id, kpi_definition_id, entry_date, source, source_ref_id)
  where source_ref_id is not null;
create index tnps_entries_shop_week_idx on public.tnps_entries(shop_id, year, calendar_week);
create index tariffs_shop_type_idx on public.tariffs(shop_id, porting_type);
create index portings_shop_status_date_idx on public.portings(shop_id, status, porting_date);
create index employees_shop_active_idx on public.employees(shop_id, is_active);
create index audit_logs_shop_created_idx on public.audit_logs(shop_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger shops_set_updated_at before update on public.shops
for each row execute function public.set_updated_at();
create trigger shop_memberships_set_updated_at before update on public.shop_memberships
for each row execute function public.set_updated_at();
create trigger kpi_definitions_set_updated_at before update on public.kpi_definitions
for each row execute function public.set_updated_at();
create trigger quarterly_targets_set_updated_at before update on public.quarterly_targets
for each row execute function public.set_updated_at();
create trigger daily_kpi_entries_set_updated_at before update on public.daily_kpi_entries
for each row execute function public.set_updated_at();
create trigger tnps_entries_set_updated_at before update on public.tnps_entries
for each row execute function public.set_updated_at();
create trigger tariffs_set_updated_at before update on public.tariffs
for each row execute function public.set_updated_at();
create trigger portings_set_updated_at before update on public.portings
for each row execute function public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.global_role = 'admin'
  );
$$;

create or replace function public.current_shop_role(target_shop_id uuid)
returns public.shop_role
language sql
stable
security definer
set search_path = public
as $$
  select sm.role
  from public.shop_memberships sm
  where sm.shop_id = target_shop_id
    and sm.user_id = auth.uid()
    and sm.status = 'active'
  limit 1;
$$;

create or replace function public.has_shop_role(
  target_shop_id uuid,
  allowed_roles public.shop_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.shop_memberships sm
      where sm.shop_id = target_shop_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role = any(allowed_roles)
    );
$$;

create or replace function public.can_view_shop(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_shop_role(
    target_shop_id,
    array['shop_lead', 'viewer']::public.shop_role[]
  );
$$;

create or replace function public.can_manage_shop(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.has_shop_role(target_shop_id, array['shop_lead']::public.shop_role[]);
$$;

create or replace function public.create_shop(
  shop_name text,
  shop_slug text,
  shop_location text default null
)
returns public.shops
language plpgsql
security definer
set search_path = public
as $$
declare
  created_shop public.shops;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.shops (name, slug, location, created_by)
  values (shop_name, lower(shop_slug), shop_location, auth.uid())
  returning * into created_shop;

  insert into public.shop_memberships (shop_id, user_id, role, status)
  values (created_shop.id, auth.uid(), 'shop_lead', 'active')
  on conflict (shop_id, user_id) do nothing;

  insert into public.audit_logs (shop_id, actor_user_id, action, target_table, target_id)
  values (created_shop.id, auth.uid(), 'shop.created', 'shops', created_shop.id);

  return created_shop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_memberships enable row level security;
alter table public.shop_invites enable row level security;
alter table public.kpi_definitions enable row level security;
alter table public.quarterly_targets enable row level security;
alter table public.daily_kpi_entries enable row level security;
alter table public.tnps_entries enable row level security;
alter table public.tariffs enable row level security;
alter table public.portings enable row level security;
alter table public.porting_kpi_impacts enable row level security;
alter table public.employees enable row level security;
alter table public.sick_days enable row level security;
alter table public.special_opening_days enable row level security;
alter table public.special_closing_days enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_self_or_admin"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "shops_select_allowed"
on public.shops for select to authenticated
using (public.can_view_shop(id));

create policy "shops_update_managers"
on public.shops for update to authenticated
using (public.can_manage_shop(id))
with check (public.can_manage_shop(id));

create policy "shop_memberships_select_allowed"
on public.shop_memberships for select to authenticated
using (public.can_view_shop(shop_id) or user_id = auth.uid());

create policy "shop_memberships_write_admin"
on public.shop_memberships for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "shop_invites_select_managers"
on public.shop_invites for select to authenticated
using (public.can_manage_shop(shop_id));

create policy "shop_invites_write_managers"
on public.shop_invites for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "kpi_definitions_select_authenticated"
on public.kpi_definitions for select to authenticated
using (true);

create policy "kpi_definitions_write_admin"
on public.kpi_definitions for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "quarterly_targets_select_allowed"
on public.quarterly_targets for select to authenticated
using (public.can_view_shop(shop_id));

create policy "quarterly_targets_write_managers"
on public.quarterly_targets for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "daily_entries_select_allowed"
on public.daily_kpi_entries for select to authenticated
using (public.can_view_shop(shop_id));

create policy "daily_entries_write_managers"
on public.daily_kpi_entries for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "tnps_select_allowed"
on public.tnps_entries for select to authenticated
using (public.can_view_shop(shop_id));

create policy "tnps_write_managers"
on public.tnps_entries for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "tariffs_select_allowed"
on public.tariffs for select to authenticated
using (shop_id is null or public.can_view_shop(shop_id));

create policy "tariffs_write_managers"
on public.tariffs for all to authenticated
using ((shop_id is null and public.is_admin()) or public.can_manage_shop(shop_id))
with check ((shop_id is null and public.is_admin()) or public.can_manage_shop(shop_id));

create policy "portings_select_allowed"
on public.portings for select to authenticated
using (public.can_view_shop(shop_id));

create policy "portings_write_managers"
on public.portings for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "porting_impacts_select_allowed"
on public.porting_kpi_impacts for select to authenticated
using (public.can_view_shop(shop_id));

create policy "porting_impacts_write_managers"
on public.porting_kpi_impacts for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "employees_select_managers"
on public.employees for select to authenticated
using (public.can_manage_shop(shop_id));

create policy "employees_write_managers"
on public.employees for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "sick_days_select_managers"
on public.sick_days for select to authenticated
using (public.can_manage_shop(shop_id));

create policy "sick_days_write_managers"
on public.sick_days for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "opening_days_select_allowed"
on public.special_opening_days for select to authenticated
using (public.can_view_shop(shop_id));

create policy "opening_days_write_managers"
on public.special_opening_days for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "closing_days_select_allowed"
on public.special_closing_days for select to authenticated
using (public.can_view_shop(shop_id));

create policy "closing_days_write_managers"
on public.special_closing_days for all to authenticated
using (public.can_manage_shop(shop_id))
with check (public.can_manage_shop(shop_id));

create policy "audit_logs_select_managers"
on public.audit_logs for select to authenticated
using (public.can_manage_shop(shop_id));

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select, update on public.shops to authenticated;
grant select, insert, update, delete on public.shop_memberships to authenticated;
grant select, insert, update, delete on public.shop_invites to authenticated;
grant select, insert, update, delete on public.kpi_definitions to authenticated;
grant select, insert, update, delete on public.quarterly_targets to authenticated;
grant select, insert, update, delete on public.daily_kpi_entries to authenticated;
grant select, insert, update, delete on public.tnps_entries to authenticated;
grant select, insert, update, delete on public.tariffs to authenticated;
grant select, insert, update, delete on public.portings to authenticated;
grant select, insert, update, delete on public.porting_kpi_impacts to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.sick_days to authenticated;
grant select, insert, update, delete on public.special_opening_days to authenticated;
grant select, insert, update, delete on public.special_closing_days to authenticated;
grant select on public.audit_logs to authenticated;

revoke execute on function public.is_admin() from public;
revoke execute on function public.current_shop_role(uuid) from public;
revoke execute on function public.has_shop_role(uuid, public.shop_role[]) from public;
revoke execute on function public.can_view_shop(uuid) from public;
revoke execute on function public.can_manage_shop(uuid) from public;
revoke execute on function public.create_shop(text, text, text) from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_shop_role(uuid) to authenticated;
grant execute on function public.has_shop_role(uuid, public.shop_role[]) to authenticated;
grant execute on function public.can_view_shop(uuid) to authenticated;
grant execute on function public.can_manage_shop(uuid) to authenticated;
grant execute on function public.create_shop(text, text, text) to authenticated;
