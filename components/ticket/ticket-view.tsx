"use client";

import { useCallback, useEffect, useState } from "react";

import {
  cancelTicketAction,
  getTicketAction,
  type TicketData,
} from "@/app/(public)/ticket/[publicId]/actions";
import { LiveStatusBadge } from "@/components/ui/live-status-badge";
import { Button } from "@/components/ui/button";
import { useQueueRefreshSignal } from "@/hooks/use-live-queue";
import {
  buildTicketTimeline,
  customerStatusLabel,
  customerStatusSummary,
  formatTicketTimestamp,
  isTerminalTicketStatus,
  mapTicketCredentialError,
  resolveCustomerFacingStatus,
  ticketAvailabilityNote,
  type TimelineStep,
} from "@/lib/ticket/timeline";
import { cn } from "@/lib/utils";

function ticketTokenKey(publicId: string) {
  return `queueless-ticket:${publicId}`;
}

function queueIdKey(publicId: string) {
  return `queueless-queue:${publicId}`;
}

export function TicketView({ publicId }: { publicId: string }) {
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);

  const isTerminal = ticket
    ? isTerminalTicketStatus(ticket.status, ticket.cancelled_at)
    : false;

  const refreshTicket = useCallback(async () => {
    const token = window.sessionStorage.getItem(ticketTokenKey(publicId));
    if (!token) {
      setError(
        "Your ticket access credential is not available in this browser.",
      );
      setLoading(false);
      return;
    }

    const result = await getTicketAction(publicId, token);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const next = result.ticket ?? null;
    setError(null);
    setTicket(next);
    setLoading(false);

    if (next?.queue_id) {
      window.sessionStorage.setItem(queueIdKey(publicId), next.queue_id);
    }
  }, [publicId]);

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      await Promise.resolve();
      if (cancelled) {
        return;
      }
      await refreshTicket();
    }

    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [refreshTicket]);

  const liveStatus = useQueueRefreshSignal({
    queueId: ticket?.queue_id ?? null,
    enabled: Boolean(ticket?.queue_id) && !isTerminal,
    onSignal: () => {
      void refreshTicket();
    },
  });

  async function cancel() {
    const token = window.sessionStorage.getItem(ticketTokenKey(publicId));
    if (!token || !window.confirm("Leave this queue?")) {
      return;
    }

    setCanceling(true);
    const result = await cancelTicketAction(publicId, token);
    setCanceling(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    await refreshTicket();
  }

  if (loading && !ticket) {
    return (
      <div
        className="mx-auto w-full max-w-xl px-5 py-12 text-center text-sm text-muted"
        role="status"
        aria-live="polite"
      >
        Loading your ticket…
      </div>
    );
  }

  if (error && !ticket) {
    const mapped = mapTicketCredentialError(error);
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-12">
        <div
          className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm sm:p-8"
          role="alert"
        >
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {mapped.title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{mapped.body}</p>
          {mapped.recovery ? (
            <p className="mt-4 text-sm leading-relaxed text-foreground">
              {mapped.recovery}
            </p>
          ) : null}
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Ticket numbers alone are not enough to open a ticket. That keeps
            other people’s tickets private.
          </p>
          <Button href="/" variant="secondary" className="mt-6">
            Back home
          </Button>
        </div>
      </main>
    );
  }

  if (!ticket) {
    return null;
  }

  const facing = resolveCustomerFacingStatus(
    ticket.status,
    ticket.cancelled_at,
  );
  const timeline = buildTicketTimeline({
    status: ticket.status,
    joined_at: ticket.joined_at,
    called_at: ticket.called_at,
    serving_at: ticket.serving_at,
    completed_at: ticket.completed_at,
    cancelled_at: ticket.cancelled_at,
  });
  const availability = ticketAvailabilityNote({
    queueStatus: ticket.queue_status,
    businessIsOpen: ticket.business_is_open,
    isTerminal,
  });
  const canLeave = ticket.status === "waiting" && !ticket.cancelled_at;
  const showWaitStats = ticket.status === "waiting";

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10 sm:px-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-left">
            <p className="text-sm font-medium text-accent">
              {ticket.business_name}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
              {ticket.service_name}
            </h1>
            <p className="mt-1 text-sm text-muted">{ticket.queue_name}</p>
          </div>
          {!isTerminal ? (
            <LiveStatusBadge status={liveStatus} className="shrink-0" />
          ) : null}
        </div>

        <div
          className="my-8 rounded-2xl bg-background px-5 py-8 text-center"
          aria-labelledby="ticket-number-label"
        >
          <p
            id="ticket-number-label"
            className="text-xs font-medium uppercase tracking-[0.18em] text-muted"
          >
            Your number
          </p>
          <p
            className="mt-2 font-display text-6xl font-semibold tracking-tight text-foreground sm:text-7xl"
            aria-live="polite"
          >
            {ticket.queue_number}
          </p>
          <p
            className={cn(
              "mt-4 text-base font-semibold",
              isTerminal ? "text-foreground" : "text-accent",
            )}
            role="status"
          >
            {customerStatusLabel(facing)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {customerStatusSummary(facing)}
          </p>
        </div>

        {availability ? (
          <p
            className="mb-6 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm leading-relaxed text-foreground"
            role="status"
          >
            {availability.message}
          </p>
        ) : null}

        <TicketTimeline steps={timeline} />

        <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
          {showWaitStats ? (
            <>
              <Info
                label="People ahead"
                value={String(ticket.people_ahead)}
              />
              <Info
                label="Estimated wait"
                value={`${ticket.estimated_wait_minutes} min`}
              />
            </>
          ) : null}
          <Info
            label="Joined"
            value={formatTicketTimestamp(ticket.joined_at)}
          />
          {ticket.called_at || ticket.serving_at ? (
            <Info
              label={ticket.serving_at && !ticket.called_at ? "Serving since" : "Called"}
              value={formatTicketTimestamp(
                ticket.called_at ?? ticket.serving_at,
              )}
            />
          ) : null}
          {isTerminal ? (
            <Info
              label={
                facing === "cancelled"
                  ? "Cancelled"
                  : facing === "completed"
                    ? "Completed"
                    : facing === "no_show"
                      ? "No-show"
                      : "Finished"
              }
              value={formatTicketTimestamp(
                ticket.cancelled_at ?? ticket.completed_at,
              )}
            />
          ) : null}
        </div>

        {ticket.email_notifications_enabled ? (
          <p className="mt-4 text-left text-xs text-muted">
            Email updates are enabled for this ticket.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {canLeave ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-6 w-full"
            disabled={canceling}
            onClick={cancel}
            aria-label="Leave queue and cancel this ticket"
          >
            {canceling ? "Leaving…" : "Leave queue"}
          </Button>
        ) : null}

        {!isTerminal ? (
          <p className="mt-4 text-left text-xs leading-relaxed text-muted">
            Estimated wait is people ahead × average service minutes. This page
            updates automatically while you wait. Keep it open on this device —
            your access credential stays in this browser session only.
          </p>
        ) : (
          <p className="mt-4 text-left text-xs leading-relaxed text-muted">
            This ticket is finished. You can close this page.
          </p>
        )}
      </div>
    </main>
  );
}

function TicketTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0 border-t border-border pt-6" aria-label="Ticket status timeline">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast ? (
              <span
                className="absolute left-[0.55rem] top-5 h-[calc(100%-0.75rem)] w-px bg-border"
                aria-hidden="true"
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-semibold",
                step.state === "done" &&
                  "border-accent bg-accent text-white",
                step.state === "current" &&
                  "border-accent bg-accent-soft text-accent",
                step.state === "pending" &&
                  "border-border bg-background text-muted",
              )}
              aria-hidden="true"
            >
              {step.state === "done" ? "✓" : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.state === "pending" ? "text-muted" : "text-foreground",
                )}
                {...(step.state === "current"
                  ? { "aria-current": "step" as const }
                  : {})}
              >
                {step.label}
                <span className="sr-only">
                  {step.state === "done"
                    ? ", completed"
                    : step.state === "current"
                      ? ", current"
                      : ", not yet"}
                </span>
              </p>
              {step.description ? (
                <p className="mt-0.5 text-xs text-muted">{step.description}</p>
              ) : null}
              {step.at ? (
                <p className="mt-1 text-xs text-muted">
                  {formatTicketTimestamp(step.at)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}
