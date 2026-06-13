import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationEventType =
  | "kpi_daily_update"
  | "kpi_quarter_adjustment"
  | "kpi_target_update"
  | "kpi_weekly_update"
  | "kpi_current_stand"
  | "user_registered";

type RecordNotificationEventInput = {
  actorUserId?: string | null;
  eventType: NotificationEventType;
  payload: Record<string, unknown>;
  shopId?: string | null;
};

export async function recordNotificationEvent(
  supabase: SupabaseClient<any>,
  input: RecordNotificationEventInput
) {
  try {
    const { error } = await supabase.from("notification_events").insert({
      actor_user_id: input.actorUserId ?? null,
      event_type: input.eventType,
      payload: input.payload,
      shop_id: input.shopId ?? null
    });

    if (error && process.env.NODE_ENV !== "production") {
      console.warn("notification_events insert failed", error.message);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("notification_events insert failed", error);
    }
  }
}
