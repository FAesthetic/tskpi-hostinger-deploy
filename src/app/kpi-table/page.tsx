import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";
import { calculateKpiMetric, type KpiMetric } from "@/lib/kpi/calculations";
import { getQuarterBounds, summarizeQuarterWorkdays, toDateKey } from "@/lib/kpi/dates";
import { displayCategoryLabel, displayKpiName } from "@/lib/kpi/display";
import { formatKpiValue, formatNumber } from "@/lib/kpi/format";

type SearchParams = {
  shop?: string;
  year?: string;
  quarter?: string;
  period?: PeriodKey;
  month?: string;
  week?: string;
  from?: string;
  to?: string;
  category?: string;
  kpi?: string;
  sort?: SortKey;
  dir?: "asc" | "desc";
};

type PeriodKey = "quarter" | "month" | "week" | "custom";

type SortKey =
  | "kpi"
  | "category"
  | "target"
  | "actual"
  | "achievement"
  | "rest"
  | "runrate"
  | "forecast"
  | "difference"
  | "required90"
  | "required100"
  | "status";

type KpiDefinition = {
  id: string;
  code: string;
  name: string;
  category: "provision" | "unit" | "quality" | "tnps";
  value_type: "money" | "count" | "score";
  unit: string;
  sort_order: number;
};

type Target = {
  kpi_definition_id: string;
  target_value: number;
};

type Entry = {
  kpi_definition_id: string;
  value: number;
};

type SpecialDay = {
  date: string;
};

type KpiTableRow = {
  kpi: KpiDefinition;
  metric: KpiMetric;
  required90: number | null;
  required100: number | null;
  restToTarget: number;
};

const sortKeys: SortKey[] = [
  "kpi",
  "category",
  "target",
  "actual",
  "achievement",
  "rest",
  "runrate",
  "forecast",
  "difference",
  "required90",
  "required100",
  "status"
];

