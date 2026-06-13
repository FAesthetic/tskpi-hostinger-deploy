"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDays, getQuarterBounds, parseDateKey, toDateKey, type Quarter } from "@/lib/kpi/dates";
import { listQuarterWeeks } from "@/lib/kpi/weeks";
import { recordNotificationEvent } from "@/lib/notifications/events";
import { createClient } from "@/lib/supabase/server";

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${key} fehlt.`);
  }

  return value;
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const rawValue = String(formData.get(key) ?? "").replace(",", ".").trim();
  const value = Number(rawValue);

  return Number.isFinite(value) ? value : fallback;
}

function intValue(formData: FormData, key: string) {
  const value = Number.parseInt(String(formData.get(key) ?? ""), 10);

  if (!Number.isInteger(value)) {
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

async function assertCanViewShop(shopId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("can_view_shop", {
    target_shop_id: shopId
  });

  if (error || !data) {
    throw new Error("Keine Berechtigung fuer diesen Shop.");
  }

  return supabase;
}

export async function saveQuarterlyTargetAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const kpiDefinitionId = requiredString(formData, "kpi_definition_id");
  const year = intValue(formData, "year");
  const quarter = intValue(formData, "quarter");
  const targetValue = numberValue(formData, "target_value");
  const note = null;

  const supabase = await assertCanManageShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("quarterly_targets").upsert(
    {
      shop_id: shopId,
      kpi_definition_id: kpiDefinitionId,
      year,
      quarter,
      target_value: targetValue,
      note,
      created_by: user?.id ?? null
    },
    {
      onConflict: "shop_id,kpi_definition_id,year,quarter"
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  await recordNotificationEvent(supabase, {
    actorUserId: user?.id,
    eventType: "kpi_target_update",
    payload: {
      kpiDefinitionId,
      quarter,
      targetValue,
      year
    },
    shopId
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings/targets");
  revalidatePath("/kpi-table");
  revalidatePath("/reports");
  redirect(`/settings/targets?shop=${shopId}&year=${year}&quarter=${quarter}`);
}

export async function saveDailyKpiEntryAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const kpiDefinitionId = requiredString(formData, "kpi_definition_id");
  const entryDate = requiredString(formData, "entry_date");
  const value = numberValue(formData, "value");
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await assertCanViewShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from("daily_kpi_entries")
    .select("id")
    .eq("shop_id", shopId)
    .eq("kpi_definition_id", kpiDefinitionId)
    .eq("entry_date", entryDate)
    .eq("source", "manual")
    .is("source_ref_id", null)
    .returns<{ id: string }[]>()
    .maybeSingle();

  const payload = {
    shop_id: shopId,
    kpi_definition_id: kpiDefinitionId,
    entry_date: entryDate,
    value,
    note,
    source: "manual",
    source_ref_id: null,
    created_by: user?.id ?? null
  };

  const { error } = existing
    ? await supabase.from("daily_kpi_entries").update(payload).eq("id", existing.id)
    : await supabase.from("daily_kpi_entries").insert(payload);

  if (error) {
    throw new Error(error.message);
  }

  await recordNotificationEvent(supabase, {
    actorUserId: user?.id,
    eventType: "kpi_daily_update",
    payload: {
      entryDate,
      entries: [{ kpiDefinitionId, value }]
    },
    shopId
  });

  revalidatePath("/dashboard");
  revalidatePath("/entries");
  revalidatePath("/kpi-table");
  redirect(`/entries?shop=${shopId}`);
}

export async function saveDailyKpiEntriesAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const entryDate = requiredString(formData, "entry_date");
  const year = intValue(formData, "year");
  const quarter = intValue(formData, "quarter");
  const supabase = await assertCanViewShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const values = Array.from(formData.entries())
    .filter(([key, rawValue]) => key.startsWith("daily_value_") && String(rawValue).trim() !== "")
    .map(([key, rawValue]) => ({
      kpiDefinitionId: key.replace("daily_value_", ""),
      value: numberValueFromRaw(rawValue)
    }))
    .filter((entry) => entry.kpiDefinitionId.length > 0 && entry.value !== null);

  for (const entry of values) {
    const { data: existing } = await supabase
      .from("daily_kpi_entries")
      .select("id")
      .eq("shop_id", shopId)
      .eq("kpi_definition_id", entry.kpiDefinitionId)
      .eq("entry_date", entryDate)
      .eq("source", "manual")
      .is("source_ref_id", null)
      .returns<{ id: string }[]>()
      .maybeSingle();

    const payload = {
      shop_id: shopId,
      kpi_definition_id: entry.kpiDefinitionId,
      entry_date: entryDate,
      value: entry.value,
      note: null,
      source: "manual",
      source_ref_id: null,
      created_by: user?.id ?? null
    };

    const { error } = existing
      ? await supabase.from("daily_kpi_entries").update(payload).eq("id", existing.id)
      : await supabase.from("daily_kpi_entries").insert(payload);

    if (error) {
      throw new Error(error.message);
    }
  }

  if (values.length) {
    await recordNotificationEvent(supabase, {
      actorUserId: user?.id,
      eventType: "kpi_daily_update",
      payload: {
        entryDate,
        entries: values
      },
      shopId
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/entries");
  revalidatePath("/kpi-table");
  revalidatePath("/reports");
  redirect(`/dashboard?shop=${shopId}&year=${year}&quarter=${quarter}&entryDate=${entryDate}&saved=daily`);
}

export async function saveQuarterAdjustmentAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const kpiDefinitionId = requiredString(formData, "kpi_definition_id");
  const year = intValue(formData, "year");
  const quarter = intValue(formData, "quarter") as Quarter;
  const value = numberValue(formData, "value");
  const note = "Pauschaler Quartalswert";
  const supabase = await assertCanViewShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { endDate } = getQuarterBounds(year, quarter);

  const { data: existing } = await supabase
    .from("daily_kpi_entries")
    .select("id")
    .eq("shop_id", shopId)
    .eq("kpi_definition_id", kpiDefinitionId)
    .eq("entry_date", endDate)
    .eq("source", "quarter_adjustment")
    .is("source_ref_id", null)
    .returns<{ id: string }[]>()
    .maybeSingle();

  const payload = {
    shop_id: shopId,
    kpi_definition_id: kpiDefinitionId,
    entry_date: endDate,
    value,
    note,
    source: "quarter_adjustment",
    source_ref_id: null,
    created_by: user?.id ?? null
  };

  const { error } = existing
    ? await supabase.from("daily_kpi_entries").update(payload).eq("id", existing.id)
    : await supabase.from("daily_kpi_entries").insert(payload);

  if (error) {
    throw new Error(error.message);
  }

  await recordNotificationEvent(supabase, {
    actorUserId: user?.id,
    eventType: "kpi_quarter_adjustment",
    payload: {
      entries: [{ kpiDefinitionId, value }],
      quarter,
      year
    },
    shopId
  });

  revalidatePath("/dashboard");
  revalidatePath("/entries");
  revalidatePath("/kpi-table");
  revalidatePath("/reports");
  redirect(
    `/dashboard?shop=${shopId}&year=${year}&quarter=${quarter}&focusKpi=${kpiDefinitionId}&saved=adjustment`
  );
}

export async function saveWeeklyKpiEntryAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const kpiDefinitionId = requiredString(formData, "kpi_definition_id");
  const weekStart = requiredString(formData, "week_start");
  const weekEnd = optionalString(formData, "week_end") ?? toDateKey(addDays(parseDateKey(weekStart), 6));
  const weekKey = requiredString(formData, "week_key");
  const year = intValue(formData, "year");
  const quarter = intValue(formData, "quarter") as Quarter;
  const value = numberValue(formData, "value");
  const supabase = await assertCanViewShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const appliedValue = await setWeeklyKpiTotal({
    createdBy: user?.id ?? null,
    desiredTotal: value,
    kpiDefinitionId,
    shopId,
    supabase,
    weekEnd,
    weekKey,
    weekStart
  });

  await recordNotificationEvent(supabase, {
    actorUserId: user?.id,
    eventType: "kpi_weekly_update",
    payload: {
      entries: [{ appliedValue, kpiDefinitionId, value }],
      quarter,
      weekEnd,
      weekKey,
      weekStart,
      year
    },
    shopId
  });

  revalidatePath("/dashboard");
  revalidatePath("/analysis");
  revalidatePath("/entries");
  revalidatePath("/kpi-table");
  redirect(
    `/dashboard?shop=${shopId}&year=${year}&quarter=${quarter}&focusKpi=${kpiDefinitionId}&saved=weekly`
  );
}

export async function saveWeeklyKpiEntriesAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const weekStart = requiredString(formData, "week_start");
  const weekEnd = optionalString(formData, "week_end") ?? toDateKey(addDays(parseDateKey(weekStart), 6));
  const weekKey = requiredString(formData, "week_key");
  const year = intValue(formData, "year");
  const quarter = intValue(formData, "quarter") as Quarter;
  const supabase = await assertCanViewShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const values = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("weekly_value_"))
    .map(([key, rawValue]) => ({
      kpiDefinitionId: key.replace("weekly_value_", ""),
      value: numberValueFromRaw(rawValue, 0)
    }))
    .filter((entry) => entry.kpiDefinitionId.length > 0 && entry.value !== null);

  const appliedValues = [];

  for (const entry of values) {
    const appliedValue = await setWeeklyKpiTotal({
      createdBy: user?.id ?? null,
      desiredTotal: entry.value ?? 0,
      kpiDefinitionId: entry.kpiDefinitionId,
      shopId,
      supabase,
      weekEnd,
      weekKey,
      weekStart
    });

    appliedValues.push({ ...entry, appliedValue });
  }

  if (values.length) {
    await recordNotificationEvent(supabase, {
      actorUserId: user?.id,
      eventType: "kpi_weekly_update",
      payload: {
        entries: appliedValues,
        quarter,
        weekEnd,
        weekKey,
        weekStart,
        year
      },
      shopId
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/analysis");
  revalidatePath("/entries");
  revalidatePath("/kpi-table");
  redirect(`/dashboard?shop=${shopId}&year=${year}&quarter=${quarter}&week=${weekKey}&saved=weekly`);
}

export async function saveCurrentStandAdjustmentsAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const year = intValue(formData, "year");
  const quarter = intValue(formData, "quarter") as Quarter;
  const supabase = await assertCanViewShop(shopId);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { startDate, endDate } = getQuarterBounds(year, quarter);

  const currentValues = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("current_value_"))
    .map(([key, rawValue]) => ({
      kpiDefinitionId: key.replace("current_value_", ""),
      desiredActual: numberValueFromRaw(rawValue, 0)
    }))
    .filter((entry) => entry.kpiDefinitionId.length > 0 && entry.desiredActual !== null);

  for (const entry of currentValues) {
    const { data: entries } = await supabase
      .from("daily_kpi_entries")
      .select("id, value, source")
      .eq("shop_id", shopId)
      .eq("kpi_definition_id", entry.kpiDefinitionId)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .returns<Array<{ id: string; value: number; source: string }>>();

    const baseActual = (entries ?? [])
      .filter((item) => item.source !== "quarter_adjustment")
      .reduce((sum, item) => sum + item.value, 0);
    const desiredActual = entry.desiredActual ?? 0;
    const existingAdjustments = (entries ?? []).filter((item) => item.source === "quarter_adjustment");
    const existingAdjustment = existingAdjustments[0] ?? null;

    if (desiredActual <= baseActual) {
      if (existingAdjustments.length) {
        const { error } = await supabase
          .from("daily_kpi_entries")
          .delete()
          .eq("shop_id", shopId)
          .eq("kpi_definition_id", entry.kpiDefinitionId)
          .eq("source", "quarter_adjustment");

        if (error) {
          throw new Error(error.message);
        }
      }

      continue;
    }

    const adjustmentValue = desiredActual - baseActual;

    const payload = {
      shop_id: shopId,
      kpi_definition_id: entry.kpiDefinitionId,
      entry_date: endDate,
      value: adjustmentValue,
      note: "Aktueller Stand",
      source: "quarter_adjustment",
      source_ref_id: null,
      created_by: user?.id ?? null
    };

    const { error } = existingAdjustment
      ? await supabase.from("daily_kpi_entries").update(payload).eq("id", existingAdjustment.id)
      : await supabase.from("daily_kpi_entries").insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    const duplicateAdjustments = existingAdjustments.slice(1);

    if (duplicateAdjustments.length) {
      const { error: duplicateError } = await supabase
        .from("daily_kpi_entries")
        .delete()
        .in("id", duplicateAdjustments.map((adjustment) => adjustment.id));

      if (duplicateError) {
        throw new Error(duplicateError.message);
      }
    }
  }

  if (currentValues.length) {
    await recordNotificationEvent(supabase, {
      actorUserId: user?.id,
      eventType: "kpi_current_stand",
      payload: {
        entries: currentValues,
        quarter,
        year
      },
      shopId
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/analysis");
  revalidatePath("/entries");
  revalidatePath("/kpi-table");
  redirect(`/dashboard?shop=${shopId}&year=${year}&quarter=${quarter}&saved=stand`);
}

export async function resetSelectedQuarterKpiDataAction(formData: FormData) {
  const shopId = requiredString(formData, "shop_id");
  const year = intValue(formData, "year");
  const quarter = intValue(formData, "quarter") as Quarter;
  const confirmation = requiredString(formData, "confirmation");

  if (confirmation !== "RESET") {
    redirect(`/settings/targets?shop=${shopId}&year=${year}&quarter=${quarter}&error=reset_confirmation`);
  }

  const supabase = await assertCanManageShop(shopId);
  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const quarterWeeks = listQuarterWeeks(year, quarter).map((week) => week.week);

  const { error: targetsError } = await supabase
    .from("quarterly_targets")
    .update({ target_value: 0, note: null })
    .eq("shop_id", shopId)
    .eq("year", year)
    .eq("quarter", quarter);

  if (targetsError) {
    throw new Error(targetsError.message);
  }

  const { error: entriesError } = await supabase
    .from("daily_kpi_entries")
    .delete()
    .eq("shop_id", shopId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (entriesError) {
    throw new Error(entriesError.message);
  }

  if (quarterWeeks.length) {
    const { error: tnpsError } = await supabase
      .from("tnps_entries")
      .delete()
      .eq("shop_id", shopId)
      .eq("year", year)
      .in("calendar_week", quarterWeeks);

    if (tnpsError) {
      throw new Error(tnpsError.message);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/analysis");
  revalidatePath("/entries");
  revalidatePath("/kpi-table");
  revalidatePath("/settings/targets");
  redirect(`/settings/targets?shop=${shopId}&year=${year}&quarter=${quarter}&reset=1`);
}

function numberValueFromRaw(rawValue: FormDataEntryValue, fallback: number | null = null) {
  const normalized = String(rawValue).replace(",", ".").trim();

  if (!normalized) {
    return fallback;
  }

  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

function optionalString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

async function setWeeklyKpiTotal({
  createdBy,
  desiredTotal,
  kpiDefinitionId,
  shopId,
  supabase,
  weekEnd,
  weekKey,
  weekStart
}: {
  createdBy: string | null;
  desiredTotal: number;
  kpiDefinitionId: string;
  shopId: string;
  supabase: ReturnType<typeof createClient>;
  weekEnd: string;
  weekKey: string;
  weekStart: string;
}) {
  const safeDesiredTotal = Math.max(desiredTotal, 0);
  const { data: existingEntries, error: existingError } = await supabase
    .from("daily_kpi_entries")
    .select("id, value, source, source_ref_id")
    .eq("shop_id", shopId)
    .eq("kpi_definition_id", kpiDefinitionId)
    .gte("entry_date", weekStart)
    .lte("entry_date", weekEnd)
    .returns<Array<{ id: string; value: number; source: string; source_ref_id: string | null }>>();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const protectedTotal = (existingEntries ?? [])
    .filter((entry) => entry.source !== "manual" && entry.source !== "weekly_manual" && entry.source !== "quarter_adjustment")
    .reduce((sum, entry) => sum + entry.value, 0);
  const userControlledValue = Math.max(safeDesiredTotal - protectedTotal, 0);

  const { error: deleteError } = await supabase
    .from("daily_kpi_entries")
    .delete()
    .eq("shop_id", shopId)
    .eq("kpi_definition_id", kpiDefinitionId)
    .gte("entry_date", weekStart)
    .lte("entry_date", weekEnd)
    .is("source_ref_id", null)
    .in("source", ["manual", "weekly_manual"]);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (userControlledValue <= 0) {
    return userControlledValue;
  }

  const { error: insertError } = await supabase.from("daily_kpi_entries").insert({
    shop_id: shopId,
    kpi_definition_id: kpiDefinitionId,
    entry_date: weekStart,
    value: userControlledValue,
    note: weekKey,
    source: "weekly_manual",
    source_ref_id: null,
    created_by: createdBy
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return userControlledValue;
}
