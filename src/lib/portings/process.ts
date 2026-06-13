import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateKey } from "@/lib/kpi/dates";

type ServerSupabase = SupabaseClient<any>;

type KpiCode = "units_mobile_pk" | "units_mobile_gk" | "provision_mobile";

type KpiDefinition = {
  id: string;
  code: KpiCode;
};

type DuePorting = {
  id: string;
  shop_id: string;
  porting_type: "mobile_pk" | "mobile_gk";
  porting_date: string | null;
  provision_amount: number;
  status: "open" | "planned" | "effective" | "archived";
};

export type PortingProcessResult = {
  processed: number;
  skipped: number;
};

export async function processDuePortingsForShop(
  supabase: ServerSupabase,
  shopId: string,
  today = toDateKey(new Date())
): Promise<PortingProcessResult> {
  const { data: kpisData, error: kpiError } = await supabase
    .from("kpi_definitions")
    .select("id, code")
    .in("code", ["units_mobile_pk", "units_mobile_gk", "provision_mobile"])
    .returns<KpiDefinition[]>();

  if (kpiError) {
    throw new Error(kpiError.message);
  }

  const kpis = kpisData ?? [];
  const kpiByCode = new Map<KpiCode, string>(kpis.map((kpi) => [kpi.code, kpi.id]));
  const provisionKpiId = kpiByCode.get("provision_mobile");

  const { data: duePortingsData, error: portingError } = await supabase
    .from("portings")
    .select("id, shop_id, porting_type, porting_date, provision_amount, status")
    .eq("shop_id", shopId)
    .eq("date_unknown", false)
    .not("porting_date", "is", null)
    .lte("porting_date", today)
    .in("status", ["open", "planned", "effective"])
    .returns<DuePorting[]>();

  if (portingError) {
    throw new Error(portingError.message);
  }

  const duePortings = duePortingsData ?? [];
  let processed = 0;
  let skipped = 0;

  for (const porting of duePortings) {
    if (!porting.porting_date || !provisionKpiId) {
      skipped += 1;
      continue;
    }

    const unitCode: KpiCode =
      porting.porting_type === "mobile_pk" ? "units_mobile_pk" : "units_mobile_gk";
    const unitKpiId = kpiByCode.get(unitCode);

    if (!unitKpiId) {
      skipped += 1;
      continue;
    }

    await writePortingImpact({
      supabase,
      porting,
      kpiDefinitionId: unitKpiId,
      impactDate: porting.porting_date,
      value: 1
    });

    await writePortingImpact({
      supabase,
      porting,
      kpiDefinitionId: provisionKpiId,
      impactDate: porting.porting_date,
      value: porting.provision_amount
    });

    const { error: updateError } = await supabase
      .from("portings")
      .update({
        status: "archived",
        archived_at: new Date().toISOString()
      })
      .eq("id", porting.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    processed += 1;
  }

  return {
    processed,
    skipped
  };
}

async function writePortingImpact({
  supabase,
  porting,
  kpiDefinitionId,
  impactDate,
  value
}: {
  supabase: ServerSupabase;
  porting: DuePorting;
  kpiDefinitionId: string;
  impactDate: string;
  value: number;
}) {
  const impactPayload = {
    porting_id: porting.id,
    shop_id: porting.shop_id,
    kpi_definition_id: kpiDefinitionId,
    impact_date: impactDate,
    value
  };

  const { error: impactError } = await supabase
    .from("porting_kpi_impacts")
    .upsert(impactPayload, {
      onConflict: "porting_id,kpi_definition_id"
    });

  if (impactError) {
    throw new Error(impactError.message);
  }

  const { data: existingEntry, error: existingError } = await supabase
    .from("daily_kpi_entries")
    .select("id")
    .eq("shop_id", porting.shop_id)
    .eq("kpi_definition_id", kpiDefinitionId)
    .eq("entry_date", impactDate)
    .eq("source", "porting")
    .eq("source_ref_id", porting.id)
    .returns<{ id: string }[]>()
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const entryPayload = {
    shop_id: porting.shop_id,
    kpi_definition_id: kpiDefinitionId,
    entry_date: impactDate,
    value,
    note: "Automatisch aus Portierung",
    source: "porting",
    source_ref_id: porting.id,
    created_by: null
  };

  const { error: entryError } = existingEntry
    ? await supabase.from("daily_kpi_entries").update(entryPayload).eq("id", existingEntry.id)
    : await supabase.from("daily_kpi_entries").insert(entryPayload);

  if (entryError) {
    throw new Error(entryError.message);
  }
}
