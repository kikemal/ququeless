"use server";

import { revalidatePath } from "next/cache";

import { getPrimaryBusiness } from "@/lib/auth/business";
import { createClient } from "@/lib/supabase/server";

export type EntryActionState = { error?: string; success?: boolean; message?: string };

export async function callNextEntryAction(queueId: string): Promise<EntryActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };
  const business = await getPrimaryBusiness(user.id);
  if (!business) return { error: "Business not found." };

  const { data, error } = await supabase.rpc("call_next_entry", { p_queue_id: queueId });
  if (error || !data?.[0]) {
    return { error: error?.message?.includes("No waiting") ? "There are no waiting customers." : error?.message ?? "Could not call the next customer." };
  }

  revalidatePath(`/dashboard/queues/${queueId}`);
  return { success: true, message: `Customer ${data[0].queue_number} has been called.` };
}

export async function transitionEntryAction(
  entryId: string,
  newStatus: "serving" | "completed" | "skipped" | "no_show",
): Promise<EntryActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please log in again." };
  const business = await getPrimaryBusiness(user.id);
  if (!business) return { error: "Business not found." };

  const { data, error } = await supabase.rpc("transition_entry", {
    p_entry_id: entryId,
    p_new_status: newStatus,
  });
  if (error || !data?.[0]) return { error: error?.message ?? "Could not update this customer." };

  revalidatePath(`/dashboard/queues/${data[0].queue_id}`);
  return { success: true, message: "Customer status updated." };
}
