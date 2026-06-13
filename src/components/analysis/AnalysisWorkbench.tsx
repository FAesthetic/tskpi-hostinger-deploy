"use client";

import { Check, LineChart, Save } from "lucide-react";
import { useState } from "react";
import { DivaChat } from "@/components/analysis/DivaChat";

export type AnalysisSeries = {
  code: string;
  id: string;
  name: string;
  category: string;
  unit: string;
  valueType: "money" | "count" | "score";
  points: Array<{ label: string; value: number; weekKey: string }>;
};

export type AnalysisWeekSummary = {
  key: string;
  label: string;
  total: number;
  strongestKpi: string;
  values: Array<{
    category: string;
    kpi: string;
    value: number;
  }>;
};

type SavedGroup = {
  ids: string[];
  name: string;
};

const storageKey = "tskpi.analysisGroups";
const colors = ["#E20074", "#6B7280", "#2563EB", "#16A34A", "#D97706", "#7C3AED", "#DC2626"];
const analysisPresets = [
  {
    codes: ["provision_broadband", "provision_tv", "provision_mobile"],
    description: "Euro-Ziele und Provisionstempo",
    name: "MyProv"
  },
  {
    codes: ["units_broadband_pk", "units_tv", "units_speedup", "units_mobile_pk"],
    description: "Privatkunden-Absatz und TV-Kopplung",
    name: "DWH Privat"
  },
  {
    codes: ["units_broadband_gk", "units_mobile_gk"],
    description: "GK-Leistung getrennt betrachten",
    name: "DWH GK"
  },
  {
    codes: ["quality_customer_frequency", "units_broadband_pk", "units_tv", "units_mobile_pk"],
    description: "Frequenz gegen Abschlussleistung",
    name: "Conversion"
  },
  {
    codes: ["provision_broadband", "provision_tv", "units_broadband_pk", "units_tv"],
    description: "DSL und TV im Bundle verstehen",
    name: "DSL + TV"
  }
];

