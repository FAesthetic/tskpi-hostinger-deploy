import type { Database } from "@/types/database";

export type GlobalRole = Database["public"]["Enums"]["global_role"];
export type ShopRole = Database["public"]["Enums"]["shop_role"];

export function isAdmin(globalRole: GlobalRole | null | undefined) {
  return globalRole === "admin";
}

export function canManageShop(
  globalRole: GlobalRole | null | undefined,
  shopRole: ShopRole | null | undefined
) {
  return isAdmin(globalRole) || shopRole === "shop_lead";
}

export function canViewShop(
  globalRole: GlobalRole | null | undefined,
  shopRole: ShopRole | null | undefined
) {
  return isAdmin(globalRole) || shopRole === "shop_lead" || shopRole === "viewer";
}

export function canEnterDailyValues(
  globalRole: GlobalRole | null | undefined,
  shopRole: ShopRole | null | undefined
) {
  return canViewShop(globalRole, shopRole);
}

export function canViewEmployeeTab(
  globalRole: GlobalRole | null | undefined,
  shopRole: ShopRole | null | undefined,
  canViewEmployeesOverride?: boolean | null
) {
  return isAdmin(globalRole) || Boolean(canViewEmployeesOverride);
}
