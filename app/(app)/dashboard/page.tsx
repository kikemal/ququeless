import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DASHBOARD_GET_STARTED_DESCRIPTION } from "@/lib/ux/copy";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireAuthUser();
  const business = await requirePrimaryBusiness(user.id);
  const supabase = await createClient();

  const [activeServicesResult, queuesResult, openQueuesResult] =
    await Promise.all([
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("is_active", true),
      supabase
        .from("queues")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("queues")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("status", "open"),
    ]);

  if (activeServicesResult.error) {
    console.error(
      "Dashboard active services count",
      activeServicesResult.error.code,
    );
  }
  if (queuesResult.error) {
    console.error("Dashboard queues count", queuesResult.error.code);
  }
  if (openQueuesResult.error) {
    console.error("Dashboard open queues count", openQueuesResult.error.code);
  }

  const activeServices = activeServicesResult.count ?? 0;
  const totalQueues = queuesResult.count ?? 0;
  const openQueues = openQueuesResult.count ?? 0;
  const hasSetup = activeServices > 0 || totalQueues > 0;

  return (
    <main className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Welcome to QueueLess
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          {hasSetup
            ? `${business.name} overview based on your live services and queues.`
            : `${business.name} is ready. Start by creating your first service.`}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active services" value={activeServices} />
        <StatCard label="Queues" value={totalQueues} />
        <StatCard label="Open queues" value={openQueues} />
      </dl>

      {!hasSetup ? (
        <EmptyState
          title="Get started"
          description={DASHBOARD_GET_STARTED_DESCRIPTION}
          action={
            <>
              <Button href="/dashboard/services">Create your first service</Button>
              <Button href="/dashboard/queues" variant="secondary">
                View queues
              </Button>
              <Button href="/dashboard/qr" variant="secondary">
                QR code
              </Button>
            </>
          }
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button href="/dashboard/queues">Open queues</Button>
          <Button href="/dashboard/services" variant="secondary">
            Manage services
          </Button>
          <Button href="/dashboard/qr" variant="secondary">
            Share QR
          </Button>
          <Button href="/dashboard/history" variant="secondary">
            History
          </Button>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-2 font-display text-3xl font-semibold text-foreground">
        {value}
      </dd>
    </div>
  );
}
