import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  QueueEntriesManager,
  type QueueEntry,
} from "@/components/dashboard/queue-entries-manager";
import {
  QueueDetail,
  type QueueDetailData,
} from "@/components/dashboard/queue-detail";
import { requirePrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";
import { buildPublicQueueUrl } from "@/lib/public-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Queue details",
};

type QueueDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function QueueDetailPage({ params }: QueueDetailPageProps) {
  const { id } = await params;
  const user = await requireAuthUser();
  const business = await requirePrimaryBusiness(user.id);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("queues")
    .select(
      "id, business_id, service_id, name, status, current_number, created_at, updated_at, services(id, name, average_service_minutes, is_active, description)",
    )
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (error) {
    console.error("QueueDetailPage error", error.message);
  }

  if (!data) {
    notFound();
  }

  const { data: entries, error: entriesError } = await supabase
    .from("queue_entries")
    .select("id, public_id, customer_name, customer_phone, queue_number, status, joined_at")
    .eq("queue_id", id)
    .eq("business_id", business.id)
    .order("joined_at", { ascending: true });

  if (entriesError) console.error("QueueDetailPage entries error", entriesError.message);

  return (
    <main className="space-y-6">
      <QueueDetail
        queue={data as QueueDetailData}
        businessSlug={business.slug}
        businessName={business.name}
        publicQueueUrl={buildPublicQueueUrl(business.slug)}
      />
      <QueueEntriesManager
        queueId={id}
        queueStatus={data.status}
        entries={(entries ?? []) as QueueEntry[]}
      />
    </main>
  );
}
