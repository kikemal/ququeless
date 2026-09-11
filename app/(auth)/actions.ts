"use server";

import { redirect } from "next/navigation";

import { mapAuthErrorMessage, mapBusinessErrorMessage } from "@/lib/auth/errors";
import { getPrimaryBusiness } from "@/lib/auth/business";
import { getSafeAuthRedirect } from "@/lib/auth/redirect";
import { slugifyBusinessName, slugWithSuffix } from "@/lib/business/slug";
import { isBusinessType } from "@/lib/business/types";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  message?: string;
  needsEmailConfirmation?: boolean;
};

const MIN_PASSWORD_LENGTH = 8;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signupAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const fullName = readString(formData, "fullName");
  const email = readString(formData, "email");
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");
  const nextPath = readString(formData, "next");
  const safeNext = getSafeAuthRedirect(nextPath);

  if (!fullName || !email || !password || !confirmPassword) {
    return { error: "Please fill in all fields." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  const emailRedirectTo = safeNext
    ? `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    : `${origin}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
      emailRedirectTo,
    },
  });

  if (error) {
    console.error("signupAction error", error.message);
    return { error: mapAuthErrorMessage(error.message) };
  }

  if (!data.session) {
    return {
      needsEmailConfirmation: true,
      message:
        "Account created. Check your email to confirm your address, then log in.",
    };
  }

  if (safeNext) {
    redirect(safeNext);
  }

  redirect("/onboarding");
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, "email");
  const password = readString(formData, "password");
  const nextPath = readString(formData, "next");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    console.error("loginAction error", error?.message);
    return { error: mapAuthErrorMessage(error?.message) };
  }

  const safeNext = getSafeAuthRedirect(nextPath);
  if (safeNext) {
    redirect(safeNext);
  }

  const business = await getPrimaryBusiness(data.user.id);
  if (!business) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createBusinessAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = readString(formData, "name");
  const businessType = readString(formData, "businessType");
  const phone = readString(formData, "phone");
  const email = readString(formData, "email");

  if (!name) {
    return { error: "Business name is required." };
  }

  if (!isBusinessType(businessType)) {
    return { error: "Select a valid business type." };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid business email, or leave it blank." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please log in again." };
  }

  const existing = await getPrimaryBusiness(user.id);
  if (existing) {
    redirect("/dashboard");
  }

  const baseSlug = slugifyBusinessName(name);
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const slug = slugWithSuffix(baseSlug, attempt);
    const { error } = await supabase.rpc("create_business", {
      p_name: name,
      p_slug: slug,
      p_business_type: businessType,
      p_phone: phone || undefined,
      p_email: email || undefined,
    });

    if (!error) {
      redirect("/dashboard");
    }

    lastError = error.message;
    const isSlugConflict =
      error.message.toLowerCase().includes("duplicate") ||
      error.message.toLowerCase().includes("unique") ||
      error.code === "23505";

    if (!isSlugConflict) {
      console.error("createBusinessAction error", error.message);
      return { error: mapBusinessErrorMessage(error.message) };
    }
  }

  console.error("createBusinessAction slug exhaustion", lastError);
  return {
    error: "Could not generate a unique business URL. Try a different name.",
  };
}
