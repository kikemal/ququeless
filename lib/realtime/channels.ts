export function queueRefreshChannel(queueId: string) {
  return `queue-refresh:${queueId}`;
}

export function queueEntriesChannel(queueId: string) {
  return `queue-entries:${queueId}`;
}

export const LIVE_POLL_FALLBACK_MS = 20_000;

export const TERMINAL_ENTRY_STATUSES = new Set([
  "completed",
  "skipped",
  "no_show",
]);

export type LiveStatus = "connecting" | "live" | "reconnecting" | "polling" | "idle";

export function liveStatusLabel(status: LiveStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "live":
      return "Live";
    case "reconnecting":
      return "Reconnecting…";
    case "polling":
      return "Updating…";
    case "idle":
      return "";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
