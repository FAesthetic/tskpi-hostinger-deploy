import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import Link from "next/link";
import type { GlobalRole, ShopRole } from "@/lib/auth/roles";
import type { Quarter } from "@/lib/kpi/dates";
import { AppSidebar, type SidebarNavItem } from "@/components/layout/AppSidebar";
import { ContextPicker } from "@/components/layout/ContextPicker";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";

type ShellShop = {
  id: string;
  name: string;
};

type ShellShopAccess = {
  shop: ShellShop;
  shopRole: ShopRole | null;
  canManage: boolean;
  canViewAnalysis?: boolean;
  canViewEmployees?: boolean;
  canViewKpiTable?: boolean;
  canViewPortings?: boolean;
};

export function AppShell({
  children,
  shops,
  shopAccess,
  selectedShop,
  year,
  quarter,
  globalRole,
  isGlobalAdmin
}: {
  children: ReactNode;
  shops: ShellShop[];
  shopAccess: ShellShopAccess[];
  selectedShop: ShellShop | null;
  year: number;
  quarter: Quarter;
  globalRole: GlobalRole;
  isGlobalAdmin: boolean;
}) {
  const selectedAccess = selectedShop
    ? shopAccess.find((item) => item.shop.id === selectedShop.id)
    : null;
  const canManageAnyShop = isGlobalAdmin || shopAccess.some((item) => item.canManage);
  const canViewAnyAnalysis = isGlobalAdmin || shopAccess.some((item) => item.canViewAnalysis);
  const canViewAnyEmployees = isGlobalAdmin || shopAccess.some((item) => item.canViewEmployees);
  const canViewAnyKpiTable = isGlobalAdmin || shopAccess.some((item) => item.canViewKpiTable);
  const canViewAnyPortings = isGlobalAdmin || shopAccess.some((item) => item.canViewPortings);
  const selectedShopName = selectedShop?.name ?? "Kein Shop";
  const roleLabel = getRoleLabel(globalRole, selectedAccess?.shopRole ?? null);
  const navItems = getNavigationItems({
    canManageAnyShop,
    canViewAnyAnalysis,
    canViewAnyEmployees,
    canViewAnyKpiTable,
    canViewAnyPortings
  });
  const settingsHref = buildContextHref("/settings", selectedShop?.id ?? null, year, quarter);

  return (
    <main className="min-h-screen bg-ink-950 text-slate-100 lg:pl-72">
      <AppSidebar
        items={navItems}
        quarter={quarter}
        roleLabel={roleLabel}
        selectedShopId={selectedShop?.id ?? null}
        selectedShopName={selectedShopName}
        year={year}
      />

      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:py-7">
        <header className="rounded-2xl border border-white/[0.08] bg-ink-900/90 p-4 shadow-cockpit backdrop-blur md:p-5">
          <div className="mb-4 flex flex-col gap-3 border-b border-white/[0.08] pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pulse-300">
                TS KPI Cockpit
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {selectedShopName} · Q{quarter} / {year}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Stand {new Intl.DateTimeFormat("de-DE").format(new Date())} · {roleLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ThemeSwitcher mode="compact" />
              <Link
                className="inline-flex h-11 w-11 items-center justify-center self-start rounded-xl border border-white/[0.09] bg-white/[0.035] text-slate-300 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white lg:self-auto"
                href={settingsHref}
              >
                <Settings aria-hidden className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <ContextPicker shops={shops} selectedShopId={selectedShop?.id ?? null} year={year} quarter={quarter} />
        </header>

        <div className="mt-6 grid gap-6">{children}</div>
      </div>
    </main>
  );
}

function getNavigationItems({
  canManageAnyShop,
  canViewAnyAnalysis,
  canViewAnyEmployees,
  canViewAnyKpiTable,
  canViewAnyPortings
}: {
  canManageAnyShop: boolean;
  canViewAnyAnalysis: boolean;
  canViewAnyEmployees: boolean;
  canViewAnyKpiTable: boolean;
  canViewAnyPortings: boolean;
}): SidebarNavItem[] {
  const items: SidebarNavItem[] = [
    { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
    { href: "/entries", icon: "entries", label: "Tageswerte" }
  ];

  if (canViewAnyEmployees) {
    items.splice(1, 0, { href: "/employees", icon: "employees", label: "Mitarbeiter" });
  }

  if (canViewAnyPortings) {
    items.splice(canViewAnyEmployees ? 2 : 1, 0, {
      href: "/portings",
      icon: "portings",
      label: "Portierungen"
    });
  }

  if (canViewAnyAnalysis) {
    items.push({ href: "/analysis", icon: "analysis", label: "Analyse" });
  }

  if (canViewAnyKpiTable) {
    items.push({ href: "/kpi-table", icon: "kpiTable", label: "KPI-Table" });
  }

  if (canManageAnyShop) {
    items.push({ href: "/settings", icon: "settings", label: "Einstellungen" });
  }

  return items;
}

function buildContextHref(href: string, shopId: string | null, year: number, quarter: Quarter) {
  const params = new URLSearchParams();

  if (shopId) {
    params.set("shop", shopId);
  }

  params.set("year", String(year));
  params.set("quarter", String(quarter));

  return `${href}?${params.toString()}`;
}

function getRoleLabel(globalRole: GlobalRole, shopRole: ShopRole | null) {
  if (globalRole === "admin") {
    return "Admin";
  }

  if (shopRole === "shop_lead") {
    return "TSL / Shopleiter";
  }

  return "Mitarbeiter";
}