export default async function KpiTablePage({ searchParams }: { searchParams: SearchParams }) {
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

  if (!selectedAccess?.canViewKpiTable) {
    redirect("/unauthorized");
  }

  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const period = getPeriodKey(searchParams.period);
  const activeRange = resolveDateRange({
    endDate,
    from: searchParams.from,
    month: searchParams.month,
    period,
    quarterStart: startDate,
    to: searchParams.to,
    week: searchParams.week,
    year
  });
  const fromDate = activeRange.fromDate;
  const toDate = activeRange.toDate;
  const sortKey = sortKeys.includes(searchParams.sort ?? "kpi") ? searchParams.sort ?? "kpi" : "kpi";
  const sortDir = searchParams.dir === "desc" ? "desc" : "asc";

  const [kpisResult, targetsResult, entriesResult, openingsResult, closingsResult] =
    await Promise.all([
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
        .returns<Target[]>(),
      context.supabase
        .from("daily_kpi_entries")
        .select("kpi_definition_id, value")
        .eq("shop_id", selectedShop.id)
        .gte("entry_date", fromDate)
        .lte("entry_date", toDate)
        .returns<Entry[]>(),
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
        .returns<SpecialDay[]>()
    ]);

  const kpis = (kpisResult.data ?? []).filter((kpi) => {
    if (searchParams.category && kpi.category !== searchParams.category) {
      return false;
    }

    if (searchParams.kpi && kpi.id !== searchParams.kpi) {
      return false;
    }

    return true;
  });
  const allKpis = kpisResult.data ?? [];
  const targets = targetsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const openings = openingsResult.data ?? [];
  const closings = closingsResult.data ?? [];
  const workdays = summarizeQuarterWorkdays({
    year,
    quarter,
    today: toDateKey(new Date()),
    specialOpenings: openings,
    specialClosings: closings
  });
  const targetMap = new Map(targets.map((target) => [target.kpi_definition_id, target.target_value]));
  const actualMap = entries.reduce<Map<string, number>>((map, entry) => {
    map.set(entry.kpi_definition_id, (map.get(entry.kpi_definition_id) ?? 0) + entry.value);
    return map;
  }, new Map());
  const rows = sortRows(
    kpis.map((kpi) => {
      const metric = calculateKpiMetric({
        actual: actualMap.get(kpi.id) ?? 0,
        target: targetMap.get(kpi.id) ?? 0,
        elapsedWorkdays: workdays.elapsedWorkdays,
        remainingWorkdays: workdays.remainingWorkdays,
        totalWorkdays: workdays.totalWorkdays
      });

      return {
        kpi,
        metric,
        required90: requiredDailyForPercent(metric, 0.9, workdays.remainingWorkdays),
        required100: requiredDailyForPercent(metric, 1, workdays.remainingWorkdays),
        restToTarget: Math.max(metric.target - metric.actual, 0)
      };
    }),
    sortKey,
    sortDir
  );
  const visibleRows = rows;
  const redRows = visibleRows.filter((row) => row.metric.status === "red");
  const yellowRows = visibleRows.filter((row) => row.metric.status === "yellow");
  const greenRows = visibleRows.filter((row) => row.metric.status === "green");
  const riskRow = [...visibleRows]
    .filter((row) => row.metric.target > 0 && row.metric.runrateForecast !== null)
    .sort((a, b) => (a.metric.runrateForecast! / a.metric.target) - (b.metric.runrateForecast! / b.metric.target))[0];
  const bestRow = [...visibleRows]
    .filter((row) => row.metric.target > 0 && row.metric.runrateForecast !== null)
    .sort((a, b) => (b.metric.runrateForecast! / b.metric.target) - (a.metric.runrateForecast! / a.metric.target))[0];

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
      <section className="cockpit-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
              KPI-Table
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Analyse fuer {selectedShop.name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Alle KPIs mit Ziel, Ist, Zielerreichung, Prognose und Tagesbedarf. Zeitraum: {activeRange.label}.
            </p>
          </div>
          <StatusBadge tone={rows.some((row) => row.metric.status === "red") ? "red" : "neutral"}>
            {rows.length} KPIs
          </StatusBadge>
        </div>

        <form className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-[150px_140px_140px_140px_140px_190px_minmax(220px,1fr)_auto] xl:items-end">
          <input name="shop" type="hidden" value={selectedShop.id} />
          <input name="year" type="hidden" value={year} />
          <input name="quarter" type="hidden" value={quarter} />
          <Select label="Zeitraum" name="period" value={period}>
            <option value="quarter">Quartal</option>
            <option value="month">Monat</option>
            <option value="week">Kalenderwoche</option>
            <option value="custom">Von / bis</option>
          </Select>
          <Field label="Monat" name="month" type="month" value={searchParams.month ?? startDate.slice(0, 7)} />
          <Field label="KW" name="week" type="week" value={searchParams.week ?? getIsoWeekInput(toDateKey(new Date()))} />
          <Field label="Von" name="from" type="date" value={fromDate} />
          <Field label="Bis" name="to" type="date" value={toDate} />
          <Select label="Kategorie" name="category" value={searchParams.category ?? ""}>
            <option value="">Alle Kategorien</option>
            <option value="provision">MyProv</option>
            <option value="unit">DWH</option>
            <option value="quality">Qualitaet</option>
          </Select>
          <Select label="KPI" name="kpi" value={searchParams.kpi ?? ""}>
            <option value="">Alle KPIs</option>
            {allKpis.map((kpi) => (
              <option key={kpi.id} value={kpi.id}>
                {displayKpiName(kpi.code, kpi.name)}
              </option>
            ))}
          </Select>
          <button className="primary-button h-10" type="submit">
            Filtern
          </button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <TableInsightCard
          label="Rot"
          tone="red"
          value={String(redRows.length)}
          text={redRows.length ? "brauchen Steuerung" : "kein akuter Brand"}
        />
        <TableInsightCard
          label="Gelb"
          tone="yellow"
          value={String(yellowRows.length)}
          text={yellowRows.length ? "aufholbar, aber beobachten" : "kein Wackler"}
        />
        <TableInsightCard
          label="Gruen"
          tone="green"
          value={String(greenRows.length)}
          text="laut Runrate auf Kurs"
        />
        <TableInsightCard
          label="Groesstes Risiko"
          tone={riskRow?.metric.status ?? "neutral"}
          value={riskRow ? displayKpiName(riskRow.kpi.code, riskRow.kpi.name) : "-"}
          text={riskRow ? `Prognose ${formatForecastPercent(riskRow.metric)}` : "Ziele pflegen"}
        />
        <TableInsightCard
          label="Staerkster KPI"
          tone={bestRow?.metric.status ?? "neutral"}
          value={bestRow ? displayKpiName(bestRow.kpi.code, bestRow.kpi.name) : "-"}
          text={bestRow ? `Prognose ${formatForecastPercent(bestRow.metric)}` : "noch offen"}
        />
      </section>

      <section className="cockpit-card p-5">
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <SortTh label="KPI" searchParams={searchParams} sortKey="kpi" />
                <SortTh label="Kategorie" searchParams={searchParams} sortKey="category" />
                <SortTh label="Ziel" searchParams={searchParams} sortKey="target" />
                <SortTh label="Ist" searchParams={searchParams} sortKey="actual" />
                <SortTh label="Rest" searchParams={searchParams} sortKey="rest" />
                <SortTh label="Zielerreichung %" searchParams={searchParams} sortKey="achievement" />
                <SortTh label="Runrate Ø" searchParams={searchParams} sortKey="runrate" />
                <SortTh label="Prognose" searchParams={searchParams} sortKey="forecast" />
                <SortTh label="Differenz" searchParams={searchParams} sortKey="difference" />
                <SortTh label="Ø bis 90%" searchParams={searchParams} sortKey="required90" />
                <SortTh label="Ø bis 100%" searchParams={searchParams} sortKey="required100" />
                <SortTh label="Status" searchParams={searchParams} sortKey="status" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.length ? (
                rows.map(({ kpi, metric, required90, required100, restToTarget }) => (
                  <tr className="bg-ink-900/60 transition hover:bg-white/[0.04]" key={kpi.id}>
                    <td className="px-4 py-4 font-semibold text-white">
                      {displayKpiName(kpi.code, kpi.name)}
                    </td>
                    <td className="px-4 py-4 text-slate-300">{categoryLabel(kpi.category)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(metric.target, kpi.value_type)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(metric.actual, kpi.value_type)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(restToTarget, kpi.value_type)}</td>
                    <td className="px-4 py-4 text-slate-300">
                      {metric.achievementPercent === null ? "-" : `${formatNumber(metric.achievementPercent, 1)}%`}
                    </td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(metric.currentDailyAverage, kpi.value_type)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(metric.runrateForecast, kpi.value_type)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(metric.differenceToTarget, kpi.value_type)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(required90, kpi.value_type)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(required100, kpi.value_type)}</td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={metric.status}>{statusLabel(metric.status)}</StatusBadge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-slate-400" colSpan={12}>
                    Keine KPIs fuer diese Filter gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function TableInsightCard({
  label,
  text,
  tone,
  value
}: {
  label: string;
  text: string;
  tone: StatusTone;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-ink-900/82 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <StatusBadge tone={tone}>{statusLabel(tone)}</StatusBadge>
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function formatForecastPercent(metric: KpiMetric) {
  const value = forecastAchievementPercent(metric);

  return value === null ? "-" : `${formatNumber(value, 1)}%`;
}

function forecastAchievementPercent(metric: KpiMetric) {
  if (metric.target <= 0 || metric.runrateForecast === null) {
    return null;
  }

  return (metric.runrateForecast / metric.target) * 100;
}

function SortTh({
  label,
  sortKey,
  searchParams
}: {
  label: string;
  sortKey: SortKey;
  searchParams: SearchParams;
}) {
  const active = searchParams.sort === sortKey;
  const nextDir = active && searchParams.dir !== "desc" ? "desc" : "asc";

  return (
    <th className="px-4 py-3">
      <Link
        className="inline-flex items-center gap-2 rounded-md px-1 py-1 transition hover:bg-white/[0.06] hover:text-white"
        href={`/kpi-table?${buildQuery({ ...searchParams, sort: sortKey, dir: nextDir })}`}
      >
        {label}
        <span className="text-[10px] text-pulse-300">{active ? (searchParams.dir === "desc" ? "DESC" : "ASC") : ""}</span>
      </Link>
    </th>
  );
}

function buildQuery(params: SearchParams) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }

  return query.toString();
}

function Field({
  label,
  name,
  value,
  type = "text"
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <input className={inputClass} defaultValue={value} name={name} type={type} />
    </label>
  );
}

function Select({
  label,
  name,
  value,
  children
}: {
  label: string;
  name: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <select className={inputClass} defaultValue={value} name={name}>
        {children}
      </select>
    </label>
  );
}

function sortRows(rows: KpiTableRow[], sortKey: SortKey, sortDir: "asc" | "desc") {
  const multiplier = sortDir === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = sortValue(a, sortKey);
    const right = sortValue(b, sortKey);

    if (typeof left === "string" || typeof right === "string") {
      return String(left).localeCompare(String(right), "de") * multiplier;
    }

    return ((left ?? -Infinity) - (right ?? -Infinity)) * multiplier;
  });
}

function sortValue(row: KpiTableRow, sortKey: SortKey) {
  const values: Record<SortKey, string | number | null> = {
    kpi: displayKpiName(row.kpi.code, row.kpi.name),
    category: categoryLabel(row.kpi.category),
    target: row.metric.target,
    actual: row.metric.actual,
    achievement: row.metric.achievementPercent,
    rest: row.restToTarget,
    runrate: row.metric.currentDailyAverage,
    forecast: row.metric.runrateForecast,
    difference: row.metric.differenceToTarget,
    required90: row.required90,
    required100: row.required100,
    status: statusSortValue(row.metric.status)
  };

  return values[sortKey];
}

function statusSortValue(status: StatusTone) {
  const values: Record<StatusTone, number> = {
    red: 0,
    yellow: 1,
    neutral: 2,
    green: 3
  };

  return values[status];
}

function categoryLabel(category: string) {
  return displayCategoryLabel(category);
}

function statusLabel(status: StatusTone) {
  const labels: Record<StatusTone, string> = {
    green: "Gruen",
    yellow: "Gelb",
    red: "Rot",
    neutral: "Offen"
  };

  return labels[status];
}

function requiredDailyForPercent(metric: KpiMetric, percent: number, remainingWorkdays: number) {
  const remaining = Math.max(metric.target * percent - metric.actual, 0);

  if (remaining === 0) {
    return 0;
  }

  return remainingWorkdays > 0 ? remaining / remainingWorkdays : null;
}

function getPeriodKey(value: string | undefined): PeriodKey {
  return value === "month" || value === "week" || value === "custom" ? value : "quarter";
}

function resolveDateRange({
  endDate,
  from,
  month,
  period,
  quarterStart,
  to,
  week,
  year
}: {
  endDate: string;
  from?: string;
  month?: string;
  period: PeriodKey;
  quarterStart: string;
  to?: string;
  week?: string;
  year: number;
}) {
  if (period === "month" && month && /^\d{4}-\d{2}$/.test(month)) {
    const [monthYear, monthNumber] = month.split("-").map(Number);
    const start = new Date(Date.UTC(monthYear, monthNumber - 1, 1));
    const end = new Date(Date.UTC(monthYear, monthNumber, 0));

    return {
      fromDate: toDateKey(start),
      label: month,
      toDate: toDateKey(end)
    };
  }

  if (period === "week" && week && /^\d{4}-W\d{2}$/.test(week)) {
    const { fromDate, toDate } = isoWeekRange(week);

    return {
      fromDate,
      label: week.replace("-W", " KW "),
      toDate
    };
  }

  if (period === "custom") {
    return {
      fromDate: isDateKey(from) ? from : quarterStart,
      label: "freier Zeitraum",
      toDate: isDateKey(to) ? to : endDate
    };
  }

  return {
    fromDate: quarterStart,
    label: `Q${Math.floor((Number(quarterStart.slice(5, 7)) - 1) / 3) + 1} ${year}`,
    toDate: endDate
  };
}

function isoWeekRange(weekValue: string) {
  const [yearText, weekText] = weekValue.split("-W");
  const week = Number(weekText);
  const year = Number(yearText);
  const janFourth = new Date(Date.UTC(year, 0, 4));
  const janFourthDay = janFourth.getUTCDay() || 7;
  const monday = new Date(janFourth);

  monday.setUTCDate(janFourth.getUTCDate() - janFourthDay + 1 + (week - 1) * 7);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    fromDate: toDateKey(monday),
    toDate: toDateKey(sunday)
  };
}

function getIsoWeekInput(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const thursday = new Date(date);
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

const inputClass = "control-field";
