"use client";

import { clsx } from "clsx";
import {
  ArrowRightLeft,
  BadgeEuro,
  BarChart3,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PencilLine,
  Settings,
  TableProperties,
  Target,
  TrendingUp,
  Users,
  X,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { listQuarterWeeks } from "@/lib/kpi/weeks";

export type SidebarIconKey =
  | "dashboard"
  | "analysis"
  | "kpiTable"
  | "entries"
  | "portings"
  | "statistics"
  | "tnps"
  | "targets"
  | "tariffs"
  | "employees"
  | "reports"
  | "compare"
  | "settings";

export type SidebarNavItem = {
  href: string;
  icon: SidebarIconKey;
  label: string;
};

const iconMap: Record<SidebarIconKey, LucideIcon> = {
  analysis: BarChart3,
  compare: BarChart3,
  dashboard: LayoutDashboard,
  employees: Users,
  entries: PencilLine,
  kpiTable: TableProperties,
  portings: ArrowRightLeft,
  reports: FileText,
  settings: Settings,
  statistics: BarChart3,
  targets: Target,
  tariffs: BadgeEuro,
  tnps: TrendingUp
};

export function AppSidebar({
  items,
  roleLabel,
  selectedShopName,
  selectedShopId,
  year,
  quarter
}: {
  items: SidebarNavItem[];
  roleLabel: string;
  selectedShopName: string;
  selectedShopId?: string | null;
  year?: number;
  quarter?: number;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/[0.08] bg-ink-950/95 px-4 backdrop-blur lg:hidden">
        <Link className="text-lg font-semibold tracking-tight text-white" href={withContext("/dashboard")}>
          TS <span className="text-pulse-500">KPI</span>
        </Link>
        <button
          aria-expanded={isOpen}
          aria-label="Menue oeffnen"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.04] text-white transition hover:border-white/15 hover:bg-white/[0.07]"
          onClick={() => setIsOpen((value) => !value)}
          type="button"
        >
          <Menu aria-hidden className="h-5 w-5" />
        </button>
      </div>

      {isOpen ? (
        <button
          aria-label="Menue schliessen"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/[0.08] bg-ink-950/98 px-4 py-5 shadow-[18px_0_42px_rgba(0,0,0,0.22)] transition-transform duration-300 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between">
          <Link
            className="rounded-lg px-2 py-1 text-2xl font-semibold tracking-tight text-white transition hover:bg-white/[0.04]"
            href={withContext("/dashboard")}
            onClick={() => setIsOpen(false)}
          >
            TS <span className="text-pulse-500">KPI</span>
          </Link>
          <button
            aria-label="Menue schliessen"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.09] text-slate-300 transition hover:border-white/15 hover:text-white lg:hidden"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Aktiver Shop
          </p>
          <p className="mt-2 text-lg font-semibold text-white">{selectedShopName}</p>
          <p className="mt-1 text-sm text-slate-400">{roleLabel}</p>
        </div>

        <nav className="mt-6 grid gap-1">
          {items.map((item) => {
            const Icon = iconMap[item.icon];
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                className={clsx(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200",
                  isActive
                    ? "border border-white/[0.09] bg-white/[0.07] text-white"
                    : "border border-transparent text-slate-300 hover:bg-white/[0.045] hover:text-white"
                )}
                href={withContext(item.href)}
                key={item.href}
                onClick={() => setIsOpen(false)}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-pulse-500" />
                ) : null}
                <span
                  className={clsx(
                    "grid h-9 w-9 place-items-center rounded-lg border transition duration-200",
                    isActive
                      ? "border-white/10 bg-pulse-500/12 text-pulse-300"
                      : "border-white/[0.08] bg-white/[0.035] text-slate-400 group-hover:border-white/15 group-hover:bg-white/[0.06] group-hover:text-white"
                  )}
                >
                  <Icon aria-hidden className="h-[18px] w-[18px]" />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <div className="flex items-center gap-2">
            <CalendarDays aria-hidden className="h-4 w-4 text-pulse-300" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Kalenderwochen
            </p>
          </div>
          <div className="mt-3 max-h-44 space-y-1 overflow-y-auto pr-1">
            {buildQuarterWeeks(year, quarter).map((week) => (
              <Link
                className="flex items-center justify-between rounded-lg px-2 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                href={withContext(`/analysis?week=${week.key}`)}
                key={week.key}
                onClick={() => setIsOpen(false)}
              >
                <span>KW {week.week}</span>
                <span className="text-slate-500">{week.startDate.slice(8, 10)}.{week.startDate.slice(5, 7)}.</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-auto grid gap-3 border-t border-white/10 pt-4">
          <form action="/auth/logout" method="post">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/15 hover:bg-white/[0.06]"
              type="submit"
            >
              <LogOut aria-hidden className="h-4 w-4 text-pulse-300" />
              Abmelden
            </button>
          </form>
          <p className="px-1 text-xs leading-5 text-slate-600">
            Keine offiziellen Markenzeichen. Nur TS KPI Cockpit.
          </p>
        </div>
      </aside>
    </>
  );

  function withContext(href: string) {
    const [pathname, existingQuery] = href.split("?");
    const params = new URLSearchParams();

    if (existingQuery) {
      new URLSearchParams(existingQuery).forEach((value, key) => params.set(key, value));
    }

    if (selectedShopId) {
      params.set("shop", selectedShopId);
    }

    if (year) {
      params.set("year", String(year));
    }

    if (quarter) {
      params.set("quarter", String(quarter));
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }
}

function buildQuarterWeeks(year?: number, quarter?: number) {
  if (!year || !quarter) {
    return [];
  }

  return listQuarterWeeks(year, quarter as 1 | 2 | 3 | 4);
}