export function AnalysisWorkbench({
  series,
  selectedWeek,
  contextQuery,
  quarter,
  shopId,
  shopName,
  weekSummaries,
  year
}: {
  contextQuery: string;
  quarter: number;
  series: AnalysisSeries[];
  selectedWeek?: string;
  shopId: string;
  shopName: string;
  weekSummaries: AnalysisWeekSummary[];
  year: number;
}) {
  const defaultIds = series.slice(0, 4).map((item) => item.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultIds);
  const [groupName, setGroupName] = useState("");
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>(() => readGroups());
  const selectedSeries = series.filter((item) => selectedIds.includes(item.id));
  const selectedWeekSummary = weekSummaries.find((week) => week.key === selectedWeek) ?? weekSummaries.at(-1);
  const conversion = buildConversionSummary(series, selectedWeekSummary?.key);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function saveGroup() {
    const name = groupName.trim();

    if (!name || !selectedIds.length) {
      return;
    }

    const nextGroups = [
      ...savedGroups.filter((group) => group.name.toLowerCase() !== name.toLowerCase()),
      { ids: selectedIds, name }
    ];

    setSavedGroups(nextGroups);
    window.localStorage.setItem(storageKey, JSON.stringify(nextGroups));
    setGroupName("");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <aside className="cockpit-card p-5">
        <div className="flex items-center gap-3">
          <LineChart aria-hidden className="h-5 w-5 text-pulse-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
              Analyse-Auswahl
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">KPIs markieren</h2>
          </div>
        </div>

        <div className="mt-5 border-t border-white/[0.08] pt-4">
          <p className="text-sm font-semibold text-white">Schnellansichten</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Fuer typische Shop-Fragen: Provision, DWH, Conversion oder Bundle-Fokus.
          </p>
          <div className="mt-3 grid gap-2">
            {analysisPresets.map((preset) => {
              const ids = series
                .filter((item) => preset.codes.includes(item.code))
                .map((item) => item.id);

              return (
                <button
                  className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-left transition hover:border-pulse-500/30 hover:bg-white/[0.045]"
                  disabled={!ids.length}
                  key={preset.name}
                  onClick={() => setSelectedIds(ids)}
                  type="button"
                >
                  <span className="block text-sm font-semibold text-white">{preset.name}</span>
                  <span className="text-xs leading-5 text-slate-500">{preset.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid max-h-[520px] gap-2 overflow-y-auto pr-1">
          {series.map((item) => (
            <label
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-sm text-slate-300 transition hover:border-white/15 hover:bg-white/[0.045]"
              key={item.id}
            >
              <span>
                <span className="block font-semibold text-white">{item.name}</span>
                <span className="text-xs text-slate-500">{item.category}</span>
              </span>
              <input
                checked={selectedIds.includes(item.id)}
                className="h-4 w-4 accent-[#E20074]"
                onChange={() => toggle(item.id)}
                type="checkbox"
              />
            </label>
          ))}
        </div>

        <div className="mt-5 border-t border-white/[0.08] pt-4">
          <p className="text-sm font-semibold text-white">Eigene Gruppe</p>
          <div className="mt-2 flex gap-2">
            <input
              className="control-field min-w-0 flex-1"
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="z. B. TV + DSL"
              value={groupName}
            />
            <button className="secondary-button h-10 px-3" onClick={saveGroup} type="button">
              <Save aria-hidden className="h-4 w-4" />
            </button>
          </div>
          {savedGroups.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {savedGroups.map((group) => (
                <button
                  className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-pulse-500/35 hover:text-white"
                  key={group.name}
                  onClick={() => setSelectedIds(group.ids)}
                  type="button"
                >
                  {group.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </aside>

      <section className="grid gap-6">
        <section className="grid gap-3 md:grid-cols-3">
          <AnalysisGuideCard
            label="Dashboard"
            text="Heute entscheiden: kritischster KPI, Tagesbedarf und aktueller Stand."
            title="Steuerung"
          />
          <AnalysisGuideCard
            label="Analyse"
            text="Wochen vergleichen: warum lief KW X besser oder schlechter?"
            title="Ursache"
          />
          <AnalysisGuideCard
            label="KPI-Table"
            text="Kontrolle: alle Werte, Filter, Sortierung und Ampeln als Tabelle."
            title="Audit"
          />
        </section>

        <div className="cockpit-card p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
                Wochenverlauf
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                Ausgewaehlte KPIs im Vergleich
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Historie wird bewusst nach Kalenderwochen verdichtet. Tagespflege bleibt moeglich.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-sm font-semibold text-slate-300">
              <Check aria-hidden className="h-4 w-4 text-pulse-300" />
              {selectedSeries.length} aktiv
            </span>
          </div>
          <AnalysisChart series={selectedSeries} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <section className="cockpit-card p-5">
            <h2 className="text-xl font-semibold text-white">Kalenderwochen</h2>
            <div className="mt-4 grid gap-2">
              {weekSummaries.map((week) => (
                <a
                  className="grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 transition hover:border-white/15 hover:bg-white/[0.045] md:grid-cols-[160px_1fr_160px]"
                  href={`?${contextQuery}&week=${week.key}`}
                  key={week.key}
                >
                  <span className="font-semibold text-white">{week.label}</span>
                  <span className="text-sm text-slate-400">Staerkster KPI: {week.strongestKpi}</span>
                  <span className="text-right text-sm font-semibold text-slate-300">
                    Summe {formatCompact(week.total)}
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section className="grid gap-6">
            <ConversionInsight conversion={conversion} />
            <SelectedWeekInsight week={selectedWeekSummary} />
            <DivaChat quarter={quarter} shopId={shopId} shopName={shopName} year={year} />
          </section>
        </div>
      </section>
    </div>
  );
}

function AnalysisGuideCard({ label, text, title }: { label: string; text: string; title: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-ink-900/82 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">{label}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function ConversionInsight({
  conversion
}: {
  conversion: {
    customerFrequency: number;
    gkConversion: number | null;
    gkUnits: number;
    pkConversion: number | null;
    pkUnits: number;
  };
}) {
  return (
    <section className="cockpit-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
        Conversion
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">DWH gegen Kundenfrequenz</h2>
      <p className="mt-2 text-sm text-slate-400">
        Kundenfrequenz ist ein Info-KPI ohne Ziel. Sobald Werte gepflegt sind, wird daraus die
        Conversion fuer Privat und GK sichtbar.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ConversionMetric label="Kunden" value={formatCompact(conversion.customerFrequency)} />
        <ConversionMetric
          label="Privat"
          value={conversion.pkConversion === null ? "-" : `${formatCompact(conversion.pkConversion)}%`}
          note={`${formatCompact(conversion.pkUnits)} DWH`}
        />
        <ConversionMetric
          label="GK"
          value={conversion.gkConversion === null ? "-" : `${formatCompact(conversion.gkConversion)}%`}
          note={`${formatCompact(conversion.gkUnits)} DWH`}
        />
      </div>
    </section>
  );
}

function ConversionMetric({ label, note, value }: { label: string; note?: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {note ? <p className="mt-1 text-sm text-slate-500">{note}</p> : null}
    </div>
  );
}

function SelectedWeekInsight({ week }: { week?: AnalysisWeekSummary }) {
  if (!week) {
    return (
      <section className="cockpit-card p-5">
        <h2 className="text-xl font-semibold text-white">Woche auswaehlen</h2>
        <p className="mt-2 text-sm text-slate-400">Klicke eine Kalenderwoche an, um Details zu sehen.</p>
      </section>
    );
  }

  const sortedValues = [...week.values].sort((a, b) => b.value - a.value);
  const topValues = sortedValues.slice(0, 5);
  const emptyValues = sortedValues.filter((item) => item.value === 0).slice(0, 4);

  return (
    <section className="cockpit-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
        Wochen-Detail
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{week.label}</h2>
      <p className="mt-2 text-sm text-slate-400">
        Summe ueber ausgewaertete KPIs: {formatCompact(week.total)}. Staerkster KPI: {week.strongestKpi}.
      </p>
      <div className="mt-5 grid gap-2">
        {topValues.map((item) => (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5"
            key={`${week.key}-${item.kpi}`}
          >
            <span>
              <span className="block text-sm font-semibold text-white">{item.kpi}</span>
              <span className="text-xs text-slate-500">{item.category}</span>
            </span>
            <span className="text-sm font-semibold text-slate-300">{formatCompact(item.value)}</span>
          </div>
        ))}
      </div>
      {emptyValues.length ? (
        <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] p-3 text-sm leading-6 text-amber-100">
          Keine Bewegung bei: {emptyValues.map((item) => item.kpi).join(", ")}. Pruefen, ob nicht gepflegt wurde oder ob wirklich keine Aktivitaet lief.
        </p>
      ) : null}
    </section>
  );
}

function AnalysisChart({ series }: { series: AnalysisSeries[] }) {
  const maxValue = Math.max(...series.flatMap((item) => item.points.map((point) => point.value)), 1);
  const labels = series[0]?.points.map((point) => point.label.replace("KW ", "")) ?? [];

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <svg className="h-[340px] w-full overflow-visible" role="img" viewBox="0 0 760 320">
        {[0, 1, 2, 3, 4].map((line) => {
          const y = 28 + line * 58;
          return (
            <line
              key={line}
              stroke="rgba(148,163,184,0.16)"
              strokeDasharray="4 8"
              x1="24"
              x2="736"
              y1={y}
              y2={y}
            />
          );
        })}
        {series.map((item, seriesIndex) => (
          <polyline
            fill="none"
            key={item.id}
            points={linePoints(item.points, maxValue)}
            stroke={colors[seriesIndex % colors.length]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ))}
        {labels.map((label, index) => {
          const x = 24 + (index / Math.max(labels.length - 1, 1)) * 712;
          return (
            <text fill="rgba(148,163,184,0.7)" fontSize="11" key={`${label}-${index}`} textAnchor="middle" x={x} y="314">
              {index % 2 === 0 ? label : ""}
            </text>
          );
        })}
      </svg>
      <div className="mt-4 flex flex-wrap gap-3">
        {series.map((item, index) => (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300" key={item.id}>
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function linePoints(points: AnalysisSeries["points"], maxValue: number) {
  return points
    .map((point, index) => {
      const x = 24 + (index / Math.max(points.length - 1, 1)) * 712;
      const y = 290 - (point.value / maxValue) * 250;

      return `${x.toFixed(1)},${Math.max(24, Math.min(290, y)).toFixed(1)}`;
    })
    .join(" ");
}

function readGroups() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildConversionSummary(series: AnalysisSeries[], weekKey?: string) {
  const valueFor = (codes: string[]) =>
    series
      .filter((item) => codes.includes(item.code))
      .reduce((sum, item) => {
        const points = weekKey
          ? item.points.filter((point) => point.weekKey === weekKey)
          : item.points;

        return sum + points.reduce((pointSum, point) => pointSum + point.value, 0);
      }, 0);
  const customerFrequency = valueFor(["quality_customer_frequency"]);
  const pkUnits = valueFor(["units_broadband_pk", "units_tv", "units_speedup", "units_mobile_pk"]);
  const gkUnits = valueFor(["units_broadband_gk", "units_mobile_gk"]);

  return {
    customerFrequency,
    gkConversion: customerFrequency > 0 ? (gkUnits / customerFrequency) * 100 : null,
    gkUnits,
    pkConversion: customerFrequency > 0 ? (pkUnits / customerFrequency) * 100 : null,
    pkUnits
  };
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
}
