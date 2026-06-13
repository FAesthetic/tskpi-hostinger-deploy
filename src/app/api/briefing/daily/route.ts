import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateMorningBriefing } from "@/lib/ai/openai";
import { calculateKpiMetric, type KpiMetric } from "@/lib/kpi/calculations";
import { getCurrentQuarter, getQuarterBounds, summarizeQuarterWorkdays } from "@/lib/kpi/dates";
import { displayCategoryLabel, displayKpiName } from "@/lib/kpi/display";
import { formatKpiValue, formatNumber } from "@/lib/kpi/format";
import { getNotificationRecipient } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

type Shop = {
  id: string;
  name: string;
  is_primary?: boolean;
};

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
  value: number;
};

type SpecialDay = {
  date: string;
};

type BriefingRow = {
  actual: number;
  category: string;
  code: string;
  kpi: string;
  metric: KpiMetric;
  runratePercent: number | null;
  target: number;
  valueType: "money" | "count" | "score";
};

type BriefingSupabaseClient = SupabaseClient<any, "public", any>;

export async function GET(request: NextRequest) {
  return handleDailyBriefing(request);
}

export async function POST(request: NextRequest) {
  return handleDailyBriefing(request);
}

async function handleDailyBriefing(request: NextRequest) {
  const authError = validateCronSecret(request);

  if (authError) {
    return authError;
  }

  const missingConfig = getMissingConfig();

  if (missingConfig.length) {
    return NextResponse.json({
      ok: false,
      status: "config_needed",
      missing: missingConfig,
      message: "Daily briefing ist vorbereitet. Bitte fehlende Server-Env-Variablen setzen."
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false
      }
    }
  );
  const shop = await resolveBriefingShop(supabase);

  if (!shop) {
    return NextResponse.json({
      ok: false,
      status: "no_shop",
      message: "Kein aktiver Shop fuer das Daily Briefing gefunden."
    });
  }

  const payload = await buildBriefingPayload(supabase, shop);
  const webhookUrl = process.env.N8N_DAILY_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json({
      ok: true,
      status: "preview",
      message: "Kein n8n Webhook gesetzt. Payload wird nur angezeigt.",
      payload
    });
  }

  const webhookResponse = await fetch(webhookUrl, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      ...(process.env.N8N_DAILY_WEBHOOK_SECRET
        ? { "x-ts-kpi-secret": process.env.N8N_DAILY_WEBHOOK_SECRET }
        : {})
    },
    method: "POST"
  }).catch((error) => ({
    ok: false,
    status: 0,
    statusText: error instanceof Error ? error.message : String(error)
  }));

  if (!webhookResponse.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: "webhook_failed",
        webhookStatus: webhookResponse.status,
        webhookStatusText: "statusText" in webhookResponse ? webhookResponse.statusText : "",
        payload
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    status: "sent",
    webhookStatus: webhookResponse.status,
    payload
  });
}

async function resolveBriefingShop(supabase: BriefingSupabaseClient) {
  const configuredShopId = process.env.DAILY_BRIEFING_SHOP_ID;

  if (configuredShopId) {
    const { data } = await supabase
      .from("shops")
      .select("id, name, is_primary")
      .eq("id", configuredShopId)
      .eq("is_active", true)
      .limit(1)
      .returns<Shop[]>();

    return data?.[0] ?? null;
  }

  const { data } = await supabase
    .from("shops")
    .select("id, name, is_primary")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("name")
    .limit(1)
    .returns<Shop[]>();

  return data?.[0] ?? null;
}

