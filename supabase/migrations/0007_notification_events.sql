create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'kpi_daily_update',
      'kpi_quarter_adjustment',
      'kpi_target_update',
      'kpi_weekly_update',
      'kpi_current_stand',
      'user_registered'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_unprocessed_idx
on public.notification_events (processed_at, created_at);

create index if not exists notification_events_shop_created_idx
on public.notification_events (shop_id, created_at desc);

alter table public.notification_events enable row level security;

drop policy if exists "notification_events_insert_member" on public.notification_events;
create policy "notification_events_insert_member"
on public.notification_events for insert to authenticated
with check (
  actor_user_id = auth.uid()
  and (
    shop_id is null
    or public.can_view_shop(shop_id)
  )
);

drop policy if exists "notification_events_admin_select" on public.notification_events;
create policy "notification_events_admin_select"
on public.notification_events for select to authenticated
using (public.is_admin());

drop policy if exists "notification_events_admin_update" on public.notification_events;
create policy "notification_events_admin_update"
on public.notification_events for update to authenticated
using (public.is_admin())
with check (public.is_admin());

grant insert, select, update on public.notification_events to authenticated;
