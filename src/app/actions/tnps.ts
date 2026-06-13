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

function intValue(formData: FormData, key: string) {
  const value = Number.parseInt(String(formData.get(key) ?? ""), 10);

  if (!Number.isInteger(value)) {
    throw new Error(`${key} ist ungueltig.`);
  }

  return value;
}

function numberValue(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").replace(",", ".").trim());

  if (!Number.isFinite(value)) {
    throw new Error(`${key} ist ungueltig.`);
  }

  return value;
}

async function assertCanManageShop(shopId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("can_manage_shop", {
    target_shop_id: shopId
  });

  if (error || !data) {
    throw new Error("Keine Berechtigung fuer diesen Shop.");
  }

  return supabase;
}

export async function saveTnpsEntryAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const year = intValue(formData, "year");
  const calendarWeek = intValue(formData, "calendar_week");
  const value = numberValue(formData, "value");
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await assertCanManageShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("tnps_entries").upsert(
    {
      shop_id: shopId,
      year,
      calendar_week: calendarWeek,
      value,
      note,
      created_by: user?.id ?? null
    },
    {
      onConflict: "shop_id,year,calendar_week"
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/tnps");
  revalidatePath("/dashboard");
  redirect(`/tnps?shop=${shopId}&year=${year}`);
}
