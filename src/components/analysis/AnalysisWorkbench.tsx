"use client";

import { Bot, Check, LineChart, MessageSquareText, Save, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

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

export function AnalysisWorkbench({
  series,
  selectedWeek,
  contextQuery,
  shopName,
  weekSummaries
}: {
  contextQuery: string;
  series: AnalysisSeries[];
  selectedWeek?: string;
  shopName: string;
  weekSummaries: AnalysisWeekSummary[];
}) {
  const defaultIds = series.slice(0, 4).map((item) => item.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultIds);
  const [groupName, setGroupName] = useState("");
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>(() => readGroups());
  const [chatQuestion, setChatQuestion] = useState("Was ist in dieser Woche auffaellig und was sollten wir naechste Woche machen?");
  const [chatAnswer, setChatAnswer] = useState("");
  const selectedSeries = series.filter((item) => selectedIds.includes(item.id));
  const selectedWeekSummary = weekSummaries.find((week) => week.key === selectedWeek) ?? weekSummaries.at(-1);
  const conversion = buildConversionSummary(series, selectedWeekSummary?.key);
  const aiPrompt = useMemo(
    () => buildAiPrompt({ selectedSeries, selectedWeekSummary, shopName }),
    [selectedSeries, selectedWeekSummary, shopName]
  );

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

  function generateAnalysis() {
    setChatAnswer(
      buildRuleBasedAnalysis({
        question: chatQuestion,
        selectedSeries,
        selectedWeekSummary,
        shopName
      })
    );
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
            <section className="cockpit-card p-5">
            <div className="flex items-center gap-3">
              <Bot aria-hidden className="h-5 w-5 text-pulse-300" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pulse-300">
                  KI-Modul
                </p>
                <h2 className="text-xl font-semibold text-white">Analyseprompt</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Nutzt aktuell eine lokale Regelanalyse auf deinen ausgewaehlten KPI-Daten. Der
              Systemprompt ist darunter vorbereitet fuer echte KI-Anbindung.
            </p>
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <label className="grid gap-2 text-sm font-semibold text-white">
                Frage an die Analyse
                <textarea
                  className="min-h-24 resize-y rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-sm leading-6 text-slate-300 outline-none focus:border-pulse-500/50"
                  onChange={(event) => setChatQuestion(event.target.value)}
                  value={chatQuestion}
                />
              </label>
              <button
                className="primary-button mt-3 inline-flex items-center gap-2"
                onClick={generateAnalysis}
                type="button"
              >
                <MessageSquareText aria-hidden className="h-4 w-4" />
                Analyse erstellen
              </button>
              {chatAnswer ? (
                <div className="mt-4 whitespace-pre-line rounded-xl border border-white/[0.08] bg-white/[0.035] p-4 text-sm leading-6 text-slate-200">
                  {chatAnswer}
                </div>
              ) : null}
            </div>
            <textarea
              className="mt-4 min-h-72 w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-sm leading-6 text-slate-300 outline-none focus:border-pulse-500/50"
              readOnly
              value={aiPrompt}
            />
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
              <div className="flex items-start gap-3">
                <Sparkles aria-hidden className="mt-0.5 h-5 w-5 text-pulse-300" />
                <p className="text-sm leading-6 text-slate-300">
                  Pruefe bei Ausreissern lokale Ereignisse, Aktionen, Frequenzveraenderungen und
                  Personalsituation. Fuer Husum z. B. Hafentage oder Stadt-Events.
                </p>
              </div>
            </div>
            </section>
          </section>
        </div>
      </section>
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

function buildAiPrompt({
  selectedSeries,
  selectedWeekSummary,
  shopName
}: {
  selectedSeries: AnalysisSeries[];
  selectedWeekSummary?: AnalysisWeekSummary;
  shopName: string;
}) {
  const data = selectedSeries.map((item) => ({
    kpi: item.name,
    kategorie: item.category,
    wochen: item.points.map((point) => `${point.label}: ${point.value}`).join(", ")
  }));

  return [
    "Du bist ein erfahrener Telekom-Shop Performance-Coach.",
    `Analysiere den Shop ${shopName} anhand der KPI-Wochenwerte.`,
    "Fokus: Quartalsziel-Erreichung, Runrate, Auffaelligkeiten je Kalenderwoche, Kundenfrequenz, Conversion-Rate DWH Privat/GK und lokale externe Ereignisse.",
    "Pruefe bei Husum/Rendsburg, ob Stadt-Events, Aktionen, Ferien, Wetter, Personallage oder regionale Veranstaltungen als Hypothese fuer Ausschlaege relevant sein koennten.",
    selectedWeekSummary
      ? `Aktive Woche: ${selectedWeekSummary.label}, staerkster KPI: ${selectedWeekSummary.strongestKpi}, Summe: ${selectedWeekSummary.total}.`
      : "Keine aktive Woche ausgewaehlt.",
    "Gib aus: 1. Was ist passiert? 2. Warum koennte es passiert sein? 3. Was machen wir naechste Woche konkret?",
    `Daten: ${JSON.stringify(data)}`
  ].join("\n");
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

function buildRuleBasedAnalysis({
  question,
  selectedSeries,
  selectedWeekSummary,
  shopName
}: {
  question: string;
  selectedSeries: AnalysisSeries[];
  selectedWeekSummary?: AnalysisWeekSummary;
  shopName: string;
}) {
  if (!selectedSeries.length) {
    return "Bitte markiere mindestens einen KPI, damit ich die Woche sinnvoll bewerten kann.";
  }

  const week = selectedWeekSummary;
  const topWeekValues = week
    ? [...week.values].sort((a, b) => b.value - a.value).slice(0, 3)
    : [];
  const weakWeekValues = week
    ? week.values.filter((item) => item.value === 0).slice(0, 3)
    : [];
  const trendSignals = selectedSeries
    .map((item) => {
      const last = item.points.at(-1)?.value ?? 0;
      const previous = item.points.at(-2)?.value ?? 0;
      return {
        change: last - previous,
        name: item.name
      };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3);
  const conversion = buildConversionSummary(selectedSeries, selectedWeekSummary?.key);

  return [
    `Analyse fuer ${shopName}`,
    `Frage: ${question}`,
    "",
    week
      ? `Auffaellig in ${week.label}: ${topWeekValues.map((item) => `${item.kpi} (${formatCompact(item.value)})`).join(", ") || "keine klaren Peaks"}.`
      : "Keine konkrete Kalenderwoche ausgewaehlt. Ich bewerte den letzten sichtbaren Wochenstand.",
    weakWeekValues.length
      ? `Pruefen: ${weakWeekValues.map((item) => item.kpi).join(", ")} hatten keine Bewegung. Das kann echte Ruhe oder fehlende Pflege sein.`
      : "Keine Null-KPIs in der ausgewaehlten Woche auffaellig.",
    trendSignals.length
      ? `Trend-Signale: ${trendSignals.map((item) => `${item.name} ${item.change >= 0 ? "+" : ""}${formatCompact(item.change)}`).join(", ")}.`
      : "Noch zu wenig Verlauf fuer ein klares Trendsignal.",
    conversion.customerFrequency > 0
      ? `Conversion: Privat ${conversion.pkConversion === null ? "-" : `${formatCompact(conversion.pkConversion)}%`} (${formatCompact(conversion.pkUnits)} DWH), GK ${conversion.gkConversion === null ? "-" : `${formatCompact(conversion.gkConversion)}%`} (${formatCompact(conversion.gkUnits)} DWH), Kundenfrequenz ${formatCompact(conversion.customerFrequency)}.`
      : "Conversion: Noch keine Kundenfrequenz gepflegt. Fuer bessere Ursachenanalyse Kundenfrequenz je Woche eintragen.",
    "",
    "Naechste Woche konkret:",
    "1. Staerksten KPI absichern und Aktivitaet wiederholbar machen.",
    "2. Null- oder Rueckgangs-KPIs in der Morgenrunde mit konkreter Aktion belegen.",
    "3. Kundenfrequenz und lokale Ereignisse gegen die Wochenleistung legen.",
    "4. Bei Husum/Rendsburg externe Peaks wie Hafentage, Stadtaktionen, Ferien oder Wetter als Hypothese notieren."
  ].join("\n");
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(value);
}
