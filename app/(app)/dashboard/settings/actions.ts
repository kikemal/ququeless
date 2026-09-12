"use server";

import { revalidatePath } from "next/cache";

import { getPrimaryMembership } from "@/lib/auth/business";
import {
  validateBusinessSettings,
  type NormalizedBusinessSettings,
} from "@/lib/business/settings";
import { mapSettingsErrorMessage } from "@/lib/dashboard/errors";
import { createClient } from "@/lib/supabase/server";

export type SettingsActionState = {
  error?: string;
  message?: string;
  success?: boolean;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function updateBusinessSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please log in again." };
  }

  const membership = await getPrimaryMembership(user.id);
  if (!membership) {
    return { error: "Create a business before updating settings." };
  }
  if (membership.role !== "business_owner") {
    return { error: "Only business owners can change settings." };
  }

  const validated = validateBusinessSettings({
    name: readString(formData, "name"),
    publicDescription: readString(formData, "publicDescription"),
    publicInstructions: readString(formData, "publicInstructions"),
    contactEmail: readString(formData, "contactEmail"),
    contactPhone: readString(formData, "contactPhone"),
    brandingTheme: readString(formData, "brandingTheme"),
  });

  if (!validated.ok) {
    return { error: validated.error.message };
  }

  const value: NormalizedBusinessSettings = validated.value;

  const { error } = await supabase.rpc("update_my_business_settings", {
    p_name: value.name,
    p_public_description: value.publicDescription,
    p_public_instructions: value.publicInstructions,
    p_contact_email: value.contactEmail,
    p_contact_phone: value.contactPhone,
    p_branding_theme: value.brandingTheme,
  });

  if (error) {
    console.error("update_my_business_settings error", error.code);
    return { error: mapSettingsErrorMessage(error.message) };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath("/q", "layout");

  return { success: true, message: "Settings saved." };
}
