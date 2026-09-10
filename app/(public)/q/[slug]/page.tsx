import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { PhasePlaceholder } from "@/components/ui/phase-placeholder";

export const metadata: Metadata = {
  title: "Join queue",
};

type JoinPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function JoinQueuePage({ params }: JoinPageProps) {
  const { slug } = await params;

  return (
    <PhasePlaceholder
      title="Join this queue"
      description={`The public join experience for “${slug}” will be implemented in a later phase. Customers will select a service, enter their name, and receive a live ticket—no app and no account.`}
      phase="Phase 4"
    >
      <Button href="/" variant="secondary">
        Back to home
      </Button>
    </PhasePlaceholder>
  );
}
