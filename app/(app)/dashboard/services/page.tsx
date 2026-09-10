import type { Metadata } from "next";

import { ServicesManager } from "@/components/dashboard/services-manager";
import { requirePrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Services",
};

export default async function ServicesPage() {
  const user = await requireAuthUser();
  const business = await requirePrimaryBusiness(user.id);
  const supabase = await createClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("ServicesPage load error", error.message);
  }

  return (
    <main>
      <ServicesManager services={services ?? []} />
      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          Could not load services. Please refresh and try again.
        </p>
      ) : null}
    </main>
  );
}
