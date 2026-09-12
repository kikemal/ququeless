/**
 * Customer ticket timeline + display helpers (Phase 14).
 * Pure functions — unit-testable without React / path aliases.
 */

export type EntryStatus =
  | "waiting"
  | "called"
  | "serving"
  | "completed"
  | "skipped"
  | "no_show";

export type QueueStatus = "open" | "paused" | "closed";

export type TicketTimelineInput = {
  status: EntryStatus;
  joined_at: string | null;
  called_at: string | null;
  serving_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

export type TimelineStepState = "done" | "current" | "pending";

export type TimelineStep = {
  id: "joined" | "called" | "outcome";
  label: string;
  state: TimelineStepState;
  at: string | null;
  description?: string;
};

export type CustomerFacingStatus =
  | "waiting"
  | "called"
  | "serving"
  | "completed"
  | "skipped"
  | "no_show"
  | "cancelled";

/** Customer cancel sets status=skipped + cancelled_at. */
export function resolveCustomerFacingStatus(
  status: EntryStatus,
  cancelledAt: string | null | undefined,
): CustomerFacingStatus {
  if (cancelledAt && (status === "skipped" || status === "completed")) {
    return "cancelled";
  }
  return status;
}

export function isTerminalTicketStatus(
  status: EntryStatus,
  cancelledAt?: string | null,
): boolean {
  if (cancelledAt) {
    return true;
  }
  return status === "completed" || status === "skipped" || status === "no_show";
}

export function customerStatusLabel(status: CustomerFacingStatus): string {
  switch (status) {
    case "waiting":
      return "Waiting";
    case "called":
      return "Please come to the desk";
    case "serving":
      return "Being served";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "no_show":
      return "No-show";
    case "cancelled":
      return "Cancelled";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function customerStatusSummary(status: CustomerFacingStatus): string {
  switch (status) {
    case "waiting":
      return "You are in line. We’ll update this page when it’s your turn.";
    case "called":
      return "It’s your turn — please come to the service desk.";
    case "serving":
      return "You are currently being served.";
    case "completed":
      return "This visit is complete. Thank you.";
    case "skipped":
      return "This ticket was skipped and is no longer active.";
    case "no_show":
      return "This ticket was marked as no-show and is no longer active.";
    case "cancelled":
      return "You left the queue. This ticket is no longer active.";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function outcomeLabel(facing: CustomerFacingStatus): string {
  switch (facing) {
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "no_show":
      return "No-show";
    case "cancelled":
      return "Cancelled";
    default:
      return "Finished";
  }
}

/**
 * Three-step timeline: Joined → Called/Serving → terminal outcome.
 * Inactive future steps are pending; past steps are done.
 */
export function buildTicketTimeline(input: TicketTimelineInput): TimelineStep[] {
  const facing = resolveCustomerFacingStatus(input.status, input.cancelled_at);
  const terminal = isTerminalTicketStatus(input.status, input.cancelled_at);
  // Only mark Called as done/current if it actually occurred — not merely because
  // the ticket reached a terminal state (e.g. cancelled while still waiting).
  const reachedCalled =
    input.status === "called" ||
    input.status === "serving" ||
    Boolean(input.called_at) ||
    Boolean(input.serving_at);

  const calledAt = input.called_at ?? input.serving_at ?? null;
  const outcomeAt = input.cancelled_at ?? input.completed_at ?? null;

  const joined: TimelineStep = {
    id: "joined",
    label: "Joined",
    state: "done",
    at: input.joined_at,
    description: "You joined the queue",
  };

  let calledState: TimelineStepState = "pending";
  if (input.status === "called" || input.status === "serving") {
    calledState = "current";
  } else if (reachedCalled) {
    calledState = "done";
  }

  const called: TimelineStep = {
    id: "called",
    label: input.status === "serving" && !terminal ? "Serving" : "Called",
    state: calledState,
    at: calledAt,
    description:
      calledState === "pending"
        ? "Waiting to be called"
        : input.status === "serving" && !terminal
          ? "Being served"
          : "Called to the desk",
  };

  let outcomeState: TimelineStepState = "pending";
  if (terminal) {
    outcomeState = "current";
  }

  const outcome: TimelineStep = {
    id: "outcome",
    label: terminal ? outcomeLabel(facing) : "Finished",
    state: outcomeState,
    at: terminal ? outcomeAt : null,
    description: terminal
      ? customerStatusSummary(facing)
      : "Not finished yet",
  };

  // When waiting, mark joined as current for clearer progress.
  if (input.status === "waiting" && !terminal) {
    joined.state = "current";
  }

  return [joined, called, outcome];
}

export function formatTicketTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export type AvailabilityNote = {
  kind: "queue_paused" | "queue_closed" | "business_closed";
  message: string;
} | null;

/**
 * Informational only — does not change ticket status or authorize anything.
 * Valid tickets remain viewable when queue/business is closed.
 */
export function ticketAvailabilityNote(options: {
  queueStatus: QueueStatus | null | undefined;
  businessIsOpen: boolean | null | undefined;
  isTerminal: boolean;
}): AvailabilityNote {
  if (options.isTerminal) {
    return null;
  }
  if (options.businessIsOpen === false) {
    return {
      kind: "business_closed",
      message:
        "This business is currently closed. Your ticket is still valid — keep this page for your place in line.",
    };
  }
  if (options.queueStatus === "paused") {
    return {
      kind: "queue_paused",
      message:
        "This queue is paused. Your ticket is still valid and will update when service resumes.",
    };
  }
  if (options.queueStatus === "closed") {
    return {
      kind: "queue_closed",
      message:
        "This queue is closed to new customers. Your existing ticket is still valid.",
    };
  }
  return null;
}

export const MISSING_TOKEN_MESSAGE =
  "Your ticket access credential is not available in this browser.";

export const MISSING_TOKEN_RECOVERY =
  "For security, tickets can only be opened with the private credential saved when you joined. We cannot recover a lost ticket from the ticket number alone. If you still have this ticket open in another tab or on the device where you joined, continue there.";

export function mapTicketCredentialError(
  error: string | null | undefined,
): { title: string; body: string; recovery?: string } {
  const value = (error ?? "").toLowerCase();

  if (
    value.includes("not available on this device") ||
    value.includes("access credential is not available") ||
    value.includes("missing ticket credentials")
  ) {
    return {
      title: "Ticket credential missing",
      body: MISSING_TOKEN_MESSAGE,
      recovery: MISSING_TOKEN_RECOVERY,
    };
  }

  if (
    value.includes("could not be found") ||
    value.includes("invalid ticket") ||
    value.includes("ticket not found")
  ) {
    return {
      title: "Ticket not found",
      body: "This ticket could not be verified. Check that you opened it on the same device where you joined, or ask the business for help joining again.",
    };
  }

  return {
    title: "Ticket unavailable",
    body: error || "We could not load this ticket right now.",
  };
}
