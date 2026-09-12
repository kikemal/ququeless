"use server";

import { revalidatePath } from "next/cache";

import { getPrimaryBusiness } from "@/lib/auth/business";
import { mapQueueEntryErrorMessage } from "@/lib/dashboard/errors";
import { processNotificationsForEntry } from "@/lib/notifications/process";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

export type EntryActionState = {
  error?: string;
  success?: boolean;
  message?: string;
};

const ALLOWED_TRANSITIONS = new Set<Enums<"entry_status">>([
  "serving",
  "completed",
  "skipped",
  "no_show",
]);

async function requireMemberQueue(queueId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Your session expired. Please log in again." as const,
      supabase,
      business: null,
      queue: null,
    };
  }

  const business = await getPrimaryBusiness(user.id);
  if (!business) {
    return {
      error: "Create your business before managing queues." as const,
      supabase,
      business: null,
      queue: null,
    };
  }

  const { data: queue, error } = await supabase
    .from("queues")
    .select("id, status")
    .eq("id", queueId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error) {
    console.error("requireMemberQueue error", error.code);
    return {
      error: mapQueueEntryErrorMessage(error.message),
      supabase,
      business,
      queue: null,
    };
  }

  if (!queue) {
    return {
      error: "Queue not found or you do not have access." as const,
      supabase,
      business,
      queue: null,
    };
  }

  return { error: null, supabase, business, queue };
}

export async function callNextEntryAction(
  queueId: string,
): Promise<EntryActionState> {
  if (!queueId) {
    return { error: "Queue not found." };
  }

  const ctx = await requireMemberQueue(queueId);
  if (ctx.error || !ctx.queue) {
    return { error: ctx.error ?? "Queue not found." };
  }

  const { data, error } = await ctx.supabase.rpc("call_next_entry", {
    p_queue_id: ctx.queue.id,
  });

  if (error || !data?.[0]) {
    console.error("callNextEntryAction error", error?.code ?? "unknown");
    return { error: mapQueueEntryErrorMessage(error?.message) };
  }

  await processNotificationsForEntry(data[0].id);

  revalidatePath(`/dashboard/queues/${ctx.queue.id}`);
  return {
    success: true,
    message: `Customer #${data[0].queue_number} has been called.`,
  };
}

export async function transitionEntryAction(
  entryId: string,
  newStatus: Enums<"entry_status">,
): Promise<EntryActionState> {
  if (!entryId) {
    return { error: "Customer not found." };
  }

  if (!ALLOWED_TRANSITIONS.has(newStatus)) {
    return { error: "That status change is not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please log in again." };
  }

  const business = await getPrimaryBusiness(user.id);
  if (!business) {
    return { error: "Create your business before managing queues." };
  }

  // Confirm the entry belongs to the authenticated user's primary business
  // before invoking the RPC (RLS/RPC remain the final authority).
  const { data: entry, error: lookupError } = await supabase
    .from("queue_entries")
    .select("id, queue_id")
    .eq("id", entryId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (lookupError) {
    console.error("transitionEntryAction lookup", lookupError.code);
    return { error: mapQueueEntryErrorMessage(lookupError.message) };
  }

  if (!entry) {
    return { error: "Customer not found or you do not have access." };
  }

  const { data, error } = await supabase.rpc("transition_entry", {
    p_entry_id: entry.id,
    p_new_status: newStatus,
  });

  if (error || !data?.[0]) {
    console.error("transitionEntryAction error", error?.code ?? "unknown");
    return { error: mapQueueEntryErrorMessage(error?.message) };
  }

  await processNotificationsForEntry(entry.id);

  revalidatePath(`/dashboard/queues/${data[0].queue_id}`);
  return { success: true, message: "Customer status updated." };
}
