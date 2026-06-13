alter table public.shops
add column if not exists is_primary boolean not null default false;

create unique index if not exists shops_single_primary_idx
on public.shops (is_primary)
where is_primary = true;

update public.shops
set is_primary = false
where slug <> 'husum'
  and is_primary = true;

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

  insert into public.shop_memberships (shop_id, user_id, role, status)
  values (created_shop.id, auth.uid(), 'shop_lead', 'active')
  on conflict (shop_id, user_id) do update
  set
    role = excluded.role,
    status = 'active',
    updated_at = now();

  insert into public.audit_logs (shop_id, actor_user_id, action, target_table, target_id)
  values (created_shop.id, auth.uid(), 'shop.claimed', 'shops', created_shop.id);

  return created_shop;
end;
$$;

insert into public.shops (name, slug, location, is_active, is_primary)
values
  ('Husum', 'husum', 'Schleswig-Holstein', true, true),
  ('Rendsburg', 'rendsburg', 'Schleswig-Holstein', true, false)
on conflict (slug) do update
set
  name = excluded.name,
  location = excluded.location,
  is_active = excluded.is_active,
  is_primary = excluded.is_primary,
  updated_at = now();