async function buildBriefingPayload(supabase: BriefingSupabaseClient, shop: Shop) {
  const current = getCurrentQuarter();
  const today = new Date();
  const todayLabel = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium"
  }).format(today);
  const { startDate, endDate } = getQuarterBounds(current.year, current.quarter);
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
        .eq("shop_id", shop.id)
        .eq("year", current.year)
        .eq("quarter", current.quarter)
        .returns<Target[]>(),
      supabase
        .from("daily_kpi_entries")
        .select("kpi_definition_id, value, entry_date")
        .eq("shop_id", shop.id)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .returns<Entry[]>(),
      supabase
        .from("special_opening_days")
        .select("date")
        .eq("shop_id", shop.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .returns<SpecialDay[]>(),
      supabase
        .from("special_closing_days")
        .select("date")
        .eq("shop_id", shop.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .returns<SpecialDay[]>()
    ]);
  const kpis = kpisResult.data ?? [];
  const targets = targetsResult.data ?? [];
  const entries = entriesResult.data ?? [];
  const workdays = summarizeQuarterWorkdays({
    quarter: current.quarter,
    specialClosings: closingsResult.data ?? [],
    specialOpenings: openingsResult.data ?? [],
    year: current.year
  });
  const targetMap = new Map(targets.map((target) => [target.kpi_definition_id, target.target_value]));
  const actualMap = entries.reduce<Map<string, number>>((sum, entry) => {
    sum.set(entry.kpi_definition_id, (sum.get(entry.kpi_definition_id) ?? 0) + entry.value);
    return sum;
  }, new Map());
  const rows = kpis.map<BriefingRow>((kpi) => {
    const actual = actualMap.get(kpi.id) ?? 0;
    const target = targetMap.get(kpi.id) ?? 0;
    const metric = calculateKpiMetric({
      actual,
      elapsedWorkdays: workdays.elapsedWorkdays,
      remainingWorkdays: workdays.remainingWorkdays,
      target,
      totalWorkdays: workdays.totalWorkdays
    });
    const runratePercent =
      metric.runrateForecast !== null && target > 0 ? (metric.runrateForecast / target) * 100 : null;

    return {
      actual,
      category: displayCategoryLabel(kpi.category),
      code: kpi.code,
      kpi: displayKpiName(kpi.code, kpi.name),
      metric,
      runratePercent,
      target,
      valueType: kpi.value_type
    };
  });
  const riskyRows = rows
    .filter((row) => row.target > 0)
    .sort((a, b) => (a.runratePercent ?? -1) - (b.runratePercent ?? -1));
  const critical = riskyRows[0] ?? null;
  const runnerUp = riskyRows[1] ?? null;
  const topPerformer = [...riskyRows].sort(
    (a, b) => (b.runratePercent ?? -1) - (a.runratePercent ?? -1)
  )[0] ?? null;
  const dslTvRatio = buildRatioInsight(rows, "units_broadband_pk", "units_tv", "DSL", "TV");
  const mobileRatio = buildRatioInsight(rows, "units_mobile_pk", "units_mobile_gk", "MF PK", "MF GK");
  const dataCare = buildDataCareReminder(entries);
  const fallbackAnalysisText = buildAnalysisText({
    critical,
    dataCare,
    dslTvRatio,
    mobileRatio,
    runnerUp,
    shopName: shop.name,
    todayLabel,
    topPerformer,
    workdays
  });
  const aiAnalysisText = await generateMorningBriefing({
    dataCare,
    dslTvRatio,
    mobileRatio,
    rows: rows.map((row) => ({
      actual: row.actual,
      category: row.category,
      kpi: row.kpi,
      requiredPerWorkday100: row.metric.requiredDailyAverage,
      runratePercent: row.runratePercent,
      status: row.metric.status,
      target: row.target,
      valueType: row.valueType
    })),
    shopName: shop.name,
    todayLabel,
    workdays
  });
  const analysisText = aiAnalysisText ?? fallbackAnalysisText;

  return {
    analysisMode: aiAnalysisText ? "openai" : "rules",
    analysisText,
    emailBody: analysisText,
    emailSubject: `TS KPI Morgenbriefing: ${shop.name}`,
    generatedAt: new Date().toISOString(),
    quarter: current.quarter,
    rows: rows.map((row) => ({
      actual: row.actual,
      category: row.category,
      kpi: row.kpi,
      requiredPerWorkday100: row.metric.requiredDailyAverage,
      runrateForecast: row.metric.runrateForecast,
      runratePercent: row.runratePercent,
      status: row.metric.status,
      target: row.target,
      unit: row.valueType
    })),
    shop: {
      id: shop.id,
      name: shop.name
    },
    systemPrompt: MORNING_BRIEFING_SYSTEM_PROMPT,
    recipientEmail: getNotificationRecipient(),
    userPrompt: buildUserPrompt(shop.name, rows, workdays, dslTvRatio, dataCare),
    workdays,
    year: current.year
  };
}

function buildRatioInsight(
  rows: BriefingRow[],
  numeratorCode: string,
  denominatorCode: string,
  numeratorLabel: string,
  denominatorLabel: string
) {
  const numerator = rows.find((row) => row.code === numeratorCode)?.actual ?? 0;
  const denominator = rows.find((row) => row.code === denominatorCode)?.actual ?? 0;

  if (numerator <= 0 || denominator <= 0) {
    return null;
  }

  return `${formatNumber(numerator / denominator, 1)} zu 1 ${numeratorLabel}/${denominatorLabel}`;
}

