import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";
import { safePercent } from "@/lib/kpi/calculations";
import { getQuarterBounds } from "@/lib/kpi/dates";
import { formatNumber } from "@/lib/kpi/format";

type SearchParams = {
  shop?: string;
  year?: string;
  quarter?: string;
};

type Target = {
  shop_id: string;
  kpi_definition_id: string;
  target_value: number;
};

type Entry = {
  shop_id: string;
  kpi_definition_id: string;
  value: number;
};

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);
  const canCompare = context.isGlobalAdmin || context.shopAccess.length > 1;

  if (!canCompare) {
    redirect("/unauthorized");
  }

  const shopIds = context.shops.map((shop) => shop.id);
  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const [targetsResult, entriesResult] = shopIds.length
    ? await Promise.all([
        context.supabase
          .from("quarterly_targets")
          .select("shop_id, kpi_definition_id, target_value")
          .in("shop_id", shopIds)
          .eq("year", year)
          .eq("quarter", quarter)
          .returns<Target[]>(),
        context.supabase
          .from("daily_kpi_entries")
          .select("shop_id, kpi_definition_id, value")
          .in("shop_id", shopIds)
          .gte("entry_date", startDate)
          .lte("entry_date", endDate)
          .returns<Entry[]>()
      ])
    : [{ data: [] as Target[] }, { data: [] as Entry[] }];

  const targets = targetsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const rows = context.shops
    .map((shop) => {
      const targetTotal = targets
        .filter((target) => target.shop_id === shop.id)
        .reduce((sum, target) => sum + target.target_value, 0);
      const actualTotal = entries
        .filter((entry) => entry.shop_id === shop.id)
        .reduce((sum, entry) => sum + entry.value, 0);
      const achievement = safePercent(actualTotal, targetTotal);
      const tone: StatusTone =
        achievement === null
          ? "neutral"
          : achievement >= 100
            ? "green"
            : achievement >= 90
              ? "yellow"
              : "red";

      return {
        shop,
        targetTotal,
        actualTotal,
        achievement,
        tone
      };
    })
    .sort((a, b) => (b.achievement ?? -1) - (a.achievement ?? -1));

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
          Vergleich
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Shops im Vergleich
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Erste Vergleichsansicht ueber alle sichtbaren Shops fuer Q{quarter} {year}.
        </p>
      </section>

      <section className="cockpit-card p-5">
        <h2 className="text-xl font-semibold text-white">Shop-Ranking</h2>
        <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Ist gesamt</th>
                <th className="px-4 py-3">Ziel gesamt</th>
                <th className="px-4 py-3">Erreichung</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr className="bg-ink-900/60 transition hover:bg-white/[0.04]" key={row.shop.id}>
                  <td className="px-4 py-4 font-medium text-white">{row.shop.name}</td>
                  <td className="px-4 py-4 text-slate-300">{formatNumber(row.actualTotal, 1)}</td>
                  <td className="px-4 py-4 text-slate-300">{formatNumber(row.targetTotal, 1)}</td>
                  <td className="px-4 py-4 text-slate-300">
                    {row.achievement === null ? "-" : `${formatNumber(row.achievement, 1)}%`}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge tone={row.tone}>{statusLabel(row.tone)}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function statusLabel(status: StatusTone) {
  const labels: Record<StatusTone, string> = {
    green: "Gruen",
    yellow: "Gelb",
    red: "Rot",
    neutral: "Offen"
  };

  return labels[status];
}
