import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  QueueDetail,
  type QueueDetailData,
} from "@/components/dashboard/queue-detail";
import { requirePrimaryBusiness } from "@/lib/auth/business";
import { requireAuthUser } from "@/lib/auth/session";
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

  return (
    <main>
      <QueueDetail queue={data as QueueDetailData} />
    </main>
  );
}
