import { createClient } from "@supabase/supabase-js";

export const DEFAULT_NOTIFICATION_RECIPIENT = "finn-ole.bierlich@telekom.de";

export type N8nNotificationPayload = {
  emailBody: string;
  emailSubject: string;
  recipientEmail: string;
  source: "ts-kpi";
  type: string;
  [key: string]: unknown;
};

export function getNotificationRecipient() {
  return process.env.N8N_NOTIFICATION_RECIPIENT_EMAIL || DEFAULT_NOTIFICATION_RECIPIENT;
}

export function getMissingAdminConfig() {
  return [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function createSupabaseAdminClient() {
  const missing = getMissingAdminConfig();

  if (missing.length) {
    throw new Error(`Missing server config: ${missing.join(", ")}`);
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false
    }
  });
}

export function validateAutomationSecret(request: Request, url?: URL) {
  const secret = process.env.CRON_SECRET || process.env.N8N_NOTIFICATION_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret =
    request.headers.get("x-cron-secret") ?? request.headers.get("x-ts-kpi-secret");
  const querySecret = url?.searchParams.get("secret") ?? null;

  return authHeader === `Bearer ${secret}` || headerSecret === secret || querySecret === secret;
}

export async function sendN8nNotification(payload: N8nNotificationPayload) {
  const webhookUrl = process.env.N8N_NOTIFICATION_WEBHOOK_URL ?? process.env.N8N_DAILY_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      sent: false,
      status: "missing_webhook" as const
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
        ...(process.env.N8N_NOTIFICATION_WEBHOOK_SECRET
          ? { "x-ts-kpi-secret": process.env.N8N_NOTIFICATION_WEBHOOK_SECRET }
          : process.env.N8N_DAILY_WEBHOOK_SECRET
            ? { "x-ts-kpi-secret": process.env.N8N_DAILY_WEBHOOK_SECRET }
            : {})
      },
      method: "POST"
    });

    return {
      sent: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      sent: false,
      status: "request_failed" as const
    };
  }
}
