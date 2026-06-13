import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  archivePortingAction,
  processDuePortingsAction,
  savePortingAction
} from "@/app/actions/portings";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";
import { getQuarterBounds, toDateKey } from "@/lib/kpi/dates";
import { formatCurrency } from "@/lib/kpi/format";
import { portingStatusLabel, portingTypeLabel } from "@/lib/portings/labels";
import { processDuePortingsForShop } from "@/lib/portings/process";

type SearchParams = {
  shop?: string;
  year?: string;
  quarter?: string;
  type?: string;
  status?: string;
  date?: string;
  tariff?: string;
  kkm?: string;
};

type Tariff = {
  id: string;
  name: string;
  porting_type: "mobile_pk" | "mobile_gk";
  provision_amount: number;
  is_active: boolean;
};

type Porting = {
  id: string;
  shop_id: string;
  customer_name: string | null;
  porting_type: "mobile_pk" | "mobile_gk";
  porting_date: string | null;
  date_unknown: boolean;
  tariff_id: string | null;
  provision_amount: number;
  kkm: string | null;
  note: string | null;
  status: "open" | "planned" | "effective" | "archived";
  created_at: string;
  archived_at: string | null;
};

export default async function PortingsPage({ searchParams }: { searchParams: SearchParams }) {
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

  if (!selectedAccess?.canViewPortings) {
    redirect("/unauthorized");
  }

  if (selectedAccess.canManage) {
    await processDuePortingsForShop(context.supabase, selectedShop.id);
  }

  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const today = toDateKey(new Date());
  const [tariffsResult, portingsResult] = await Promise.all([
    context.supabase
      .from("tariffs")
      .select("id, name, porting_type, provision_amount, is_active")
      .eq("shop_id", selectedShop.id)
      .order("name")
      .returns<Tariff[]>(),
    context.supabase
      .from("portings")
      .select(
        "id, shop_id, customer_name, porting_type, porting_date, date_unknown, tariff_id, provision_amount, kkm, note, status, created_at, archived_at"
      )
      .eq("shop_id", selectedShop.id)
      .order("created_at", { ascending: false })
      .limit(250)
      .returns<Porting[]>()
  ]);

  const tariffs = tariffsResult.data ?? [];
  const portings = portingsResult.data ?? [];
  const tariffMap = new Map(tariffs.map((tariff) => [tariff.id, tariff]));
  const filteredPortings = portings.filter((porting) =>
    matchesFilters(porting, searchParams, startDate, endDate)
  );
  const withoutDate = filteredPortings.filter((porting) => porting.date_unknown);
  const withDate = filteredPortings.filter((porting) => !porting.date_unknown);
  const dueCount = portings.filter(
    (porting) =>
      !porting.date_unknown &&
      porting.porting_date !== null &&
      porting.porting_date <= today &&
      ["open", "planned", "effective"].includes(porting.status)
  ).length;

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
        <Metric label="Gefiltert" note="Portierungen" value={String(filteredPortings.length)} />
        <Metric label="Ohne Datum" note="noch nicht wirksam" value={String(withoutDate.length)} />
        <Metric label="Faellig" note="bis heute offen" value={String(dueCount)} />
        <div className="cockpit-card cockpit-card-hover p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Verarbeitung
          </p>
          <form action={processDuePortingsAction} className="mt-3">
            <input name="shop_id" type="hidden" value={selectedShop.id} />
            <button className="primary-button h-10">Faellige buchen</button>
          </form>
        </div>
      </section>

      <section className="cockpit-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
          Portierungsliste
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Mobilfunk-Portierungen
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Portierungen werden zum Portierungsdatum automatisch auf Mobilfunk-Stueck und
          Mobilfunk-Provision gebucht.
        </p>

        <FilterForm
          quarter={quarter}
          searchParams={searchParams}
          selectedShopId={selectedShop.id}
          tariffs={tariffs}
          year={year}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="cockpit-card p-5">
          <h2 className="text-xl font-semibold text-white">Portierung erfassen</h2>
          <PortingForm shopId={selectedShop.id} tariffs={tariffs.filter((tariff) => tariff.is_active)} />
        </div>

        <PortingTable
          archiveEnabled
          portings={withDate}
          tariffMap={tariffMap}
          title={`Portierungen Q${quarter} ${year}`}
        />
      </section>

      <PortingTable
        archiveEnabled
        portings={withoutDate}
        tariffMap={tariffMap}
        title="Ohne Datum"
      />
    </AppShell>
  );
}

function FilterForm({
  tariffs,
  selectedShopId,
  year,
  quarter,
  searchParams
}: {
  tariffs: Tariff[];
  selectedShopId: string;
  year: number;
  quarter: number;
  searchParams: SearchParams;
}) {
  return (
    <form className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-7 xl:items-end">
      <input name="shop" type="hidden" value={selectedShopId} />
      <input name="year" type="hidden" value={year} />
      <input name="quarter" type="hidden" value={quarter} />
      <Select label="Typ" name="type" value={searchParams.type ?? ""}>
        <option value="">Alle</option>
        <option value="mobile_pk">Mobilfunk PK</option>
        <option value="mobile_gk">Mobilfunk GK</option>
      </Select>
      <Select label="Status" name="status" value={searchParams.status ?? ""}>
        <option value="">Alle</option>
        <option value="open">Offen</option>
        <option value="planned">Geplant</option>
        <option value="effective">Wirksam</option>
        <option value="archived">Archiviert</option>
      </Select>
      <Select label="Datum" name="date" value={searchParams.date ?? ""}>
        <option value="">Alle</option>
        <option value="known">Bekannt</option>
        <option value="unknown">Ohne Datum</option>
      </Select>
      <Select label="Tarif" name="tariff" value={searchParams.tariff ?? ""}>
        <option value="">Alle</option>
        {tariffs.map((tariff) => (
          <option key={tariff.id} value={tariff.id}>
            {tariff.name}
          </option>
        ))}
      </Select>
      <Field label="KKM" name="kkm" value={searchParams.kkm ?? ""} />
      <button className="secondary-button h-10">Filtern</button>
      <a className="secondary-button flex h-10 items-center justify-center" href={`/portings?shop=${selectedShopId}&year=${year}&quarter=${quarter}`}>
        Reset
      </a>
    </form>
  );
}

