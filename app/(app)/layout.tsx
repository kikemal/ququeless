import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getProfileSummary, requirePrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthUser();
  const business = await requirePrimaryBusiness(user.id);
  const profile = await getProfileSummary(user.id);

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  const userName =
    profile?.full_name?.trim() ||
    metadataName ||
    user.email?.split("@")[0] ||
    "Account";
  const userEmail = profile?.email || user.email || "";

  return (
    <DashboardShell
      businessName={business.name}
      userName={userName}
      userEmail={userEmail}
    >
      {children}
    </DashboardShell>
  );
}
