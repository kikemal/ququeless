/**
 * Queue history helpers (Phase 16).
 * Date ranges reuse Phase 8 resolveAnalyticsRange at the page layer.
 * Wait formatting mirrors analytics formatDurationSeconds (kept local so
 * Node unit tests can load this module without TS path-extension conflicts).
 */

export const HISTORY_PAGE_SIZE = 25;
export const HISTORY_PAGE_SIZE_MAX = 50;

export type HistoryOutcome =
  | "completed"
  | "cancelled"
  | "skipped"
  | "no_show";

export const HISTORY_OUTCOMES: readonly HistoryOutcome[] = [
  "completed",
  "cancelled",
  "skipped",
  "no_show",
] as const;

export function isHistoryOutcome(value: string): value is HistoryOutcome {
  return (HISTORY_OUTCOMES as readonly string[]).includes(value);
}

export function historyOutcomeLabel(outcome: HistoryOutcome | string): string {
  switch (outcome) {
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "skipped":
      return "Skipped";
    case "no_show":
      return "No-show";
    default:
      return outcome;
  }
}

export type HistoryRow = {
  queue_name: string;
  service_name: string;
  queue_number: number;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  status: string;
  outcome: string;
  joined_at: string;
  called_at: string | null;
  serving_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  wait_seconds: number | null;
  total_count: number;
};

export function formatHistoryTimestamp(
  value: string | null | undefined,
): string {
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

export function formatHistoryWait(
  waitSeconds: number | null | undefined,
): string {
  const seconds =
    waitSeconds === null || waitSeconds === undefined
      ? null
      : Number(waitSeconds);
  if (seconds === null || Number.isNaN(seconds)) {
    return "—";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${Math.round(minutes * 10) / 10} min`;
  }
  const hours = minutes / 60;
  return `${Math.round(hours * 10) / 10} hr`;
}

export function parseHistoryPage(value: string | null | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.min(n, 401);
}

export function historyOffsetForPage(
  page: number,
  pageSize: number = HISTORY_PAGE_SIZE,
): number {
  return Math.max(0, (page - 1) * pageSize);
}

export function historyTotalPages(
  totalCount: number,
  pageSize: number = HISTORY_PAGE_SIZE,
): number {
  if (totalCount <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/** Row key without exposing internal DB ids. */
export function historyRowKey(row: HistoryRow): string {
  return `${row.queue_name}|${row.queue_number}|${row.joined_at}|${row.outcome}`;
}
