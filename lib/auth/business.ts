import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type PrimaryBusiness = Pick<
  Tables<"businesses">,
  "id" | "name" | "slug" | "business_type" | "phone" | "email"
>;

/**
 * Phase 2 assumption: use the user's first membership (oldest) as the primary business.
 * Multi-business switching is deferred; the schema already supports many memberships.
 */
export async function getPrimaryBusiness(
  userId: string,
): Promise<PrimaryBusiness | null> {
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select("business_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("getPrimaryBusiness membership error", membershipError.message);
    return null;
  }

  if (!membership) {
    return null;
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, slug, business_type, phone, email")
    .eq("id", membership.business_id)
    .maybeSingle();

  if (businessError) {
    console.error("getPrimaryBusiness business error", businessError.message);
    return null;
  }

  return business;
}

export async function requirePrimaryBusiness(
  userId: string,
): Promise<PrimaryBusiness> {
  const business = await getPrimaryBusiness(userId);
  if (!business) {
    redirect("/onboarding");
  }
  return business;
}

export type PrimaryMembership = {
  businessId: string;
  role: Tables<"business_members">["role"];
  membershipId: string;
};

/**
 * Oldest membership for the user (primary business), including role.
 */
export async function getPrimaryMembership(
  userId: string,
): Promise<PrimaryMembership | null> {
  const supabase = await createClient();

  const { data: membership, error } = await supabase
    .from("business_members")
    .select("id, business_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getPrimaryMembership error", error.message);
    return null;
  }

  if (!membership) {
    return null;
  }

  return {
    businessId: membership.business_id,
    role: membership.role,
    membershipId: membership.id,
  };
}

export async function getProfileSummary(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getProfileSummary error", error.message);
    return null;
  }

  return data;
}
