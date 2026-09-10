import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requirePrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
      activeServicesResult.error.message,
    );
  }
  if (queuesResult.error) {
    console.error("Dashboard queues count", queuesResult.error.message);
  }
  if (openQueuesResult.error) {
    console.error("Dashboard open queues count", openQueuesResult.error.message);
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
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Get started
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Create a service, then open a queue for it. Customer joining and QR
            codes come later.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button href="/dashboard/services">Create your first service</Button>
            <Button href="/dashboard/queues" variant="secondary">
              View queues
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button href="/dashboard/services">Manage services</Button>
          <Button href="/dashboard/queues" variant="secondary">
            Manage queues
          </Button>
          <Link
            href="/dashboard/services"
            className="inline-flex h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Add another service
          </Link>
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
