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
import { saveCurrentStandAdjustmentsAction } from "@/app/actions/kpi";
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

      <div className="grid gap-8">
        {groupedCards.map(([category, items]) => (
          <section className="grid gap-4" key={category}>
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

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
  const forecastPercent = card.runratePercent ?? card.achievementPercent;
  const displayName = displayKpiName(card.code, card.name);
  const categoryLabel = displayCategoryLabel(card.category);

  return (
    <article className="group rounded-2xl border border-white/[0.08] bg-ink-900/95 p-5 shadow-cockpit transition duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-[#1B1C1F]">
      <button className="block w-full text-left" onClick={onOpen} type="button">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 transition group-hover:border-white/15 group-hover:text-white">
              <Icon aria-hidden className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-white">{displayName}</h3>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {categoryLabel}
              </p>
            </div>
          </div>
          <StatusBadge tone={card.status}>{statusLabel(card.status)}</StatusBadge>
        </div>

        <div className="mt-7 flex items-end gap-2">
          <span className="text-5xl font-semibold tracking-tight text-white">
            {formatPercent(forecastPercent)}
          </span>
          <span className="pb-2 text-xl font-bold text-slate-500">%</span>
        </div>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
          erwartete Zielerreichung Ende Quartal
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-400">
          <span>Noch {restLabel} offen</span>
          <span className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-xs text-slate-300">
            {formatValue(card.differenceToTarget, card.valueType, card.unit)}
          </span>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-pulse-500"
            style={{ width: `${Math.min(Math.max(forecastPercent ?? 0, 0), 100)}%` }}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-4 text-sm">
          <MetricLabel label="Ziel" value={formatValue(card.target, card.valueType, card.unit)} />
          <MetricLabel label="Aktuell" value={formatValue(card.actual, card.valueType, card.unit)} />
          <MetricLabel
            label="Runrate"
            value={formatValue(card.runrateForecast, card.valueType, card.unit)}
          />
          <MetricLabel label="pro Arbeitstag" value={formatAverage(card.requiredDaily100, card)} />
        </div>
      </button>

      {card.valueType === "score" ? (
        <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            tNPS wird woechentlich gepflegt
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Kein additiver Tageswert. Werte bitte im tNPS-Verlauf aktualisieren.
          </p>
        </div>
      ) : (
        <form
          action={saveCurrentStandAdjustmentsAction}
          className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"
        >
          <input name="shop_id" type="hidden" value={shopId} />
          <input name="year" type="hidden" value={year} />
          <input name="quarter" type="hidden" value={quarter} />
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Aktuellen Gesamtstand setzen
            <div className="grid gap-2">
              <input
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.09] bg-ink-800 px-3 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-pulse-500/60 focus:ring-2 focus:ring-pulse-500/10"
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
              <p className="text-[11px] font-medium normal-case tracking-normal text-slate-500">
                Stand heute im Quartal. Enter oder Feld verlassen aktualisiert automatisch.
              </p>
            </div>
          </label>
        </form>
      )}
    </article>
  );
}

function KpiDetailModal({
  kpi,
  onClose
}: {
  kpi: DashboardKpiCardData | null;
  onClose: () => void;
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
            <KpiWeeklyOverview kpi={kpi} />
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiWeeklyOverview({ kpi }: { kpi: DashboardKpiCardData }) {
  const maxValue = Math.max(...kpi.weekPoints.map((week) => week.value), 1);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">Wochenuebersicht</h3>
        <p className="text-sm text-slate-500">Historie nach Kalenderwochen, statt Tagesrauschen.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {kpi.weekPoints.map((week) => (
          <div
            className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"
            key={week.key}
          >
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
          </div>
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
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function groupCards(cards: DashboardKpiCardData[]) {
  const order: DashboardKpiCardData["category"][] = ["provision", "unit", "quality", "tnps"];
  return order
    .map((category) => [category, cards.filter((card) => card.category === category)] as const)
    .filter(([, items]) => items.length > 0);
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
