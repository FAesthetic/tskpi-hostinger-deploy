import { saveTnpsEntryAction } from "@/app/actions/tnps";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";
import { formatNumber } from "@/lib/kpi/format";

type SearchParams = {
  shop?: string;
  year?: string;
  quarter?: string;
};

type TnpsEntry = {
  id: string;
  year: number;
  calendar_week: number;
  value: number;
  note: string | null;
};

type TnpsTarget = {
  target_value: number;
};

type TnpsKpi = {
  id: string;
};

export default async function TnpsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);
  const selectedAccess = selectedShop
    ? context.shopAccess.find((item) => item.shop.id === selectedShop.id)
    : null;
  const canManageSelectedShop = Boolean(selectedAccess?.canManage);

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

  const [entriesResult, tnpsKpiResult] = await Promise.all([
    context.supabase
      .from("tnps_entries")
      .select("id, year, calendar_week, value, note")
      .eq("shop_id", selectedShop.id)
      .eq("year", year)
      .order("calendar_week")
      .returns<TnpsEntry[]>(),
    context.supabase
      .from("kpi_definitions")
      .select("id")
      .eq("code", "tnps")
      .returns<TnpsKpi[]>()
      .maybeSingle()
  ]);

  const entries = entriesResult.data ?? [];
  const tnpsKpi = tnpsKpiResult.data;
  const { data: target } = tnpsKpi
    ? await context.supabase
        .from("quarterly_targets")
        .select("target_value")
        .eq("shop_id", selectedShop.id)
        .eq("kpi_definition_id", tnpsKpi.id)
        .eq("year", year)
        .eq("quarter", quarter)
        .returns<TnpsTarget[]>()
        .maybeSingle()
    : { data: null };

  const current = entries.at(-1) ?? null;
  const previous = entries.at(-2) ?? null;
  const trend = current && previous ? current.value - previous.value : null;
  const isOnTarget =
    current && target?.target_value !== undefined ? current.value >= target.target_value : null;

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
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Aktuell" note={current ? `KW ${current.calendar_week}` : "kein Wert"} value={current ? formatNumber(current.value, 1) : "-"} />
        <Metric label="Ziel" note={`Q${quarter} ${year}`} value={target ? formatNumber(target.target_value, 1) : "-"} />
        <Metric label="Trend" note="gegen Vorwoche" value={trend === null ? "-" : `${trend >= 0 ? "+" : ""}${formatNumber(trend, 1)}`} />
        <div className="cockpit-card cockpit-card-hover p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Status
          </p>
          <div className="mt-3">
            <StatusBadge tone={isOnTarget === null ? "neutral" : isOnTarget ? "green" : "red"}>
              {isOnTarget === null ? "Offen" : isOnTarget ? "Ueber Ziel" : "Unter Ziel"}
            </StatusBadge>
          </div>
        </div>
      </section>

      <section className={`grid gap-5 ${canManageSelectedShop ? "lg:grid-cols-[0.82fr_1.18fr]" : ""}`}>
        {canManageSelectedShop ? (
          <div className="cockpit-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
              tNPS
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Wochenwert erfassen
            </h1>
            <form action={saveTnpsEntryAction} className="mt-6 grid gap-4">
              <input name="shop_id" type="hidden" value={selectedShop.id} />
              <Field label="Jahr" name="year" type="number" value={String(year)} />
              <Field label="Kalenderwoche" name="calendar_week" type="number" />
              <Field label="Wert" name="value" type="number" />
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-300">Notiz</span>
                <textarea className={`${inputClass} min-h-24 py-2`} name="note" />
              </label>
              <button className="primary-button h-11">tNPS speichern</button>
            </form>
          </div>
        ) : null}

        <section className="cockpit-card p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
              Verlauf
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              tNPS {selectedShop.name}
            </h1>
          </div>
          <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">KW</th>
                  <th className="px-4 py-3">Wert</th>
                  <th className="px-4 py-3">Status</th>
                  {canManageSelectedShop ? <th className="px-4 py-3">Notiz</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {entries.length ? (
                  entries.map((entry) => {
                    const overTarget =
                      target?.target_value === undefined ? null : entry.value >= target.target_value;

                    return (
                      <tr className="bg-ink-900/60 transition hover:bg-white/[0.04]" key={entry.id}>
                        <td className="px-4 py-4 text-slate-300">KW {entry.calendar_week}</td>
                        <td className="px-4 py-4 font-semibold text-white">
                          {formatNumber(entry.value, 1)}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge tone={overTarget === null ? "neutral" : overTarget ? "green" : "red"}>
                            {overTarget === null ? "ohne Ziel" : overTarget ? "ok" : "unter Ziel"}
                          </StatusBadge>
                        </td>
                        {canManageSelectedShop ? (
                          <td className="px-4 py-4 text-slate-500">{entry.note ?? "-"}</td>
                        ) : null}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-5 text-slate-400" colSpan={canManageSelectedShop ? 4 : 3}>
                      Noch keine tNPS-Werte erfasst.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="cockpit-card cockpit-card-hover p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  type = "text"
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <input className={inputClass} defaultValue={value} name={name} type={type} />
    </label>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <section className="cockpit-card p-7">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
    </section>
  );
}

const inputClass = "control-field";
