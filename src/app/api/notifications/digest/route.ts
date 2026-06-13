import { NextResponse, type NextRequest } from "next/server";
import { displayKpiName } from "@/lib/kpi/display";
import { formatKpiValue } from "@/lib/kpi/format";
import {
  createSupabaseAdminClient,
  getMissingAdminConfig,
  getNotificationRecipient,
  sendN8nNotification,
  validateAutomationSecret
} from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

type NotificationEvent = {
  actor_user_id: string | null;
  created_at: string;
  event_type: string;
  id: string;
  payload: Record<string, unknown>;
  shop_id: string | null;
};

type KpiDefinition = {
  category: "provision" | "unit" | "quality" | "tnps";
  code: string;
  id: string;
  name: string;
  value_type: "money" | "count" | "score";
};

type Shop = {
  id: string;
  name: string;
};

type Profile = {
  display_name: string | null;
  email: string | null;
  id: string;
};

export async function GET(request: NextRequest) {
  return handleDigest(request);
}

export async function POST(request: NextRequest) {
  return handleDigest(request);
}

async function handleDigest(request: NextRequest) {
  if (!validateAutomationSecret(request, request.nextUrl)) {
    return NextResponse.json({ ok: false, status: "unauthorized" }, { status: 401 });
  }

  const missingConfig = getMissingAdminConfig();

  if (missingConfig.length) {
    return NextResponse.json({
      ok: false,
      status: "config_needed",
      missing: missingConfig
    });
  }

  const supabase = createSupabaseAdminClient();
  const { data: eventsData, error } = await supabase
    .from("notification_events")
    .select("id, shop_id, actor_user_id, event_type, payload, created_at")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<NotificationEvent[]>();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "query_failed",
        message: error.message
      },
      { status: 500 }
    );
  }

  const events = eventsData ?? [];

  if (!events.length) {
    return NextResponse.json({
      ok: true,
      status: "empty",
      message: "Keine neuen TS KPI Updates fuer den 15-Minuten-Digest."
    });
  }

  const [shops, kpis, profiles] = await Promise.all([
    fetchShops(supabase, events),
    fetchKpis(supabase, events),
    fetchProfiles(supabase, events)
  ]);
  const payload = buildDigestPayload({
    events,
    kpis,
    profiles,
    shops
  });
  const shouldSendToN8n = request.nextUrl.searchParams.get("send") === "1";
  const isDryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const notification = shouldSendToN8n ? await sendN8nNotification(payload) : null;

  if (!isDryRun) {
    await supabase
      .from("notification_events")
      .update({ processed_at: new Date().toISOString() })
      .in("id", events.map((event) => event.id));
  }

  return NextResponse.json({
    ok: true,
    notification,
    payload,
    processed: !isDryRun,
    status: "digest"
  });
}

async function fetchShops(supabase: ReturnType<typeof createSupabaseAdminClient>, events: NotificationEvent[]) {
  const shopIds = unique(events.map((event) => event.shop_id).filter(Boolean) as string[]);

  if (!shopIds.length) {
    return new Map<string, Shop>();
  }

  const { data } = await supabase
    .from("shops")
    .select("id, name")
    .in("id", shopIds)
    .returns<Shop[]>();
  const shops = new Map<string, Shop>();

  for (const shop of data ?? []) {
    shops.set(shop.id, shop);
  }

  return shops;
}

async function fetchKpis(supabase: ReturnType<typeof createSupabaseAdminClient>, events: NotificationEvent[]) {
  const kpiIds = unique(events.flatMap((event) => extractKpiIds(event.payload)));

  if (!kpiIds.length) {
    return new Map<string, KpiDefinition>();
  }

  const { data } = await supabase
    .from("kpi_definitions")
    .select("id, code, name, category, value_type")
    .in("id", kpiIds)
    .returns<KpiDefinition[]>();
  const kpis = new Map<string, KpiDefinition>();

  for (const kpi of data ?? []) {
    kpis.set(kpi.id, kpi);
  }

  return kpis;
}

async function fetchProfiles(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  events: NotificationEvent[]
) {
  const userIds = unique(events.map((event) => event.actor_user_id).filter(Boolean) as string[]);

  if (!userIds.length) {
    return new Map<string, Profile>();
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds)
    .returns<Profile[]>();
  const profiles = new Map<string, Profile>();

  for (const profile of data ?? []) {
    profiles.set(profile.id, profile);
  }

  return profiles;
}

