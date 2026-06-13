insert into public.kpi_definitions (code, name, category, value_type, unit, sort_order, status)
values
  ('quality_customer_frequency', 'Kundenfrequenz', 'quality', 'count', 'Kunden', 440, 'active')
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  value_type = excluded.value_type,
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = now();
