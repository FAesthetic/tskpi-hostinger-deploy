import { redirect } from "next/navigation";
import {
  canManageShop,
  canViewEmployeeTab,
  canViewShop,
  type GlobalRole,
  type ShopRole
} from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { getCurrentQuarter, type Quarter } from "@/lib/kpi/dates";

export type Profile = {
  display_name: string | null;
  email?: string | null;
  global_role: GlobalRole;
  access_status?: "pending" | "approved" | "blocked";
  requested_shop_id?: string | null;
};

export type Shop = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  is_active: boolean;
  is_primary?: boolean;
};

export type Membership = {
  shop_id: string;
  role: ShopRole;
  status: "active" | "invited" | "suspended";
  can_view_employees?: boolean;
  can_view_portings?: boolean;
  can_view_analysis?: boolean;
  can_view_kpi_table?: boolean;
};

export type ShopAccess = {
  shop: Shop;
  shopRole: ShopRole | null;
  canManage: boolean;
  canViewAnalysis: boolean;
  canViewEmployees: boolean;
  canViewKpiTable: boolean;
  canViewPortings: boolean;
};

export async function getAuthenticatedAppContext() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userId = user.id;

  const profileResult = await supabase
    .from("profiles")
    .select("display_name, email, global_role, access_status, requested_shop_id")
    .eq("id", userId)
    .returns<Profile[]>()
    .maybeSingle();
  const { data: fallbackProfile } = profileResult.error
    ? await supabase
        .from("profiles")
        .select("display_name, global_role")
        .eq("id", userId)
        .returns<Profile[]>()
        .maybeSingle()
    : { data: null };
  const profile = profileResult.data ?? fallbackProfile;

  const globalRole = profile?.global_role ?? "user";
  const isGlobalAdmin = globalRole === "admin";

  let membershipsData = await fetchActiveMemberships();

  let { data: shopsData } = await supabase
    .from("shops")
    .select("id, name, slug, location, is_active")
    .order("name")
    .returns<Shop[]>();

  if ((shopsData ?? []).length === 0) {
    await ensureDefaultShops();

    const [refreshedShopsResult, refreshedMembershipsResult] = await Promise.all([
      supabase
        .from("shops")
        .select("id, name, slug, location, is_active")
        .order("name")
        .returns<Shop[]>(),
      fetchActiveMemberships()
    ]);

    shopsData = refreshedShopsResult.data;
    membershipsData = refreshedMembershipsResult;
  }

  const memberships = membershipsData ?? [];
  const allShops = shopsData ?? [];
  const membershipShopIds = new Set(memberships.map((membership) => membership.shop_id));
  const shops = isGlobalAdmin
    ? allShops
    : allShops.filter((shop) => membershipShopIds.has(shop.id));

  const shopAccess = shops
    .map((shop) => {
      const membership = memberships.find((item) => item.shop_id === shop.id);
      const shopRole = isGlobalAdmin ? "shop_lead" : membership?.role ?? null;

      return {
        shop,
        shopRole,
        canManage: canManageShop(globalRole, shopRole),
        canViewAnalysis: isGlobalAdmin || membership?.can_view_analysis !== false,
        canViewEmployees: canViewEmployeeTab(
          globalRole,
          shopRole,
          membership?.can_view_employees ?? null
        ),
        canViewKpiTable: isGlobalAdmin || membership?.can_view_kpi_table !== false,
        canViewPortings:
          isGlobalAdmin || membership?.can_view_portings === true || canManageShop(globalRole, shopRole)
      };
    })
    .filter((item) => canViewShop(globalRole, item.shopRole));

  return {
    supabase,
    user,
    profile,
    globalRole,
    isGlobalAdmin,
    memberships,
    shops,
    shopAccess
  };

  async function ensureDefaultShops() {
    const defaults = [
      { shop_name: "Husum", shop_slug: "husum", shop_location: "Schleswig-Holstein" },
      { shop_name: "Rendsburg", shop_slug: "rendsburg", shop_location: "Schleswig-Holstein" }
    ];

    for (const shop of defaults) {
      await supabase.rpc("create_shop", shop);
    }
  }

  async function fetchActiveMemberships() {
    const result = await supabase
      .from("shop_memberships")
      .select("shop_id, role, status, can_view_employees, can_view_portings, can_view_analysis, can_view_kpi_table")
      .eq("user_id", userId)
      .eq("status", "active")
      .returns<Membership[]>();

    if (!result.error) {
      return result.data;
    }

    const fallback = await supabase
      .from("shop_memberships")
      .select("shop_id, role, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .returns<Membership[]>();

    return fallback.data;
  }
}

export function resolveSelectedShop(shopAccess: ShopAccess[], requestedShopId?: string | null) {
  if (!shopAccess.length) {
    return null;
  }

  return (
    shopAccess.find((item) => item.shop.id === requestedShopId)?.shop ??
    shopAccess[0]?.shop ??
    null
  );
}

export function parseQuarterSearchParams(searchParams: {
  year?: string;
  quarter?: string;
}) {
  const current = getCurrentQuarter();
  const parsedYear = Number(searchParams.year);
  const parsedQuarter = Number(searchParams.quarter);

  return {
    year: Number.isInteger(parsedYear) && parsedYear >= 2020 ? parsedYear : current.year,
    quarter:
      parsedQuarter >= 1 && parsedQuarter <= 4 ? (parsedQuarter as Quarter) : current.quarter
  };
}
