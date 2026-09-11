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
    .select(
      "id, public_id, customer_name, customer_phone, customer_email, email_notifications_enabled, queue_number, status, joined_at",
    )
    .eq("queue_id", id)
    .eq("business_id", business.id)
    .order("joined_at", { ascending: true });

  if (entriesError) console.error("QueueDetailPage entries error", entriesError.message);

  const entryIds = (entries ?? []).map((entry) => entry.id);
  const notificationByEntry = new Map<
    string,
    { status: string; type: string }
  >();

  if (entryIds.length > 0) {
    const { data: notifications, error: notificationError } = await supabase
      .from("customer_notifications")
      .select("queue_entry_id, status, type, created_at")
      .eq("business_id", business.id)
      .in("queue_entry_id", entryIds)
      .order("created_at", { ascending: false });

    if (notificationError) {
      console.error("QueueDetailPage notifications error", notificationError.message);
    } else {
      for (const row of notifications ?? []) {
        if (!notificationByEntry.has(row.queue_entry_id)) {
          notificationByEntry.set(row.queue_entry_id, {
            status: row.status,
            type: row.type,
          });
        }
      }
    }
  }

  const enrichedEntries: QueueEntry[] = (entries ?? []).map((entry) => {
    const latest = notificationByEntry.get(entry.id);
    return {
      ...entry,
      latest_notification_status: latest?.status ?? null,
      latest_notification_type: latest?.type ?? null,
    };
  });

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
        entries={enrichedEntries}
      />
    </main>
  );
}
