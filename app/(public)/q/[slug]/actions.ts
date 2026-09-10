"use server";

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

  if (!queueId) return { error: "Queue not found." };
  if (!customerName) return { error: "Your name is required." };
  if (customerName.length > 120) return { error: "Your name is too long." };
  if (customerPhone.length > 32) return { error: "Your phone number is too long." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_queue", {
    p_queue_id: queueId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone || undefined,
  });

  if (error || !data?.[0]) {
    console.error("joinQueueAction error", error?.message);
    const message = error?.message ?? "Could not join this queue.";
    if (message.toLowerCase().includes("not open")) {
      return { error: "This queue is not accepting customers right now." };
    }
    if (message.toLowerCase().includes("inactive")) {
      return { error: "This service is currently unavailable." };
    }
    return { error: message };
  }

  return {
    ticket: {
      publicId: data[0].public_id,
      accessToken: data[0].access_token,
      queueNumber: data[0].queue_number,
    },
  };
}
