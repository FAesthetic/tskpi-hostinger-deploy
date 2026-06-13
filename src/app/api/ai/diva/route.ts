import { NextResponse, type NextRequest } from "next/server";
import { generateDivaResponse, type DivaChatMessage } from "@/lib/ai/openai";
import { calculateKpiMetric } from "@/lib/kpi/calculations";
import { getQuarterBounds, summarizeQuarterWorkdays, toDateKey, type Quarter } from "@/lib/kpi/dates";
import { displayCategoryLabel, displayKpiName } from "@/lib/kpi/display";
import { formatKpiValue, formatNumber } from "@/lib/kpi/format";
import { listQuarterWeeks } from "@/lib/kpi/weeks";
import { applyPipelineToMetric, buildFuturePortingPipeline } from "@/lib/portings/pipeline";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type KpiDefinition = {
  category: "provision" | "unit" | "quality" | "tnps";
  code: string;
  id: string;
  name: string;
  sort_order: number;
  unit: string;
  value_type: "money" | "count" | "score";
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

type Porting = {
  date_unknown: boolean;
  porting_date: string | null;
  porting_type: "mobile_pk" | "mobile_gk";
  provision_amount: number;
  status: "open" | "planned" | "effective" | "archived";
  tariff_id: string | null;
};

type Tariff = {
  id: string;
  is_active: boolean;
  name: string;
  porting_type: "mobile_pk" | "mobile_gk";
  provision_amount: number;
};

type TnpsEntry = {
  calendar_week: number;
  value: number;
  year: number;
};

type Shop = {
  id: string;
  location: string | null;
  name: string;
};

type DivaRequestBody = {
  history?: DivaChatMessage[];
  quarter?: number;
  question?: string;
  shopId?: string;
  year?: number;
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Bitte zuerst einloggen.", ok: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as DivaRequestBody;
  const shopId = typeof body.shopId === "string" ? body.shopId : "";
  const year = Number(body.year);
  const quarter = Number(body.quarter) as Quarter;
  const question = String(body.question ?? "").trim();

  if (!shopId || !Number.isInteger(year) || !isQuarter(quarter) || question.length < 3) {
    return NextResponse.json(
      { message: "Shop, Jahr, Quartal oder Frage fehlt.", ok: false },
      { status: 400 }
    );
  }

  const { data: canViewAnalysis, error: accessError } = await supabase.rpc("can_view_analysis", {
    target_shop_id: shopId
  });

  if (accessError || !canViewAnalysis) {
    return NextResponse.json(
      { message: "Keine Berechtigung fuer DiVA in diesem Shop.", ok: false },
      { status: 403 }
    );
  }

  const context = await buildDivaContext({ quarter, shopId, supabase, year });
  const answer = await generateDivaResponse({
    context,
    history: sanitizeHistory(body.history),
    question
  });

  return NextResponse.json({
    answer: answer ?? buildFallbackAnswer(context),
    mode: answer ? "openai" : "rules",
    ok: true
  });
}

async function buildDivaContext({
  quarter,
  shopId,
  supabase,
  year
}: {
  quarter: Quarter;
  shopId: string;
  supabase: ReturnType<typeof createClient>;
  year: number;
}) {
  const { startDate, endDate } = getQuarterBounds(year, quarter);
  const weeks = listQuarterWeeks(year, quarter);
  const weekNumbers = new Set(weeks.map((week) => week.week));

  const [
    shopResult,
    kpisResult,
    targetsResult,
    entriesResult,
    openingsResult,
    closingsResult,
    portingsResult,
    tariffsResult,
    tnpsResult
  ] = await Promise.all([
    supabase.from("shops").select("id, name, location").eq("id", shopId).limit(1).returns<Shop[]>(),
    supabase
      .from("kpi_definitions")
      .select("id, code, name, category, value_type, unit, sort_order")
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
      .select("kpi_definition_id, value, entry_date, source")
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
      .returns<SpecialDay[]>(),
    supabase
      .from("portings")
      .select("porting_type, porting_date, date_unknown, status, provision_amount, tariff_id")
      .eq("shop_id", shopId)
      .returns<Porting[]>(),
    supabase
      .from("tariffs")
      .select("id, name, porting_type, provision_amount, is_active")
      .or(`shop_id.eq.${shopId},shop_id.is.null`)
      .returns<Tariff[]>(),
    supabase
      .from("tnps_entries")
      .select("year, calendar_week, value")
      .eq("shop_id", shopId)
      .eq("year", year)
      .returns<TnpsEntry[]>()
  ]);

  const shop = shopResult.data?.[0] ?? { id: shopId, location: null, name: "Unbekannter Shop" };
  const kpis = kpisResult.data ?? [];
  const targets = targetsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const workdays = summarizeQuarterWorkdays({
    quarter,
    specialClosings: closingsResult.data ?? [],
    specialOpenings: openingsResult.data ?? [],
    year
  });
  const targetMap = new Map(targets.map((target) => [target.kpi_definition_id, Number(target.target_value)]));
  const kpiIdByCode = new Map(kpis.map((kpi) => [kpi.code, kpi.id]));
  const futurePortingPipelineMap = buildFuturePortingPipeline({
    endDate,
    kpiIdByCode,
    portings: portingsResult.data ?? [],
    today: toDateKey(new Date())
  });
  const actualMap = entries.reduce<Map<string, number>>((sum, entry) => {
    sum.set(entry.kpi_definition_id, (sum.get(entry.kpi_definition_id) ?? 0) + Number(entry.value));
    return sum;
  }, new Map());
  const kpiRows = kpis.map((kpi) => {
    const actual = actualMap.get(kpi.id) ?? 0;
    const target = targetMap.get(kpi.id) ?? 0;
    const baseMetric = calculateKpiMetric({
      actual,
      elapsedWorkdays: workdays.elapsedWorkdays,
      remainingWorkdays: workdays.remainingWorkdays,
      target,
      totalWorkdays: workdays.totalWorkdays
    });
    const pipelineValue = futurePortingPipelineMap.get(kpi.id) ?? 0;
    const metric = applyPipelineToMetric({
      metric: baseMetric,
      pipelineValue,
      remainingWorkdays: workdays.remainingWorkdays
    });
    const runratePercent =
      metric.runrateForecast !== null && target > 0 ? (metric.runrateForecast / target) * 100 : null;

    return {
      actual,
      actualLabel: formatKpiValue(actual, kpi.value_type),
      category: displayCategoryLabel(kpi.category),
      code: kpi.code,
      kpi: displayKpiName(kpi.code, kpi.name),
      portingPipeline: pipelineValue,
      portingPipelineLabel: formatKpiValue(pipelineValue, kpi.value_type),
      requiredPerRestWorkday: metric.requiredDailyAverage,
      requiredPerRestWorkdayLabel: formatKpiValue(metric.requiredDailyAverage, kpi.value_type),
      runrateForecast: metric.runrateForecast,
      runrateForecastLabel: formatKpiValue(metric.runrateForecast, kpi.value_type),
      runratePercent,
      runratePercentLabel: runratePercent === null ? "-" : `${formatNumber(runratePercent, 1)}%`,
      status: metric.status,
      target,
      targetLabel: formatKpiValue(target, kpi.value_type),
      valueType: kpi.value_type,
      weeklyValues: weeks.map((week) => ({
        label: week.label,
        value: entries
          .filter(
            (entry) =>
              entry.kpi_definition_id === kpi.id &&
              entry.entry_date >= week.startDate &&
              entry.entry_date <= week.endDate
          )
          .reduce((sum, entry) => sum + Number(entry.value), 0)
      }))
    };
  });

  const tnpsEntries = (tnpsResult.data ?? [])
    .filter((entry) => weekNumbers.has(entry.calendar_week))
    .sort((a, b) => a.calendar_week - b.calendar_week);

  return {
    analysisRules: [
      "Keine personenbezogenen Kunden- oder Mitarbeiternotizen im Kontext.",
      "Wenn Daten fehlen, Hypothesen klar markieren.",
      "Fokus auf steuerbare Vertriebsaktionen."
    ],
    dataQuality: buildDataQuality(entries, kpiRows.length),
    kpis: kpiRows,
    portings: summarizePortings(portingsResult.data ?? []),
    quarter: `Q${quarter} ${year}`,
    ratios: buildRatios(kpiRows),
    shop,
    tariffs: summarizeTariffs(tariffsResult.data ?? []),
    tnps: {
      current: tnpsEntries.at(-1)?.value ?? null,
      trend:
        tnpsEntries.length >= 2
          ? Number(tnpsEntries.at(-1)?.value ?? 0) - Number(tnpsEntries.at(-2)?.value ?? 0)
          : null,
      weekly: tnpsEntries.map((entry) => ({
        calendarWeek: entry.calendar_week,
        value: Number(entry.value)
      }))
    },
    weeks: weeks.map((week) => ({
      endDate: week.endDate,
      key: week.key,
      label: week.label,
      startDate: week.startDate
    })),
    workdays
  };
}

function sanitizeHistory(history: DivaRequestBody["history"]) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (message): message is DivaChatMessage =>
        message &&
        (message.role === "assistant" || message.role === "user") &&
        typeof message.content === "string"
    )
    .slice(-8)
    .map((message) => ({
      content: message.content.slice(0, 1200),
      role: message.role
    }));
}

