/**
 * Queue waiting-capacity helpers (Phase 12).
 * Capacity counts only entry_status = 'waiting'.
 */

export const MAX_WAITING_CUSTOMERS_LIMIT = 10000;

export type ParsedMaxWaiting =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/**
 * Parse capacity form input.
 * Empty / "unlimited" → null (unlimited).
 * Otherwise a positive integer ≤ MAX_WAITING_CUSTOMERS_LIMIT.
 */
export function parseMaxWaitingCustomersInput(
  raw: string | null | undefined,
): ParsedMaxWaiting {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (!trimmed || trimmed === "unlimited") {
    return { ok: true, value: null };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      error: "Capacity must be a whole number, or leave blank for unlimited.",
    };
  }

  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      error: "Capacity must be a positive whole number.",
    };
  }
  if (value > MAX_WAITING_CUSTOMERS_LIMIT) {
    return {
      ok: false,
      error: `Capacity cannot exceed ${MAX_WAITING_CUSTOMERS_LIMIT}.`,
    };
  }

  return { ok: true, value };
}

export function isQueueAtCapacity(
  waitingCount: number,
  maxWaitingCustomers: number | null | undefined,
): boolean {
  if (maxWaitingCustomers === null || maxWaitingCustomers === undefined) {
    return false;
  }
  return waitingCount >= maxWaitingCustomers;
}

export function formatWaitingCapacityLabel(
  waitingCount: number,
  maxWaitingCustomers: number | null | undefined,
): string {
  if (maxWaitingCustomers === null || maxWaitingCustomers === undefined) {
    return `Waiting: ${waitingCount}`;
  }
  return `Waiting: ${waitingCount} / ${maxWaitingCustomers}`;
}