function buildAnalysisText({
  critical,
  dataCare,
  dslTvRatio,
  mobileRatio,
  runnerUp,
  shopName,
  todayLabel,
  topPerformer,
  workdays
}: {
  critical: BriefingRow | null;
  dataCare: string;
  dslTvRatio: string | null;
  mobileRatio: string | null;
  runnerUp: BriefingRow | null;
  shopName: string;
  todayLabel: string;
  topPerformer: BriefingRow | null;
  workdays: { remainingWorkdays: number };
}) {
  const lines = [
    `Guten Morgen ${shopName}. Stand ${todayLabel}.`,
    critical
      ? `Fokus heute: ${critical.kpi}. Bei aktueller Geschwindigkeit landen wir bei ${formatNumber(critical.runratePercent, 1)}% Zielerreichung. Bis 100% braucht ihr ab jetzt ${formatKpiValue(critical.metric.requiredDailyAverage, critical.valueType)} pro Arbeitstag.`
      : "Noch kein kritischer KPI erkennbar. Bitte Ziele und Ist-Werte pruefen.",
    runnerUp
      ? `Zweiter Blick: ${runnerUp.kpi} liegt bei ${formatNumber(runnerUp.runratePercent, 1)}% Prognose.`
      : "Zweiter Blick: noch keine zweite Prioritaet erkennbar.",
    topPerformer
      ? `Stabil: ${topPerformer.kpi} wirkt aktuell am staerksten.`
      : "Stabil: noch kein Top Performer erkennbar.",
    dslTvRatio ? `Auffaelligkeit: ${dslTvRatio}. Pruefe, ob TV sauber mitverkauft wird.` : null,
    mobileRatio ? `Mobilfunk-Mix: ${mobileRatio}.` : null,
    dataCare,
    `Morgenrunde: 1. Fokus-KPI nennen. 2. Tagesziel festlegen. 3. Konkrete Massnahme fuer Beratung/Training festlegen. Rest-Arbeitstage: ${workdays.remainingWorkdays}.`
  ];

  return lines.filter(Boolean).join("\n");
}

function buildUserPrompt(
  shopName: string,
  rows: BriefingRow[],
  workdays: { remainingWorkdays: number },
  dslTvRatio: string | null,
  dataCare: string
) {
  return [
    `Analysiere die aktuellen KPI-Daten fuer den Telekom-Shop ${shopName}.`,
    `Fasse die Lage fuer eine kurze Morgenrunde zusammen.`,
    `Nenne maximal drei Fokus-KPIs, konkrete Tagesziele und eine auffaellige Relation wie DSL zu TV oder MF PK zu MF GK, falls sie relevant ist.`,
    dslTvRatio ? `Bekannte Auffaelligkeit: ${dslTvRatio}.` : "",
    `Datenpflege-Hinweis: ${dataCare}`,
    `Rest-Arbeitstage: ${workdays.remainingWorkdays}.`,
    `Daten: ${JSON.stringify(
      rows.map((row) => ({
        actual: row.actual,
        category: row.category,
        kpi: row.kpi,
        requiredPerWorkday100: row.metric.requiredDailyAverage,
        runratePercent: row.runratePercent,
        target: row.target
      }))
    )}`
  ].join("\n");
}

function buildDataCareReminder(entries: Entry[]) {
  const today = new Date();
  const todayTime = startOfDay(today).getTime();
  const lastEntryTime = entries.reduce((latest, entry) => {
    const entryTime = startOfDay(new Date(entry.entry_date)).getTime();

    return Number.isFinite(entryTime) ? Math.max(latest, entryTime) : latest;
  }, 0);
  const daysSinceLastEntry =
    lastEntryTime > 0 ? Math.floor((todayTime - lastEntryTime) / 86_400_000) : null;

  if (daysSinceLastEntry === null) {
    return "Datenpflege: Es gibt noch keine Eintraege im Quartal. Bitte aktuellen Stand oder Wochenwerte eintragen.";
  }

  if (daysSinceLastEntry >= 7) {
    return `Datenpflege: Letzter KPI-Eintrag vor ${daysSinceLastEntry} Tagen. Bitte Wochenwerte oder aktuellen Stand nachziehen.`;
  }

  return "Datenpflege: Bitte heute kurz pruefen, ob die aktuellen Wochenwerte und Staende vollstaendig sind.";
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function validateCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return null;
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const isAllowed =
    authHeader === `Bearer ${secret}` || headerSecret === secret || querySecret === secret;

  return isAllowed
    ? null
    : NextResponse.json({ ok: false, status: "unauthorized" }, { status: 401 });
}

function getMissingConfig() {
  return [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

const MORNING_BRIEFING_SYSTEM_PROMPT = [
  "Du bist der analytische Fuehrungsassistent fuer einen Telekom-Shop.",
  "Sprich knapp, direkt und handlungsorientiert wie fuer eine Morgenrunde.",
  "Nutze MyProv, DWH, Qualitaet, tNPS, Runrate, Rest-Arbeitstage und Zielpfad.",
  "Erkenne auffaellige Mixe wie DSL zu TV, MF PK zu MF GK, Qualitaet zu Absatz oder starke Abweichungen zur Runrate.",
  "Gib konkrete Massnahmen: Fokus im Tagesbriefing, Verkaufsfrage, Training, Coaching oder Portierungs-/Nachfassaktion.",
  "Erinnere kurz an Datenpflege, wenn aktuelle Wochenwerte oder Staende fehlen koennten.",
  "Keine langen Erklaerungen. Maximal 6 kurze Bulletpoints plus ein Tagesfokus."
].join(" ");
