import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JoinQueueForm } from "@/components/join/join-queue-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join queue" };

type JoinPageProps = { params: Promise<{ slug: string }> };

type PublicQueue = {
  business_name: string;
  business_slug: string;
  queue_id: string;
  queue_name: string;
  queue_status: "open" | "paused" | "closed";
  current_number: number;
  service_name: string;
  service_description: string | null;
  average_service_minutes: number;
};

export default async function JoinQueuePage({ params }: JoinPageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_queues", { p_slug: slug });

  if (error) {
    console.error("JoinQueuePage error", error.message);
  }

  const queues = (data ?? []) as PublicQueue[];
  if (queues.length === 0) notFound();

  const business = queues[0];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-accent">{business.business_name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
          Choose a service
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Join without creating an account. Keep your ticket page open to follow your place in line.
        </p>
      </div>

      <div className="space-y-4">
        {queues.map((queue) => (
          <section key={queue.queue_id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-foreground">{queue.service_name}</h2>
                <p className="mt-1 text-sm text-muted">{queue.queue_name}</p>
                {queue.service_description ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted">{queue.service_description}</p>
                ) : null}
                <p className="mt-3 text-xs text-muted">
                  About {queue.average_service_minutes} min per customer · Current number {queue.current_number}
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-accent-soft px-3 py-1 text-xs font-medium capitalize text-accent">
                {queue.queue_status}
              </span>
            </div>
            <div className="mt-5 border-t border-border pt-5">
              <JoinQueueForm queueId={queue.queue_id} queueStatus={queue.queue_status} />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
