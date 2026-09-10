import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { PhasePlaceholder } from "@/components/ui/phase-placeholder";

export const metadata: Metadata = {
  title: "Your ticket",
};

type TicketPageProps = {
  params: Promise<{ publicId: string }>;
};

export default async function TicketPage({ params }: TicketPageProps) {
  const { publicId } = await params;

  return (
    <PhasePlaceholder
      title="Your ticket"
      description={`Ticket “${publicId}” will show live position, estimated wait, and call status in a later phase. No queue data is loaded yet.`}
      phase="Phase 4"
    >
      <Button href="/" variant="secondary">
        Back to home
      </Button>
    </PhasePlaceholder>
  );
}
