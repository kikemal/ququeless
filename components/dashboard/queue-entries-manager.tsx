"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition, type ReactNode } from "react";

import {
  callNextEntryAction,
  transitionEntryAction,
} from "@/app/(app)/dashboard/queues/[id]/actions";
import { LiveStatusBadge } from "@/components/ui/live-status-badge";
import { Button } from "@/components/ui/button";
import { useQueueEntriesLive } from "@/hooks/use-live-queue";
import {
  callNextDisableReason,
  callNextDisabledMessage,
  callNextPendingKey,
  entryActionPendingKey,
  entryStatusLabel,
  formatJoinedTime,
  formatWaitingDuration,
  isDestructiveStaffAction,
  partitionQueueEntries,
  staffActionLabel,
  staffActionsForStatus,
  type StaffEntryAction,
} from "@/lib/dashboard/queue-workflow";
import { cn } from "@/lib/utils";
import type { Enums, Tables } from "@/types/database";

export type QueueEntry = Pick<
  Tables<"queue_entries">,
  | "id"
  | "public_id"
  | "customer_name"
  | "customer_phone"
  | "customer_email"
  | "email_notifications_enabled"
  | "queue_number"
  | "status"
  | "joined_at"
> & {
  latest_notification_status?: string | null;
  latest_notification_type?: string | null;
};

type Props = {
  queueId: string;
  queueStatus: Enums<"queue_status">;
  entries: QueueEntry[];
};

