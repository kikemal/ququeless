/**
 * Staff queue workflow helpers (Phase 15).
 * Mirrors existing transition_entry / call_next_entry rules — no new statuses.
 *
 * Allowed transitions (DB):
 *   waiting → called | skipped
 *   called  → serving | skipped | no_show
 *   serving → completed | no_show
 */

export type EntryStatus =
  | "waiting"
  | "called"
  | "serving"
  | "completed"
  | "skipped"
  | "no_show";

export type QueueStatus = "open" | "paused" | "closed";

export type StaffEntryAction = "serving" | "completed" | "skipped" | "no_show";

export type WorkflowEntry = {
  id: string;
  status: EntryStatus;
  joined_at: string;
  queue_number: number;
  customer_name: string;
};

export function entryStatusLabel(status: EntryStatus): string {
  switch (status) {
    case "waiting":
      return "Waiting";
    case "called":
      return "Called";
    case "serving":
      return "Serving";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "no_show":
      return "No-show";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Actions the staff UI may offer for a given entry status (matches transition_entry). */
export function staffActionsForStatus(status: EntryStatus): StaffEntryAction[] {
  switch (status) {
    case "waiting":
      return ["skipped"];
    case "called":
      return ["serving", "skipped", "no_show"];
    case "serving":
      return ["completed", "no_show"];
    default:
      return [];
  }
}

export function isDestructiveStaffAction(action: StaffEntryAction): boolean {
  return action === "skipped" || action === "no_show";
}

export function staffActionLabel(action: StaffEntryAction): string {
  switch (action) {
    case "serving":
      return "Start serving";
    case "completed":
      return "Complete";
    case "skipped":
      return "Skip";
    case "no_show":
      return "No-show";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function staffActionSuccessMessage(action: StaffEntryAction): string {
  switch (action) {
    case "serving":
      return "Customer is now being served.";
    case "completed":
      return "Customer marked completed.";
    case "skipped":
      return "Customer skipped.";
    case "no_show":
      return "Customer marked as no-show.";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function partitionQueueEntries<T extends { status: EntryStatus }>(
  entries: T[],
): {
  waiting: T[];
  active: T[];
  terminal: T[];
  counts: {
    waiting: number;
    called: number;
    serving: number;
    completed: number;
    skipped: number;
    no_show: number;
  };
} {
  const waiting = entries.filter((e) => e.status === "waiting");
  const active = entries.filter(
    (e) => e.status === "called" || e.status === "serving",
  );
  const terminal = entries.filter(
    (e) =>
      e.status === "completed" ||
      e.status === "skipped" ||
      e.status === "no_show",
  );

  return {
    waiting,
    active,
    terminal,
    counts: {
      waiting: waiting.length,
      called: entries.filter((e) => e.status === "called").length,
      serving: entries.filter((e) => e.status === "serving").length,
      completed: entries.filter((e) => e.status === "completed").length,
      skipped: entries.filter((e) => e.status === "skipped").length,
      no_show: entries.filter((e) => e.status === "no_show").length,
    },
  };
}

export type CallNextDisableReason =
  | "pending"
  | "paused"
  | "closed"
  | "empty"
  | null;

export function callNextDisableReason(options: {
  queueStatus: QueueStatus;
  waitingCount: number;
  pending: boolean;
}): CallNextDisableReason {
  if (options.pending) {
    return "pending";
  }
  if (options.queueStatus === "paused") {
    return "paused";
  }
  if (options.queueStatus === "closed") {
    return "closed";
  }
  if (options.waitingCount <= 0) {
    return "empty";
  }
  return null;
}

export function callNextDisabledMessage(
  reason: CallNextDisableReason,
): string | null {
  switch (reason) {
    case "pending":
      return "Working…";
    case "paused":
      return "Queue is paused.";
    case "closed":
      return "Queue is closed.";
    case "empty":
      return "No customers are waiting.";
    case null:
      return null;
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** Waiting duration label from joined_at; returns null if invalid. */
export function formatWaitingDuration(
  joinedAt: string,
  nowMs: number = Date.now(),
): string | null {
  const joined = Date.parse(joinedAt);
  if (!Number.isFinite(joined)) {
    return null;
  }
  const minutes = Math.max(0, Math.floor((nowMs - joined) / 60_000));
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function formatJoinedTime(joinedAt: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeStyle: "short",
    }).format(new Date(joinedAt));
  } catch {
    return joinedAt;
  }
}

/** Pending key helpers for duplicate-click protection in the UI. */
export function callNextPendingKey(): string {
  return "call-next";
}

export function entryActionPendingKey(
  entryId: string,
  action: StaffEntryAction,
): string {
  return `${entryId}:${action}`;
}
