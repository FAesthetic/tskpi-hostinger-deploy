"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { IsoWeek } from "@/lib/kpi/weeks";

export function WeekPicker({
  selectedWeekKey,
  weeks
}: {
  selectedWeekKey: string;
  weeks: IsoWeek[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-slate-300">Kalenderwoche waehlen</span>
      <select
        className="control-field"
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("week", event.target.value);
          router.push(`?${params.toString()}`);
        }}
        value={selectedWeekKey}
      >
        {weeks.map((week) => (
          <option key={week.key} value={week.key}>
            {week.label}
          </option>
        ))}
      </select>
    </label>
  );
}
