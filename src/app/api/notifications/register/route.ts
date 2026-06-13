import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseAdminClient,
  getMissingAdminConfig,
  getNotificationRecipient,
  sendN8nNotification
} from "@/lib/notifications/service";

type RegistrationPayload = {
  email?: string;
  requestedShopId?: string;
};

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const missingConfig = getMissingAdminConfig();

  if (missingConfig.length) {
    return NextResponse.json({
      ok: false,
      status: "config_needed",
      missing: missingConfig
    });
  }

  const body = (await request.json().catch(() => ({}))) as RegistrationPayload;
  const email = String(body.email ?? "").trim().toLowerCase();
  const requestedShopId = String(body.requestedShopId ?? "").trim() || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, status: "invalid_email" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: shop } = requestedShopId
    ? await supabase
        .from("shops")
        .select("id, name")
        .eq("id", requestedShopId)
        .returns<Array<{ id: string; name: string }>>()
        .maybeSingle()
    : { data: null };
  const shopLabel = shop?.name ?? "kein Shop gewaehlt";
  const message = [
    "Neue TS KPI Registrierung wartet auf Freigabe.",
    `E-Mail: ${email}`,
    `Wunsch-Shop: ${shopLabel}`,
    "Bitte in TS KPI unter Einstellungen > Nutzer & Rechte pruefen und aktiv setzen."
  ].join("\n");

  await supabase.from("notification_events").insert({
    event_type: "user_registered",
    payload: {
      email,
      requestedShopId,
      shopName: shop?.name ?? null
    },
    shop_id: requestedShopId
  });

  const notification = await sendN8nNotification({
    emailBody: message,
    emailSubject: "TS KPI: Neuer Nutzer wartet auf Freigabe",
    recipientEmail: getNotificationRecipient(),
    source: "ts-kpi",
    type: "user_registered",
    user: {
      email,
      requestedShopId,
      shopName: shop?.name ?? null
    }
  });

  return NextResponse.json({
    ok: true,
    notification,
    status: "registered"
  });
}
