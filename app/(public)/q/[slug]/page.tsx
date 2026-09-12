import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JoinQueueForm } from "@/components/join/join-queue-form";
import { PublicQueuesLiveRefresh } from "@/components/join/public-queues-live-refresh";
import {
  mapPublicBusinessProfile,
  publicQueueThemeClass,
  type BrandingTheme,
} from "@/lib/business/settings";
import {
  formatWaitingCapacityLabel,
  isQueueAtCapacity,
} from "@/lib/dashboard/queue-capacity";
import { queueStatusLabel, type QueueStatus } from "@/lib/dashboard/queue-status";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Join queue" };

type JoinPageProps = { params: Promise<{ slug: string }> };

type PublicQueue = {
  business_name: string;
  business_slug: string;
  public_description: string | null;
  public_instructions: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  branding_theme: string | null;
  queue_id: string;
  queue_name: string;
  queue_status: QueueStatus;
  current_number: number;
  waiting_count: number;
  max_waiting_customers: number | null;
  service_name: string;
  service_description: string | null;
  average_service_minutes: number;
};

function statusMessage(status: QueueStatus, isFull: boolean): string {
  if (status === "open" && isFull) {
    return "Queue full. Please try again later.";
  }
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

function queueCardClass(theme: BrandingTheme): string {
  switch (theme) {
    case "minimal":
      return "rounded-xl border border-border/70 bg-surface/80 p-5";
    case "warm":
      return "rounded-2xl border border-border bg-surface p-5 shadow-sm";
    case "professional":
      return "rounded-lg border border-border bg-surface p-5";
    case "default":
    default:
      return "rounded-2xl border border-border bg-surface p-5 shadow-sm";
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

  const profile = mapPublicBusinessProfile(queues[0]);
  const themeClass = publicQueueThemeClass(profile.brandingTheme);
  const hasContact = Boolean(profile.contactEmail || profile.contactPhone);
  const queueIds = queues.map((queue) => queue.queue_id);

  return (
    <>
      <PublicQueuesLiveRefresh queueIds={queueIds} />
      <main
        className={cn(
          "mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 lg:px-8",
          themeClass,
        )}
      >
        <div
          className={cn(
            "mb-8",
            profile.brandingTheme === "professional" &&
              "border-b border-border pb-6",
            profile.brandingTheme === "minimal" && "mb-6",
          )}
        >
          <h1
            className={cn(
              "font-display font-semibold tracking-tight text-foreground",
              profile.brandingTheme === "professional"
                ? "text-2xl sm:text-3xl"
                : "text-3xl",
              profile.brandingTheme === "warm" && "text-accent",
            )}
          >
            {profile.businessName}
          </h1>
          {profile.publicDescription ? (
            <p className="mt-3 text-base leading-relaxed text-muted">
              {profile.publicDescription}
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-relaxed text-muted">
            No account needed. After you join, keep your ticket page open to
            follow your place in line.
          </p>
        </div>

        <div className="space-y-4">
          {queues.map((queue) => {
            const waitingCount = queue.waiting_count ?? 0;
            const isFull = isQueueAtCapacity(
              waitingCount,
              queue.max_waiting_customers,
            );
            const canJoin = queue.queue_status === "open" && !isFull;

            return (
              <section
                key={queue.queue_id}
                className={queueCardClass(profile.brandingTheme)}
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
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {formatWaitingCapacityLabel(
                        waitingCount,
                        queue.max_waiting_customers,
                      )}
                    </p>
                    {isFull && queue.queue_status === "open" ? (
                      <p className="mt-2 text-sm text-danger" role="status">
                        Queue full. {waitingCount} people are currently waiting.
                        Please try again later.
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-medium",
                      queue.queue_status === "open" &&
                        !isFull &&
                        "bg-accent-soft text-accent",
                      queue.queue_status === "open" &&
                        isFull &&
                        "bg-danger/10 text-danger",
                      queue.queue_status === "paused" &&
                        "bg-background text-foreground",
                      queue.queue_status === "closed" &&
                        "bg-background text-muted",
                    )}
                  >
                    {queue.queue_status === "open" && isFull
                      ? "Full"
                      : queueStatusLabel(queue.queue_status)}
                  </span>
                </div>

                <p
                  className={cn(
                    "mt-4 text-sm",
                    canJoin ? "text-muted" : "text-foreground",
                  )}
                  role="status"
                >
                  {statusMessage(queue.queue_status, isFull)}
                </p>

                <div className="mt-5 border-t border-border pt-5">
                  <JoinQueueForm
                    queueId={queue.queue_id}
                    queueStatus={queue.queue_status}
                    isFull={isFull}
                  />
                </div>
              </section>
            );
          })}
        </div>

        {profile.publicInstructions ? (
          <section className="mt-8 rounded-xl border border-border bg-surface/60 px-5 py-4">
            <h2 className="text-sm font-medium text-foreground">
              Before you join
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {profile.publicInstructions}
            </p>
          </section>
        ) : null}

        {hasContact ? (
          <section className="mt-6 text-sm text-muted">
            <h2 className="font-medium text-foreground">Contact</h2>
            <ul className="mt-2 space-y-1">
              {profile.contactEmail ? (
                <li>
                  <span className="text-muted">Email: </span>
                  <span className="text-foreground">{profile.contactEmail}</span>
                </li>
              ) : null}
              {profile.contactPhone ? (
                <li>
                  <span className="text-muted">Phone: </span>
                  <span className="text-foreground">{profile.contactPhone}</span>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
