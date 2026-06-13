-- Fuehre diese Datei nur aus, wenn du alle KPI-Zahlen neu starten willst.
-- Sie loescht Ist-Werte, tNPS-Werte und Portierungswirkungen und setzt alle Quartalsziele auf 0.

begin;

update public.quarterly_targets
set target_value = 0,
    updated_at = now();

delete from public.daily_kpi_entries;
delete from public.quality_entries;
delete from public.tnps_entries;
delete from public.porting_kpi_impacts;

update public.portings
set status = 'open',
    archived_at = null,
    updated_at = now();

commit;
