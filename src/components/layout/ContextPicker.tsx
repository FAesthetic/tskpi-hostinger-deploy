"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Quarter } from "@/lib/kpi/dates";

type PickerShop = {
  id: string;
  name: string;
};

export function ContextPicker({
  shops,
  selectedShopId,
  year,
  quarter
}: {
  shops: PickerShop[];
  selectedShopId: string | null;
  year: number;
  quarter: Quarter;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [yearValue, setYearValue] = useState(String(year));

  function navigate(next: { shop?: string; quarter?: string; year?: string }) {
    const params = new URLSearchParams(searchParams.toString());

    if (next.shop !== undefined) {
      params.set("shop", next.shop);
    }

    if (next.quarter !== undefined) {
      params.set("quarter", next.quarter);
    }

    if (next.year !== undefined) {
      params.set("year", next.year);
    }

    router.push(`?${params.toString()}`);
  }

  function commitYear() {
    const parsedYear = Number(yearValue);

    if (Number.isInteger(parsedYear) && parsedYear >= 2020 && parsedYear <= 2100 && parsedYear !== year) {
      navigate({ year: String(parsedYear) });
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_120px_120px] md:items-end">
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-slate-400">Shop</span>
        <select
          className="h-11 rounded-xl border border-white/[0.09] bg-ink-800 px-3 text-white outline-none transition focus:border-pulse-500/60 focus:ring-2 focus:ring-pulse-500/10"
          disabled={!shops.length}
          onChange={(event) => navigate({ shop: event.target.value })}
          value={selectedShopId ?? ""}
        >
          {!shops.length ? <option>Noch kein Shop angelegt</option> : null}
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-slate-400">Quartal</span>
        <select
          className="h-11 rounded-xl border border-white/[0.09] bg-ink-800 px-3 text-white outline-none transition focus:border-pulse-500/60 focus:ring-2 focus:ring-pulse-500/10"
          onChange={(event) => navigate({ quarter: event.target.value })}
          value={quarter}
        >
          {[1, 2, 3, 4].map((item) => (
            <option key={item} value={item}>
              Q{item}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-slate-400">Jahr</span>
        <input
          className="h-11 rounded-xl border border-white/[0.09] bg-ink-800 px-3 text-white outline-none transition focus:border-pulse-500/60 focus:ring-2 focus:ring-pulse-500/10"
          onBlur={commitYear}
          onChange={(event) => setYearValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitYear();
            }
          }}
          type="number"
          value={yearValue}
        />
      </label>
    </div>
  );
}
