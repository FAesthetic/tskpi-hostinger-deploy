import { saveDailyKpiEntryAction } from "@/app/actions/kpi";
import { AppShell } from "@/components/layout/AppShell";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { displayCategoryLabel, displayKpiName } from "@/lib/kpi/display";
import { formatKpiValue } from "@/lib/kpi/format";
import { getQuarterBounds, toDateKey } from "@/lib/kpi/dates";
import { listQuarterWeeks } from "@/lib/kpi/weeks";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";

type SearchParams = {
  shop?: string;
  year?: string;
  quarter?: string;
};

type KpiDefinition = {
  id: string;
  code: string;
  name: string;
  category: "provision" | "unit" | "quality" | "tnps";
  value_type: "money" | "count" | "score";
  sort_order: number;
};

type DailyEntry = {
  id: string;
  entry_date: string;
  value: number;
  note: string | null;
  kpi_definition_id: string;
};

export default async function EntriesPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);

  if (!selectedShop) {
    return (
      <AppShell
        globalRole={context.globalRole}
        isGlobalAdmin={context.isGlobalAdmin}
        quarter={quarter}
        selectedShop={null}
        shopAccess={context.shopAccess}
        shops={context.shops}
        year={year}
      >
        <EmptyState title="Keine Shops sichtbar" />
      </AppShell>
    );
  }

  const { data: kpisData } = await context.supabase
    .from("kpi_definitions")
    .select("id, code, name, category, value_type, sort_order")
    .in("category", ["provision", "unit", "quality"])
    .eq("status", "active")
    .order("sort_order")
    .returns<KpiDefinition[]>();

  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const [quarterEntriesResult] = await Promise.all([
    context.supabase
      .from("daily_kpi_entries")
      .select("id, entry_date, value, note, kpi_definition_id")
      .eq("shop_id", selectedShop.id)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .neq("source", "quarter_adjustment")
      .returns<DailyEntry[]>()
  ]);

  const kpis = kpisData ?? [];
  const quarterEntries = quarterEntriesResult.data ?? [];
  const kpiMap = new Map(kpis.map((kpi) => [kpi.id, kpi]));
  const summary = summarizeEntries(quarterEntries, kpiMap);
  const weeks = listQuarterWeeks(year, quarter);
  const weeklyRows = weeks.map((week) => summarizeWeek(week, quarterEntries, kpiMap));

  return (
    <AppShell
      globalRole={context.globalRole}
      isGlobalAdmin={context.isGlobalAdmin}
      quarter={quarter}
      selectedShop={selectedShop}
      shopAccess={context.shopAccess}
      shops={context.shops}
      year={year}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Kalenderwochen" note={`Q${quarter} ${year}`} value={String(weeks.length)} />
        <Metric label="MyProv" note="Quartal erfasst" value={formatKpiValue(summary.provision, "money")} />
        <Metric label="DWH" note="Quartal erfasst" value={formatKpiValue(summary.unit, "count")} />
        <Metric label="Qualitaet" note="Quartal erfasst" value={formatKpiValue(summary.quality, "count")} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="cockpit-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
            Wochenwerte
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Nachpflege
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Du kannst weiterhin einzelne Tage nachpflegen. Die Historie rechts wird bewusst als Kalenderwoche angezeigt.
          </p>

          <form action={saveDailyKpiEntryAction} className="mt-6 grid gap-4">
            <input name="shop_id" type="hidden" value={selectedShop.id} />

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-300">Datum</span>
              <input className={inputClass} defaultValue={toDateKey(new Date())} name="entry_date" type="date" />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-300">KPI</span>
              <select className={inputClass} name="kpi_definition_id">
                {kpis.map((kpi) => (
                  <option key={kpi.id} value={kpi.id}>
                    {displayKpiName(kpi.code, kpi.name)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-300">Wert</span>
              <input className={inputClass} name="value" step="0.01" type="number" />
            </label>

            <SubmitButton className="primary-button h-11" pendingLabel="Speichert...">
              Wert speichern
            </SubmitButton>
          </form>
        </div>

        <section className="cockpit-card p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Verlauf
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Wochenhistorie</h2>
            </div>
            <p className="text-sm text-slate-400">{weeklyRows.length} Kalenderwochen</p>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Kalenderwoche</th>
                  <th className="px-4 py-3">MyProv</th>
                  <th className="px-4 py-3">DWH</th>
                  <th className="px-4 py-3">Qualitaet</th>
                  <th className="px-4 py-3">Staerkster KPI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {weeklyRows.length ? (
                  weeklyRows.map((row) => (
                    <tr className="bg-ink-900/60 transition hover:bg-white/[0.04]" key={row.key}>
                      <td className="px-4 py-4 font-semibold text-white">{row.label}</td>
                      <td className="px-4 py-4 text-slate-300">{formatKpiValue(row.provision, "money")}</td>
                      <td className="px-4 py-4 text-slate-300">{formatKpiValue(row.unit, "count")}</td>
                      <td className="px-4 py-4 text-slate-300">{formatKpiValue(row.quality, "count")}</td>
                      <td className="px-4 py-4 text-slate-400">{row.strongestKpi}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-5 text-slate-400" colSpan={5}>
                      Noch keine Werte erfasst.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="cockpit-card cockpit-card-hover p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function summarizeEntries(entries: DailyEntry[], kpiMap: Map<string, KpiDefinition>) {
  return entries.reduce(
    (summary, entry) => {
      const kpi = kpiMap.get(entry.kpi_definition_id);

      if (kpi?.category === "provision") {
        summary.provision += entry.value;
      }

      if (kpi?.category === "unit") {
        summary.unit += entry.value;
      }

      if (kpi?.category === "quality") {
        summary.quality += entry.value;
      }

      return summary;
    },
    { provision: 0, quality: 0, unit: 0 }
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <section className="cockpit-card p-7">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
    </section>
  );
}

function categoryLabel(category?: string) {
  return category ? displayCategoryLabel(category) : "-";
}

function summarizeWeek(
  week: ReturnType<typeof listQuarterWeeks>[number],
  entries: DailyEntry[],
  kpiMap: Map<string, KpiDefinition>
) {
  const weekEntries = entries.filter(
    (entry) => entry.entry_date >= week.startDate && entry.entry_date <= week.endDate
  );
  const kpiTotals = weekEntries.reduce<Map<string, number>>((map, entry) => {
    map.set(entry.kpi_definition_id, (map.get(entry.kpi_definition_id) ?? 0) + entry.value);
    return map;
  }, new Map());
  const strongest = [...kpiTotals.entries()]
    .map(([kpiId, value]) => ({ kpi: kpiMap.get(kpiId), value }))
    .sort((a, b) => b.value - a.value)[0];
  const totals = summarizeEntries(weekEntries, kpiMap);

  return {
    key: week.key,
    label: week.label,
    provision: totals.provision,
    quality: totals.quality,
    strongestKpi: strongest?.kpi ? displayKpiName(strongest.kpi.code, strongest.kpi.name) : "Keine Daten",
    unit: totals.unit
  };
}

const inputClass = "control-field";
