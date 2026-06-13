import Link from "next/link";
import type { ReactNode } from "react";
import {
  saveDailyKpiEntriesAction,
  saveQuarterAdjustmentAction,
  saveWeeklyKpiEntriesAction
} from "@/app/actions/kpi";
import {
  DashboardKpiExplorer,
  type DashboardKpiCardData
} from "@/components/dashboard/DashboardKpiExplorer";
import { KpiGraphPanel, type GraphSeries } from "@/components/dashboard/KpiGraphPanel";
import { WeekPicker } from "@/components/dashboard/WeekPicker";
import { AppShell } from "@/components/layout/AppShell";
import { ShopCreatePanel } from "@/components/shops/ShopCreatePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { calculateKpiMetric, type KpiMetric } from "@/lib/kpi/calculations";
import {
  getQuarterBounds,
  listQuarterDates,
  summarizeQuarterWorkdays,
  toDateKey,
  type Quarter,
  type WorkdaySummary
} from "@/lib/kpi/dates";
import { displayCategoryLabel, displayKpiName } from "@/lib/kpi/display";
import { formatKpiValue, formatNumber } from "@/lib/kpi/format";
import { listQuarterWeeks, type IsoWeek } from "@/lib/kpi/weeks";
import { processDuePortingsForShop } from "@/lib/portings/process";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";

type SearchParams = {
  focusKpi?: string;
  saved?: string;
  shop?: string;
  week?: string;
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
  note: string | null;
  source: string;
  value: number;
};

type SpecialDay = {
  date: string;
};

type PortingSummary = {
  id: string;
  porting_date: string | null;
  date_unknown: boolean;
  status: "open" | "planned" | "effective" | "archived";
};

type TnpsEntry = {
  calendar_week: number;
  value: number;
};

type TnpsKpi = {
  id: string;
};

type TnpsTarget = {
  target_value: number;
};

type KpiRow = {
  kpi: KpiDefinition;
  metric: KpiMetric;
};

