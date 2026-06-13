"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Smartphone,
  Target,
  TrendingUp,
  Tv,
  Wifi,
  X,
  Zap,
  type LucideIcon
} from "lucide-react";
import { saveCurrentStandAdjustmentsAction, saveWeeklyKpiEntryAction } from "@/app/actions/kpi";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { displayCategoryLabel, displayKpiName, displayUnitLabel } from "@/lib/kpi/display";

export type DashboardKpiPoint = {
  date: string;
  value: number;
  cumulative: number;
  ideal: number;
};

export type DashboardKpiWeekPoint = {
  endDate: string;
  key: string;
  label: string;
  startDate: string;
  value: number;
  manualValue: number;
};

export type DashboardKpiCardData = {
  id: string;
  code: string;
  name: string;
  category: "provision" | "unit" | "quality" | "tnps";
  valueType: "money" | "count" | "score";
  unit: string;
  iconKey: string;
  actual: number;
  target: number;
  dailyValue: number;
  portingPipeline: number;
  quarterAdjustment: number;
  achievementPercent: number | null;
  currentDailyAverage: number | null;
  requiredDailyAverage: number | null;
  requiredDaily90: number | null;
  requiredDaily100: number | null;
  runrateForecast: number | null;
  runratePercent: number | null;
  differenceToTarget: number;
  restTo90: number;
  restTo100: number;
  status: StatusTone;
  elapsedWorkdays: number;
  remainingWorkdays: number;
  totalWorkdays: number;
  points: DashboardKpiPoint[];
  weekPoints: DashboardKpiWeekPoint[];
  strongestDay: { date: string; value: number } | null;
  lastEntry: { date: string; value: number } | null;
};

const iconMap: Record<string, LucideIcon> = {
  broadband: Wifi,
  tv: Tv,
  mobile: Smartphone,
  speed: Zap,
  business: Building2,
  quality: BadgeCheck,
  target: Target,
  default: Activity
};

const categoryLabels: Record<DashboardKpiCardData["category"], string> = {
  provision: "MyProv",
  quality: "Qualitaet",
  tnps: "Qualitaet",
  unit: "DWH"
};

const categoryAccents: Record<DashboardKpiCardData["category"], string> = {
  provision: "bg-pulse-500",
  quality: "bg-slate-400",
  tnps: "bg-slate-400",
  unit: "bg-slate-400"
};

