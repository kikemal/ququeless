export type CustomerNotificationType =
  | "called"
  | "completed"
  | "skipped"
  | "cancelled";

export const MAX_NOTIFICATION_ATTEMPTS = 3;

export function notificationSubject(type: CustomerNotificationType): string {
  switch (type) {
    case "called":
      return "Your QueueLess turn is ready";
    case "completed":
      return "Your QueueLess service is complete";
    case "skipped":
      return "Your QueueLess ticket was skipped";
    case "cancelled":
      return "Your QueueLess ticket was cancelled";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function notificationTextBody(input: {
  type: CustomerNotificationType;
  businessName: string;
  queueName: string;
  queueNumber: number;
  ticketUrl: string | null;
}): string {
  const header = `${input.businessName} · ${input.queueName} · #${input.queueNumber}`;
  let message: string;
  switch (input.type) {
    case "called":
      message = "Your turn is now being served. Please head to the service desk.";
      break;
    case "completed":
      message = "Your service has been completed. Thank you for visiting.";
      break;
    case "skipped":
      message = "Your queue ticket was skipped.";
      break;
    case "cancelled":
      message = "Your queue ticket has been cancelled.";
      break;
    default: {
      const _exhaustive: never = input.type;
      return _exhaustive;
    }
  }

  const lines = [header, "", message];
  if (input.ticketUrl) {
    lines.push("", `View your ticket: ${input.ticketUrl}`);
    lines.push("(Open this link on the same device where you joined the queue.)");
  }
  return lines.join("\n");
}

export const NOTIFICATION_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Mirrors claim RPC retry eligibility (Phase 11/17).
 * Fresh `sending` is not retryable; stale `sending` with attempts remaining is.
 * Exhausted attempts are terminal (SQL expires them to `failed`).
 */
export function isRetryableNotificationStatus(
  status: "pending" | "sending" | "sent" | "failed",
  attempts: number,
  maxAttempts: number = MAX_NOTIFICATION_ATTEMPTS,
  options?: {
    updatedAt?: Date | string | null;
    now?: Date;
    staleAfterMs?: number;
  },
): boolean {
  if (status === "sent") {
    return false;
  }
  if (status === "pending") {
    return true;
  }
  if (status === "failed") {
    return attempts < maxAttempts;
  }
  if (status === "sending") {
    if (attempts >= maxAttempts) {
      return false;
    }
    const updatedAt = options?.updatedAt;
    if (!updatedAt) {
      return false;
    }
    const staleAfterMs = options?.staleAfterMs ?? NOTIFICATION_STALE_AFTER_MS;
    const now = options?.now ?? new Date();
    const updatedMs =
      typeof updatedAt === "string"
        ? new Date(updatedAt).getTime()
        : updatedAt.getTime();
    if (!Number.isFinite(updatedMs)) {
      return false;
    }
    return now.getTime() - updatedMs >= staleAfterMs;
  }
  return false;
}

export function isTerminalNotificationStatus(
  status: "pending" | "sending" | "sent" | "failed",
  attempts: number,
  maxAttempts: number = MAX_NOTIFICATION_ATTEMPTS,
): boolean {
  if (status === "sent") {
    return true;
  }
  if (status === "sending" && attempts >= maxAttempts) {
    return true;
  }
  return status === "failed" && attempts >= maxAttempts;
}

export function notificationIdempotencyKey(
  queueEntryId: string,
  type: CustomerNotificationType,
  channel: "email" = "email",
): string {
  return `${queueEntryId}:${type}:${channel}`;
}

export function mapStatusToNotificationType(
  status: string,
): CustomerNotificationType | null {
  switch (status) {
    case "called":
      return "called";
    case "completed":
      return "completed";
    case "skipped":
    case "no_show":
      return "skipped";
    default:
      return null;
  }
}