type DailyTotalsByKpi = Map<string, Map<string, number>>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);
  const selectedAccess = selectedShop
    ? context.shopAccess.find((item) => item.shop.id === selectedShop.id)
    : null;
  const canManageSelectedShop = Boolean(selectedAccess?.canManage);
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
            TS KPI
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Noch kein Shop angelegt
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Sobald Husum oder Rendsburg in Supabase vorhanden sind und dein Nutzer berechtigt
            ist, erscheint hier das Cockpit.
          </p>
        </section>
        {context.isGlobalAdmin ? <ShopCreatePanel /> : null}
      </AppShell>
    );
  }

  if (canManageSelectedShop) {
    await processDuePortingsForShop(context.supabase, selectedShop.id, today);
  }

  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const quarterWeeks = listQuarterWeeks(year, quarter);
  const selectedWeek = resolveWeek(searchParams.week, quarterWeeks, today);
  const [
    kpisResult,
    targetsResult,
    entriesResult,
    openingsResult,
    closingsResult,
    portingsResult,
    tnpsEntriesResult,
    tnpsKpiResult
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
      .select("kpi_definition_id, entry_date, value, source, note")
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
      .select("id, porting_date, date_unknown, status")
      .eq("shop_id", selectedShop.id)
      .returns<PortingSummary[]>(),
    context.supabase
      .from("tnps_entries")
      .select("calendar_week, value")
      .eq("shop_id", selectedShop.id)
      .eq("year", year)
      .order("calendar_week")
      .returns<TnpsEntry[]>(),
    context.supabase
      .from("kpi_definitions")
      .select("id")
      .eq("code", "tnps")
      .returns<TnpsKpi[]>()
      .maybeSingle()
  ]);

  const kpis = kpisResult.data ?? [];
  const targets = targetsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const openings = openingsResult.data ?? [];
  const closings = closingsResult.data ?? [];
  const portings = portingsResult.data ?? [];
  const tnpsEntries = tnpsEntriesResult.data ?? [];
  const tnpsKpi = tnpsKpiResult.data;

  const { data: tnpsTarget } = tnpsKpi
    ? await context.supabase
        .from("quarterly_targets")
        .select("target_value")
        .eq("shop_id", selectedShop.id)
        .eq("kpi_definition_id", tnpsKpi.id)
        .eq("year", year)
        .eq("quarter", quarter)
        .returns<TnpsTarget[]>()
        .maybeSingle()
    : { data: null };

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
  const quarterAdjustmentMap = entries
    .filter((entry) => entry.source === "quarter_adjustment")
    .reduce<Map<string, number>>((sum, entry) => {
      sum.set(entry.kpi_definition_id, (sum.get(entry.kpi_definition_id) ?? 0) + entry.value);
      return sum;
    }, new Map());
  const weeklyManualMap = entries
    .filter((entry) => entry.source === "weekly_manual")
    .reduce<Map<string, Map<string, number>>>((sum, entry) => {
      const current = sum.get(entry.kpi_definition_id) ?? new Map<string, number>();
      current.set(entry.entry_date, (current.get(entry.entry_date) ?? 0) + entry.value);
      sum.set(entry.kpi_definition_id, current);
      return sum;
    }, new Map());
  const dailyTotalsByKpi = buildDailyTotalsByKpi(
    entries.filter((entry) => entry.source !== "quarter_adjustment")
  );
  const selectedWeekEntryMap = entries
    .filter(
      (entry) =>
        entry.source !== "quarter_adjustment" &&
        entry.entry_date >= selectedWeek.startDate &&
        entry.entry_date <= selectedWeek.endDate
    )
    .reduce<Map<string, number>>((sum, entry) => {
      sum.set(entry.kpi_definition_id, (sum.get(entry.kpi_definition_id) ?? 0) + entry.value);
      return sum;
    }, new Map());

  const cards = kpis.map((kpi) => {
    const metric = calculateKpiMetric({
      actual: actualMap.get(kpi.id) ?? 0,
      target: targetMap.get(kpi.id) ?? 0,
      elapsedWorkdays: workdays.elapsedWorkdays,
      remainingWorkdays: workdays.remainingWorkdays,
      totalWorkdays: workdays.totalWorkdays
    });

    return { kpi, metric };
  });

  const measuredCards = cards.filter((card) => card.metric.target > 0);
  const focusCards = [...measuredCards]
    .sort((a, b) => urgencyScore(a) - urgencyScore(b))
    .slice(0, 4);
  const critical = focusCards[0] ?? null;
  const stableCards = measuredCards
    .filter((card) => card.metric.status === "green")
    .slice(0, 3);
  const redCount = cards.filter((card) => card.metric.status === "red").length;
  const yellowCount = cards.filter((card) => card.metric.status === "yellow").length;
  const greenCount = cards.filter((card) => card.metric.status === "green").length;
  const overallTone = redCount > 0 ? "red" : yellowCount > 0 ? "yellow" : greenCount > 0 ? "green" : "neutral";
  const portingsWithoutDate = portings.filter((porting) => porting.date_unknown).length;
  const quarterPortings = portings.filter(
    (porting) =>
      !porting.date_unknown &&
      porting.porting_date !== null &&
      porting.porting_date >= startDate &&
      porting.porting_date <= endDate
  ).length;
  const archivedPortings = portings.filter(
    (porting) =>
      porting.status === "archived" &&
      porting.porting_date !== null &&
      porting.porting_date >= startDate &&
      porting.porting_date <= endDate
  ).length;
  const currentTnps = tnpsEntries.at(-1) ?? null;
  const tnpsOnTarget =
    currentTnps && tnpsTarget?.target_value !== undefined
      ? currentTnps.value >= tnpsTarget.target_value
      : null;
  const dashboardCards = buildDashboardKpiCards({
    cards,
    dailyTotalsByKpi,
    quarterAdjustmentMap,
    quarter,
    weeklyManualMap,
    workdays,
    year
  });
  const tnpsDashboardCard = buildTnpsDashboardCard({
    currentTnps,
    quarter,
    target: tnpsTarget?.target_value ?? 0,
    tnpsKpiId: tnpsKpi?.id ?? null,
    workdays,
    year
  });

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
      <CommandHero
        critical={critical}
        focusCards={focusCards}
        overallTone={overallTone}
        portingsWithoutDate={portingsWithoutDate}
        remainingWorkdays={workdays.remainingWorkdays}
      />

      <DashboardKpiExplorer
        cards={tnpsDashboardCard ? [...dashboardCards, tnpsDashboardCard] : dashboardCards}
        quarter={quarter}
        saved={searchParams.saved}
        shopId={selectedShop.id}
        year={year}
      />

      <DailyInputPanel
        dailyEntryMap={selectedWeekEntryMap}
        isSaved={searchParams.saved === "weekly" || searchParams.saved === "stand"}
        kpis={kpis}
        quarter={quarter}
        quarterWeeks={quarterWeeks}
        selectedShopId={selectedShop.id}
        selectedShopName={selectedShop.name}
        selectedWeek={selectedWeek}
        savedMode={searchParams.saved}
        today={today}
        year={year}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricShell
          label="Gesamtstatus"
          note={`${redCount} rot, ${yellowCount} gelb`}
          value={<StatusBadge tone={overallTone}>{statusLabel(overallTone)}</StatusBadge>}
        />
        <MetricShell label="Arbeitstage" note="gesamt im Quartal" value={String(workdays.totalWorkdays)} />
        <MetricShell label="Vergangen" note="inklusive heute" value={String(workdays.elapsedWorkdays)} />
        <MetricShell label="Verbleibend" note="bis Quartalsende" value={String(workdays.remainingWorkdays)} />
        <MetricShell label="Portierungen" note={`${archivedPortings} gebucht`} value={String(quarterPortings)} />
        <MetricShell
          label="tNPS"
          note={tnpsOnTarget === null ? "ohne Ziel" : tnpsOnTarget ? "ueber Ziel" : "unter Ziel"}
          value={currentTnps ? formatNumber(currentTnps.value, 1) : "-"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <section className="cockpit-card p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-pulse-300">
                KPI Scorecard
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                Ampel, Ist und Quartalsprognose
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="secondary-button" href={`/kpi-table?shop=${selectedShop.id}&year=${year}&quarter=${quarter}`}>
                KPI-Tabelle
              </Link>
              {canManageSelectedShop ? (
                <Link className="secondary-button" href={`/settings/targets?shop=${selectedShop.id}&year=${year}&quarter=${quarter}`}>
                  Ziele
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">KPI</th>
                  <th className="px-4 py-3">Kategorie</th>
                  <th className="px-4 py-3">Ist</th>
                  <th className="px-4 py-3">Ziel</th>
                  <th className="px-4 py-3">Prognose %</th>
                  <th className="px-4 py-3">Runrate</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {cards.map(({ kpi, metric }) => (
                  <tr className="bg-[#151A1E]/80 transition hover:bg-white/[0.04]" key={kpi.id}>
                    <td className="px-4 py-4 font-semibold text-white">
                      {displayKpiName(kpi.code, kpi.name)}
                    </td>
                    <td className="px-4 py-4 text-slate-400">{categoryLabel(kpi.category)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(metric.actual, kpi.value_type)}</td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(metric.target, kpi.value_type)}</td>
                    <td className="px-4 py-4 font-semibold text-white">
                      {forecastAchievementPercent(metric) === null
                        ? "-"
                        : `${formatNumber(forecastAchievementPercent(metric), 1)}%`}
                    </td>
                    <td className="px-4 py-4 text-slate-300">{formatKpiValue(metric.runrateForecast, kpi.value_type)}</td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={metric.status}>{statusLabel(metric.status)}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="grid content-start gap-5">
          <section className="cockpit-card p-5">
            <h2 className="text-xl font-black text-white">Fokusliste</h2>
            <div className="mt-4 grid gap-3">
              {focusCards.length ? (
                focusCards.map(({ kpi, metric }, index) => (
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4" key={kpi.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-pulse-300">#{index + 1}</p>
                        <p className="mt-1 font-semibold text-white">
                          {displayKpiName(kpi.code, kpi.name)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Prognose {forecastAchievementPercent(metric) === null ? "-" : `${formatNumber(forecastAchievementPercent(metric), 1)}%`}
                        </p>
                      </div>
                      <StatusBadge tone={metric.status}>{statusLabel(metric.status)}</StatusBadge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                  Keine kritischen KPI-Signale.
                </p>
              )}
            </div>

            {stableCards.length ? (
              <p className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
                Stabil: {stableCards.map((card) => displayKpiName(card.kpi.code, card.kpi.name)).join(", ")}
              </p>
            ) : null}

            {portingsWithoutDate > 0 ? (
              <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                {portingsWithoutDate} Portierungen ohne Datum.
              </p>
            ) : null}
          </section>

          {context.isGlobalAdmin ? <ShopCreatePanel compact /> : null}
        </aside>
      </section>
    </AppShell>
  );
}

function CommandHero({
  critical,
  focusCards,
  overallTone,
  portingsWithoutDate,
  remainingWorkdays
}: {
  critical: KpiRow | null;
  focusCards: KpiRow[];
  overallTone: "green" | "yellow" | "red" | "neutral";
  portingsWithoutDate: number;
  remainingWorkdays: number;
}) {
  const runnerUp = focusCards[1] ?? null;
  const headline = overallTone === "green"
    ? "Auf Kurs"
    : overallTone === "yellow"
      ? "Knapp unter Plan"
      : overallTone === "red"
        ? "Nicht auf Kurs"
        : "Noch offen";

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900/95 shadow-cockpit">
      <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="p-5 md:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/[0.09] bg-white/[0.035] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
              Gesamtstatus
            </span>
            <StatusBadge tone={overallTone}>{statusLabel(overallTone)}</StatusBadge>
          </div>

          <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-5xl">
            {headline}
          </h1>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
            Heute wichtig
          </p>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            {critical ? (
              <>
                <span className="font-semibold text-white">
                  Heute wichtig: {displayKpiName(critical.kpi.code, critical.kpi.name)}.
                </span>{" "}
                {buildDailyFocusHint(
                  displayKpiName(critical.kpi.code, critical.kpi.name),
                  requiredDailyForPercent(critical.metric, 0.9, remainingWorkdays),
                  requiredDailyForPercent(critical.metric, 1, remainingWorkdays),
                  critical.kpi.value_type
                )}
              </>
            ) : (
              "Sobald Ziele gepflegt sind, zeigt dir die Startseite automatisch die kritischsten KPIs, Tagesbedarf und Runrate."
            )}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <MiniMetric
              label="Runrate Ende Quartal"
              value={critical ? formatKpiValue(critical.metric.runrateForecast, critical.kpi.value_type) : "-"}
            />
            <MiniMetric
              label="Prognose Quote"
              value={critical && forecastAchievementPercent(critical.metric) !== null
                ? `${formatNumber(forecastAchievementPercent(critical.metric), 1)}%`
                : "-"}
            />
            <MiniMetric
              label="Fehlt bis 100%"
              value={critical ? formatKpiValue(missingToPercent(critical.metric, 1), critical.kpi.value_type) : "-"}
            />
            <MiniMetric label="Rest-Arbeitstage" value={String(remainingWorkdays)} />
          </div>
        </div>

        <div className="border-t border-white/[0.08] bg-white/[0.025] p-5 md:p-7 xl:border-l xl:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
            Morgenrunde
          </p>
          <ul className="mt-5 grid gap-3 text-sm leading-6 text-slate-200">
            <li className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
              <span className="font-semibold text-white">1. Fokus nennen:</span>{" "}
              {critical ? displayKpiName(critical.kpi.code, critical.kpi.name) : "Zielpflege abschliessen"}
            </li>
            <li className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
              <span className="font-semibold text-white">2. Tagesziel festlegen:</span>{" "}
              {critical
                ? `${formatKpiValue(requiredDailyForPercent(critical.metric, 1, remainingWorkdays), critical.kpi.value_type)} bis 100% Pfad`
                : "konkretes Tagesziel nach Zielpflege"}
            </li>
            <li className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
              <span className="font-semibold text-white">3. Zweites Thema:</span>{" "}
              {runnerUp ? displayKpiName(runnerUp.kpi.code, runnerUp.kpi.name) : portingsWithoutDate > 0 ? "Portierungen ohne Datum klaeren" : "stabile KPIs absichern"}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function ProvisionCommandGrid({
  dailyEntryMap,
  dailyTotalsByKpi,
  entryDate,
  focusKpiId,
  provisionCards,
  quarter,
  remainingWorkdays,
  selectedShopId,
  today,
  year
}: {
  dailyEntryMap: Map<string, number>;
  dailyTotalsByKpi: DailyTotalsByKpi;
  entryDate: string;
  focusKpiId: string | null;
  provisionCards: KpiRow[];
  quarter: Quarter;
  remainingWorkdays: number;
  selectedShopId: string;
  today: string;
  year: number;
}) {
  if (!provisionCards.length) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-pulse-300">
            Provisionen
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
            Aktueller Stand, Prognose und schnelle Eingabe
          </h2>
        </div>
        <Link
          className="secondary-button self-start sm:self-auto"
          href={`/api/export/kpis?shop=${selectedShopId}&year=${year}&quarter=${quarter}`}
        >
          Excel Export
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {provisionCards.map((row) => {
          const isActive = row.kpi.id === focusKpiId;
          const recent = recentDailyValues(dailyTotalsByKpi.get(row.kpi.id), today, 6);
          const maxRecent = Math.max(...recent.map((item) => item.value), 1);
          const forecastPercent = forecastAchievementPercent(row.metric);

          return (
            <article
              className={[
                "group overflow-hidden rounded-lg border p-5 shadow-[0_24px_70px_rgba(0,0,0,0.26)] transition duration-200 hover:-translate-y-1",
                isActive
                  ? "border-pulse-500/60 bg-[#1C2227]"
                  : "border-white/10 bg-[#151A1E] hover:border-pulse-500/40 hover:bg-[#1C2227]"
              ].join(" ")}
              key={row.kpi.id}
            >
              <Link
                className="block"
                href={`/dashboard?shop=${selectedShopId}&year=${year}&quarter=${quarter}&focusKpi=${row.kpi.id}`}
              >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-400">{row.kpi.unit}</p>
                  <h3 className="mt-1 text-2xl font-black tracking-tight text-white">{row.kpi.name}</h3>
                </div>
                <StatusBadge tone={row.metric.status}>{statusLabel(row.metric.status)}</StatusBadge>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <CardStat label="Ist" value={formatKpiValue(row.metric.actual, row.kpi.value_type)} />
                <CardStat label="Ziel" value={formatKpiValue(row.metric.target, row.kpi.value_type)} />
                <CardStat label="Runrate" value={formatKpiValue(row.metric.runrateForecast, row.kpi.value_type)} />
                <CardStat
                  label="Prognose %"
                  value={forecastPercent === null ? "-" : `${formatNumber(forecastPercent, 1)}%`}
                />
                <CardStat
                  label="taeglich bis 100%"
                  value={formatKpiValue(requiredDailyForPercent(row.metric, 1, remainingWorkdays), row.kpi.value_type)}
                />
              </div>

              <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span>letzte 6 Tage</span>
                  <span>{row.metric.achievementPercent === null ? "-" : `${formatNumber(row.metric.achievementPercent, 1)}%`}</span>
                </div>
                <div className="grid h-20 grid-cols-6 items-end gap-2">
                  {recent.map((item) => (
                    <div className="grid gap-1" key={item.date}>
                      <div
                        className="rounded-t bg-pulse-500/80 transition group-hover:bg-pulse-400"
                        style={{ height: `${Math.max((item.value / maxRecent) * 64, item.value > 0 ? 8 : 2)}px` }}
                      />
                      <span className="text-center text-[10px] text-slate-600">{dayShort(item.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
              </Link>

              <form
                action={saveDailyKpiEntriesAction}
                className="mt-4 grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <input name="shop_id" type="hidden" value={selectedShopId} />
                <input name="year" type="hidden" value={year} />
                <input name="quarter" type="hidden" value={quarter} />
                <input name="entry_date" type="hidden" value={entryDate} />
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold text-slate-300">Heute / gewaehlter Tag</span>
                  <input
                    className="h-10 rounded-md border border-white/10 bg-[#0B0F10] px-3 text-right text-base font-black text-white outline-none transition placeholder:text-slate-700 focus:border-pulse-500 focus:ring-2 focus:ring-pulse-500/20"
                    defaultValue={dailyEntryMap.get(row.kpi.id) ?? ""}
                    name={`daily_value_${row.kpi.id}`}
                    placeholder="0"
                    step="0.01"
                    type="number"
                  />
                </label>
                <SubmitButton className="secondary-button h-10" pendingLabel="Speichert...">
                  Wert speichern
                </SubmitButton>
              </form>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function KpiDetailPanel({
  dailyTotalsByKpi,
  entryDate,
  isAdjustmentSaved,
  kpis,
  quarter,
  quarterAdjustment,
  remainingWorkdays,
  row,
  selectedShopId,
  today,
  year
}: {
  dailyTotalsByKpi: DailyTotalsByKpi;
  entryDate: string;
  isAdjustmentSaved: boolean;
  kpis: KpiDefinition[];
  quarter: Quarter;
  quarterAdjustment: number;
  remainingWorkdays: number;
  row: KpiRow;
  selectedShopId: string;
  today: string;
  year: number;
}) {
  const monthDates = listMonthDates(entryDate);
  const values = dailyTotalsByKpi.get(row.kpi.id);
  const graphSeries = buildGraphSeries({ dailyTotalsByKpi, kpis, quarter, today, year });

  return (
    <section className="fixed inset-y-0 left-0 right-0 z-[80] grid place-items-center bg-black/70 p-3 backdrop-blur-sm md:p-6 lg:left-72">
      <Link
        aria-label="Analyse schliessen"
        className="absolute inset-0"
        href={`/dashboard?shop=${selectedShopId}&year=${year}&quarter=${quarter}`}
      />
      <div className="relative z-10 grid max-h-[92vh] w-full max-w-[1320px] gap-5 overflow-y-auto rounded-lg border border-white/10 bg-[#0B0F10] p-4 shadow-[0_40px_140px_rgba(0,0,0,0.58)] xl:grid-cols-[1.2fr_0.8fr]">
      <div className="cockpit-card border-pulse-500/20 p-5 md:p-6">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-pulse-300">
              Analyse
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{row.kpi.name}</h2>
            <p className="mt-2 text-sm text-slate-400">
              Geoeffnet aus der Kachel: Monat, Verlauf und pauschale Quartalskorrektur.
            </p>
            <Link
              className="mt-4 inline-flex rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-pulse-500/40 hover:text-white"
              href={`/dashboard?shop=${selectedShopId}&year=${year}&quarter=${quarter}`}
            >
              Analyse schliessen
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            <PathValue label="Runrate" value={formatKpiValue(row.metric.runrateForecast, row.kpi.value_type)} />
            <PathValue label="bis 90% / Tag" value={formatKpiValue(requiredDailyForPercent(row.metric, 0.9, remainingWorkdays), row.kpi.value_type)} />
            <PathValue label="bis 100% / Tag" value={formatKpiValue(row.metric.requiredDailyAverage, row.kpi.value_type)} />
            <PathValue label="Nachtrag" value={formatKpiValue(quarterAdjustment, row.kpi.value_type)} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-2">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
            <div className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600" key={day}>
              {day}
            </div>
          ))}
          {calendarCells(monthDates).map((cell, index) =>
            cell ? (
              <Link
                className={[
                  "min-h-24 rounded-lg border p-3 transition hover:border-pulse-500/50 hover:bg-pulse-500/10",
                  cell === today
                    ? "border-pulse-500/50 bg-pulse-500/[0.08]"
                    : "border-white/10 bg-black/20"
                ].join(" ")}
                href={`/dashboard?shop=${selectedShopId}&year=${year}&quarter=${quarter}&entryDate=${cell}&focusKpi=${row.kpi.id}`}
                key={cell}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">{dayShort(cell)}</span>
                  <span className="text-xs text-slate-600">{cell.slice(-2)}</span>
                </div>
                <p className="mt-4 text-lg font-black text-white">
                  {formatKpiValue(values?.get(cell) ?? 0, row.kpi.value_type)}
                </p>
              </Link>
            ) : (
              <div className="min-h-24 rounded-lg border border-transparent" key={`empty-${index}`} />
            )
          )}
        </div>
      </div>

      <aside className="grid content-start gap-5">
        <KpiGraphPanel series={graphSeries} />

        <section className="cockpit-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">Ist-Stand nachtragen</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Fuer Wochen, die du nicht einzeln nachpflegen willst. Zaehlt ins Quartal, erscheint aber nicht im Tageskalender.
              </p>
            </div>
          </div>
          {isAdjustmentSaved ? (
            <p className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200">
              Quartals-Nachtrag gespeichert
            </p>
          ) : null}
          <form action={saveQuarterAdjustmentAction} className="mt-5 grid gap-3">
            <input name="shop_id" type="hidden" value={selectedShopId} />
            <input name="kpi_definition_id" type="hidden" value={row.kpi.id} />
            <input name="year" type="hidden" value={year} />
            <input name="quarter" type="hidden" value={quarter} />
            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-slate-300">Pauschaler Wert</span>
              <input className="control-field text-lg font-bold" name="value" placeholder="z. B. 40" step={row.kpi.value_type === "money" ? "0.01" : "1"} type="number" />
            </label>
            <SubmitButton className="primary-button h-11" pendingLabel="Speichere Nachtrag...">
              In Quartal addieren
            </SubmitButton>
          </form>
        </section>
      </aside>
      </div>
    </section>
  );
}

function MetricShell({
  label,
  value,
  note
}: {
  label: string;
  value: ReactNode;
  note: string;
}) {
  return (
    <div className="cockpit-card cockpit-card-hover p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function DailyInputPanel({
  dailyEntryMap,
  isSaved,
  kpis,
  quarter,
  quarterWeeks,
  selectedShopId,
  selectedShopName,
  selectedWeek,
  savedMode,
  today,
  year
}: {
  dailyEntryMap: Map<string, number>;
  isSaved: boolean;
  kpis: KpiDefinition[];
  quarter: Quarter;
  quarterWeeks: IsoWeek[];
  selectedShopId: string;
  selectedShopName: string;
  selectedWeek: IsoWeek;
  savedMode?: string;
  today: string;
  year: number;
}) {
  const grouped = getDailyInputGroups(kpis);
  const baseHref = `/dashboard?shop=${selectedShopId}&year=${year}&quarter=${quarter}`;

  return (
    <section className="cockpit-card p-5 md:p-6">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
            Wochenpflege
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Kalenderwoche erfassen
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {selectedShopName}, Q{quarter} {year}, {selectedWeek.label}. Hier pflegst du Wochenwerte. Den aktuellen Gesamtstand setzt du direkt in der jeweiligen KPI-Karte.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isSaved ? (
            <span className="inline-flex h-9 items-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] px-3 text-sm font-medium text-emerald-100">
              {savedMode === "stand" ? "Aktueller Stand gespeichert" : "Wochenwerte gespeichert"}
            </span>
          ) : null}
          {selectedWeek.startDate !== resolveWeek(null, quarterWeeks, today).startDate ? (
            <Link className="secondary-button py-2" href={baseHref}>
              Aktuelle KW
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-5 max-w-sm rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
        <WeekPicker selectedWeekKey={selectedWeek.key} weeks={quarterWeeks} />
      </div>

      <form action={saveWeeklyKpiEntriesAction} className="mt-5 grid gap-5">
        <input name="shop_id" type="hidden" value={selectedShopId} />
        <input name="year" type="hidden" value={year} />
        <input name="quarter" type="hidden" value={quarter} />
        <input name="week_key" type="hidden" value={selectedWeek.key} />
        <input name="week_start" type="hidden" value={selectedWeek.startDate} />
        <input name="week_end" type="hidden" value={selectedWeek.endDate} />

        <DailyFieldGroup
          dailyEntryMap={dailyEntryMap}
          items={grouped.provision}
          title="Provisionsziele"
        />
        <DailyFieldGroup
          dailyEntryMap={dailyEntryMap}
          items={grouped.unit}
          title="Stueckzahlziele"
        />
        <DailyFieldGroup
          dailyEntryMap={dailyEntryMap}
          items={grouped.quality}
          title="Qualitaet"
        />

        <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">
            Diese Werte zaehlen auf die ausgewaehlte Kalenderwoche. Wenn du Wochen ausgelassen hast, nutze unten den aktuellen Stand.
          </p>
          <div className="flex gap-2">
            <button className="secondary-button h-10" type="reset">
              Zuruecksetzen
            </button>
            <SubmitButton className="primary-button h-10 px-6" pendingLabel="Speichere...">
              KW speichern
            </SubmitButton>
          </div>
        </div>
      </form>

      <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-sm leading-6 text-slate-400">
        <span className="font-semibold text-white">Kein Nachpflege-Zwang:</span>{" "}
        Wenn zwei Wochen fehlen, kannst du sie hier als KW nachtragen oder einfach oben in der passenden KPI-Karte den aktuellen Gesamtstand setzen.
      </div>
    </section>
  );
}

function DailyFieldGroup({
  dailyEntryMap,
  fieldPrefix = "weekly_value_",
  items,
  title
}: {
  dailyEntryMap: Map<string, number>;
  fieldPrefix?: string;
  items: KpiDefinition[];
  title: string;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((kpi) => (
          <DailyNumberField
            fieldPrefix={fieldPrefix}
            key={kpi.id}
            kpi={kpi}
            value={dailyEntryMap.get(kpi.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DailyNumberField({
  fieldPrefix,
  kpi,
  value
}: {
  fieldPrefix: string;
  kpi: KpiDefinition;
  value?: number;
}) {
  const isMoney = kpi.value_type === "money";

  return (
    <label className="group grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 transition focus-within:border-pulse-500/50 focus-within:bg-white/[0.045] hover:border-white/15 hover:bg-white/[0.04]">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">{dailyInputLabel(kpi)}</span>
        <span className="text-xs text-slate-500">{isMoney ? "EUR" : "Stk."}</span>
      </span>
      <input
        className="h-11 rounded-xl border border-white/[0.09] bg-ink-800 px-3 text-right text-lg font-semibold text-white outline-none transition placeholder:text-slate-700 focus:border-pulse-500/60 focus:ring-2 focus:ring-pulse-500/10"
        defaultValue={value ?? ""}
        inputMode={isMoney ? "decimal" : "numeric"}
        min="0"
        name={`${fieldPrefix}${kpi.id}`}
        placeholder="0"
        step={isMoney ? "0.01" : "1"}
        type="number"
      />
    </label>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function PathValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-md bg-black/20 px-3 py-2 text-right">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function categoryLabel(category: string) {
  return displayCategoryLabel(category);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    green: "Gruen",
    yellow: "Gelb",
    red: "Rot",
    neutral: "Offen"
  };

  return labels[status] ?? status;
}

function getDailyInputGroups(kpis: KpiDefinition[]) {
  const byCode = new Map(kpis.map((kpi) => [kpi.code, kpi]));

  return {
    provision: [
      "provision_broadband",
      "provision_tv",
      "provision_mobile"
    ].flatMap((code) => byCode.get(code) ?? []),
    unit: [
      "units_broadband_pk",
      "units_tv",
      "units_speedup",
      "units_mobile_pk",
      "units_broadband_gk",
      "units_mobile_gk"
    ].flatMap((code) => byCode.get(code) ?? []),
    quality: [
      "quality_app_activation",
      "quality_leads",
      "quality_kek",
      "quality_pom",
      "quality_customer_frequency"
    ].flatMap((code) => byCode.get(code) ?? [])
  };
}

function dailyInputLabel(kpi: KpiDefinition) {
  const labels: Record<string, string> = {
    provision_broadband: "DSL €",
    provision_tv: "TV €",
    provision_mobile: "MF €",
    units_broadband_pk: "DSL",
    units_tv: "TV",
    units_speedup: "SpeedUp",
    units_mobile_pk: "MF",
    units_broadband_gk: "DSL GK",
    units_mobile_gk: "MF GK",
    quality_app_activation: "App-Aktivierung",
    quality_leads: "Lead",
    quality_kek: "KeK",
    quality_pom: "POM",
    quality_customer_frequency: "Kundenfrequenz"
  };

  return labels[kpi.code] ?? displayKpiName(kpi.code, kpi.name);
}

function buildDailyFocusHint(
  kpiName: string,
  requiredFor90: number | null,
  requiredFor100: number | null,
  valueType: "money" | "count" | "score"
) {
  return `${kpiName} ist aktuell der wichtigste Fokus. Fuer 90 Prozent Zielerreichung werden ab heute durchschnittlich ${formatKpiValue(requiredFor90, valueType)} pro Arbeitstag benoetigt, fuer 100 Prozent ${formatKpiValue(requiredFor100, valueType)}. Plane heute zuerst konkrete Aktivitaeten fuer diesen KPI ein.`;
}

function buildHint(
  kpiName: string,
  requiredDailyAverage: number | null,
  valueType: "money" | "count" | "score"
) {
  if (requiredDailyAverage === null) {
    return `${kpiName} braucht Aufmerksamkeit. Sobald weitere Arbeitstage im Quartal verbleiben, wird der konkrete Tagesbedarf berechnet.`;
  }

  return `${kpiName} ist aktuell der kritischste KPI. Fuer 100 Prozent Zielerreichung werden ab heute durchschnittlich ${formatKpiValue(requiredDailyAverage, valueType)} pro Arbeitstag benoetigt.`;
}

function urgencyScore(row: KpiRow) {
  if (row.metric.target <= 0) {
    return 999;
  }

  if (row.metric.runrateForecast === null) {
    return 998;
  }

  return row.metric.runrateForecast / row.metric.target;
}

function missingToPercent(metric: KpiMetric, percent: number) {
  return Math.max(metric.target * percent - metric.actual, 0);
}

function requiredDailyForPercent(metric: KpiMetric, percent: number, remainingWorkdays: number) {
  const remaining = Math.max(metric.target * percent - metric.actual, 0);

  if (remaining === 0) {
    return 0;
  }

  return remainingWorkdays > 0 ? remaining / remainingWorkdays : null;
}

function forecastAchievementPercent(metric: KpiMetric) {
  if (metric.target <= 0 || metric.runrateForecast === null) {
    return null;
  }

  return (metric.runrateForecast / metric.target) * 100;
}

function resolveWeek(weekKey: string | null | undefined, weeks: IsoWeek[], today: string): IsoWeek {
  const byKey = weekKey ? weeks.find((week) => week.key === weekKey) : null;

  if (byKey) {
    return byKey;
  }

  return weeks.find((week) => today >= week.startDate && today <= week.endDate) ?? weeks[0] ?? {
    endDate: today,
    key: `${today.slice(0, 4)}-W00`,
    label: "Aktuelle Woche",
    startDate: today,
    week: 0,
    year: Number(today.slice(0, 4))
  };
}

function buildDashboardKpiCards({
  cards,
  dailyTotalsByKpi,
  quarter,
  quarterAdjustmentMap,
  weeklyManualMap,
  workdays,
  year
}: {
  cards: KpiRow[];
  dailyTotalsByKpi: DailyTotalsByKpi;
  quarter: Quarter;
  quarterAdjustmentMap: Map<string, number>;
  weeklyManualMap: Map<string, Map<string, number>>;
  workdays: WorkdaySummary;
  year: number;
}): DashboardKpiCardData[] {
  const quarterDates = listQuarterDates(year, quarter);
  const quarterWeeks = listQuarterWeeks(year, quarter);

  return cards.map(({ kpi, metric }) => {
    const valuesByDate = dailyTotalsByKpi.get(kpi.id);
    let cumulative = 0;
    const points = quarterDates.map((date, index) => {
      const value = valuesByDate?.get(date) ?? 0;
      cumulative += value;
      const ideal =
        metric.target > 0
          ? metric.target * (index / Math.max(quarterDates.length - 1, 1))
          : 0;

      return {
        date,
        value,
        cumulative,
        ideal
      };
    });
    const nonZeroPoints = points.filter((point) => point.value > 0);
    const weekPoints = quarterWeeks.map((week) => ({
      endDate: week.endDate,
      key: week.key,
      label: `KW ${week.week}`,
      manualValue: weeklyManualMap.get(kpi.id)?.get(week.startDate) ?? 0,
      startDate: week.startDate,
      value: points
        .filter((point) => point.date >= week.startDate && point.date <= week.endDate)
        .reduce((sum, point) => sum + point.value, 0)
    }));
    const strongestDay =
      nonZeroPoints.length > 0
        ? nonZeroPoints.reduce((best, point) => (point.value > best.value ? point : best))
        : null;
    const lastEntry = nonZeroPoints.at(-1) ?? null;

    return {
      achievementPercent: metric.achievementPercent,
      actual: metric.actual,
      category: kpi.category,
      code: kpi.code,
      currentDailyAverage: metric.currentDailyAverage,
      dailyValue: metric.actual,
      differenceToTarget: metric.differenceToTarget,
      elapsedWorkdays: workdays.elapsedWorkdays,
      iconKey: iconKeyForKpi(kpi),
      id: kpi.id,
      lastEntry,
      name: kpi.name,
      points,
      quarterAdjustment: quarterAdjustmentMap.get(kpi.id) ?? 0,
      remainingWorkdays: workdays.remainingWorkdays,
      requiredDaily90: requiredDailyForPercent(metric, 0.9, workdays.remainingWorkdays),
      requiredDaily100: requiredDailyForPercent(metric, 1, workdays.remainingWorkdays),
      requiredDailyAverage: metric.requiredDailyAverage,
      restTo90: missingToPercent(metric, 0.9),
      restTo100: missingToPercent(metric, 1),
      runrateForecast: metric.runrateForecast,
      runratePercent: forecastAchievementPercent(metric),
      status: metric.status,
      strongestDay,
      target: metric.target,
      totalWorkdays: workdays.totalWorkdays,
      unit: kpi.unit,
      valueType: kpi.value_type,
      weekPoints
    };
  });
}

function buildTnpsDashboardCard({
  currentTnps,
  quarter,
  target,
  tnpsKpiId,
  workdays,
  year
}: {
  currentTnps: TnpsEntry | null;
  quarter: Quarter;
  target: number;
  tnpsKpiId: string | null;
  workdays: WorkdaySummary;
  year: number;
}): DashboardKpiCardData | null {
  if (!tnpsKpiId) {
    return null;
  }

  const actual = currentTnps?.value ?? 0;
  const achievementPercent = target > 0 ? (actual / target) * 100 : null;
  const status =
    target <= 0
      ? "neutral"
      : actual >= target
        ? "green"
        : actual >= target * 0.9
          ? "yellow"
          : "red";
  const points = listQuarterDates(year, quarter).map((date) => ({
    cumulative: actual,
    date,
    ideal: target,
    value: actual
  }));
  const weekPoints = listQuarterWeeks(year, quarter).map((week) => ({
    endDate: week.endDate,
    key: week.key,
    label: `KW ${week.week}`,
    manualValue: 0,
    startDate: week.startDate,
    value: 0
  }));

  return {
    achievementPercent,
    actual,
    category: "tnps",
    code: "tnps",
    currentDailyAverage: null,
    dailyValue: actual,
    differenceToTarget: actual - target,
    elapsedWorkdays: workdays.elapsedWorkdays,
    iconKey: "quality",
    id: tnpsKpiId,
    lastEntry: currentTnps ? { date: `KW ${currentTnps.calendar_week}`, value: actual } : null,
    name: "tNPS",
    points,
    quarterAdjustment: 0,
    remainingWorkdays: workdays.remainingWorkdays,
    requiredDaily90: null,
    requiredDaily100: null,
    requiredDailyAverage: null,
    restTo90: Math.max(target * 0.9 - actual, 0),
    restTo100: Math.max(target - actual, 0),
    runrateForecast: actual,
    runratePercent: achievementPercent,
    status,
    strongestDay: null,
    target,
    totalWorkdays: workdays.totalWorkdays,
    unit: "%",
    valueType: "score",
    weekPoints
  };
}

function iconKeyForKpi(kpi: KpiDefinition) {
  if (kpi.code.includes("broadband")) {
    return kpi.code.includes("gk") ? "business" : "broadband";
  }

  if (kpi.code.includes("tv")) {
    return "tv";
  }

  if (kpi.code.includes("mobile")) {
    return "mobile";
  }

  if (kpi.code.includes("speed")) {
    return "speed";
  }

  if (kpi.category === "quality") {
    return "quality";
  }

  return "default";
}


function buildGraphSeries({
  dailyTotalsByKpi,
  kpis,
  quarter,
  today,
  year
}: {
  dailyTotalsByKpi: DailyTotalsByKpi;
  kpis: KpiDefinition[];
  quarter: Quarter;
  today: string;
  year: number;
}): GraphSeries[] {
  const dates = listQuarterDates(year, quarter)
    .filter((date) => date <= today)
    .slice(-28);

  return kpis
    .filter((kpi) => kpi.category !== "tnps")
    .map((kpi) => {
      const totals = dailyTotalsByKpi.get(kpi.id);

      return {
        id: kpi.id,
        name: kpi.name,
        points: dates.map((date) => ({
          date,
          value: totals?.get(date) ?? 0
        }))
      };
    });
}

function buildDailyTotalsByKpi(entries: DailyEntry[]) {
  return entries.reduce<DailyTotalsByKpi>((map, entry) => {
    const byDate = map.get(entry.kpi_definition_id) ?? new Map<string, number>();
    byDate.set(entry.entry_date, (byDate.get(entry.entry_date) ?? 0) + entry.value);
    map.set(entry.kpi_definition_id, byDate);
    return map;
  }, new Map());
}

function recentDailyValues(values: Map<string, number> | undefined, today: string, days: number) {
  const dates: { date: string; value: number }[] = [];
  const end = dateFromKey(today);

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - index);
    const key = toDateKey(date);
    dates.push({ date: key, value: values?.get(key) ?? 0 });
  }

  return dates;
}

function listMonthDates(dateKey: string) {
  const date = dateFromKey(dateKey);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const cursor = new Date(Date.UTC(year, month, 1));
  const dates: string[] = [];

  while (cursor.getUTCMonth() === month) {
    dates.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function calendarCells(monthDates: string[]) {
  const first = dateFromKey(monthDates[0]);
  const mondayIndex = (first.getUTCDay() + 6) % 7;
  const cells: Array<string | null> = Array.from({ length: mondayIndex }, () => null);

  return [...cells, ...monthDates];
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dayShort(dateKey: string) {
  const day = dateFromKey(dateKey).getUTCDate();
  return String(day).padStart(2, "0");
}
