import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/ui/phase-placeholder";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return (
    <PhasePlaceholder
      title="Platform admin"
      description="Super-admin tools for listing and suspending tenants will be added after core multi-tenancy is live. No tenant data is shown here yet."
      phase="a later phase"
    />
  );
}
