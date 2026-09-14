"use server";

import { revalidatePath } from "next/cache";

import { getPrimaryBusiness, getPrimaryMembership } from "@/lib/auth/business";
import { mapServiceErrorMessage } from "@/lib/dashboard/errors";
import {
  optionalTrimmedText,
  parsePositiveInt,
} from "@/lib/dashboard/validation";
import { createClient } from "@/lib/supabase/server";

export type ServiceActionState = {
  error?: string;
  message?: string;
  success?: boolean;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateServicePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/services");
  revalidatePath("/dashboard/queues");
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

  const membership = await getPrimaryMembership(user.id);
  if (!membership) {
    return {
      error: "Create your business before managing services." as const,
      supabase,
      user,
      business: null,
    };
  }

  if (membership.role !== "business_owner") {
    return {
      error: "Only business owners can manage services." as const,
      supabase,
      user,
      business: null,
    };
  }

  const business = await getPrimaryBusiness(user.id);
  if (!business || business.id !== membership.businessId) {
    return {
      error: "Create your business before managing services." as const,
      supabase,
      user,
      business: null,
    };
  }

  return { error: null, supabase, user, business };
}

export async function createServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const name = readString(formData, "name");
  const description = optionalTrimmedText(readString(formData, "description") || "");
  const durationRaw = readString(formData, "averageServiceMinutes");
  const duration = parsePositiveInt(durationRaw);

  if (!name) {
    return { error: "Service name is required." };
  }

  if (duration === null) {
    return { error: "Average duration must be a positive whole number of minutes." };
  }

  const ctx = await requireOwnerContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { error } = await ctx.supabase.from("services").insert({
    business_id: ctx.business.id,
    name,
    description,
    average_service_minutes: duration,
    is_active: true,
  });

  if (error) {
    console.error("createServiceAction error", error.code);
    return { error: mapServiceErrorMessage(error.message) };
  }

  revalidateServicePaths();
  return { success: true, message: "Service created." };
}

export async function updateServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const serviceId = readString(formData, "serviceId");
  const name = readString(formData, "name");
  const description = optionalTrimmedText(readString(formData, "description") || "");
  const durationRaw = readString(formData, "averageServiceMinutes");
  const duration = parsePositiveInt(durationRaw);

  if (!serviceId) {
    return { error: "Service not found." };
  }

  if (!name) {
    return { error: "Service name is required." };
  }

  if (duration === null) {
    return { error: "Average duration must be a positive whole number of minutes." };
  }

  const ctx = await requireOwnerContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { data, error } = await ctx.supabase
    .from("services")
    .update({
      name,
      description,
      average_service_minutes: duration,
    })
    .eq("id", serviceId)
    .eq("business_id", ctx.business.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("updateServiceAction error", error.code);
    return { error: mapServiceErrorMessage(error.message) };
  }

  if (!data) {
    return { error: "Service not found or you do not have permission to edit it." };
  }

  revalidateServicePaths();
  return { success: true, message: "Service updated." };
}

export async function setServiceActiveAction(
  formData: FormData,
): Promise<ServiceActionState> {
  const serviceId = readString(formData, "serviceId");
  const nextActive = readString(formData, "isActive") === "true";

  if (!serviceId) {
    return { error: "Service not found." };
  }

  const ctx = await requireOwnerContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { data, error } = await ctx.supabase
    .from("services")
    .update({ is_active: nextActive })
    .eq("id", serviceId)
    .eq("business_id", ctx.business.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("setServiceActiveAction error", error.code);
    return { error: mapServiceErrorMessage(error.message) };
  }

  if (!data) {
    return {
      error: "Service not found or you do not have permission to change it.",
    };
  }

  revalidateServicePaths();
  return {
    success: true,
    message: nextActive ? "Service activated." : "Service deactivated.",
  };
}

export async function deleteServiceAction(
  formData: FormData,
): Promise<ServiceActionState> {
  const serviceId = readString(formData, "serviceId");

  if (!serviceId) {
    return { error: "Service not found." };
  }

  const ctx = await requireOwnerContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { data: dependentQueues, error: queueCheckError } = await ctx.supabase
    .from("queues")
    .select("id")
    .eq("service_id", serviceId)
    .eq("business_id", ctx.business.id)
    .limit(1);

  if (queueCheckError) {
    console.error("deleteServiceAction queue check", queueCheckError.message);
    return { error: mapServiceErrorMessage(queueCheckError.message) };
  }

  if (dependentQueues && dependentQueues.length > 0) {
    return {
      error:
        "This service is used by one or more queues. Deactivate it instead of deleting.",
    };
  }

  const { data, error } = await ctx.supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("business_id", ctx.business.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("deleteServiceAction error", error.code);
    return { error: mapServiceErrorMessage(error.message) };
  }

  if (!data) {
    return {
      error: "Service not found or you do not have permission to delete it.",
    };
  }

  revalidateServicePaths();
  return { success: true, message: "Service deleted." };
}