export function DashboardKpiExplorer({
  cards,
  quarter,
  saved,
  shopId,
  year
}: {
  cards: DashboardKpiCardData[];
  quarter: number;
  saved?: string;
  shopId: string;
  year: number;
}) {
  const [selectedKpi, setSelectedKpi] = useState<DashboardKpiCardData | null>(null);
  const groupedCards = useMemo(() => groupCards(cards), [cards]);
  const categoryOverview = useMemo(() => buildCategoryOverview(cards), [cards]);

  return (
    <>
      {saved === "daily" ? (
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
          Tageswerte gespeichert.
        </div>
      ) : null}
      {saved === "weekly" || saved === "stand" || saved === "adjustment" ? (
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
          {saved === "stand" ? "Aktueller Stand gespeichert." : "Wochen- oder Nachtragswert gespeichert."}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/[0.08] bg-ink-900/82 p-4">
        <div className="flex flex-col gap-2 border-b border-white/[0.08] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pulse-300">
              KPI-Steuerung
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Kompakter Quartalsblick
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            Karten zeigen den echten Ist-Stand zum Ziel. Klick oeffnet Wochenwerte, Verlauf und
            Detailprognose.
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {categoryOverview.map((item) => (
            <CategorySummaryCard item={item} key={item.category} />
          ))}
        </div>
      </section>

      <div className="grid gap-6">
        {groupedCards.map(([category, items]) => (
          <section className="grid gap-3" key={category}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`h-8 w-1.5 rounded-full ${categoryAccents[category]}`} />
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    {categoryLabels[category]}
                  </h2>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Quartalsziel, Runrate und Tagesbedarf
                  </p>
                </div>
              </div>
              <span className="hidden text-xs font-bold uppercase tracking-[0.3em] text-slate-600 sm:block">
                {category === "provision" ? "EUR" : category === "unit" ? "Stk" : "Qualitaet"}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {items.map((card) => (
                <KpiCockpitCard
                  card={card}
                  key={card.id}
                  onOpen={() => setSelectedKpi(card)}
                  quarter={quarter}
                  shopId={shopId}
                  year={year}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <KpiDetailModal
        kpi={selectedKpi}
        onClose={() => setSelectedKpi(null)}
        quarter={quarter}
        shopId={shopId}
        year={year}
      />
    </>
  );
}

function KpiCockpitCard({
  card,
  onOpen,
  quarter,
  shopId,
  year
}: {
  card: DashboardKpiCardData;
  onOpen: () => void;
  quarter: number;
  shopId: string;
  year: number;
}) {
  const Icon = iconMap[card.iconKey] ?? iconMap.default;
  const restLabel = formatValue(Math.max(card.target - card.actual, 0), card.valueType, card.unit);
  const currentPercent = card.achievementPercent;
  const forecastPercent = card.runratePercent;
  const displayName = displayKpiName(card.code, card.name);
  const categoryLabel = displayCategoryLabel(card.category);
  const insight = buildStatusInsight(card);

  return (
    <article className="group rounded-2xl border border-white/[0.08] bg-ink-900/95 p-4 shadow-cockpit transition duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-[#1B1C1F]">
      <button className="block w-full text-left" onClick={onOpen} type="button">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 transition group-hover:border-white/15 group-hover:text-white">
              <Icon aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold tracking-tight text-white">{displayName}</h3>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {categoryLabel}
              </p>
            </div>
          </div>
          <StatusBadge tone={card.status}>{statusLabel(card.status)}</StatusBadge>
        </div>

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-semibold tracking-tight text-white">
                {formatPercent(currentPercent)}
              </span>
              <span className="pb-1 text-lg font-bold text-slate-500">%</span>
            </div>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-pulse-300">
              Ist zum Ziel
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Runrate
            </p>
            <p className="mt-1 text-base font-semibold text-white">
              {formatPercent(forecastPercent)}%
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400">
          <span>Noch {restLabel} offen</span>
          <span className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-xs text-slate-300">
            {formatValue(card.differenceToTarget, card.valueType, card.unit)}
          </span>
          {card.portingPipeline > 0 ? (
            <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">
              +{formatValue(card.portingPipeline, card.valueType, card.unit)} Pipeline
            </span>
          ) : null}
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-pulse-500"
            style={{ width: `${Math.min(Math.max(currentPercent ?? 0, 0), 100)}%` }}
          />
        </div>

        <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs leading-5 text-slate-300">
          {insight}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-3 text-sm">
          <MetricLabel label="Ziel" value={formatValue(card.target, card.valueType, card.unit)} />
          <MetricLabel label="Aktuell" value={formatValue(card.actual, card.valueType, card.unit)} />
          <MetricLabel
            label="Prognose"
            value={formatValue(card.runrateForecast, card.valueType, card.unit)}
          />
          {card.portingPipeline > 0 ? (
            <MetricLabel
              label="Porting-Pipeline"
              value={`+${formatValue(card.portingPipeline, card.valueType, card.unit)}`}
            />
          ) : null}
          <MetricLabel label="Runrate %" value={`${formatPercent(forecastPercent)}%`} />
          <MetricLabel label="pro Arbeitstag" value={formatAverage(card.requiredDaily100, card)} />
        </div>
      </button>

      {card.valueType === "score" ? (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            tNPS wird woechentlich gepflegt
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Kein additiver Tageswert. Verlauf im Detailbereich pflegen.
          </p>
        </div>
      ) : (
        <form
          action={saveCurrentStandAdjustmentsAction}
          className="mt-4 flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-2"
        >
          <input name="shop_id" type="hidden" value={shopId} />
          <input name="year" type="hidden" value={year} />
          <input name="quarter" type="hidden" value={quarter} />
          <label className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Gesamtstand
            </span>
            <input
              className="mt-1 h-9 w-full min-w-0 rounded-lg border border-white/[0.09] bg-ink-800 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-pulse-500/60 focus:ring-2 focus:ring-pulse-500/10"
              defaultValue={card.dailyValue || ""}
              inputMode="decimal"
              name={`current_value_${card.id}`}
              onBlur={(event) => {
                if (event.currentTarget.value.trim() !== "") {
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={displayUnitLabel(card.valueType, card.unit)}
              type="number"
            />
          </label>
          <button
            className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 text-xs font-semibold text-slate-200 transition hover:border-pulse-400/40 hover:bg-pulse-500/10 hover:text-white"
            type="submit"
          >
            Setzen
          </button>
        </form>
      )}
    </article>
  );
}

function KpiDetailModal({
  kpi,
  onClose,
  quarter,
  shopId,
  year
}: {
  kpi: DashboardKpiCardData | null;
  onClose: () => void;
  quarter: number;
  shopId: string;
  year: number;
}) {
  useEffect(() => {
    if (!kpi) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [kpi, onClose]);

  if (!kpi) {
    return null;
  }

  const forecastTone = getForecastTone(kpi);
  const statusText = getForecastText(kpi);

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-[90] flex items-center justify-center px-4 py-6 lg:left-72">
      <button
        aria-label="Detailansicht schliessen"
        className="absolute inset-0 bg-black/62 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <section className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/[0.1] bg-ink-900 shadow-[0_28px_90px_rgba(0,0,0,0.48)] animate-in fade-in zoom-in-95 duration-200">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-6 border-b border-white/[0.08] bg-ink-900/95 px-6 py-5 backdrop-blur md:px-8">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              {displayKpiName(kpi.code, kpi.name)}
            </h2>
            <p className="mt-1 text-base font-medium text-slate-400">Detailansicht & Prognose</p>
          </div>
          <button
            aria-label="Schliessen"
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.035] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-6 p-6 md:p-8">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiMetricMiniCard
              accent="text-pulse-300"
              label="Aktuell"
              sub={kpi.achievementPercent === null ? "kein Ziel" : `${formatPercent(kpi.achievementPercent)}% Ist-Erreichung`}
              value={formatValue(kpi.actual, kpi.valueType, kpi.unit)}
            />
            <KpiMetricMiniCard
              accent="text-white"
              label="Ziel"
              value={formatValue(kpi.target, kpi.valueType, kpi.unit)}
            />
            <KpiMetricMiniCard
              accent="text-sky-300"
              label="Runrate Ø"
              sub="/ Tag"
              value={formatAverage(kpi.currentDailyAverage, kpi)}
            />
            <KpiMetricMiniCard
              accent="text-amber-300"
              label="Benötigt Ø"
              sub="/ Rest-Tag"
              value={formatAverage(kpi.requiredDaily100, kpi)}
            />
          </div>
          {kpi.portingPipeline > 0 ? (
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
                Portierungs-Pipeline
              </p>
              <p className="mt-2 text-xl font-semibold text-white">
                +{formatValue(kpi.portingPipeline, kpi.valueType, kpi.unit)}
              </p>
              <p className="mt-1 text-sm leading-6 text-emerald-100/80">
                In Prognose und Restbedarf enthalten. Offiziell wird der Wert erst am
                Portierungsdatum in den Ist-Stand gebucht.
              </p>
            </div>
          ) : null}

          <div className={`rounded-2xl border p-5 ${forecastTone}`}>
            <div className="flex items-start gap-4">
              {kpi.status === "green" ? (
                <CheckCircle2 aria-hidden className="mt-1 h-6 w-6 text-emerald-200" />
              ) : (
                <AlertTriangle aria-hidden className="mt-1 h-6 w-6 text-red-200" />
              )}
              <div>
                <p className="text-xl font-semibold text-white">
                  Prognose: {formatValue(kpi.runrateForecast, kpi.valueType, kpi.unit)}{" "}
                  <span className="text-base text-slate-300">
                    ({formatPercent(kpi.runratePercent)}%)
                  </span>
                </p>
                <p className="mt-1 text-sm font-medium text-slate-300">{statusText}</p>
              </div>
            </div>
          </div>

          <KpiTrendChart kpi={kpi} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiMetricMiniCard
              label="Rest bis 90%"
              value={formatValue(kpi.restTo90, kpi.valueType, kpi.unit)}
            />
            <KpiMetricMiniCard
              label="Ø bis 90%"
              value={formatAverage(kpi.requiredDaily90, kpi)}
            />
            <KpiMetricMiniCard
              label="Resttage"
              value={`${kpi.remainingWorkdays}`}
              sub={`${kpi.elapsedWorkdays} vergangen`}
            />
            <KpiMetricMiniCard
              label="Staerkster Tag"
              value={kpi.strongestDay ? formatValue(kpi.strongestDay.value, kpi.valueType, kpi.unit) : "0"}
              sub={kpi.strongestDay?.date ?? "Keine Daten"}
            />
          </div>

          <div className="grid gap-5">
            <KpiWeeklyOverview
              kpi={kpi}
              quarter={quarter}
              shopId={shopId}
              year={year}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiWeeklyOverview({
  kpi,
  quarter,
  shopId,
  year
}: {
  kpi: DashboardKpiCardData;
  quarter: number;
  shopId: string;
  year: number;
}) {
  const maxValue = Math.max(...kpi.weekPoints.map((week) => week.value), 1);
  const isEditable = kpi.valueType !== "score";

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">Wochenuebersicht</h3>
        <p className="text-sm text-slate-500">
          Bearbeite hier die KW-Werte. Leere Felder werden als 0 gespeichert.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {kpi.weekPoints.map((week) => (
          <form
            action={saveWeeklyKpiEntryAction}
            className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"
            key={week.key}
          >
            <input name="shop_id" type="hidden" value={shopId} />
            <input name="kpi_definition_id" type="hidden" value={kpi.id} />
            <input name="year" type="hidden" value={year} />
            <input name="quarter" type="hidden" value={quarter} />
            <input name="week_key" type="hidden" value={week.key} />
            <input name="week_start" type="hidden" value={week.startDate} />
            <input name="week_end" type="hidden" value={week.endDate} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-white">{week.label}</span>
              <span className="text-sm font-semibold text-slate-300">
                {formatValue(week.value, kpi.valueType, kpi.unit)}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-pulse-500"
                style={{ width: `${Math.min((week.value / maxValue) * 100, 100)}%` }}
              />
            </div>
            {isEditable ? (
              <div className="mt-3 grid gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Wochenwert
                </label>
                <div className="relative">
                  <input
                    className="h-10 w-full rounded-xl border border-white/[0.09] bg-ink-800 px-3 pr-16 text-right text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-pulse-500/60 focus:ring-2 focus:ring-pulse-500/10"
                    defaultValue={week.value || ""}
                    inputMode={kpi.valueType === "money" ? "decimal" : "numeric"}
                    min="0"
                    name="value"
                    onBlur={(event) => event.currentTarget.form?.requestSubmit()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="0"
                    step={kpi.valueType === "money" ? "0.01" : "1"}
                    type="number"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                    {kpi.valueType === "money" ? "EUR" : kpi.unit || "Stk"}
                  </span>
                </div>
                <button className="sr-only" type="submit">
                  KW speichern
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-500">
                tNPS pflegst du weiterhin im tNPS-Verlauf, weil der Wert nicht additiv ist.
              </p>
            )}
          </form>
        ))}
      </div>
    </div>
  );
}

function KpiTrendChart({ kpi }: { kpi: DashboardKpiCardData }) {
  const width = 680;
  const height = 280;
  const padding = 34;
  const maxValue = Math.max(kpi.target, ...kpi.points.map((point) => point.cumulative), 1);
  const actualPath = buildLinePath(kpi.points, "cumulative", width, height, padding, maxValue);
  const idealPath = buildLinePath(kpi.points, "ideal", width, height, padding, maxValue);
  const xLabels = kpi.points.filter((_, index) => index % Math.max(Math.floor(kpi.points.length / 5), 1) === 0);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Verlauf aktuelles Quartal</h3>
          <p className="text-sm text-slate-500">Ist kumuliert gegen ideale Ziel-Linie</p>
        </div>
        <TrendingUp aria-hidden className="h-5 w-5 text-pulse-300" />
      </div>
      <svg className="h-[280px] w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, 1, 2, 3].map((line) => {
          const y = padding + ((height - padding * 2) / 3) * line;
          return (
            <line
              key={line}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="5 5"
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
            />
          );
        })}
        <path d={idealPath} fill="none" stroke="rgba(148,163,184,0.65)" strokeDasharray="6 7" strokeWidth="2" />
        <path d={actualPath} fill="none" stroke="#E20074" strokeLinecap="round" strokeWidth="3" />
        {xLabels.map((point) => {
          const index = kpi.points.indexOf(point);
          const x = padding + (index / Math.max(kpi.points.length - 1, 1)) * (width - padding * 2);
          return (
            <text fill="rgba(148,163,184,0.6)" fontSize="11" key={point.date} textAnchor="middle" x={x} y={height - 4}>
              {point.date.slice(5).replace("-", ".")}
            </text>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-5 text-sm font-semibold text-slate-400">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-pulse-500" />
          Ist-Stand
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-slate-500" />
          Ziel-Linie
        </span>
      </div>
    </div>
  );
}

function KpiMetricMiniCard({
  accent = "text-white",
  label,
  sub,
  value
}: {
  accent?: string;
  label: string;
  sub?: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${accent}`}>{value}</p>
      {sub ? <p className="mt-2 text-sm font-semibold text-slate-500">{sub}</p> : null}
    </div>
  );
}

function MetricLabel({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function groupCards(cards: DashboardKpiCardData[]) {
  const order: DashboardKpiCardData["category"][] = ["provision", "unit", "quality", "tnps"];
  return order
    .map((category) => [category, cards.filter((card) => card.category === category)] as const)
    .filter(([, items]) => items.length > 0);
}

function buildCategoryOverview(cards: DashboardKpiCardData[]) {
  return groupCards(cards).map(([category, items]) => {
    const measurable = items.filter((item) => item.target > 0);
    const red = measurable.filter((item) => item.status === "red").length;
    const yellow = measurable.filter((item) => item.status === "yellow").length;
    const green = measurable.filter((item) => item.status === "green").length;
    const averageForecast = measurable.length
      ? measurable.reduce((sum, item) => sum + (item.runratePercent ?? item.achievementPercent ?? 0), 0) / measurable.length
      : null;
    const critical = [...measurable].sort(
      (a, b) => (a.runratePercent ?? 999) - (b.runratePercent ?? 999)
    )[0];

    return {
      averageForecast,
      category,
      critical,
      green,
      label: categoryLabels[category],
      red,
      total: items.length,
      yellow
    };
  });
}

function CategorySummaryCard({
  item
}: {
  item: ReturnType<typeof buildCategoryOverview>[number];
}) {
  const tone = item.red > 0 ? "red" : item.yellow > 0 ? "yellow" : item.green > 0 ? "green" : "neutral";

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {item.label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {item.averageForecast === null ? "-" : `${formatPercent(item.averageForecast)}%`}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Ø Prognose
          </p>
        </div>
        <StatusBadge tone={tone}>{statusLabel(tone)}</StatusBadge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        <span className="rounded-lg border border-red-300/15 bg-red-300/[0.055] px-2 py-2 text-red-100">
          {item.red} rot
        </span>
        <span className="rounded-lg border border-amber-200/15 bg-amber-200/[0.055] px-2 py-2 text-amber-100">
          {item.yellow} gelb
        </span>
        <span className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.055] px-2 py-2 text-emerald-100">
          {item.green} gruen
        </span>
      </div>
      <p className="mt-3 min-h-10 text-sm leading-5 text-slate-400">
        {item.critical
          ? `Engster KPI: ${displayKpiName(item.critical.code, item.critical.name)}`
          : `${item.total} KPI ohne Zielbewertung`}
      </p>
    </div>
  );
}

function buildLinePath(
  points: DashboardKpiPoint[],
  key: "cumulative" | "ideal",
  width: number,
  height: number,
  padding: number,
  maxValue: number
) {
  if (!points.length) {
    return "";
  }

  return points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - (point[key] / maxValue) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function getForecastTone(kpi: DashboardKpiCardData) {
  if (kpi.status === "green") {
    return "border-emerald-300/15 bg-emerald-300/[0.055]";
  }

  if (kpi.status === "yellow") {
    return "border-amber-200/15 bg-amber-200/[0.055]";
  }

  if (kpi.status === "red") {
    return "border-red-300/15 bg-red-300/[0.055]";
  }

  return "border-white/[0.08] bg-white/[0.035]";
}

function getForecastText(kpi: DashboardKpiCardData) {
  if (kpi.target <= 0) {
    return "Lege ein Ziel an, damit TS KPI die Prognose bewerten kann.";
  }

  const forecast = kpi.runrateForecast ?? 0;
  const diff = forecast - kpi.target;

  if (diff >= 0) {
    return "Bei aktueller Geschwindigkeit wird das Ziel voraussichtlich erreicht.";
  }

  return `Es fehlen voraussichtlich ${formatValue(Math.abs(diff), kpi.valueType, kpi.unit)} bis zum Ziel.`;
}

function formatValue(value: number | null, valueType: DashboardKpiCardData["valueType"], unit: string) {
  const safeValue = value ?? 0;
  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: valueType === "money" ? 0 : 1
  }).format(safeValue);

  if (valueType === "money") {
    return `${formatted} €`;
  }

  if (valueType === "score") {
    return formatted;
  }

  return `${formatted} ${unit || "Stk"}`;
}

function formatAverage(value: number | null, kpi: DashboardKpiCardData) {
  const safeValue = value ?? 0;
  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1
  }).format(safeValue);

  if (kpi.valueType === "money") {
    return `${formatted} €`;
  }

  if (kpi.valueType === "score") {
    return formatted;
  }

  return `${formatted} ${kpi.unit || "Stk"}`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "0.0";
  }

  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  }).format(value);
}

function statusLabel(status: StatusTone) {
  const labels: Record<StatusTone, string> = {
    green: "Auf Kurs",
    neutral: "Offen",
    red: "Kritisch",
    yellow: "Knapp"
  };

  return labels[status];
}

function buildStatusInsight(kpi: DashboardKpiCardData) {
  if (kpi.target <= 0) {
    return "Noch kein Ziel hinterlegt. Pflege zuerst ein Ziel, dann bewertet TS KPI Runrate und Risiko.";
  }

  const runratePercent = kpi.runratePercent ?? 0;
  const gapToTarget = Math.max(100 - runratePercent, 0);
  const required = formatAverage(kpi.requiredDaily100, kpi);
  const name = displayKpiName(kpi.code, kpi.name);

  if (kpi.status === "green") {
    const variants = [
      `${name} ist auf Kurs. Wenn das Tempo bleibt, landest du bei ${formatPercent(runratePercent)}% Zielerreichung.`,
      `Stabiler Pfad: Die Runrate liegt ueber Ziel. Jetzt absichern und nicht nachlassen.`,
      `Guter Wert: Prognose ${formatPercent(runratePercent)}%. Fokus nur halten, kein Feuerwehreinsatz noetig.`
    ];

    return pickVariant(variants, kpi.id);
  }

  if (kpi.status === "yellow") {
    const variants = [
      `${name} ist knapp unter Plan. Pro Rest-Arbeitstag brauchst du rund ${required}.`,
      `Leichtes Risiko: Die Runrate liegt ${formatPercent(gapToTarget)} Prozentpunkte unter 100%.`,
      `Aufholbar: Setze diese Woche kleine Zusatzimpulse, sonst kippt der KPI Richtung rot.`
    ];

    return pickVariant(variants, kpi.id);
  }

  if (kpi.status === "red") {
    const variants = [
      `${name} ist kritisch. Ab jetzt braucht ihr rund ${required} pro Arbeitstag bis 100%.`,
      `Handlungsbedarf: Die Prognose liegt bei ${formatPercent(runratePercent)}%. Plane heute konkrete Massnahmen.`,
      `Fokus-KPI: Ohne Tempoaenderung bleibt ihr deutlich unter Ziel. Erst Aktivitaeten, dann Ergebnis checken.`
    ];

    return pickVariant(variants, kpi.id);
  }

  return "Noch keine belastbare Bewertung. Sobald Ziel und Werte vorhanden sind, erscheinen konkrete Hinweise.";
}

function pickVariant(variants: string[], seed: string) {
  const hash = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return variants[hash % variants.length];
}
