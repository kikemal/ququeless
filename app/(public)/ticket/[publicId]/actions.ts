"use server";

import { after } from "next/server";

import { mapTicketErrorMessage } from "@/lib/dashboard/errors";
import { processNotificationsForTicket } from "@/lib/notifications/process";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

export type TicketData = {
  public_id: string;
  /** Used only for realtime channel subscription — never shown in UI. */
  queue_id: string;
  queue_number: number;
  status: Enums<"entry_status">;
  people_ahead: number;
  estimated_wait_minutes: number;
  service_name: string;
  business_name: string;
  queue_name: string;
  email_notifications_enabled: boolean;
  joined_at: string | null;
  called_at: string | null;
  serving_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  queue_status: Enums<"queue_status">;
  business_is_open: boolean;
};

export async function getTicketAction(publicId: string, accessToken: string) {
  if (!publicId || !accessToken.trim()) {
    return { error: "Missing ticket credentials." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_ticket", {
    p_public_id: publicId,
    p_access_token: accessToken,
  });

  if (error || !data?.[0]) {
    console.error("getTicketAction error", error?.code ?? "not_found");
    return { error: mapTicketErrorMessage(error?.message ?? "Ticket not found") };
  }

  return { ticket: data[0] as TicketData };
}

export async function cancelTicketAction(publicId: string, accessToken: string) {
  if (!publicId || !accessToken.trim()) {
    return { error: "Missing ticket credentials." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_ticket", {
    p_public_id: publicId,
    p_access_token: accessToken,
  });

  if (error) {
    console.error("cancelTicketAction error", error.code);
    return { error: mapTicketErrorMessage(error.message) };
  }

  // Delivery is best-effort and must not undo cancellation or block UX.
  after(() => {
    void processNotificationsForTicket(publicId, accessToken);
  });

  return { success: true };
}
