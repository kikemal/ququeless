import type { Metadata } from "next";
import Link from "next/link";

import { PublicQueueQr } from "@/components/dashboard/public-queue-qr";
import { Button } from "@/components/ui/button";
import { requirePrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";
import { buildPublicQueueUrl } from "@/lib/public-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "QR Code",
};

export default async function QrPage() {
  const user = await requireAuthUser();
  const business = await requirePrimaryBusiness(user.id);
  const supabase = await createClient();
  const publicQueueUrl = buildPublicQueueUrl(business.slug);

  const { data: queues } = await supabase
    .from("queues")
    .select("id, name, services(name)")
    .eq("business_id", business.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const primaryQueue = queues?.[0] ?? null;
  const serviceRelation = primaryQueue?.services as
    | { name: string }
    | { name: string }[]
    | null
    | undefined;
  const serviceName = Array.isArray(serviceRelation)
    ? serviceRelation[0]?.name
    : serviceRelation?.name;

  return (
    <main className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          QR Code
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          Share this code so customers can open your public queue page and join
          without an account.
        </p>
      </div>

      {publicQueueUrl ? (
        <PublicQueueQr
          publicQueueUrl={publicQueueUrl}
          businessName={business.name}
          queueName={primaryQueue?.name ?? "All public queues"}
          serviceName={serviceName ?? "Scan to join any open queue"}
          slug={business.slug}
        />
      ) : (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">
          Public queue URL is unavailable. Set NEXT_PUBLIC_APP_URL.
        </p>
      )}

      {primaryQueue ? (
        <Button href={`/dashboard/queues/${primaryQueue.id}`} variant="secondary">
          Open queue details
        </Button>
      ) : (
        <p className="text-sm text-muted">
          Create a queue to manage customers after they scan.{" "}
          <Link
            href="/dashboard/queues"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Go to queues
          </Link>
        </p>
      )}
    </main>
  );
}
