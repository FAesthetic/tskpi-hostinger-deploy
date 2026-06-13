-- Fuehre diese Datei nur aus, wenn du alle KPI-Zahlen neu starten willst.
-- Sie loescht Ist-Werte, tNPS-Werte und Portierungswirkungen und setzt alle Quartalsziele auf 0.
-- Shops, Nutzer, Rollen und Tarife bleiben erhalten.

begin;

do $$
begin
  if to_regclass('public.quarterly_targets') is not null then
    update public.quarterly_targets
    set target_value = 0,
        note = null,
        updated_at = now();
  end if;

  if to_regclass('public.daily_kpi_entries') is not null then
    delete from public.daily_kpi_entries;
  end if;

  if to_regclass('public.quality_entries') is not null then
    delete from public.quality_entries;
  end if;

  if to_regclass('public.tnps_entries') is not null then
    delete from public.tnps_entries;
  end if;

  if to_regclass('public.porting_kpi_impacts') is not null then
    delete from public.porting_kpi_impacts;
  end if;

  if to_regclass('public.portings') is not null then
    update public.portings
    set status = case when date_unknown then 'open'::public.porting_status else 'planned'::public.porting_status end,
        archived_at = null,
        updated_at = now()
    where status in ('effective', 'archived');
  end if;
end $$;

commit;
