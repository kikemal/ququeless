/**
 * Analytics date-range helpers.
 * V1 convention: all ranges are interpreted in UTC day boundaries.
 * Half-open interval [start, end).
 */

export type AnalyticsPreset = "today" | "7d" | "30d" | "custom";

export type AnalyticsRange = {
  start: Date;
  end: Date;
  preset: AnalyticsPreset;
};

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function resolveAnalyticsRange(
  preset: AnalyticsPreset,
  now: Date = new Date(),
  customStart?: string | null,
  customEnd?: string | null,
): AnalyticsRange | { error: string } {
  if (preset === "custom") {
    if (!customStart || !customEnd) {
      return { error: "Choose a start and end date." };
    }
    const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customStart.trim());
    const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customEnd.trim());
    if (!startMatch || !endMatch) {
      return { error: "Use YYYY-MM-DD dates." };
    }
    const start = new Date(
      Date.UTC(
        Number(startMatch[1]),
        Number(startMatch[2]) - 1,
        Number(startMatch[3]),
      ),
    );
    const endDay = new Date(
      Date.UTC(
        Number(endMatch[1]),
        Number(endMatch[2]) - 1,
        Number(endMatch[3]),
      ),
    );
    const end = addUtcDays(endDay, 1);
    if (!(start.getTime() < end.getTime())) {
      return { error: "End date must be on or after the start date." };
    }
    if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
      return { error: "Choose a range of at most 366 days." };
    }
    return { start, end, preset };
  }

  const todayStart = utcDayStart(now);
  if (preset === "today") {
    return { start: todayStart, end: addUtcDays(todayStart, 1), preset };
  }
  if (preset === "7d") {
    return { start: addUtcDays(todayStart, -6), end: addUtcDays(todayStart, 1), preset };
  }
  if (preset === "30d") {
    return {
      start: addUtcDays(todayStart, -29),
      end: addUtcDays(todayStart, 1),
      preset,
    };
  }
  return { error: "Invalid date range." };
}

export function completionRatePercent(
  served: number,
  cancelled: number,
  skipped: number,
): number | null {
  const eligible = served + cancelled + skipped;
  if (eligible <= 0) {
    return null;
  }
  return Math.round((served / eligible) * 1000) / 10;
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
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

export function formatMetricNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return String(value);
}

export function formatCompletionRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) {
    return "—";
  }
  return `${rate}%`;
}

export function hasAnalyticsActivity(totalCustomers: number): boolean {
  return totalCustomers > 0;
}
