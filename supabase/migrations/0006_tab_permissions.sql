alter table public.shop_memberships
add column if not exists can_view_portings boolean not null default false,
add column if not exists can_view_analysis boolean not null default true,
add column if not exists can_view_kpi_table boolean not null default true;

update public.shop_memberships
set can_view_portings = true
where role = 'shop_lead'
  and can_view_portings = false;

create or replace function public.can_view_portings(target_shop_id uuid)
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
        and (sm.can_view_portings = true or sm.role = 'shop_lead')
    );
$$;

create or replace function public.can_view_analysis(target_shop_id uuid)
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
        and sm.can_view_analysis = true
    );
$$;

create or replace function public.can_view_kpi_table(target_shop_id uuid)
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
        and sm.can_view_kpi_table = true
    );
$$;

revoke execute on function public.can_view_portings(uuid) from public;
revoke execute on function public.can_view_analysis(uuid) from public;
revoke execute on function public.can_view_kpi_table(uuid) from public;
grant execute on function public.can_view_portings(uuid) to authenticated;
grant execute on function public.can_view_analysis(uuid) to authenticated;
grant execute on function public.can_view_kpi_table(uuid) to authenticated;