function PortingForm({ shopId, tariffs }: { shopId: string; tariffs: Tariff[] }) {
  return (
    <form action={savePortingAction} className="mt-5 grid gap-4">
      <input name="shop_id" type="hidden" value={shopId} />
      <Field label="Kunde / Name" name="customer_name" />
      <Select label="Typ" name="porting_type">
        <option value="mobile_pk">Mobilfunk PK</option>
        <option value="mobile_gk">Mobilfunk GK</option>
      </Select>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input name="date_unknown" type="checkbox" />
        Kein Datum bekannt
      </label>
      <Field label="Portierungsdatum" name="porting_date" type="date" />
      <Select label="Tarif" name="tariff_id">
        <option value="">Kein Tarif</option>
        {tariffs.map((tariff) => (
          <option key={tariff.id} value={tariff.id}>
            {tariff.name} - {formatCurrency(tariff.provision_amount)}
          </option>
        ))}
      </Select>
      <Field label="Provision Override" name="provision_amount" type="number" />
      <Field label="KKM" name="kkm" />
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Notiz</span>
        <textarea className={`${inputClass} min-h-24 py-2`} name="note" />
      </label>
      <button className="primary-button h-11">Portierung speichern</button>
    </form>
  );
}

function PortingTable({
  title,
  portings,
  tariffMap,
  archiveEnabled
}: {
  title: string;
  portings: Porting[];
  tariffMap: Map<string, Tariff>;
  archiveEnabled?: boolean;
}) {
  return (
    <section className="cockpit-card p-5">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Typ</th>
              <th className="px-4 py-3">Datum</th>
              <th className="px-4 py-3">Tarif</th>
              <th className="px-4 py-3">Provision</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">KKM</th>
              {archiveEnabled ? <th className="px-4 py-3">Aktion</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {portings.length ? (
              portings.map((porting) => (
                <tr className="bg-ink-900/60 transition hover:bg-white/[0.04]" key={porting.id}>
                  <td className="px-4 py-4 text-white">{porting.customer_name ?? "-"}</td>
                  <td className="px-4 py-4 text-slate-300">{portingTypeLabel(porting.porting_type)}</td>
                  <td className="px-4 py-4 text-slate-300">
                    {porting.date_unknown ? "Ohne Datum" : porting.porting_date}
                  </td>
                  <td className="px-4 py-4 text-slate-300">
                    {porting.tariff_id ? tariffMap.get(porting.tariff_id)?.name ?? "-" : "-"}
                  </td>
                  <td className="px-4 py-4 text-slate-300">
                    {formatCurrency(porting.provision_amount)}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge tone={statusTone(porting.status)}>
                      {portingStatusLabel(porting.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-4 text-slate-300">{porting.kkm ?? "-"}</td>
                  {archiveEnabled ? (
                    <td className="px-4 py-4">
                      <form action={archivePortingAction}>
                        <input name="shop_id" type="hidden" value={porting.shop_id} />
                        <input name="id" type="hidden" value={porting.id} />
                        <button className="secondary-button px-3 py-1.5 text-xs">
                          Archivieren
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-5 text-slate-400" colSpan={archiveEnabled ? 8 : 7}>
                  Keine Portierungen gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function matchesFilters(porting: Porting, filters: SearchParams, startDate: string, endDate: string) {
  if (filters.type && porting.porting_type !== filters.type) {
    return false;
  }

  if (filters.status && porting.status !== filters.status) {
    return false;
  }

  if (filters.date === "known" && porting.date_unknown) {
    return false;
  }

  if (filters.date === "unknown" && !porting.date_unknown) {
    return false;
  }

  if (filters.tariff && porting.tariff_id !== filters.tariff) {
    return false;
  }

  if (filters.kkm && !porting.kkm?.toLowerCase().includes(filters.kkm.toLowerCase())) {
    return false;
  }

  if (!porting.date_unknown && porting.porting_date) {
    return porting.porting_date >= startDate && porting.porting_date <= endDate;
  }

  return true;
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

function Select({
  label,
  name,
  value,
  children
}: {
  label: string;
  name: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <select className={inputClass} defaultValue={value} name={name}>
        {children}
      </select>
    </label>
  );
}

function statusTone(status: string): StatusTone {
  if (status === "archived" || status === "effective") {
    return "green";
  }

  if (status === "planned") {
    return "yellow";
  }

  return "neutral";
}

function EmptyState({ title }: { title: string }) {
  return (
    <section className="cockpit-card p-7">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
    </section>
  );
}

const inputClass = "control-field";
