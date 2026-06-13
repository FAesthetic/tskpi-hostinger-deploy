import { redirect } from "next/navigation";
import { AnalysisWorkbench, type AnalysisSeries, type AnalysisWeekSummary } from "@/components/analysis/AnalysisWorkbench";
import { AppShell } from "@/components/layout/AppShell";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";
import { getQuarterBounds, toDateKey } from "@/lib/kpi/dates";
import { displayCategoryLabel, displayKpiName } from "@/lib/kpi/display";
import { listQuarterWeeks } from "@/lib/kpi/weeks";
import { buildFuturePortingImpactEntries } from "@/lib/portings/pipeline";

type SearchParams = {
  quarter?: string;
  shop?: string;
  week?: string;
  year?: string;
};

type KpiDefinition = {
  id: string;
  code: string;
  name: string;
  category: "provision" | "unit" | "quality" | "tnps";
  value_type: "money" | "count" | "score";
  unit: string;
  sort_order: number;
};

type DailyEntry = {
  entry_date: string;
  kpi_definition_id: string;
  value: number;
};

type PortingRow = {
  date_unknown: boolean;
  porting_date: string | null;
  porting_type: "mobile_gk" | "mobile_pk";
  provision_amount: number | null;
  status: string;
};

export default async function AnalysisPage({ searchParams }: { searchParams: SearchParams }) {
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
        <section className="cockpit-card p-7">
          <h1 className="text-2xl font-semibold text-white">Keine Shops sichtbar</h1>
        </section>
      </AppShell>
    );
  }

  const selectedAccess = context.shopAccess.find((item) => item.shop.id === selectedShop.id);

  if (!selectedAccess?.canViewAnalysis) {
    redirect("/unauthorized");
  }

  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const [kpisResult, entriesResult, portingsResult] = await Promise.all([
    context.supabase
      .from("kpi_definitions")
      .select("id, code, name, category, value_type, unit, sort_order")
      .neq("category", "tnps")
      .eq("status", "active")
      .order("sort_order")
      .returns<KpiDefinition[]>(),
    context.supabase
      .from("daily_kpi_entries")
      .select("kpi_definition_id, entry_date, value")
      .eq("shop_id", selectedShop.id)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .neq("source", "quarter_adjustment")
      .returns<DailyEntry[]>(),
    context.supabase
      .from("portings")
      .select("porting_date, date_unknown, porting_type, provision_amount, status")
      .eq("shop_id", selectedShop.id)
      .returns<PortingRow[]>()
  ]);

  const kpis = kpisResult.data ?? [];
  const kpiIdByCode = new Map(kpis.map((kpi) => [kpi.code, kpi.id]));
  const entries = [
    ...(entriesResult.data ?? []),
    ...buildFuturePortingImpactEntries({
      endDate,
      kpiIdByCode,
      portings: portingsResult.data ?? [],
      today: toDateKey(new Date())
    })
  ];
  const weeks = listQuarterWeeks(year, quarter);
  const series = buildWeeklySeries(kpis, entries, weeks);
  const weekSummaries = buildWeekSummaries(series, weeks);

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
      <section className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pulse-300">
          Analyse
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          Wochenanalyse fuer {selectedShop.name}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Waehle KPIs, speichere Analysegruppen und bewerte Kalenderwochen statt nur einzelne
          Tage. Tageswerte bleiben als Nachpflege moeglich, die Historie wird hier verdichtet.
        </p>
      </section>

      <AnalysisWorkbench
        contextQuery={`shop=${selectedShop.id}&year=${year}&quarter=${quarter}`}
        quarter={quarter}
        selectedWeek={searchParams.week}
        series={series}
        shopId={selectedShop.id}
        shopName={selectedShop.name}
        weekSummaries={weekSummaries}
        year={year}
      />
    </AppShell>
  );
}

function buildWeeklySeries(
  kpis: KpiDefinition[],
  entries: DailyEntry[],
  weeks: ReturnType<typeof listQuarterWeeks>
): AnalysisSeries[] {
  return kpis.map((kpi) => ({
    category: displayCategoryLabel(kpi.category),
    code: kpi.code,
    id: kpi.id,
    name: displayKpiName(kpi.code, kpi.name),
    points: weeks.map((week) => ({
      label: `KW ${week.week}`,
      value: entries
        .filter(
          (entry) =>
            entry.kpi_definition_id === kpi.id &&
            entry.entry_date >= week.startDate &&
            entry.entry_date <= week.endDate
        )
        .reduce((sum, entry) => sum + entry.value, 0),
      weekKey: week.key
    })),
    unit: kpi.unit,
    valueType: kpi.value_type
  }));
}

function buildWeekSummaries(
  series: AnalysisSeries[],
  weeks: ReturnType<typeof listQuarterWeeks>
): AnalysisWeekSummary[] {
  return weeks.map((week) => {
    const values = series.map((item) => ({
      name: item.name,
      value: item.points.find((point) => point.weekKey === week.key)?.value ?? 0
    }));
    const strongest = values.reduce(
      (best, item) => (item.value > best.value ? item : best),
      { name: "Keine Daten", value: 0 }
    );

    return {
      key: week.key,
      label: week.label,
      strongestKpi: strongest.name,
      total: values.reduce((sum, item) => sum + item.value, 0),
      values: series.map((item) => ({
        category: item.category,
        kpi: item.name,
        value: item.points.find((point) => point.weekKey === week.key)?.value ?? 0
      }))
    };
  });
}
