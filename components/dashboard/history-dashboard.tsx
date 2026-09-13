"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnalyticsPreset } from "@/lib/analytics/metrics";
import {
  HISTORY_OUTCOMES,
  HISTORY_PAGE_SIZE,
  formatHistoryTimestamp,
  formatHistoryWait,
  historyOutcomeLabel,
  historyRowKey,
  historyTotalPages,
  type HistoryRow,
} from "@/lib/dashboard/history";
import { cn } from "@/lib/utils";

type HistoryDashboardProps = {
  initialPreset: AnalyticsPreset;
  customStart: string | null;
  customEnd: string | null;
  queueId: string | null;
  outcome: string | null;
  page: number;
  rows: HistoryRow[];
  totalCount: number;
  queues: { id: string; name: string }[];
  error: string | null;
};

const PRESETS: { value: AnalyticsPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

export function HistoryDashboard({
  initialPreset,
  customStart,
  customEnd,
  queueId,
  outcome,
  page,
  rows,
  totalCount,
  queues,
  error,
}: HistoryDashboardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const totalPages = historyTotalPages(totalCount, HISTORY_PAGE_SIZE);

  function navigate(next: {
    range?: AnalyticsPreset;
    from?: string | null;
    to?: string | null;
    queue?: string | null;
    outcome?: string | null;
    page?: number;
  }) {
    const params = new URLSearchParams();
    const range = next.range ?? initialPreset;
    params.set("range", range);
    const from = next.from === undefined ? customStart : next.from;
    const to = next.to === undefined ? customEnd : next.to;
    if (range === "custom") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    const q = next.queue === undefined ? queueId : next.queue;
    if (q) params.set("queue", q);
    const o = next.outcome === undefined ? outcome : next.outcome;
    if (o) params.set("outcome", o);
    const p = next.page ?? 1;
    if (p > 1) params.set("page", String(p));

    startTransition(() => {
      router.push(`/dashboard/history?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Queue history
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Review completed, skipped, no-show, and cancelled tickets. For
          aggregates and trends, use{" "}
          <Link
            href="/dashboard/analytics"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Analytics
          </Link>
          .
        </p>
      </div>

      <form
        className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const range = String(form.get("range") || "today") as AnalyticsPreset;
          navigate({
            range,
            from: String(form.get("from") || "") || null,
            to: String(form.get("to") || "") || null,
            queue: String(form.get("queue") || "") || null,
            outcome: String(form.get("outcome") || "") || null,
            page: 1,
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="history-range">Date range</Label>
            <select
              id="history-range"
              name="range"
              defaultValue={initialPreset}
              className={selectClassName}
            >
              {PRESETS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="history-from">From (UTC)</Label>
            <Input
              id="history-from"
              name="from"
              type="date"
              defaultValue={customStart ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="history-to">To (UTC)</Label>
            <Input
              id="history-to"
              name="to"
              type="date"
              defaultValue={customEnd ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="history-queue">Queue</Label>
            <select
              id="history-queue"
              name="queue"
              defaultValue={queueId ?? ""}
              className={selectClassName}
            >
              <option value="">All queues</option>
              {queues.map((queue) => (
                <option key={queue.id} value={queue.id}>
                  {queue.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="history-outcome">Final status</Label>
            <select
              id="history-outcome"
              name="outcome"
              defaultValue={outcome ?? ""}
              className={selectClassName}
            >
              <option value="">All terminal</option>
              {HISTORY_OUTCOMES.map((item) => (
                <option key={item} value={item}>
                  {historyOutcomeLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Loading…" : "Apply filters"}
        </Button>
      </form>

      {error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!error && rows.length === 0 ? (
        <p
          className="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted"
          role="status"
        >
          No queue history matches these filters.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            Showing {(page - 1) * HISTORY_PAGE_SIZE + 1}–
            {Math.min(page * HISTORY_PAGE_SIZE, totalCount)} of {totalCount}
          </p>

          <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-3 py-3 font-medium">Joined</th>
                  <th className="px-3 py-3 font-medium">#</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Queue</th>
                  <th className="px-3 py-3 font-medium">Service</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Wait</th>
                  <th className="px-3 py-3 font-medium">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={historyRowKey(row)}>
                    <td className="px-3 py-3 text-muted">
                      {formatHistoryTimestamp(row.joined_at)}
                    </td>
                    <td className="px-3 py-3 font-display font-semibold text-foreground">
                      {row.queue_number}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-foreground">
                        {row.customer_name}
                      </div>
                      {row.customer_phone || row.customer_email ? (
                        <div className="mt-0.5 text-xs text-muted">
                          {[row.customer_phone, row.customer_email]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-foreground">{row.queue_name}</td>
                    <td className="px-3 py-3 text-muted">{row.service_name}</td>
                    <td className="px-3 py-3">
                      <OutcomeBadge outcome={row.outcome} />
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {formatHistoryWait(row.wait_seconds)}
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {formatHistoryTimestamp(
                        row.cancelled_at ?? row.completed_at,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li
                key={historyRowKey(row)}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold text-foreground">
                      #{row.queue_number} · {row.customer_name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {row.queue_name} · {row.service_name}
                    </p>
                  </div>
                  <OutcomeBadge outcome={row.outcome} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                  <div>
                    <dt>Joined</dt>
                    <dd className="text-foreground">
                      {formatHistoryTimestamp(row.joined_at)}
                    </dd>
                  </div>
                  <div>
                    <dt>Finished</dt>
                    <dd className="text-foreground">
                      {formatHistoryTimestamp(
                        row.cancelled_at ?? row.completed_at,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Wait</dt>
                    <dd className="text-foreground">
                      {formatHistoryWait(row.wait_seconds)}
                    </dd>
                  </div>
                  <div>
                    <dt>Called</dt>
                    <dd className="text-foreground">
                      {formatHistoryTimestamp(
                        row.called_at ?? row.serving_at,
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || page <= 1}
              onClick={() => navigate({ page: page - 1 })}
              aria-label="Previous page"
            >
              Previous
            </Button>
            <p className="text-sm text-muted">
              Page {page} of {totalPages}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || page >= totalPages}
              onClick={() => navigate({ page: page + 1 })}
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        outcome === "completed" && "bg-accent-soft text-accent",
        outcome === "cancelled" && "bg-background text-foreground",
        (outcome === "skipped" || outcome === "no_show") &&
          "bg-background text-muted",
      )}
    >
      {historyOutcomeLabel(outcome)}
    </span>
  );
}

const selectClassName = cn(
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground",
  "focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30",
);
