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
import { TERMINAL_ENTRY_STATUSES } from "@/lib/realtime/channels";

const labels: Record<TicketData["status"], string> = {
  waiting: "Waiting",
  called: "Please come to the desk",
  serving: "Being served",
  completed: "Completed",
  skipped: "Skipped",
  no_show: "No-show",
};

function ticketTokenKey(publicId: string) {
  return `queueless-ticket:${publicId}`;
}

function queueIdKey(publicId: string) {
  return `queueless-queue:${publicId}`;
}

export function TicketView({ publicId }: { publicId: string }) {
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  const isTerminal = ticket
    ? TERMINAL_ENTRY_STATUSES.has(ticket.status)
    : false;

  const refreshTicket = useCallback(async () => {
    const token = window.sessionStorage.getItem(ticketTokenKey(publicId));
    if (!token) {
      setError("Your ticket access token is not available on this device.");
      return;
    }

    const result = await getTicketAction(publicId, token);
    if (result.error) {
      setError(result.error);
      return;
    }

    const next = result.ticket ?? null;
    setError(null);
    setTicket(next);

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

  if (error && !ticket) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-12 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Ticket unavailable
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{error}</p>
        <Button href="/" variant="secondary" className="mt-6">
          Back home
        </Button>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-12 text-center text-sm text-muted">
        Loading your ticket…
      </div>
    );
  }

  const active =
    ticket.status === "waiting" ||
    ticket.status === "called" ||
    ticket.status === "serving";

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10 sm:px-6">
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-accent">{ticket.business_name}</p>
          {!isTerminal ? <LiveStatusBadge status={liveStatus} /> : null}
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold text-foreground">
          {ticket.service_name}
        </h1>
        <p className="mt-1 text-sm text-muted">{ticket.queue_name}</p>

        <div className="my-8 rounded-2xl bg-background px-5 py-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Your number
          </p>
          <p className="mt-2 font-display text-6xl font-semibold tracking-tight text-foreground">
            {ticket.queue_number}
          </p>
          <p className="mt-3 text-sm font-medium text-accent">
            {labels[ticket.status]}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-left">
          <Info label="People ahead" value={ticket.people_ahead} />
          <Info
            label="Estimated wait"
            value={`${ticket.estimated_wait_minutes} min`}
          />
        </div>

        {ticket.email_notifications_enabled ? (
          <p className="mt-4 text-xs text-muted">
            Email updates are enabled for this ticket.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {active ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-6 w-full"
            disabled={canceling}
            onClick={cancel}
          >
            {canceling ? "Leaving…" : "Leave queue"}
          </Button>
        ) : null}
        <p className="mt-4 text-xs text-muted">
          Estimated wait is people ahead × average service minutes. This page
          updates automatically while you wait.
        </p>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}
