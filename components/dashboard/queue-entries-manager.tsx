"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import {
  callNextEntryAction,
  transitionEntryAction,
} from "@/app/(app)/dashboard/queues/[id]/actions";
import { LiveStatusBadge } from "@/components/ui/live-status-badge";
import { Button } from "@/components/ui/button";
import { useQueueEntriesLive } from "@/hooks/use-live-queue";
import type { Enums, Tables } from "@/types/database";

export type QueueEntry = Pick<
  Tables<"queue_entries">,
  | "id"
  | "public_id"
  | "customer_name"
  | "customer_phone"
  | "queue_number"
  | "status"
  | "joined_at"
>;

type Props = {
  queueId: string;
  queueStatus: Enums<"queue_status">;
  entries: QueueEntry[];
};

const activeStatuses = new Set<Enums<"entry_status">>([
  "waiting",
  "called",
  "serving",
]);

export function QueueEntriesManager({
  queueId,
  queueStatus,
  entries,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const liveStatus = useQueueEntriesLive({
    queueId,
    onChange: refresh,
  });

  const active = entries.filter((entry) => activeStatuses.has(entry.status));
  const waitingCount = entries.filter((entry) => entry.status === "waiting")
    .length;

  function run(
    task: () => Promise<{ error?: string; success?: boolean; message?: string }>,
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Updated.");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Customers
            </h2>
            <LiveStatusBadge status={liveStatus} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {active.length} active · {waitingCount} waiting
          </p>
        </div>
        <Button
          type="button"
          disabled={isPending || queueStatus !== "open" || waitingCount === 0}
          onClick={() => run(() => callNextEntryAction(queueId))}
        >
          {isPending ? "Working…" : "Call next"}
        </Button>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {message && !error ? (
        <p
          className="mt-4 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent"
          role="status"
        >
          {message}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          No customers have joined this queue yet.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-3 py-3 font-medium">#</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Joined</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-4 font-display font-semibold text-foreground">
                    {entry.queue_number}
                  </td>
                  <td className="px-3 py-4">
                    <div className="font-medium text-foreground">
                      {entry.customer_name}
                    </div>
                    {entry.customer_phone ? (
                      <div className="mt-1 text-xs text-muted">
                        {entry.customer_phone}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-4 text-muted">
                    {new Intl.DateTimeFormat(undefined, {
                      timeStyle: "short",
                    }).format(new Date(entry.joined_at))}
                  </td>
                  <td className="px-3 py-4 capitalize text-muted">
                    {entry.status.replace("_", " ")}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      {entry.status === "called" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                          disabled={isPending}
                          onClick={() =>
                            run(() =>
                              transitionEntryAction(entry.id, "serving"),
                            )
                          }
                        >
                          Start serving
                        </Button>
                      ) : null}
                      {entry.status === "serving" ? (
                        <Button
                          type="button"
                          className="h-9 px-3 text-xs"
                          disabled={isPending}
                          onClick={() =>
                            run(() =>
                              transitionEntryAction(entry.id, "completed"),
                            )
                          }
                        >
                          Complete
                        </Button>
                      ) : null}
                      {entry.status === "waiting" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 px-3 text-xs text-danger"
                          disabled={isPending}
                          onClick={() =>
                            run(() =>
                              transitionEntryAction(entry.id, "skipped"),
                            )
                          }
                        >
                          Skip
                        </Button>
                      ) : null}
                      {entry.status === "called" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 px-3 text-xs text-danger"
                          disabled={isPending}
                          onClick={() =>
                            run(() =>
                              transitionEntryAction(entry.id, "no_show"),
                            )
                          }
                        >
                          No-show
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
