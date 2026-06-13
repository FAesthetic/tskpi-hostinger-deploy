import { redirect } from "next/navigation";
import { saveQuarterlyTargetAction } from "@/app/actions/kpi";
import { AppShell } from "@/components/layout/AppShell";
import { displayCategoryLabel, displayKpiName } from "@/lib/kpi/display";
import { formatKpiValue } from "@/lib/kpi/format";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";

type SearchParams = {
  shop?: string;
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
  note: string | null;
};

export default async function TargetsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);

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
        <EmptyState title="Keine Shops sichtbar" />
      </AppShell>
    );
  }

  const selectedAccess = context.shopAccess.find((item) => item.shop.id === selectedShop.id);

  if (!selectedAccess?.canManage) {
    redirect("/unauthorized");
  }

  const { data: kpisData } = await context.supabase
    .from("kpi_definitions")
    .select("id, code, name, category, value_type, unit, sort_order")
    .eq("status", "active")
    .order("sort_order")
    .returns<KpiDefinition[]>();

  const { data: targetsData } = await context.supabase
    .from("quarterly_targets")
    .select("kpi_definition_id, target_value, note")
    .eq("shop_id", selectedShop.id)
    .eq("year", year)
    .eq("quarter", quarter)
    .returns<QuarterlyTarget[]>();

  const kpis = kpisData ?? [];
  const targets = targetsData ?? [];
  const targetMap = new Map(targets.map((target) => [target.kpi_definition_id, target]));
  const groupedKpis = groupByCategory(kpis);

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
      <section className="cockpit-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
          Einstellungen
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Quartalsziele fuer {selectedShop.name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Diese Werte treiben Zielerreichung, Runrate, Prognose und Tagesbedarf.
        </p>
      </section>

      <section className="grid gap-5">
        {Object.entries(groupedKpis).map(([category, items]) => (
          <div className="cockpit-card p-5" key={category}>
            <h2 className="text-xl font-semibold text-white">{categoryLabel(category)}</h2>
            <div className="mt-5 grid gap-3">
              {items.map((kpi) => {
                const target = targetMap.get(kpi.id);
                const isInfoKpi = kpi.code === "quality_customer_frequency";

                return (
                  <form
                    action={saveQuarterlyTargetAction}
                    className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:border-pulse-500/25 hover:bg-white/[0.05] lg:grid-cols-[1fr_180px_120px]"
                    key={kpi.id}
                  >
                    <input name="shop_id" type="hidden" value={selectedShop.id} />
                    <input name="year" type="hidden" value={year} />
                    <input name="quarter" type="hidden" value={quarter} />
                    <input name="kpi_definition_id" type="hidden" value={kpi.id} />

                    <div>
                      <p className="font-semibold text-white">{displayKpiName(kpi.code, kpi.name)}</p>
                      <p className="text-sm text-slate-500">
                        {isInfoKpi
                          ? "Info-KPI ohne Pflichtziel"
                          : `Aktuell: ${formatKpiValue(target?.target_value ?? 0, kpi.value_type)}`}
                      </p>
                    </div>

                    <label className="grid gap-1 text-sm">
                      <span className="text-slate-400">Ziel</span>
                      <input
                        className={inputClass}
                        defaultValue={target?.target_value ?? 0}
                        name="target_value"
                        placeholder={isInfoKpi ? "optional" : "0"}
                        step="0.01"
                        type="number"
                      />
                    </label>

                    <button className="primary-button self-end" type="submit">
                      Speichern
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

function groupByCategory(kpis: KpiDefinition[]) {
  return kpis.reduce<Record<string, KpiDefinition[]>>((groups, kpi) => {
    groups[kpi.category] = groups[kpi.category] ?? [];
    groups[kpi.category].push(kpi);
    return groups;
  }, {});
}

function categoryLabel(category: string) {
  return displayCategoryLabel(category);
}

function EmptyState({ title }: { title: string }) {
  return (
    <section className="cockpit-card p-7">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
    </section>
  );
}

const inputClass = "control-field";
