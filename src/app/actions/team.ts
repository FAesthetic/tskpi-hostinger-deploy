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

function contextPath(path: string, formData: FormData, shopId: string) {
  const params = new URLSearchParams({ shop: shopId });
  const year = optionalString(formData, "year");
  const quarter = optionalString(formData, "quarter");

  if (year) {
    params.set("year", year);
  }

  if (quarter) {
    params.set("quarter", quarter);
  }

  return `${path}?${params.toString()}`;
}

async function assertCanManageEmployees(shopId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("can_view_employee_data", {
    target_shop_id: shopId
  });

  if (error || !data) {
    throw new Error("Keine Berechtigung fuer Mitarbeiterdaten.");
  }

  return supabase;
}

export async function saveEmployeeAction(formData: FormData) {
  const id = optionalString(formData, "id");
  const shopId = requiredString(formData, "shop_id");
  const name = requiredString(formData, "name");
  const functionTitle = optionalString(formData, "function_title");
  const startDate = optionalString(formData, "start_date");
  const note = optionalString(formData, "note");
  const isActive = formData.get("is_active") === "on";

  const supabase = await assertCanManageEmployees(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const payload = {
    shop_id: shopId,
    name,
    function_title: functionTitle,
    start_date: startDate,
    note,
    is_active: isActive,
    created_by: user?.id ?? null
  };

  const { error } = id
    ? await supabase.from("employees").update(payload).eq("id", id).eq("shop_id", shopId)
    : await supabase.from("employees").insert(payload);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/employees");
  redirect(contextPath("/employees", formData, shopId));
}

export async function saveSickDayAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const employeeId = requiredString(formData, "employee_id");
  const startDate = requiredString(formData, "start_date");
  const endDate = requiredString(formData, "end_date");
  const note = optionalString(formData, "note");

  const supabase = await assertCanManageEmployees(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("sick_days").insert({
    shop_id: shopId,
    employee_id: employeeId,
    start_date: startDate,
    end_date: endDate,
    note,
    created_by: user?.id ?? null
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/employees");
  redirect(contextPath("/employees", formData, shopId));
}
