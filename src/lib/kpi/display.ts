export type KpiCategory = "provision" | "unit" | "quality" | "tnps";
export type KpiValueType = "money" | "count" | "score";

export function displayCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    provision: "MyProv",
    quality: "Qualitaet",
    tnps: "Qualitaet",
    unit: "DWH"
  };

  return labels[category] ?? category;
}

export function displayKpiName(code: string, fallback: string) {
  const labels: Record<string, string> = {
    provision_broadband: "DSL",
    provision_tv: "TV",
    provision_mobile: "MF",
    quality_app_activation: "App-Aktivierung",
    quality_kek: "KEK",
    quality_leads: "Lead",
    quality_pom: "POM",
    quality_customer_frequency: "Kundenfrequenz",
    tnps: "tNPS",
    units_broadband_gk: "DSL GK",
    units_broadband_pk: "DSL",
    units_mobile_gk: "MF GK",
    units_mobile_pk: "MF",
    units_speedup: "SpeedUP",
    units_tv: "TV"
  };

  return labels[code] ?? fallback;
}

export function displayUnitLabel(valueType: KpiValueType, unit?: string) {
  if (valueType === "money") {
    return "EUR";
  }

  if (valueType === "score") {
    return "%";
  }

  return unit || "Stk";
}