function buildDigestPayload({
  events,
  kpis,
  profiles,
  shops
}: {
  events: NotificationEvent[];
  kpis: Map<string, KpiDefinition>;
  profiles: Map<string, Profile>;
  shops: Map<string, Shop>;
}) {
  const lines = [
    "TS KPI Update der letzten 15 Minuten:",
    "",
    ...events.map((event) => formatEventLine(event, { kpis, profiles, shops })),
    "",
    "Reminder: Bitte pruefen, ob alle Wochenwerte und aktuellen Staende gepflegt sind.",
    "Wenn Daten fehlen: kurz in TS KPI nachtragen, damit Runrate und Morgenrunde sauber bleiben."
  ];

  return {
    emailBody: lines.join("\n"),
    emailSubject: `TS KPI: ${events.length} Update${events.length === 1 ? "" : "s"} eingetragen`,
    events,
    generatedAt: new Date().toISOString(),
    n8nInstruction:
      "Sende diese Nachricht per Gmail an recipientEmail. Wenn status empty ist, keine Mail senden.",
    recipientEmail: getNotificationRecipient(),
    source: "ts-kpi" as const,
    type: "kpi_digest"
  };
}

function formatEventLine(
  event: NotificationEvent,
  context: {
    kpis: Map<string, KpiDefinition>;
    profiles: Map<string, Profile>;
    shops: Map<string, Shop>;
  }
) {
  const shopName = event.shop_id ? context.shops.get(event.shop_id)?.name ?? "Shop" : "Shop";
  const actor = event.actor_user_id ? context.profiles.get(event.actor_user_id) : null;
  const actorLabel = actor?.display_name ?? actor?.email ?? "System";

  if (event.event_type === "user_registered") {
    const email = String(event.payload.email ?? "unbekannt");
    const requestedShop = String(event.payload.shopName ?? shopName);

    return `- Neue Registrierung: ${email} fuer ${requestedShop}. Bitte genehmigen oder sperren.`;
  }

  if (event.event_type === "kpi_target_update") {
    const kpi = context.kpis.get(String(event.payload.kpiDefinitionId ?? ""));
    const targetValue = Number(event.payload.targetValue ?? 0);

    return `- ${shopName}: ${actorLabel} hat Ziel ${formatKpiLabel(kpi)} auf ${formatEventValue(targetValue, kpi)} gesetzt.`;
  }

  const entryText = extractEntries(event.payload)
    .map((entry) => {
      const kpi = context.kpis.get(entry.kpiDefinitionId);
      const prefix = event.event_type === "kpi_current_stand" ? "auf" : "+";

      return `${formatKpiLabel(kpi)} ${prefix}${formatEventValue(entry.value, kpi)}`;
    })
    .join(", ");
  const contextLabel =
    event.event_type === "kpi_weekly_update"
      ? `KW ${String(event.payload.weekKey ?? "").replace(/^[0-9]{4}-W/, "")}`
      : event.event_type === "kpi_daily_update"
        ? String(event.payload.entryDate ?? "Tageswert")
        : event.event_type === "kpi_quarter_adjustment"
          ? "Quartalsnachtrag"
          : "Aktueller Stand";

  return `- ${shopName}: ${actorLabel} hat ${contextLabel} aktualisiert: ${entryText || "Werte gepflegt"}.`;
}

function extractKpiIds(payload: Record<string, unknown>) {
  const direct = typeof payload.kpiDefinitionId === "string" ? [payload.kpiDefinitionId] : [];

  return [...direct, ...extractEntries(payload).map((entry) => entry.kpiDefinitionId)];
}

function extractEntries(payload: Record<string, unknown>) {
  const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];

  return rawEntries
    .map((rawEntry) => {
      if (!rawEntry || typeof rawEntry !== "object") {
        return null;
      }

      const entry = rawEntry as Record<string, unknown>;
      const kpiDefinitionId = String(entry.kpiDefinitionId ?? "");
      const value = Number(entry.value ?? entry.desiredActual ?? entry.targetValue ?? 0);

      return kpiDefinitionId && Number.isFinite(value)
        ? {
            kpiDefinitionId,
            value
          }
        : null;
    })
    .filter((entry): entry is { kpiDefinitionId: string; value: number } => Boolean(entry));
}

function formatKpiLabel(kpi: KpiDefinition | undefined) {
  return kpi ? displayKpiName(kpi.code, kpi.name) : "KPI";
}

function formatEventValue(value: number, kpi: KpiDefinition | undefined) {
  return formatKpiValue(value, kpi?.value_type ?? "count");
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
