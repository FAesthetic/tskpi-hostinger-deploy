import { redirect } from "next/navigation";
import { deleteUserAccessAction, updateUserAccessAction } from "@/app/actions/users";
import { AppShell } from "@/components/layout/AppShell";
import {
  getAuthenticatedAppContext,
  parseQuarterSearchParams,
  resolveSelectedShop
} from "@/lib/data/app-context";

type SearchParams = {
  error?: string;
  shop?: string;
  saved?: string;
  year?: string;
  quarter?: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  global_role: "admin" | "user";
  access_status: "pending" | "approved" | "blocked";
  requested_shop_id: string | null;
  created_at: string;
};

type MembershipRow = {
  shop_id: string;
  user_id: string;
  role: "shop_lead" | "viewer";
  status: "invited" | "active" | "suspended";
  can_view_employees: boolean;
  can_view_portings: boolean;
  can_view_analysis: boolean;
  can_view_kpi_table: boolean;
};

export default async function UsersSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedAppContext();
  const { year, quarter } = parseQuarterSearchParams(searchParams);
  const selectedShop = resolveSelectedShop(context.shopAccess, searchParams.shop);

  if (!context.isGlobalAdmin) {
    redirect("/unauthorized");
  }

  const [profilesResult, membershipsResult] = await Promise.all([
    context.supabase
      .from("profiles")
      .select("id, display_name, email, global_role, access_status, requested_shop_id, created_at")
      .order("created_at", { ascending: false })
      .returns<ProfileRow[]>(),
    context.supabase
      .from("shop_memberships")
      .select("shop_id, user_id, role, status, can_view_employees, can_view_portings, can_view_analysis, can_view_kpi_table")
      .returns<MembershipRow[]>()
  ]);

  const profiles = profilesResult.data ?? [];
  const fallbackEmployeeMembershipsResult = membershipsResult.error
    ? await context.supabase
        .from("shop_memberships")
        .select("shop_id, user_id, role, status, can_view_employees")
        .returns<
          Array<
            Omit<
              MembershipRow,
              "can_view_portings" | "can_view_analysis" | "can_view_kpi_table"
            >
          >
        >()
    : { data: null, error: null };
  const fallbackMinimalMembershipsResult =
    membershipsResult.error && fallbackEmployeeMembershipsResult.error
      ? await context.supabase
          .from("shop_memberships")
          .select("shop_id, user_id, role, status")
          .returns<
            Array<
              Omit<
                MembershipRow,
                | "can_view_employees"
                | "can_view_portings"
                | "can_view_analysis"
                | "can_view_kpi_table"
              >
            >
          >()
      : { data: null };
  const isPermissionMigrationMissing = Boolean(membershipsResult.error);
  const memberships: MembershipRow[] = membershipsResult.data
    ? membershipsResult.data
    : fallbackEmployeeMembershipsResult.data
      ? fallbackEmployeeMembershipsResult.data.map((membership) => ({
          ...membership,
          can_view_analysis: true,
          can_view_kpi_table: true,
          can_view_portings: membership.role === "shop_lead"
        }))
      : (fallbackMinimalMembershipsResult.data ?? []).map((membership) => ({
          ...membership,
          can_view_analysis: true,
          can_view_employees: membership.role === "shop_lead",
          can_view_kpi_table: true,
          can_view_portings: membership.role === "shop_lead"
        }));
  const membershipByUser = memberships.reduce<Map<string, MembershipRow[]>>((map, membership) => {
    const current = map.get(membership.user_id) ?? [];
    current.push(membership);
    map.set(membership.user_id, current);
    return map;
  }, new Map());
  const shopById = new Map(context.shops.map((shop) => [shop.id, shop]));
  const pendingCount = profiles.filter((profile) => profile.access_status === "pending").length;

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
          Nutzerverwaltung
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Zugriffe genehmigen und Rechte steuern
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Neue Registrierungen bleiben pending, bis du Shop, Rolle und Mitarbeiter-Recht freigibst.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Pending" value={String(pendingCount)} />
          <Metric label="Genehmigt" value={String(profiles.filter((profile) => profile.access_status === "approved").length)} />
          <Metric label="Gesperrt" value={String(profiles.filter((profile) => profile.access_status === "blocked").length)} />
        </div>
        {searchParams.saved ? (
          <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] px-4 py-3 text-sm leading-6 text-emerald-100">
            Zugriff gespeichert.
          </div>
        ) : null}
        {searchParams.error ? (
          <div className="mt-5 rounded-xl border border-red-300/20 bg-red-500/[0.1] px-4 py-3 text-sm leading-6 text-red-100">
            {searchParams.error}
          </div>
        ) : null}
        {isPermissionMigrationMissing ? (
          <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-4 py-3 text-sm leading-6 text-amber-100">
            Die Rechteverwaltung ist im Code vorbereitet, aber mindestens eine Supabase-Migration
            fuer granulare Tab-Rechte ist offenbar noch nicht aktiv. Nutzerfreigabe funktioniert
            trotzdem; einzelne Tab-Sperren greifen voll, sobald die Migrationen ausgefuehrt wurden.
          </div>
        ) : null}
      </section>

      <section className="grid gap-4">
        {profiles.map((profile) => {
          const userMemberships = membershipByUser.get(profile.id) ?? [];
          const primaryMembership = userMemberships[0] ?? null;
          const selectedShopId = primaryMembership?.shop_id ?? profile.requested_shop_id ?? selectedShop?.id ?? context.shops[0]?.id ?? "";
          const selectedRole = primaryMembership?.role ?? "viewer";
          const selectedStatus = primaryMembership?.status ?? (profile.access_status === "blocked" ? "suspended" : profile.access_status === "approved" ? "active" : "invited");
          const canViewEmployees = primaryMembership?.can_view_employees ?? selectedRole === "shop_lead";
          const canViewPortings = primaryMembership?.can_view_portings ?? selectedRole === "shop_lead";
          const canViewAnalysis = primaryMembership?.can_view_analysis ?? true;
          const canViewKpiTable = primaryMembership?.can_view_kpi_table ?? true;

          return (
            <form
              action={updateUserAccessAction}
              className="cockpit-card grid gap-4 p-5 xl:grid-cols-[1.2fr_1fr_150px_150px_170px_220px]"
              key={profile.id}
            >
              <input name="user_id" type="hidden" value={profile.id} />
              <input name="redirect_shop" type="hidden" value={selectedShop?.id ?? ""} />
              <div>
                <p className="text-lg font-semibold text-white">
                  {profile.display_name || profile.email || "Neuer Nutzer"}
                </p>
                <p className="mt-1 text-sm text-slate-400">{profile.email ?? "Keine E-Mail im Profil"}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Wunsch-Shop: {profile.requested_shop_id ? shopById.get(profile.requested_shop_id)?.name ?? "Unbekannt" : "nicht gewaehlt"}
                </p>
              </div>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-300">Shop</span>
                <select className="control-field" defaultValue={selectedShopId} name="shop_id">
                  {context.shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-300">Rolle</span>
                <select className="control-field" defaultValue={selectedRole} name="role">
                  <option value="viewer">Verkaeufer / Mitarbeiter</option>
                  <option value="shop_lead">Shopleiter</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-300">Status</span>
                <select className="control-field" defaultValue={selectedStatus} name="status">
                  <option value="invited">Pending</option>
                  <option value="active">Aktiv</option>
                  <option value="suspended">Gesperrt</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-300">Global</span>
                <select className="control-field" defaultValue={profile.global_role} name="global_role">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <div className="grid content-end gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input defaultChecked={canViewEmployees} name="can_view_employees" type="checkbox" />
                  Mitarbeiter-Tab
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input defaultChecked={canViewPortings} name="can_view_portings" type="checkbox" />
                  Portierungen
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input defaultChecked={canViewAnalysis} name="can_view_analysis" type="checkbox" />
                  Analyse
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input defaultChecked={canViewKpiTable} name="can_view_kpi_table" type="checkbox" />
                  KPI-Table
                </label>
                <button className="primary-button h-10">Speichern</button>
                <button
                  className="h-10 rounded-xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
                  formAction={deleteUserAccessAction}
                >
                  Zugriff loeschen
                </button>
              </div>
            </form>
          );
        })}
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
