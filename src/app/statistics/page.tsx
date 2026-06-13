import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { calculateKpiMetric, type KpiMetric } from "@/lib/kpi/calculations";
import {
  getQuarterBounds,
  listQuarterDates,
  summarizeQuarterWorkdays,
  toDateKey
} from "@/lib/kpi/dates";
import { formatKpiValue, formatNumber } from "@/lib/kpi/format";
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
  unit: string;
  sort_order: number;
};

type QuarterlyTarget = {
  kpi_definition_id: string;
  target_value: number;
};

type DailyEntry = {
  entry_date: string;
  kpi_definition_id: string;
  value: number;
};

type SpecialDay = {
  date: string;
};

type PortingRow = {
  porting_type: string;
  provision_amount: number | null;
  status: string;
};

type KpiStat = {
  kpi: KpiDefinition;
  metric: KpiMetric;
};

export default async function StatisticsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);
  const today = toDateKey(new Date());

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
          <h1 className="text-3xl font-black text-white">Noch kein Shop angelegt</h1>
        </section>
      </AppShell>
    );
  }

  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const [
    kpisResult,
    targetsResult,
    entriesResult,
    openingsResult,
    closingsResult,
    portingsResult
  ] = await Promise.all([
    context.supabase
      .from("kpi_definitions")
      .select("id, code, name, category, value_type, unit, sort_order")
      .neq("category", "tnps")
      .eq("status", "active")
      .order("sort_order")
      .returns<KpiDefinition[]>(),
    context.supabase
      .from("quarterly_targets")
      .select("kpi_definition_id, target_value")
      .eq("shop_id", selectedShop.id)
      .eq("year", year)
      .eq("quarter", quarter)
      .returns<QuarterlyTarget[]>(),
    context.supabase
      .from("daily_kpi_entries")
      .select("kpi_definition_id, entry_date, value")
      .eq("shop_id", selectedShop.id)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .returns<DailyEntry[]>(),
    context.supabase
      .from("special_opening_days")
      .select("date")
      .eq("shop_id", selectedShop.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .returns<SpecialDay[]>(),
    context.supabase
      .from("special_closing_days")
      .select("date")
      .eq("shop_id", selectedShop.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .returns<SpecialDay[]>(),
    context.supabase
      .from("portings")
      .select("porting_type, provision_amount, status")
      .eq("shop_id", selectedShop.id)
      .returns<PortingRow[]>()
  ]);

  const kpis = kpisResult.data ?? [];
  const targets = targetsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const openings = openingsResult.data ?? [];
  const closings = closingsResult.data ?? [];
  const portings = portingsResult.data ?? [];

  const workdays = summarizeQuarterWorkdays({
    year,
    quarter,
    today,
    specialOpenings: openings,
    specialClosings: closings
  });
  const targetMap = new Map(targets.map((target) => [target.kpi_definition_id, target.target_value]));
  const actualMap = entries.reduce<Map<string, number>>((sum, entry) => {
    sum.set(entry.kpi_definition_id, (sum.get(entry.kpi_definition_id) ?? 0) + entry.value);
    return sum;
  }, new Map());
  const stats = kpis.map((kpi) => ({
    kpi,
    metric: calculateKpiMetric({
      actual: actualMap.get(kpi.id) ?? 0,
      target: targetMap.get(kpi.id) ?? 0,
      elapsedWorkdays: workdays.elapsedWorkdays,
      remainingWorkdays: workdays.remainingWorkdays,
      totalWorkdays: workdays.totalWorkdays
    })
  }));
  const provisionStats = stats.filter((item) => item.kpi.category === "provision");
  const unitStats = stats.filter((item) => item.kpi.category === "unit");
  const qualityStats = stats.filter((item) => item.kpi.category === "quality");
  const provisionActual = sumMetric(provisionStats, "actual");
  const provisionTarget = sumMetric(provisionStats, "target");
  const unitActual = sumMetric(unitStats, "actual");
  const unitTarget = sumMetric(unitStats, "target");
  const topPerformer = [...stats].sort((a, b) => percent(b.metric) - percent(a.metric))[0] ?? null;
  const catchUp = [...stats]
    .filter((item) => item.metric.target > 0)
    .sort((a, b) => riskRatio(a.metric) - riskRatio(b.metric))[0] ?? null;
  const provisionTimeline = buildTimeline(entries, provisionStats.map((item) => item.kpi.id), year, quarter);
  const unitTimeline = buildTimeline(entries, unitStats.map((item) => item.kpi.id), year, quarter);
  const pkPortings = portings.filter((porting) => porting.porting_type === "mobile_pk").length;
  const gkPortings = portings.filter((porting) => porting.porting_type === "mobile_gk").length;
  const portingRevenue = portings.reduce((sum, porting) => sum + (porting.provision_amount ?? 0), 0);

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
        <p className="text-xs font-black uppercase tracking-[0.22em] text-pulse-300">Statistik-Center</p>
        <h1 className="text-4xl font-black tracking-tight text-white">
          Detaillierte Analyse fuer Q{quarter} {year}
        </h1>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Fortschritt"
          note={`${formatNumber((workdays.elapsedWorkdays / Math.max(workdays.totalWorkdays, 1)) * 100, 1)}% abgeschlossen`}
          value={`${workdays.elapsedWorkdays} / ${workdays.totalWorkdays}`}
        />
        <StatCard
          label="Provision"
          note={`Ziel: ${formatKpiValue(provisionTarget, "money")}`}
          value={formatKpiValue(provisionActual, "money")}
        />
        <StatCard
          label="Stueckzahlen"
          note={`Ziel: ${formatKpiValue(unitTarget, "count")}`}
          value={formatKpiValue(unitActual, "count")}
        />
        <StatCard
          label="Runrate Ø"
          note="Prov. / Stk. pro Arbeitstag"
          value={`${formatKpiValue(workdays.elapsedWorkdays ? provisionActual / workdays.elapsedWorkdays : 0, "money")}`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <AnalysisCard
          tone="pulse"
          title="Ziel-Datum"
          value={estimateTargetDate(provisionActual, provisionTarget, workdays.elapsedWorkdays, year, quarter)}
          text="Voraussichtliche Zielerreichung bei aktueller Geschwindigkeit."
        />
        <AnalysisCard
          tone="amber"
          title="Power-Up Faktor"
          value={powerUpFactor(provisionActual, provisionTarget, workdays.elapsedWorkdays, workdays.remainingWorkdays)}
          text="Notwendige Mehrleistung gegenueber dem bisherigen Tempo."
        />
        <div className="cockpit-card p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Portierungs-Mix</p>
          <p className="mt-4 text-3xl font-black text-white">{formatKpiValue(portingRevenue, "money")}</p>
          <p className="mt-1 text-sm text-slate-400">Provision aus Portierungen</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniSplit label="PK" value={String(pkPortings)} />
            <MiniSplit label="GK" value={String(gkPortings)} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="cockpit-card p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black text-white">Zeitverlauf Provision</h2>
            <span className="rounded-md bg-pulse-500 px-3 py-1 text-sm font-black text-white">EUR</span>
          </div>
          <LineChart points={provisionTimeline} target={provisionTarget} />
        </div>
        <div className="grid gap-5">
          <FocusCard title="Top Performer" item={topPerformer} tone="green" />
          <FocusCard title="Aufholbedarf" item={catchUp} tone="red" />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="cockpit-card p-5">
          <h2 className="text-xl font-black text-white">Effizienz-Index</h2>
          <div className="mt-8 grid place-items-center">
            <div className="grid h-36 w-36 place-items-center rounded-full border-[12px] border-pulse-500/40 bg-black/25 text-center">
              <span className="text-4xl font-black text-pulse-300">
                {formatNumber(percent({ actual: provisionActual, target: provisionTarget }), 1)}
              </span>
            </div>
            <p className="mt-5 text-sm text-slate-400">
              {provisionActual >= provisionTarget ? "Du liegst vor dem Zielpfad." : "Du liegst hinter dem Zeitplan."}
            </p>
          </div>
        </div>
        <div className="cockpit-card p-5">
          <h2 className="text-2xl font-black text-white">KPI Performance Vergleich</h2>
          <PerformanceBars stats={[...provisionStats, ...unitStats, ...qualityStats]} />
        </div>
      </section>
    </AppShell>
  );
}

function StatCard({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="cockpit-card p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-4 text-4xl font-black text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function AnalysisCard({
  text,
  title,
  tone,
  value
}: {
  text: string;
  title: string;
  tone: "amber" | "pulse";
  value: string;
}) {
  return (
    <div className="cockpit-card p-6">
      <p className={`text-xs font-black uppercase tracking-[0.18em] ${tone === "pulse" ? "text-pulse-300" : "text-amber-300"}`}>
        {title}
      </p>
      <p className="mt-6 text-4xl font-black text-white">{value}</p>
      <p className="mt-4 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function MiniSplit({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-4 text-center">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-pulse-300">{value}</p>
    </div>
  );
}

function FocusCard({ item, title, tone }: { item: KpiStat | null; title: string; tone: "green" | "red" }) {
  const percentage = item ? percent(item.metric) : 0;

  return (
    <div className="cockpit-card p-5">
      <div className="flex items-center justify-between gap-4">
        <p className={`text-sm font-black uppercase tracking-[0.14em] ${tone === "green" ? "text-emerald-300" : "text-red-300"}`}>
          {title}
        </p>
        {item ? <StatusBadge tone={item.metric.status}>{statusLabel(item.metric.status)}</StatusBadge> : null}
      </div>
      <p className="mt-6 text-2xl font-black text-white">{item?.kpi.name ?? "Keine Daten"}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={tone === "green" ? "h-full rounded-full bg-emerald-400" : "h-full rounded-full bg-red-400"}
          style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-slate-400">
        {item ? `${formatKpiValue(item.metric.actual, item.kpi.value_type)} von ${formatKpiValue(item.metric.target, item.kpi.value_type)}` : "-"}
      </p>
    </div>
  );
}

function LineChart({ points, target }: { points: Array<{ date: string; value: number }>; target: number }) {
  const width = 760;
  const height = 320;
  const padding = 36;
  const maxValue = Math.max(target, ...points.map((point) => point.value), 1);
  const actualPath = points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - (point.value / maxValue) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const targetPath = points
    .map((_, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((target * index) / Math.max(points.length - 1, 1) / maxValue) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="mt-6 h-[320px] w-full" viewBox={`0 0 ${width} ${height}`}>
      {[0, 1, 2, 3].map((line) => {
        const y = padding + ((height - padding * 2) / 3) * line;
        return <line key={line} stroke="rgba(255,255,255,0.08)" strokeDasharray="5 5" x1={padding} x2={width - padding} y1={y} y2={y} />;
      })}
      <path d={targetPath} fill="none" stroke="rgba(148,163,184,0.62)" strokeDasharray="6 7" strokeWidth="2" />
      <path d={actualPath} fill="none" stroke="#E20074" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function PerformanceBars({ stats }: { stats: KpiStat[] }) {
  return (
    <div className="mt-6 grid gap-3">
      {stats.slice(0, 10).map((item) => {
        const percentage = percent(item.metric);

        return (
          <div className="grid gap-2 md:grid-cols-[180px_1fr_80px] md:items-center" key={item.kpi.id}>
            <p className="font-semibold text-white">{item.kpi.name}</p>
            <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-pulse-500" style={{ width: `${Math.min(percentage, 100)}%` }} />
            </div>
            <p className="text-right text-sm font-black text-slate-300">{formatNumber(percentage, 1)}%</p>
          </div>
        );
      })}
    </div>
  );
}

function buildTimeline(entries: DailyEntry[], kpiIds: string[], year: number, quarter: 1 | 2 | 3 | 4) {
  const idSet = new Set(kpiIds);
  const byDate = entries
    .filter((entry) => idSet.has(entry.kpi_definition_id))
    .reduce<Map<string, number>>((sum, entry) => {
      sum.set(entry.entry_date, (sum.get(entry.entry_date) ?? 0) + entry.value);
      return sum;
    }, new Map());
  let cumulative = 0;

  return listQuarterDates(year, quarter).map((date) => {
    cumulative += byDate.get(date) ?? 0;
    return { date, value: cumulative };
  });
}

function sumMetric(stats: KpiStat[], key: "actual" | "target") {
  return stats.reduce((sum, item) => sum + item.metric[key], 0);
}

function percent(metric: Pick<KpiMetric, "actual" | "target">) {
  if (metric.target <= 0) {
    return 0;
  }

  return (metric.actual / metric.target) * 100;
}

function statusLabel(status: KpiMetric["status"]) {
  const labels: Record<KpiMetric["status"], string> = {
    green: "Gruen",
    neutral: "Offen",
    red: "Rot",
    yellow: "Gelb"
  };

  return labels[status];
}

function riskRatio(metric: KpiMetric) {
  if (metric.target <= 0 || metric.runrateForecast === null) {
    return 999;
  }

  return metric.runrateForecast / metric.target;
}

function powerUpFactor(actual: number, target: number, elapsedWorkdays: number, remainingWorkdays: number) {
  if (target <= 0) {
    return "N/A";
  }

  const currentAverage = elapsedWorkdays > 0 ? actual / elapsedWorkdays : 0;
  const requiredAverage = remainingWorkdays > 0 ? Math.max(target - actual, 0) / remainingWorkdays : 0;

  if (requiredAverage <= currentAverage) {
    return "OK";
  }

  if (currentAverage <= 0) {
    return "Start";
  }

  return `${formatNumber(requiredAverage / currentAverage, 1)}x`;
}

function estimateTargetDate(actual: number, target: number, elapsedWorkdays: number, year: number, quarter: 1 | 2 | 3 | 4) {
  if (target <= 0 || actual <= 0 || elapsedWorkdays <= 0) {
    return "N/A";
  }

  const average = actual / elapsedWorkdays;
  const neededWorkdays = Math.ceil(target / average);
  const dates = listQuarterDates(year, quarter);

  return dates[Math.min(neededWorkdays - 1, dates.length - 1)] ?? "N/A";
}
