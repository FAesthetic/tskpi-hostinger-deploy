import { redirect } from "next/navigation";
import { resetSelectedQuarterKpiDataAction, saveQuarterlyTargetAction } from "@/app/actions/kpi";
import { AppShell } from "@/components/layout/AppShell";
import { AutoSubmitNumberInput } from "@/components/ui/AutoSubmitNumberInput";
import { displayCategoryLabel, displayKpiName } from "@/lib/kpi/display";
import { formatKpiValue } from "@/lib/kpi/format";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";

type SearchParams = {
  error?: string;
  reset?: string;
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
          Diese Werte treiben Zielerreichung, Runrate, Prognose und Tagesbedarf. Aenderungen speichern automatisch per Enter oder beim Verlassen des Feldes.
        </p>
        {searchParams.reset ? (
          <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] px-4 py-3 text-sm leading-6 text-emerald-100">
            KPI-Zahlen und Zielwerte fuer dieses Quartal wurden auf 0 gesetzt.
          </div>
        ) : null}
        {searchParams.error === "reset_confirmation" ? (
          <div className="mt-5 rounded-xl border border-red-300/20 bg-red-500/[0.1] px-4 py-3 text-sm leading-6 text-red-100">
            Reset nicht ausgefuehrt. Bitte schreibe exakt RESET in das Bestaetigungsfeld.
          </div>
        ) : null}
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
                    className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:border-pulse-500/25 hover:bg-white/[0.05] lg:grid-cols-[1fr_220px]"
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
                      <AutoSubmitNumberInput
                        className={inputClass}
                        defaultValue={target?.target_value ?? 0}
                        min="0"
                        name="target_value"
                        placeholder={isInfoKpi ? "optional" : "0"}
                        step="0.01"
                      />
                      <span className="text-xs text-slate-500">Auto-Save bei Enter oder Klick raus.</span>
                    </label>

                    <button className="sr-only" type="submit">
                      Ziel speichern
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="cockpit-card border-red-400/15 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200">
          Reset
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
          KPI-Zahlen fuer {selectedShop.name} Q{quarter} / {year} auf 0 setzen
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Loescht Wochen-/Tageswerte und tNPS fuer dieses Quartal und setzt alle Zielwerte auf 0.
          Nutzer, Shops, Tarife und Portierungen bleiben erhalten.
        </p>
        <form action={resetSelectedQuarterKpiDataAction} className="mt-5 grid gap-3 md:grid-cols-[240px_auto] md:items-end">
          <input name="shop_id" type="hidden" value={selectedShop.id} />
          <input name="year" type="hidden" value={year} />
          <input name="quarter" type="hidden" value={quarter} />
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-300">Bestaetigung</span>
            <input className="control-field" name="confirmation" placeholder="RESET" />
          </label>
          <button
            className="h-11 justify-self-start rounded-xl border border-red-400/25 bg-red-500/10 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
            type="submit"
          >
            Quartal zuruecksetzen
          </button>
        </form>
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
