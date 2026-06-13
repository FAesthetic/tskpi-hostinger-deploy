import { redirect } from "next/navigation";
import { saveTariffAction, seedTariffTemplatesAction } from "@/app/actions/portings";
import { AppShell } from "@/components/layout/AppShell";
import { formatCurrency } from "@/lib/kpi/format";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";
import { portingTypeLabel } from "@/lib/portings/labels";

type SearchParams = {
  shop?: string;
  year?: string;
  quarter?: string;
};

type Tariff = {
  id: string;
  shop_id: string | null;
  name: string;
  porting_type: "mobile_pk" | "mobile_gk";
  provision_amount: number;
  is_active: boolean;
  note: string | null;
};

export default async function TariffsPage({ searchParams }: { searchParams: SearchParams }) {
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

  const { data: tariffsData } = await context.supabase
    .from("tariffs")
    .select("id, shop_id, name, porting_type, provision_amount, is_active, note")
    .eq("shop_id", selectedShop.id)
    .order("name")
    .returns<Tariff[]>();

  const tariffs = tariffsData ?? [];

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
      <section className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="cockpit-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
            Tarife
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Tarif anlegen
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Tarife steuern die automatische Provision in der Portierungsliste.
          </p>
          <TariffForm shopId={selectedShop.id} />
        </div>

        <div className="cockpit-card p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Aktuelle Tarife</h2>
              <p className="mt-1 text-sm text-slate-400">
                Mobilfunk aktiv, Breitband/TV als inaktive Platzhalter.
              </p>
            </div>
            <form action={seedTariffTemplatesAction}>
              <input name="shop_id" type="hidden" value={selectedShop.id} />
              <button className="secondary-button h-10" type="submit">
                Telekom-Vorlagen anlegen
              </button>
            </form>
          </div>
          <div className="mt-5 grid gap-3">
            {tariffs.length ? (
              tariffs.map((tariff) => (
                <form
                  action={saveTariffAction}
                  className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:border-pulse-500/25 hover:bg-white/[0.05] xl:grid-cols-[1fr_150px_140px_90px_1fr_110px]"
                  key={tariff.id}
                >
                  <input name="id" type="hidden" value={tariff.id} />
                  <input name="shop_id" type="hidden" value={selectedShop.id} />
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-400">Name</span>
                    <input className={inputClass} defaultValue={tariff.name} name="name" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-400">Typ</span>
                    <select className={inputClass} defaultValue={tariff.porting_type} name="porting_type">
                      <option value="mobile_pk">Mobilfunk PK</option>
                      <option value="mobile_gk">Mobilfunk GK</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-400">Provision</span>
                    <input className={inputClass} defaultValue={tariff.provision_amount} name="provision_amount" step="0.01" type="number" />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
                    <input defaultChecked={tariff.is_active} name="is_active" type="checkbox" />
                    aktiv
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-400">Notiz</span>
                    <input className={inputClass} defaultValue={tariff.note ?? ""} name="note" />
                  </label>
                  <button className="primary-button self-end">Speichern</button>
                </form>
              ))
            ) : (
              <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-300">
                Noch keine Tarife fuer {selectedShop.name}. Lege einen Tarif an, damit
                Portierungen automatisch eine Provision erhalten.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="cockpit-card p-5">
        <h2 className="text-xl font-semibold text-white">Ueberblick</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tariffs.map((tariff) => (
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:border-pulse-500/25" key={`summary-${tariff.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{tariff.name}</p>
                  <p className="text-sm text-slate-400">{portingTypeLabel(tariff.porting_type)}</p>
                </div>
                <p className="font-semibold text-pulse-300">{formatCurrency(tariff.provision_amount)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function TariffForm({ shopId }: { shopId: string }) {
  return (
    <form action={saveTariffAction} className="mt-6 grid gap-4">
      <input name="shop_id" type="hidden" value={shopId} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Name</span>
        <input className={inputClass} name="name" placeholder="MagentaMobil M" required />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Typ</span>
        <select className={inputClass} name="porting_type">
          <option value="mobile_pk">Mobilfunk PK</option>
          <option value="mobile_gk">Mobilfunk GK</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Provision</span>
        <input className={inputClass} name="provision_amount" step="0.01" type="number" />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input defaultChecked name="is_active" type="checkbox" />
        aktiv
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Notiz</span>
        <textarea className={`${inputClass} min-h-24 py-2`} name="note" />
      </label>
      <button className="primary-button h-11">Tarif speichern</button>
    </form>
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
