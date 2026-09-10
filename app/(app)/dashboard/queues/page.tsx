import type { Metadata } from "next";

import {
  QueuesManager,
  type QueueListItem,
} from "@/components/dashboard/queues-manager";
import { requirePrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Queues",
};

export default async function QueuesPage() {
  const user = await requireAuthUser();
  const business = await requirePrimaryBusiness(user.id);
  const supabase = await createClient();

  const [queuesResult, servicesResult] = await Promise.all([
    supabase
      .from("queues")
      .select(
        "id, business_id, service_id, name, status, current_number, created_at, updated_at, services(id, name, is_active)",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("services")
      .select("id, name, is_active")
      .eq("business_id", business.id)
      .order("name", { ascending: true }),
  ]);

  if (queuesResult.error) {
    console.error("QueuesPage queues error", queuesResult.error.message);
  }
  if (servicesResult.error) {
    console.error("QueuesPage services error", servicesResult.error.message);
  }

  const queues = (queuesResult.data ?? []) as QueueListItem[];

  return (
    <main>
      <QueuesManager
        queues={queues}
        services={servicesResult.data ?? []}
      />
      {queuesResult.error || servicesResult.error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          Could not load queues. Please refresh and try again.
        </p>
      ) : null}
    </main>
  );
}
