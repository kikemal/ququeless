"use server";

import { revalidatePath } from "next/cache";

import { getPrimaryBusiness } from "@/lib/auth/business";
import { parseMaxWaitingCustomersInput } from "@/lib/dashboard/queue-capacity";
import { mapQueueErrorMessage } from "@/lib/dashboard/errors";
import { isQueueStatus } from "@/lib/dashboard/queue-status";
import { createClient } from "@/lib/supabase/server";

export type QueueActionState = {
  error?: string;
  message?: string;
  success?: boolean;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateQueuePaths(queueId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/queues");
  revalidatePath("/dashboard/services");
  if (queueId) {
    revalidatePath(`/dashboard/queues/${queueId}`);
  }
}

async function requireOwnerContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Your session expired. Please log in again." as const,
      supabase,
      user: null,
      business: null,
    };
  }

  const business = await getPrimaryBusiness(user.id);
  if (!business) {
    return {
      error: "Create your business before managing queues." as const,
      supabase,
      user,
      business: null,
    };
  }

  return { error: null, supabase, user, business };
}

export async function createQueueAction(
  _prev: QueueActionState,
  formData: FormData,
): Promise<QueueActionState> {
  const name = readString(formData, "name");
  const serviceId = readString(formData, "serviceId");
  const statusRaw = readString(formData, "status") || "open";
  const capacityParsed = parseMaxWaitingCustomersInput(
    readString(formData, "maxWaitingCustomers"),
  );

  if (!name) {
    return { error: "Queue name is required." };
  }

  if (!serviceId) {
    return { error: "Select a service for this queue." };
  }

  if (!isQueueStatus(statusRaw)) {
    return { error: "Choose a valid queue status." };
  }

  if (!capacityParsed.ok) {
    return { error: capacityParsed.error };
  }

  const ctx = await requireOwnerContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { data: service, error: serviceError } = await ctx.supabase
    .from("services")
    .select("id, is_active")
    .eq("id", serviceId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();

  if (serviceError) {
    console.error("createQueueAction service lookup", serviceError.code);
    return { error: mapQueueErrorMessage(serviceError.message) };
  }

  if (!service) {
    return { error: "Select a service that belongs to your business." };
  }

  if (!service.is_active) {
    return {
      error:
        "Choose an active service. Inactive services cannot be used for new queues.",
    };
  }

  const { data, error } = await ctx.supabase
    .from("queues")
    .insert({
      business_id: ctx.business.id,
      service_id: service.id,
      name,
      status: statusRaw,
      max_waiting_customers: capacityParsed.value,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("createQueueAction error", error.code);
    return { error: mapQueueErrorMessage(error.message) };
  }

  revalidateQueuePaths(data?.id);
  return { success: true, message: "Queue created." };
}

export async function updateQueueAction(
  _prev: QueueActionState,
  formData: FormData,
): Promise<QueueActionState> {
  const queueId = readString(formData, "queueId");
  const name = readString(formData, "name");
  const serviceId = readString(formData, "serviceId");
  const statusRaw = readString(formData, "status");
  const capacityParsed = parseMaxWaitingCustomersInput(
    readString(formData, "maxWaitingCustomers"),
  );

  if (!queueId) {
    return { error: "Queue not found." };
  }

  if (!name) {
    return { error: "Queue name is required." };
  }

  if (!serviceId) {
    return { error: "Select a service for this queue." };
  }

  if (!isQueueStatus(statusRaw)) {
    return { error: "Choose a valid queue status." };
  }

  if (!capacityParsed.ok) {
    return { error: capacityParsed.error };
  }

  const ctx = await requireOwnerContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { data: service, error: serviceError } = await ctx.supabase
    .from("services")
    .select("id, is_active")
    .eq("id", serviceId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();

  if (serviceError) {
    console.error("updateQueueAction service lookup", serviceError.code);
    return { error: mapQueueErrorMessage(serviceError.message) };
  }

  if (!service) {
    return { error: "Select a service that belongs to your business." };
  }

  const { data: existingQueue, error: existingError } = await ctx.supabase
    .from("queues")
    .select("id, service_id")
    .eq("id", queueId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();

  if (existingError) {
    console.error("updateQueueAction queue lookup", existingError.code);
    return { error: mapQueueErrorMessage(existingError.message) };
  }

  if (!existingQueue) {
    return { error: "Queue not found or you do not have permission to edit it." };
  }

  // Switching to a different service requires that service to be active.
  if (existingQueue.service_id !== service.id && !service.is_active) {
    return {
      error:
        "Choose an active service. Inactive services cannot be assigned to queues.",
    };
  }

  const { data, error } = await ctx.supabase
    .from("queues")
    .update({
      name,
      service_id: service.id,
      status: statusRaw,
      max_waiting_customers: capacityParsed.value,
    })
    .eq("id", queueId)
    .eq("business_id", ctx.business.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("updateQueueAction error", error.code);
    return { error: mapQueueErrorMessage(error.message) };
  }

  if (!data) {
    return { error: "Queue not found or you do not have permission to edit it." };
  }

  revalidateQueuePaths(queueId);
  return { success: true, message: "Queue updated." };
}

export async function setQueueStatusAction(
  formData: FormData,
): Promise<QueueActionState> {
  const queueId = readString(formData, "queueId");
  const statusRaw = readString(formData, "status");

  if (!queueId) {
    return { error: "Queue not found." };
  }

  if (!isQueueStatus(statusRaw)) {
    return { error: "Choose a valid queue status." };
  }

  const ctx = await requireOwnerContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { data, error } = await ctx.supabase
    .from("queues")
    .update({ status: statusRaw })
    .eq("id", queueId)
    .eq("business_id", ctx.business.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("setQueueStatusAction error", error.code);
    return { error: mapQueueErrorMessage(error.message) };
  }

  if (!data) {
    return {
      error: "Queue not found or you do not have permission to change it.",
    };
  }

  revalidateQueuePaths(queueId);
  return { success: true, message: `Queue marked as ${statusRaw}.` };
}

export async function deleteQueueAction(
  formData: FormData,
): Promise<QueueActionState> {
  const queueId = readString(formData, "queueId");

  if (!queueId) {
    return { error: "Queue not found." };
  }

  const ctx = await requireOwnerContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { data, error } = await ctx.supabase
    .from("queues")
    .delete()
    .eq("id", queueId)
    .eq("business_id", ctx.business.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("deleteQueueAction error", error.code);
    return { error: mapQueueErrorMessage(error.message) };
  }

  if (!data) {
    return {
      error: "Queue not found or you do not have permission to delete it.",
    };
  }

  revalidateQueuePaths();
  return { success: true, message: "Queue deleted." };
}
