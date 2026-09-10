import type { Metadata } from "next";

import { TicketView } from "@/components/ticket/ticket-view";

export const metadata: Metadata = { title: "Your ticket" };

type TicketPageProps = { params: Promise<{ publicId: string }> };

export default async function TicketPage({ params }: TicketPageProps) {
  const { publicId } = await params;
  return <TicketView publicId={publicId} />;
}
