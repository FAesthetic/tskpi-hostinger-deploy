"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} fehlt.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

async function assertAdmin() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("is_admin");

  if (error || !data) {
    throw new Error("Nur Admins duerfen Nutzer verwalten.");
  }

  return supabase;
}

export async function updateUserAccessAction(formData: FormData) {
  const userId = requiredString(formData, "user_id");
  const shopId = requiredString(formData, "shop_id");
  const role = requiredString(formData, "role") as "shop_lead" | "viewer";
  const status = requiredString(formData, "status") as "invited" | "active" | "suspended";
  const globalRole = requiredString(formData, "global_role") as "admin" | "user";
  const canViewEmployees = formData.get("can_view_employees") === "on";
  const canViewPortings = formData.get("can_view_portings") === "on";
  const canViewAnalysis = formData.get("can_view_analysis") === "on";
  const canViewKpiTable = formData.get("can_view_kpi_table") === "on";
  const redirectShop = optionalString(formData, "redirect_shop") ?? shopId;
  const usersSettingsUrl = (params?: Record<string, string>) => {
    const searchParams = new URLSearchParams({ shop: redirectShop, ...(params ?? {}) });

    return `/settings/users?${searchParams.toString()}`;
  };

  const supabase = await assertAdmin();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      access_status: status === "active" ? "approved" : status === "suspended" ? "blocked" : "pending",
      global_role: globalRole,
      requested_shop_id: shopId
    })
    .eq("id", userId);

  if (profileError) {
    redirect(usersSettingsUrl({ error: profileError.message }));
  }

  const membershipPayload = {
    shop_id: shopId,
    user_id: userId,
    role,
    status,
    invited_by: user?.id ?? null,
    can_view_employees: canViewEmployees,
    can_view_portings: canViewPortings,
    can_view_analysis: canViewAnalysis,
    can_view_kpi_table: canViewKpiTable
  };
  const fallbackPayload = {
    shop_id: shopId,
    user_id: userId,
    role,
    status,
    invited_by: user?.id ?? null,
    can_view_employees: canViewEmployees
  };
  const minimalPayload = {
    shop_id: shopId,
    user_id: userId,
    role,
    status,
    invited_by: user?.id ?? null
  };
  const membershipError = await upsertMembershipWithFallback([
    membershipPayload,
    fallbackPayload,
    minimalPayload
  ]);

  if (membershipError) {
    redirect(usersSettingsUrl({ error: `Zugriff konnte nicht gespeichert werden: ${membershipError}` }));
  }

  const { error: otherMembershipsError } = await supabase
    .from("shop_memberships")
    .update({ status: "suspended" })
    .eq("user_id", userId)
    .neq("shop_id", shopId);

  if (otherMembershipsError) {
    redirect(usersSettingsUrl({ error: otherMembershipsError.message }));
  }

  revalidatePath("/settings/users");
  revalidatePath("/settings");
  redirect(usersSettingsUrl({ saved: "user" }));

  async function upsertMembershipWithFallback(payloads: Array<Record<string, unknown>>) {
    let lastError: string | null = null;

    for (const payload of payloads) {
      const { error } = await supabase.from("shop_memberships").upsert(payload, {
        onConflict: "shop_id,user_id"
      });

      if (!error) {
        return null;
      }

      lastError = error.message;

      if (!isMissingPermissionMigrationError(error.message)) {
        return error.message;
      }
    }

    return lastError;
  }
}

export async function deleteUserAccessAction(formData: FormData) {
  const userId = requiredString(formData, "user_id");
  const redirectShop = optionalString(formData, "redirect_shop");
  const usersSettingsUrl = (params?: Record<string, string>) => {
    const searchParams = new URLSearchParams({
      ...(redirectShop ? { shop: redirectShop } : {}),
      ...(params ?? {})
    });

    return `/settings/users${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  };
  const supabase = await assertAdmin();

  const { error: membershipError } = await supabase
    .from("shop_memberships")
    .delete()
    .eq("user_id", userId);

  if (membershipError) {
    redirect(usersSettingsUrl({ error: membershipError.message }));
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      access_status: "blocked",
      global_role: "user"
    })
    .eq("id", userId);

  if (profileError) {
    redirect(usersSettingsUrl({ error: profileError.message }));
  }

  revalidatePath("/settings/users");
  revalidatePath("/settings");
  redirect(usersSettingsUrl({ saved: "deleted" }));
}

function isMissingPermissionMigrationError(message: string) {
  return [
    "can_view_employees",
    "can_view_portings",
    "can_view_analysis",
    "can_view_kpi_table"
  ].some((column) => message.includes(column));
}
