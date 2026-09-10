"use server";

import { mapJoinQueueErrorMessage } from "@/lib/dashboard/errors";
import { createClient } from "@/lib/supabase/server";

export type JoinQueueState = {
  error?: string;
  ticket?: {
    publicId: string;
    accessToken: string;
    queueNumber: number;
  };
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function joinQueueAction(
  _prev: JoinQueueState,
  formData: FormData,
): Promise<JoinQueueState> {
  const queueId = readString(formData, "queueId");
  const customerName = readString(formData, "customerName");
  const customerPhone = readString(formData, "customerPhone");

  if (!queueId) {
    return { error: "This queue could not be found." };
  }

  if (!customerName) {
    return { error: "Your name is required." };
  }

  if (customerName.length > 120) {
    return { error: "Your name is too long." };
  }

  if (customerPhone.length > 32) {
    return { error: "Your phone number is too long." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_queue", {
    p_queue_id: queueId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone || undefined,
  });

  if (error || !data?.[0]) {
    // Never log tokens or full customer PII.
    console.error("joinQueueAction error", error?.code ?? "unknown");
    return { error: mapJoinQueueErrorMessage(error?.message) };
  }

  const row = data[0];

  return {
    ticket: {
      publicId: row.public_id,
      accessToken: row.access_token,
      queueNumber: row.queue_number,
    },
  };
}