export function QueueEntriesManager({
  queueId,
  queueStatus,
  entries,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const liveStatus = useQueueEntriesLive({
    queueId,
    onChange: refresh,
  });

  const { waiting, active, terminal, counts } = partitionQueueEntries(entries);
  const disableReason = callNextDisableReason({
    queueStatus,
    waitingCount: counts.waiting,
    pending: isPending,
  });
  const callNextHint = callNextDisabledMessage(disableReason);

  function run(
    key: string,
    task: () => Promise<{ error?: string; success?: boolean; message?: string }>,
  ) {
    if (isPending) {
      return;
    }
    setError(null);
    setMessage(null);
    setPendingKey(key);
    startTransition(async () => {
      try {
        const result = await task();
        if (result.error) {
          setError(result.error);
          return;
        }
        setMessage(result.message ?? "Updated.");
        router.refresh();
      } finally {
        setPendingKey(null);
      }
    });
  }

  function runTransition(entry: QueueEntry, action: StaffEntryAction) {
    if (isDestructiveStaffAction(action)) {
      const label =
        action === "no_show"
          ? `Mark #${entry.queue_number} ${entry.customer_name} as no-show?`
          : `Skip #${entry.queue_number} ${entry.customer_name}?`;
      if (!window.confirm(label)) {
        return;
      }
    }
    run(entryActionPendingKey(entry.id, action), () =>
      transitionEntryAction(entry.id, action),
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-semibold text-foreground">
                Queue workflow
              </h2>
              <LiveStatusBadge status={liveStatus} />
            </div>
            <p className="mt-2 text-sm text-muted" aria-live="polite">
              {counts.waiting} waiting · {counts.called + counts.serving}{" "}
              active · {counts.completed} completed · {counts.skipped} skipped ·{" "}
              {counts.no_show} no-show
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <Button
              type="button"
              disabled={disableReason !== null}
              onClick={() =>
                run(callNextPendingKey(), () => callNextEntryAction(queueId))
              }
              aria-label="Call next waiting customer"
            >
              {pendingKey === callNextPendingKey()
                ? "Calling…"
                : "Call next"}
            </Button>
            {callNextHint && disableReason !== "pending" ? (
              <p className="text-xs text-muted" role="status">
                {callNextHint}
              </p>
            ) : null}
          </div>
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
      </div>

      <WorkflowSection
        title="Now serving"
        empty="No customers are being called or served right now."
        hasItems={active.length > 0}
      >
        <ul className="divide-y divide-border">
          {active.map((entry) => (
            <CustomerRow
              key={entry.id}
              entry={entry}
              showWaitDuration={false}
              isPending={isPending}
              pendingKey={pendingKey}
              onAction={runTransition}
            />
          ))}
        </ul>
      </WorkflowSection>

      <WorkflowSection
        title="Waiting"
        empty="No customers are waiting."
        count={counts.waiting}
        hasItems={waiting.length > 0}
      >
        <ul className="divide-y divide-border">
          {waiting.map((entry) => (
            <CustomerRow
              key={entry.id}
              entry={entry}
              showWaitDuration
              isPending={isPending}
              pendingKey={pendingKey}
              onAction={runTransition}
            />
          ))}
        </ul>
      </WorkflowSection>

      <WorkflowSection
        title="Finished"
        empty="No completed, skipped, or no-show customers yet."
        count={terminal.length}
        hasItems={terminal.length > 0}
        footer={
          terminal.length > 0 ? (
            <p className="mt-4 text-sm text-muted">
              Showing the {Math.min(12, terminal.length)} most recent.
              {terminal.length > 12 ? " " : " "}
              <Link
                href={`/dashboard/history?queue=${encodeURIComponent(queueId)}`}
                className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                View full history
              </Link>
            </p>
          ) : null
        }
      >
        <ul className="divide-y divide-border">
          {[...terminal]
            .reverse()
            .slice(0, 12)
            .map((entry) => (
              <CustomerRow
                key={entry.id}
                entry={entry}
                showWaitDuration={false}
                isPending={isPending}
                pendingKey={pendingKey}
                onAction={runTransition}
                readOnly
              />
            ))}
        </ul>
      </WorkflowSection>
    </section>
  );
}

function WorkflowSection({
  title,
  empty,
  count,
  hasItems,
  footer,
  children,
}: {
  title: string;
  empty: string;
  count?: number;
  hasItems: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h3 className="font-display text-base font-semibold text-foreground">
        {title}
        {typeof count === "number" ? (
          <span className="ml-2 text-sm font-normal text-muted">({count})</span>
        ) : null}
      </h3>
      {!hasItems ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          {empty}
        </p>
      ) : (
        <div className="mt-4">{children}</div>
      )}
      {footer}
    </section>
  );
}

function CustomerRow({
  entry,
  showWaitDuration,
  isPending,
  pendingKey,
  onAction,
  readOnly = false,
}: {
  entry: QueueEntry;
  showWaitDuration: boolean;
  isPending: boolean;
  pendingKey: string | null;
  onAction: (entry: QueueEntry, action: StaffEntryAction) => void;
  readOnly?: boolean;
}) {
  const actions = readOnly ? [] : staffActionsForStatus(entry.status);
  const waitLabel = showWaitDuration
    ? formatWaitingDuration(entry.joined_at)
    : null;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-display text-xl font-semibold text-foreground">
            #{entry.queue_number}
          </p>
          <p className="truncate font-medium text-foreground">
            {entry.customer_name}
          </p>
          <span
            className={cn(
              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
              entry.status === "serving" && "bg-accent text-white",
              entry.status === "called" &&
                "border border-accent/50 bg-accent-soft/40 text-accent",
              entry.status === "waiting" && "bg-background text-muted",
              (entry.status === "completed" ||
                entry.status === "skipped" ||
                entry.status === "no_show") &&
                "bg-background text-muted",
            )}
          >
            {entry.status === "serving"
              ? "Now serving"
              : entry.status === "called"
                ? "At desk"
                : entryStatusLabel(entry.status)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Joined {formatJoinedTime(entry.joined_at)}
          {waitLabel ? ` · Waiting ${waitLabel}` : null}
          {entry.customer_phone ? ` · ${entry.customer_phone}` : null}
        </p>
        {entry.email_notifications_enabled ? (
          <p className="mt-1 text-xs text-muted">
            Email updates on
            {entry.latest_notification_status
              ? ` · ${entry.latest_notification_type ?? "update"} ${entry.latest_notification_status}`
              : ""}
          </p>
        ) : null}
      </div>

      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {actions.map((action) => {
            const key = entryActionPendingKey(entry.id, action);
            const thisPending = pendingKey === key;
            const destructive = isDestructiveStaffAction(action);
            return (
              <Button
                key={action}
                type="button"
                variant={
                  action === "completed"
                    ? "primary"
                    : destructive
                      ? "ghost"
                      : "secondary"
                }
                className={cn(
                  "h-9 px-3 text-xs",
                  destructive && "text-danger",
                )}
                disabled={isPending}
                aria-label={`${staffActionLabel(action)} for ticket ${entry.queue_number}`}
                onClick={() => onAction(entry, action)}
              >
                {thisPending ? "Working…" : staffActionLabel(action)}
              </Button>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}
