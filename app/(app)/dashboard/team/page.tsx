import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  TeamManager,
  type PendingInvitationRow,
  type TeamMemberRow,
} from "@/components/dashboard/team-manager";
import {
  getPrimaryBusiness,
  getPrimaryMembership,
} from "@/lib/auth/business";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/team");
  }

  const membership = await getPrimaryMembership(user.id);
  const business = await getPrimaryBusiness(user.id);

  if (!membership || !business) {
    redirect("/onboarding");
  }

  const isOwner = membership.role === "business_owner";

  const { data: teamRows, error: teamError } = await supabase.rpc(
    "list_business_team",
  );

  if (teamError) {
    console.error("list_business_team error", teamError.message);
  }

  const members: TeamMemberRow[] = (teamRows ?? []).map((row) => ({
    membershipId: row.membership_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    email: row.email,
    fullName: row.full_name,
    isCurrentUser: row.user_id === user.id,
  }));

  let invitations: PendingInvitationRow[] = [];
  if (isOwner) {
    const { data: inviteRows, error: inviteError } = await supabase.rpc(
      "list_pending_invitations",
    );
    if (inviteError) {
      console.error("list_pending_invitations error", inviteError.message);
    } else {
      invitations = (inviteRows ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        acceptedAt: row.accepted_at,
        revokedAt: row.revoked_at,
      }));
    }
  }

  return (
    <main>
      <TeamManager
        isOwner={isOwner}
        members={members}
        invitations={invitations}
      />
    </main>
  );
}
