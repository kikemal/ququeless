import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JoinQueueForm } from "@/components/join/join-queue-form";
import { queueStatusLabel, type QueueStatus } from "@/lib/dashboard/queue-status";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Join queue" };

type JoinPageProps = { params: Promise<{ slug: string }> };

type PublicQueue = {
  business_name: string;
  business_slug: string;
  queue_id: string;
  queue_name: string;
  queue_status: QueueStatus;
  current_number: number;
  service_name: string;
  service_description: string | null;
  average_service_minutes: number;
};

function statusMessage(status: QueueStatus): string {
  switch (status) {
    case "open":
      return "This queue is open. Enter your details to join.";
    case "paused":
      return "This queue is paused. Joining is temporarily unavailable.";
    case "closed":
      return "This queue is closed and not accepting customers.";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export default async function JoinQueuePage({ params }: JoinPageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_queues", {
    p_slug: slug,
  });

  if (error) {
    console.error("JoinQueuePage error", error.code);
  }

  const queues = (data ?? []) as PublicQueue[];
  if (queues.length === 0) {
    notFound();
  }

  const businessName = queues[0].business_name;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-accent">{businessName}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
          Join a queue
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          No account needed. After you join, keep your ticket page open to follow
          your place in line.
        </p>
      </div>

      <div className="space-y-4">
        {queues.map((queue) => {
          const canJoin = queue.queue_status === "open";

          return (
            <section
              key={queue.queue_id}
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    {queue.service_name}
                  </h2>
                  <p className="mt-1 text-sm text-muted">{queue.queue_name}</p>
                  {queue.service_description ? (
                    <p className="mt-3 text-sm leading-relaxed text-muted">
                      {queue.service_description}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-muted">
                    About {queue.average_service_minutes} min per customer ·
                    Current number {queue.current_number}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-medium",
                    queue.queue_status === "open" &&
                      "bg-accent-soft text-accent",
                    queue.queue_status === "paused" &&
                      "bg-background text-foreground",
                    queue.queue_status === "closed" &&
                      "bg-background text-muted",
                  )}
                >
                  {queueStatusLabel(queue.queue_status)}
                </span>
              </div>

              <p
                className={cn(
                  "mt-4 text-sm",
                  canJoin ? "text-muted" : "text-foreground",
                )}
                role="status"
              >
                {statusMessage(queue.queue_status)}
              </p>

              <div className="mt-5 border-t border-border pt-5">
                <JoinQueueForm
                  queueId={queue.queue_id}
                  queueStatus={queue.queue_status}
                />
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
