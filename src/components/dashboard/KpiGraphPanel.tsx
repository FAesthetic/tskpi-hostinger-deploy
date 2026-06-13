"use client";

import { useMemo, useState } from "react";

type GraphPoint = {
  date: string;
  value: number;
};

export type GraphSeries = {
  id: string;
  name: string;
  points: GraphPoint[];
};

type SavedGroup = {
  ids: string[];
  name: string;
};

const colors = ["#E20074", "#22c55e", "#38bdf8", "#f59e0b", "#a78bfa", "#f43f5e"];
const storageKey = "tskpi.graphGroups";

export function KpiGraphPanel({
  series,
  title = "KPIs vergleichen"
}: {
  series: GraphSeries[];
  title?: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => series.slice(0, 2).map((item) => item.id));
  const [groupName, setGroupName] = useState("");
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>(() => readGroups());
  const selectedSeries = series.filter((item) => selectedIds.includes(item.id));
  const maxValue = Math.max(
    ...selectedSeries.flatMap((item) => item.points.map((point) => point.value)),
    1
  );
  const dateLabels = useMemo(() => series[0]?.points.map((point) => point.date.slice(8, 10)) ?? [], [series]);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function saveGroup() {
    const name = groupName.trim();

    if (!name || selectedIds.length === 0) {
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
    <section className="cockpit-card p-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-pulse-300">
          Analyse-Graph
        </p>
        <h2 className="mt-2 text-xl font-black text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Mehrere KPIs markieren und eigene Analysegruppen im Browser speichern.
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        {series.map((item) => (
          <label
            className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300 transition hover:border-pulse-500/35"
            key={item.id}
          >
            <span>{item.name}</span>
            <input
              checked={selectedIds.includes(item.id)}
              className="h-4 w-4 accent-[#E20074]"
              onChange={() => toggle(item.id)}
              type="checkbox"
            />
          </label>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <svg className="h-56 w-full overflow-visible" role="img" viewBox="0 0 320 180">
          {[0, 1, 2, 3].map((line) => (
            <line
              key={line}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
              x1="0"
              x2="320"
              y1={24 + line * 42}
              y2={24 + line * 42}
            />
          ))}
          {selectedSeries.map((item, seriesIndex) => (
            <g key={item.id}>
              <polyline
                fill="none"
                points={linePoints(item.points, maxValue)}
                stroke={colors[seriesIndex % colors.length]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3.5"
              />
              {item.points.map((point, index) => {
                const coords = pointCoords(index, item.points.length, point.value, maxValue);

                return (
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    fill="#0B0F10"
                    key={`${item.id}-${point.date}`}
                    r="3"
                    stroke={colors[seriesIndex % colors.length]}
                    strokeWidth="2"
                  />
                );
              })}
            </g>
          ))}
        </svg>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-600">
          {dateLabels.filter((_, index) => index % 4 === 0).map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-sm font-semibold text-white">Gruppe speichern</p>
        <div className="flex gap-2">
          <input
            className="control-field flex-1"
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="Gruppe speichern, z. B. TV + DSL Stueckzahl"
            value={groupName}
          />
          <button className="secondary-button h-10" onClick={saveGroup} type="button">
            Speichern
          </button>
        </div>
        {savedGroups.length ? (
          <div className="flex flex-wrap gap-2">
            {savedGroups.map((group) => (
              <button
                className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-pulse-500/40 hover:bg-pulse-500/10"
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
    </section>
  );
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

function pointCoords(index: number, total: number, value: number, maxValue: number) {
  const x = total <= 1 ? 0 : (index / (total - 1)) * 320;
  const y = 160 - (value / maxValue) * 136;

  return { x, y: Math.max(18, Math.min(160, y)) };
}

function linePoints(points: GraphPoint[], maxValue: number) {
  return points
    .map((point, index) => {
      const coords = pointCoords(index, points.length, point.value, maxValue);
      return `${coords.x},${coords.y}`;
    })
    .join(" ");
}
