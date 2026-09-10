"use server";

import { mapTicketErrorMessage } from "@/lib/dashboard/errors";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

export type TicketData = {
  public_id: string;
  queue_number: number;
  status: Enums<"entry_status">;
  people_ahead: number;
  estimated_wait_minutes: number;
  service_name: string;
  business_name: string;
  queue_name: string;
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

  return { success: true };
}
