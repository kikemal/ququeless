"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrimaryBusiness, getPrimaryMembership } from "@/lib/auth/business";
import { getAppOrigin } from "@/lib/public-url";
import { isValidInviteEmail, normalizeInviteEmail } from "@/lib/team/email";
import { buildInviteUrl } from "@/lib/team/invitation";
import { createClient } from "@/lib/supabase/server";

export type TeamActionState = {
  error?: string;
  message?: string;
  success?: boolean;
  invitationUrl?: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function mapTeamError(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (value.includes("owner access required") || value.includes("insufficient")) {
    return "You are not authorized to manage this team.";
  }
  if (value.includes("already a team member")) {
    return "This email is already a team member.";
  }
  if (value.includes("valid email") || value.includes("email is required")) {
    return "Enter a valid email address.";
  }
  if (value.includes("cannot remove yourself")) {
    return "You cannot remove yourself.";
  }
  if (value.includes("only staff members")) {
    return "Only staff members can be removed.";
  }
  if (value.includes("accepted invitations cannot be revoked")) {
    return "Accepted invitations cannot be revoked.";
  }
  if (value.includes("invitation not found") || value.includes("membership not found")) {
    return "That team item could not be found.";
  }
  if (value.includes("authentication required")) {
    return "Your session expired. Please log in again.";
  }
  if (value.includes("unique") || value.includes("duplicate")) {
    return "A pending invitation for this email already exists.";
  }

  return "Could not complete that team action. Please try again.";
}

function mapAcceptError(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();

  if (value.includes("different email")) {
    return "This invitation belongs to a different email address.";
  }
  if (value.includes("expired")) {
    return "This invitation has expired.";
  }
  if (value.includes("revoked")) {
    return "This invitation has been revoked.";
  }
  if (value.includes("already been accepted")) {
    return "This invitation has already been accepted.";
  }
  if (value.includes("already a member")) {
    return "You are already a member of this business.";
  }
  if (value.includes("authentication required")) {
    return "Please log in to accept this invitation.";
  }
  if (value.includes("invalid invitation") || value.includes("no_data")) {
    return "This invitation is invalid.";
  }

  return "This invitation is invalid.";
}

async function requireOwnerTeamContext() {
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
      membership: null,
    };
  }

  const membership = await getPrimaryMembership(user.id);
  const business = await getPrimaryBusiness(user.id);

  if (!membership || !business) {
    return {
      error: "Create your business before managing your team." as const,
      supabase,
      user,
      business: null,
      membership: null,
    };
  }

  if (membership.role !== "business_owner") {
    return {
      error: "You are not authorized to manage this team." as const,
      supabase,
      user,
      business,
      membership,
    };
  }

  return { error: null, supabase, user, business, membership };
}

export async function inviteStaffAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const emailRaw = readString(formData, "email");
  const email = normalizeInviteEmail(emailRaw);

  if (!isValidInviteEmail(email)) {
    return { error: "Enter a valid email address." };
  }

  const ctx = await requireOwnerTeamContext();
  if (ctx.error || !ctx.business) {
    return { error: ctx.error ?? "Could not load your business." };
  }

  const { data, error } = await ctx.supabase.rpc("create_business_invitation", {
    p_email: email,
  });

  if (error) {
    console.error("inviteStaffAction error", error.code);
    return { error: mapTeamError(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || !("invitation_token" in row)) {
    return { error: "Could not create the invitation. Please try again." };
  }

  const token = String(
    (row as { invitation_token: string }).invitation_token ?? "",
  );
  const invitationUrl = buildInviteUrl(token, getAppOrigin());

  if (!invitationUrl) {
    return {
      error:
        "Invitation created, but the app URL is not configured. Set NEXT_PUBLIC_APP_URL.",
    };
  }

  revalidatePath("/dashboard/team");

  return {
    success: true,
    message:
      "Invitation created. Copy the link below and share it securely — it is shown only once.",
    invitationUrl,
  };
}

export async function revokeInvitationAction(
  formData: FormData,
): Promise<TeamActionState> {
  const invitationId = readString(formData, "invitationId");
  if (!invitationId) {
    return { error: "Invitation not found." };
  }

  const ctx = await requireOwnerTeamContext();
  if (ctx.error) {
    return { error: ctx.error };
  }

  const { error } = await ctx.supabase.rpc("revoke_business_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    console.error("revokeInvitationAction error", error.code);
    return { error: mapTeamError(error.message) };
  }

  revalidatePath("/dashboard/team");
  return { success: true, message: "Invitation revoked." };
}

export async function removeStaffAction(
  formData: FormData,
): Promise<TeamActionState> {
  const membershipId = readString(formData, "membershipId");
  if (!membershipId) {
    return { error: "Membership not found." };
  }

  const ctx = await requireOwnerTeamContext();
  if (ctx.error) {
    return { error: ctx.error };
  }

  const { error } = await ctx.supabase.rpc("remove_staff_member", {
    p_membership_id: membershipId,
  });

  if (error) {
    console.error("removeStaffAction error", error.code);
    return { error: mapTeamError(error.message) };
  }

  revalidatePath("/dashboard/team");
  return { success: true, message: "Staff member removed." };
}

export async function acceptInvitationAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const token = readString(formData, "token");
  if (!token) {
    return { error: "This invitation is invalid." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in to accept this invitation." };
  }

  const { error } = await supabase.rpc("accept_business_invitation", {
    p_token: token,
  });

  if (error) {
    console.error("acceptInvitationAction error", error.code);
    return { error: mapAcceptError(error.message) };
  }

  redirect("/dashboard");
}
