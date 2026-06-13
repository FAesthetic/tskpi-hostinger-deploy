"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { processDuePortingsForShop } from "@/lib/portings/process";

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

function numberValue(formData: FormData, key: string, fallback = 0) {
  const rawValue = String(formData.get(key) ?? "").replace(",", ".").trim();
  const value = Number(rawValue);

  return Number.isFinite(value) ? value : fallback;
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

export async function saveTariffAction(formData: FormData) {
  const id = optionalString(formData, "id");
  const shopId = requiredString(formData, "shop_id");
  const name = requiredString(formData, "name");
  const portingType = requiredString(formData, "porting_type");
  const provisionAmount = numberValue(formData, "provision_amount");
  const isActive = formData.get("is_active") === "on";
  const note = optionalString(formData, "note");

  const supabase = await assertCanManageShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const payload = {
    shop_id: shopId,
    name,
    porting_type: portingType,
    provision_amount: provisionAmount,
    is_active: isActive,
    note,
    created_by: user?.id ?? null
  };

  const { error } = id
    ? await supabase.from("tariffs").update(payload).eq("id", id).eq("shop_id", shopId)
    : await supabase.from("tariffs").insert(payload);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings/tariffs");
  revalidatePath("/portings");
  redirect(`/settings/tariffs?shop=${shopId}`);
}

export async function seedTariffTemplatesAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const supabase = await assertCanManageShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: existingData } = await supabase
    .from("tariffs")
    .select("name")
    .eq("shop_id", shopId)
    .returns<{ name: string }[]>();
  const existingNames = new Set((existingData ?? []).map((tariff) => tariff.name));
  const rows = tariffTemplates
    .filter((template) => !existingNames.has(template.name))
    .map((template) => ({
      ...template,
      created_by: user?.id ?? null,
      shop_id: shopId
    }));

  if (rows.length) {
    const { error } = await supabase.from("tariffs").insert(rows);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/settings/tariffs");
  revalidatePath("/portings");
  redirect(`/settings/tariffs?shop=${shopId}`);
}

export async function savePortingAction(formData: FormData) {
  const id = optionalString(formData, "id");
  const shopId = requiredString(formData, "shop_id");
  const customerName = optionalString(formData, "customer_name");
  const portingType = requiredString(formData, "porting_type");
  const dateUnknown = formData.get("date_unknown") === "on";
  const portingDate = dateUnknown ? null : optionalString(formData, "porting_date");
  const tariffId = optionalString(formData, "tariff_id");
  const kkm = optionalString(formData, "kkm");
  const note = optionalString(formData, "note");

  const supabase = await assertCanManageShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const provisionInput = String(formData.get("provision_amount") ?? "").trim();
  let provisionAmount = numberValue(formData, "provision_amount");

  if (!provisionInput && tariffId) {
    const { data: tariff } = await supabase
      .from("tariffs")
      .select("provision_amount")
      .eq("id", tariffId)
      .returns<{ provision_amount: number }[]>()
      .maybeSingle();

    provisionAmount = tariff?.provision_amount ?? 0;
  }

  const payload = {
    shop_id: shopId,
    customer_name: customerName,
    porting_type: portingType,
    porting_date: portingDate,
    date_unknown: dateUnknown,
    tariff_id: tariffId,
    provision_amount: provisionAmount,
    kkm,
    note,
    status: dateUnknown ? "open" : "planned",
    created_by: user?.id ?? null,
    archived_at: null
  };

  const { error } = id
    ? await supabase.from("portings").update(payload).eq("id", id).eq("shop_id", shopId)
    : await supabase.from("portings").insert(payload);

  if (error) {
    throw new Error(error.message);
  }

  if (!dateUnknown && portingDate) {
    await processDuePortingsForShop(supabase, shopId);
  }

  revalidatePath("/dashboard");
  revalidatePath("/portings");
  redirect(`/portings?shop=${shopId}`);
}

const tariffTemplates = [
  template("MagentaMobil XS", "mobile_pk", true, "Mobilfunk-Platzhalter, Provision spaeter setzen"),
  template("MagentaMobil S", "mobile_pk", true, "Mobilfunk-Platzhalter, Provision spaeter setzen"),
  template("MagentaMobil M", "mobile_pk", true, "Mobilfunk-Platzhalter, Provision spaeter setzen"),
  template("MagentaMobil L", "mobile_pk", true, "Mobilfunk-Platzhalter, Provision spaeter setzen"),
  template("MagentaMobil XL", "mobile_pk", true, "Mobilfunk-Platzhalter, Provision spaeter setzen"),
  template("PlusKarte", "mobile_pk", true, "PlusKarten-Platzhalter, Provision spaeter setzen"),
  template("PlusKarte Plus", "mobile_pk", true, "PlusKarten-Platzhalter, Provision spaeter setzen"),
  template("Glasfaser 150", "mobile_pk", false, "Breitband-Platzhalter, nicht fuer Portierungen aktiv"),
  template("Glasfaser 300", "mobile_pk", false, "Breitband-Platzhalter, nicht fuer Portierungen aktiv"),
  template("Glasfaser 600", "mobile_pk", false, "Breitband-Platzhalter, nicht fuer Portierungen aktiv"),
  template("Glasfaser 1000", "mobile_pk", false, "Breitband-Platzhalter, nicht fuer Portierungen aktiv"),
  template("MagentaZuhause S", "mobile_pk", false, "Breitband-Platzhalter, nicht fuer Portierungen aktiv"),
  template("MagentaZuhause M", "mobile_pk", false, "Breitband-Platzhalter, nicht fuer Portierungen aktiv"),
  template("MagentaZuhause L", "mobile_pk", false, "Breitband-Platzhalter, nicht fuer Portierungen aktiv"),
  template("MagentaZuhause XL", "mobile_pk", false, "Breitband-Platzhalter, nicht fuer Portierungen aktiv"),
  template("MagentaTV Smart", "mobile_pk", false, "TV-Platzhalter, nicht fuer Portierungen aktiv"),
  template("MagentaTV SmartStream", "mobile_pk", false, "TV-Platzhalter, nicht fuer Portierungen aktiv"),
  template("MagentaTV MegaStream", "mobile_pk", false, "TV-Platzhalter, nicht fuer Portierungen aktiv")
];

function template(
  name: string,
  porting_type: "mobile_pk" | "mobile_gk",
  is_active: boolean,
  note: string
) {
  return {
    is_active,
    name,
    note: `${note}. Provision-Platzhalter 0 EUR, bitte final auf maximal 30 EUR pflegen.`,
    porting_type,
    provision_amount: 0
  };
}

export async function archivePortingAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const id = requiredString(formData, "id");
  const supabase = await assertCanManageShop(shopId);

  const { error } = await supabase
    .from("portings")
    .update({
      status: "archived",
      archived_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/portings");
  redirect(`/portings?shop=${shopId}`);
}

export async function processDuePortingsAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const supabase = await assertCanManageShop(shopId);

  await processDuePortingsForShop(supabase, shopId);

  revalidatePath("/dashboard");
  revalidatePath("/portings");
  redirect(`/portings?shop=${shopId}`);
}