function summarizePortings(portings: Porting[]) {
  const active = portings.filter((porting) => porting.status !== "archived");
  const withoutDate = portings.filter((porting) => porting.date_unknown || !porting.porting_date);

  return {
    active: active.length,
    archived: portings.filter((porting) => porting.status === "archived").length,
    byStatus: countBy(portings, (porting) => porting.status),
    byType: countBy(portings, (porting) => porting.porting_type),
    openProvision: active.reduce((sum, porting) => sum + Number(porting.provision_amount), 0),
    withoutDate: withoutDate.length
  };
}

function summarizeTariffs(tariffs: Tariff[]) {
  const activeTariffs = tariffs.filter((tariff) => tariff.is_active);
  const highest = activeTariffs.reduce<Tariff | null>(
    (best, tariff) =>
      !best || Number(tariff.provision_amount) > Number(best.provision_amount) ? tariff : best,
    null
  );

  return {
    active: activeTariffs.length,
    byType: countBy(activeTariffs, (tariff) => tariff.porting_type),
    highestProvision: highest
      ? {
          name: highest.name,
          provisionAmount: Number(highest.provision_amount),
          type: highest.porting_type
        }
      : null
  };
}

function buildRatios(kpis: Array<{ actual: number; code: string }>) {
  const value = (code: string) => kpis.find((row) => row.code === code)?.actual ?? 0;
  const dslUnits = value("units_broadband_pk") + value("units_broadband_gk");
  const tvUnits = value("units_tv");
  const myProvDsl = value("provision_broadband");
  const myProvTv = value("provision_tv");
  const myProvMobile = value("provision_mobile");
  const totalDwh =
    dslUnits + tvUnits + value("units_speedup") + value("units_mobile_pk") + value("units_mobile_gk");
  const customerFrequency = value("quality_customer_frequency");

  return {
    customerConversion: customerFrequency > 0 ? `${formatNumber((totalDwh / customerFrequency) * 100, 1)}%` : null,
    dwhDslToTv: tvUnits > 0 ? `${formatNumber(dslUnits / tvUnits, 1)} DSL je TV` : "TV aktuell 0",
    myProvDslToTv: myProvTv > 0 ? `${formatNumber(myProvDsl / myProvTv, 1)} DSL-Euro je TV-Euro` : "TV MyProv aktuell 0",
    provisionPerDwhUnit:
      totalDwh > 0 ? `${formatKpiValue((myProvDsl + myProvTv + myProvMobile) / totalDwh, "money")} je DWH` : null,
    tvAttachToDsl: dslUnits > 0 ? `${formatNumber((tvUnits / dslUnits) * 100, 1)}%` : null
  };
}

