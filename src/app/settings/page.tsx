import Link from "next/link";
import { redirect } from "next/navigation";
import { saveTariffAction, seedTariffTemplatesAction } from "@/app/actions/portings";
import { AppShell } from "@/components/layout/AppShell";
import { ShopCreatePanel } from "@/components/shops/ShopCreatePanel";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { formatCurrency } from "@/lib/kpi/format";
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

type Tariff = {
  id: string;
  shop_id: string | null;
  name: string;
  porting_type: "mobile_pk" | "mobile_gk";
  provision_amount: number;
  is_active: boolean;
  note: string | null;
};

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);
  const canManageAny = context.isGlobalAdmin || context.shopAccess.some((item) => item.canManage);

  if (!canManageAny) {
    redirect("/unauthorized");
  }

  const { data: tariffsData } = selectedShop
    ? await context.supabase
        .from("tariffs")
        .select("id, shop_id, name, porting_type, provision_amount, is_active, note")
        .eq("shop_id", selectedShop.id)
        .order("name")
        .returns<Tariff[]>()
    : { data: [] };
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
      <section className="cockpit-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pulse-300">
          Einstellungen
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          TS KPI Steuerung
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Rollen, Shop-Zugriff und operative Einstellungen bleiben getrennt nach Shop.
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <section className="cockpit-card p-5">
            <h2 className="text-xl font-semibold text-white">Sichtbare Shops</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {context.shopAccess.map((access) => (
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4" key={access.shop.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{access.shop.name}</p>
                      <p className="mt-1 text-sm text-slate-400">{roleLabel(access.shopRole)}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-300">
                      {access.canManage ? "Bearbeiten" : "Ansehen"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="cockpit-card p-5">
            <h2 className="text-xl font-semibold text-white">Cockpit-Design</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Dark und Light bleiben oben schnell erreichbar. Die erweiterten Varianten steuerst du hier zentral.
            </p>
            <div className="mt-5">
              <ThemeSwitcher />
            </div>
          </section>

          <section className="cockpit-card p-5">
            <h2 className="text-xl font-semibold text-white">Bereiche</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <SettingsLink
                href={`/settings/targets?shop=${selectedShop?.id ?? ""}&year=${year}&quarter=${quarter}`}
                label="Ziele"
                text="Quartalsziele je KPI pflegen."
              />
              <SettingsLink
                href={`/settings/tariffs?shop=${selectedShop?.id ?? ""}&year=${year}&quarter=${quarter}`}
                label="Tarife"
                text="Tarifliste und Provisionen fuer Portierungen steuern."
              />
              {context.isGlobalAdmin ? (
                <SettingsLink
                  href={`/settings/users?shop=${selectedShop?.id ?? ""}&year=${year}&quarter=${quarter}`}
                  label="Nutzer & Rechte"
                  text="Registrierungen genehmigen, Rollen und Mitarbeiter-Tab steuern."
                />
              ) : null}
              <SettingsLink
                href={`/employees?shop=${selectedShop?.id ?? ""}&year=${year}&quarter=${quarter}`}
                label="Mitarbeiter"
                text="Teamdaten, Krankentage und interne Notizen."
              />
              <SettingsLink
                href={`/kpi-table?shop=${selectedShop?.id ?? ""}&year=${year}&quarter=${quarter}`}
                label="KPI-Tabelle"
                text="Analyseansicht fuer alle KPIs."
              />
            </div>
          </section>

          {selectedShop ? (
            <section className="cockpit-card p-5">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Tarife & Provisionen</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Diese Werte nutzt die Portierungsliste automatisch. Provisionen kannst du jederzeit ueberschreiben.
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
                <TariffInlineForm shopId={selectedShop.id} />
                {tariffs.map((tariff) => (
                  <TariffInlineForm key={tariff.id} shopId={selectedShop.id} tariff={tariff} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="grid content-start gap-5">
          <section className="cockpit-card p-5">
            <h2 className="text-xl font-semibold text-white">Rollenbasis</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-300">
              <p>Admin: alle Shops, Shop-Anlage und alle Managementbereiche.</p>
              <p>TSL: zugewiesene Shops, Ziele, Werte, Portierungen und Mitarbeiter.</p>
              <p>Mitarbeiter: Zahlen und Tageswerte fuer den eigenen Shop.</p>
            </div>
          </section>
          {context.isGlobalAdmin ? <ShopCreatePanel compact /> : null}
        </aside>
      </section>
    </AppShell>
  );
}

function TariffInlineForm({ shopId, tariff }: { shopId: string; tariff?: Tariff }) {
  return (
    <form
      action={saveTariffAction}
      className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 xl:grid-cols-[1.1fr_150px_140px_90px_1fr_110px]"
    >
      {tariff ? <input name="id" type="hidden" value={tariff.id} /> : null}
      <input name="shop_id" type="hidden" value={shopId} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">{tariff ? "Tarif" : "Neuer Tarif"}</span>
        <input className="control-field" defaultValue={tariff?.name ?? ""} name="name" placeholder="MagentaMobil M" required />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Typ</span>
        <select className="control-field" defaultValue={tariff?.porting_type ?? "mobile_pk"} name="porting_type">
          <option value="mobile_pk">Mobilfunk PK</option>
          <option value="mobile_gk">Mobilfunk GK</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Provision</span>
        <input className="control-field" defaultValue={tariff?.provision_amount ?? ""} name="provision_amount" placeholder="0" step="0.01" type="number" />
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
        <input defaultChecked={tariff?.is_active ?? true} name="is_active" type="checkbox" />
        aktiv
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-300">Notiz</span>
        <input className="control-field" defaultValue={tariff?.note ?? ""} name="note" placeholder={tariff ? formatCurrency(tariff.provision_amount) : "optional"} />
      </label>
      <button className="primary-button self-end">{tariff ? "Speichern" : "Anlegen"}</button>
    </form>
  );
}

function SettingsLink({ href, label, text }: { href: string; label: string; text: string }) {
  return (
    <Link className="rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:border-pulse-500/30 hover:bg-white/[0.06]" href={href}>
      <p className="font-semibold text-white">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </Link>
  );
}

function roleLabel(role: string | null) {
  if (role === "shop_lead") {
    return "TSL / Shopleiter";
  }

  if (role === "viewer") {
    return "Mitarbeiter";
  }

  return "Admin";
}
