alter table public.profiles
add column if not exists email text,
add column if not exists access_status text not null default 'pending'
  check (access_status in ('pending', 'approved', 'blocked')),
add column if not exists requested_shop_id uuid references public.shops(id) on delete set null;

alter table public.shop_memberships
add column if not exists can_view_employees boolean not null default false;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

update public.profiles
set access_status = 'approved'
where global_role = 'admin'
  and access_status = 'pending';

update public.shop_memberships
set can_view_employees = true
where role = 'shop_lead'
  and can_view_employees = false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_shop uuid;
begin
  requested_shop := nullif(new.raw_user_meta_data ->> 'requested_shop_id', '')::uuid;

  insert into public.profiles (
    id,
    display_name,
    avatar_url,
    email,
    requested_shop_id,
    access_status,
    global_role
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email,
    requested_shop,
    case when lower(new.email) = 'finnbierlich@yahoo.com' then 'approved' else 'pending' end,
    case when lower(new.email) = 'finnbierlich@yahoo.com' then 'admin'::public.global_role else 'user'::public.global_role end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    requested_shop_id = coalesce(public.profiles.requested_shop_id, excluded.requested_shop_id),
    access_status = case
      when public.profiles.global_role = 'admin' then 'approved'
      else public.profiles.access_status
    end,
    updated_at = now();

  return new;
end;
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
      join public.profiles p on p.id = sm.user_id
      where sm.shop_id = target_shop_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and p.access_status = 'approved'
        and sm.role = any(allowed_roles)
    );
$$;

create or replace function public.can_view_employee_data(target_shop_id uuid)
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
      join public.profiles p on p.id = sm.user_id
      where sm.shop_id = target_shop_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and p.access_status = 'approved'
        and sm.can_view_employees = true
    );
$$;

create or replace function public.guard_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = new.id
    and not public.is_admin()
    and (
      old.global_role is distinct from new.global_role
      or old.access_status is distinct from new.access_status
    )
  then
    raise exception 'not_allowed_to_change_own_access';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_profile_admin_fields on public.profiles;
create trigger profiles_guard_profile_admin_fields
before update on public.profiles
for each row execute function public.guard_profile_admin_fields();

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
  on conflict (slug) do update
  set
    name = excluded.name,
    location = coalesce(excluded.location, public.shops.location),
    is_active = true,
    updated_at = now()
  returning * into created_shop;

  insert into public.shop_memberships (shop_id, user_id, role, status, can_view_employees)
  values (created_shop.id, auth.uid(), 'shop_lead', 'active', true)
  on conflict (shop_id, user_id) do update
  set
    role = excluded.role,
    status = 'active',
    can_view_employees = true,
    updated_at = now();

  insert into public.audit_logs (shop_id, actor_user_id, action, target_table, target_id)
  values (created_shop.id, auth.uid(), 'shop.claimed', 'shops', created_shop.id);

  return created_shop;
end;
$$;

drop policy if exists "shops_select_allowed" on public.shops;
create policy "shops_select_allowed"
on public.shops for select to authenticated
using (public.can_view_shop(id));

drop policy if exists "shops_select_for_signup" on public.shops;
create policy "shops_select_for_signup"
on public.shops for select to anon
using (is_active = true);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "employees_select_managers" on public.employees;
drop policy if exists "employees_write_managers" on public.employees;
create policy "employees_select_allowed"
on public.employees for select to authenticated
using (public.can_view_employee_data(shop_id));

create policy "employees_write_allowed"
on public.employees for all to authenticated
using (public.can_view_employee_data(shop_id))
with check (public.can_view_employee_data(shop_id));

drop policy if exists "sick_days_select_managers" on public.sick_days;
drop policy if exists "sick_days_write_managers" on public.sick_days;
create policy "sick_days_select_allowed"
on public.sick_days for select to authenticated
using (public.can_view_employee_data(shop_id));

create policy "sick_days_write_allowed"
on public.sick_days for all to authenticated
using (public.can_view_employee_data(shop_id))
with check (public.can_view_employee_data(shop_id));

grant select (id, name, slug, location, is_active) on public.shops to anon;
grant update (display_name, avatar_url, global_role, email, access_status, requested_shop_id) on public.profiles to authenticated;

revoke execute on function public.can_view_employee_data(uuid) from public;
grant execute on function public.can_view_employee_data(uuid) to authenticated;
