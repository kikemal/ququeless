"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setQueueStatusAction } from "@/app/(app)/dashboard/queues/actions";
import { PublicQueueQr } from "@/components/dashboard/public-queue-qr";
import { StatusBadge } from "@/components/dashboard/queues-manager";
import { Button } from "@/components/ui/button";
import {
  QUEUE_STATUSES,
  queueStatusLabel,
  type QueueStatus,
} from "@/lib/dashboard/queue-status";
import type { Tables } from "@/types/database";

export type QueueDetailData = Tables<"queues"> & {
  services: Pick<
    Tables<"services">,
    "id" | "name" | "average_service_minutes" | "is_active" | "description"
  > | null;
};

type QueueDetailProps = {
  queue: QueueDetailData;
  businessSlug: string;
  businessName: string;
  publicQueueUrl: string | null;
};

function formatTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function QueueDetail({
  queue,
  businessSlug,
  businessName,
  publicQueueUrl,
}: QueueDetailProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeStatus(status: QueueStatus) {
    if (status === queue.status) {
      return;
    }

    const formData = new FormData();
    formData.set("queueId", queue.id);
    formData.set("status", status);

    startTransition(async () => {
      const result = await setQueueStatusAction(formData);
      if (result.error) {
        setError(result.error);
        setMessage(null);
        return;
      }
      setError(null);
      setMessage(result.message ?? "Queue status updated.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">
          <Link
            href="/dashboard/queues"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Queues
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">{queue.name}</span>
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {queue.name}
          </h1>
          <StatusBadge status={queue.status} />
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {message && !error ? (
        <p
          className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent"
          role="status"
        >
          {message}
        </p>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Connected service">
          {queue.services?.name ?? "Unknown service"}
          {queue.services && !queue.services.is_active ? (
            <span className="mt-1 block text-xs text-muted">Inactive</span>
          ) : null}
        </InfoCard>
        <InfoCard label="Average service time">
          {queue.services
            ? `${queue.services.average_service_minutes} min`
            : "—"}
        </InfoCard>
        <InfoCard label="Current number">{queue.current_number}</InfoCard>
        <InfoCard label="Status">{queueStatusLabel(queue.status)}</InfoCard>
        <InfoCard label="Created">{formatTimestamp(queue.created_at)}</InfoCard>
        <InfoCard label="Updated">{formatTimestamp(queue.updated_at)}</InfoCard>
      </dl>

      {queue.services?.description ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-medium text-muted">Service description</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {queue.services.description}
          </p>
        </section>
      ) : null}

      {publicQueueUrl ? (
        <PublicQueueQr
          publicQueueUrl={publicQueueUrl}
          businessName={businessName}
          queueName={queue.name}
          serviceName={queue.services?.name ?? "Service"}
          slug={businessSlug}
        />
      ) : (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Public Queue
          </h2>
          <p className="mt-2 text-sm text-muted" role="alert">
            Public queue URL is unavailable. Set NEXT_PUBLIC_APP_URL and check
            the business slug.
          </p>
          <Link
            href={`/q/${businessSlug}`}
            className="mt-3 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            /q/{businessSlug}
          </Link>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Queue status
        </h2>
        <p className="mt-1 text-sm text-muted">
          Open queues accept new customers. Paused and closed queues stop joining.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {QUEUE_STATUSES.map((status) => (
            <Button
              key={status}
              type="button"
              variant={queue.status === status ? "primary" : "secondary"}
              className="h-10 px-4 text-sm"
              disabled={isPending || queue.status === status}
              aria-pressed={queue.status === status}
              onClick={() => changeStatus(status)}
            >
              {isPending && queue.status !== status
                ? "Updating…"
                : queueStatusLabel(status)}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}