function buildDataQuality(entries: Entry[], kpiCount: number) {
  const adjustmentCount = entries.filter((entry) => entry.source === "quarter_adjustment").length;
  const manualCount = entries.filter((entry) => entry.source !== "quarter_adjustment").length;
  const activeEntryDates = new Set(entries.map((entry) => entry.entry_date));

  return {
    activeEntryDays: activeEntryDates.size,
    adjustmentEntries: adjustmentCount,
    kpiCount,
    manualEntries: manualCount,
    note:
      adjustmentCount > 0
        ? "Es gibt pauschale Quartalsausgleiche. Wochenmuster koennen dadurch weniger exakt sein."
        : "Keine pauschalen Quartalsausgleiche im Zeitraum erkannt."
  };
}

function buildFallbackAnswer(context: Record<string, unknown>) {
  const kpis = Array.isArray(context.kpis)
    ? context.kpis.filter((item): item is { kpi: string; runratePercent: number | null; status: string } => {
        return Boolean(item) && typeof item === "object" && "kpi" in item && "status" in item;
      })
    : [];
  const critical = kpis
    .filter((row) => row.status === "red" || row.status === "yellow")
    .slice(0, 3)
    .map((row) => row.kpi)
    .join(", ");

  return [
    "DiVA ist vorbereitet, aber die OpenAI-Antwort war gerade nicht verfuegbar.",
    critical
      ? `Regelbasierter Schnellblick: Fokus zuerst auf ${critical}.`
      : "Regelbasierter Schnellblick: Es gibt aktuell keinen klar kritischen KPI im Kontext.",
    "Pruefe TV-zu-DSL, Runrate unter 100% und Wochen ohne Pflege. Stelle daraus eine konkrete Morgenrunden-Aktion zusammen."
  ].join("\n");
}

function countBy<T>(items: T[], selector: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function isQuarter(value: number): value is Quarter {
  return value === 1 || value === 2 || value === 3 || value === 4;
}
