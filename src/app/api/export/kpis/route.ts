import { NextRequest } from "next/server";
import { calculateKpiMetric } from "@/lib/kpi/calculations";
import { getQuarterBounds, summarizeQuarterWorkdays, toDateKey, type Quarter } from "@/lib/kpi/dates";
import { formatKpiValue, formatNumber } from "@/lib/kpi/format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type KpiDefinition = {
  id: string;
  code: string;
  name: string;
  category: "provision" | "unit" | "quality" | "tnps";
  value_type: "money" | "count" | "score";
  unit: string;
  sort_order: number;
};

type Target = {
  kpi_definition_id: string;
  target_value: number;
};

type Entry = {
  entry_date: string;
  kpi_definition_id: string;
  source: string;
  value: number;
};

type SpecialDay = {
  date: string;
};

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const shopId = request.nextUrl.searchParams.get("shop");
  const year = Number(request.nextUrl.searchParams.get("year"));
  const quarter = Number(request.nextUrl.searchParams.get("quarter")) as Quarter;

  if (!shopId || !Number.isInteger(year) || ![1, 2, 3, 4].includes(quarter)) {
    return new Response("Ungueltige Export-Parameter", { status: 400 });
  }

  const { data: canView, error: accessError } = await supabase.rpc("can_view_shop", {
    target_shop_id: shopId
  });

  if (accessError || !canView) {
    return new Response("Keine Berechtigung", { status: 403 });
  }

  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const [kpisResult, targetsResult, entriesResult, openingsResult, closingsResult] =
    await Promise.all([
      supabase
        .from("kpi_definitions")
        .select("id, code, name, category, value_type, unit, sort_order")
        .neq("category", "tnps")
        .eq("status", "active")
        .order("sort_order")
        .returns<KpiDefinition[]>(),
      supabase
        .from("quarterly_targets")
        .select("kpi_definition_id, target_value")
        .eq("shop_id", shopId)
        .eq("year", year)
        .eq("quarter", quarter)
        .returns<Target[]>(),
      supabase
        .from("daily_kpi_entries")
        .select("kpi_definition_id, entry_date, value, source")
        .eq("shop_id", shopId)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .returns<Entry[]>(),
      supabase
        .from("special_opening_days")
        .select("date")
        .eq("shop_id", shopId)
        .gte("date", startDate)
        .lte("date", endDate)
        .returns<SpecialDay[]>(),
      supabase
        .from("special_closing_days")
        .select("date")
        .eq("shop_id", shopId)
        .gte("date", startDate)
        .lte("date", endDate)
        .returns<SpecialDay[]>()
    ]);

  const kpis = kpisResult.data ?? [];
  const targets = targetsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const openings = openingsResult.data ?? [];
  const closings = closingsResult.data ?? [];
  const targetMap = new Map(targets.map((target) => [target.kpi_definition_id, target.target_value]));
  const actualMap = entries.reduce<Map<string, number>>((map, entry) => {
    map.set(entry.kpi_definition_id, (map.get(entry.kpi_definition_id) ?? 0) + entry.value);
    return map;
  }, new Map());
  const workdays = summarizeQuarterWorkdays({
    year,
    quarter,
    today: toDateKey(new Date()),
    specialOpenings: openings,
    specialClosings: closings
  });

  const rows = [
    ["KPI", "Kategorie", "Ziel", "Ist", "Zielerreichung %", "Runrate", "Differenz", "Tagesbedarf", "Status"]
  ];

  for (const kpi of kpis) {
    const metric = calculateKpiMetric({
      actual: actualMap.get(kpi.id) ?? 0,
      target: targetMap.get(kpi.id) ?? 0,
      elapsedWorkdays: workdays.elapsedWorkdays,
      remainingWorkdays: workdays.remainingWorkdays,
      totalWorkdays: workdays.totalWorkdays
    });

    rows.push([
      kpi.name,
      categoryLabel(kpi.category),
      formatKpiValue(metric.target, kpi.value_type),
      formatKpiValue(metric.actual, kpi.value_type),
      metric.achievementPercent === null ? "" : formatNumber(metric.achievementPercent, 1),
      formatKpiValue(metric.runrateForecast, kpi.value_type),
      formatKpiValue(metric.differenceToTarget, kpi.value_type),
      formatKpiValue(metric.requiredDailyAverage, kpi.value_type),
      statusLabel(metric.status)
    ]);
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`;
  const filename = `shoppulse-kpis-q${quarter}-${year}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    provision: "Provision",
    quality: "Qualitaet",
    unit: "Stueckzahl"
  };

  return labels[category] ?? category;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    green: "Gruen",
    neutral: "Offen",
    red: "Rot",
    yellow: "Gelb"
  };

  return labels[status] ?? status;
}
