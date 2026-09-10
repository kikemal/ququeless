"use server";

import { createClient } from "@/lib/supabase/server";

export type TicketData = {
  public_id: string;
  queue_number: number;
  status: "waiting" | "called" | "serving" | "completed" | "skipped" | "no_show";
  people_ahead: number;
  estimated_wait_minutes: number;
  service_name: string;
  business_name: string;
  queue_name: string;
};

export async function getTicketAction(publicId: string, accessToken: string) {
  if (!publicId || !accessToken) return { error: "Missing ticket credentials." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_ticket", {
    p_public_id: publicId,
    p_access_token: accessToken,
  });

  if (error || !data?.[0]) {
    return { error: "This ticket could not be found. The saved ticket may have expired or been cleared." };
  }

  return { ticket: data[0] as TicketData };
}

export async function cancelTicketAction(publicId: string, accessToken: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_ticket", {
    p_public_id: publicId,
    p_access_token: accessToken,
  });
  return error ? { error: "Could not cancel your ticket." } : { success: true };
}
