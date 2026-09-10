import type { Enums } from "@/types/database";

export type QueueStatus = Enums<"queue_status">;

export const QUEUE_STATUSES: readonly QueueStatus[] = [
  "open",
  "paused",
  "closed",
] as const;

export function isQueueStatus(value: string): value is QueueStatus {
  return (QUEUE_STATUSES as readonly string[]).includes(value);
}

export function queueStatusLabel(status: QueueStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "paused":
      return "Paused";
    case "closed":
      return "Closed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
