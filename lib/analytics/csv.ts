/**
 * Phase 10: safe CSV serialization for analytics exports.
 * Aggregate-only — never include customer PII or secrets.
 */

export type AnalyticsCsvOverview = {
  total_customers: number;
  served: number;
  cancelled: number;
  skipped: number;
  completion_rate: number | null;
  avg_wait_seconds: number | null;
  avg_service_seconds: number | null;
};

export type AnalyticsCsvPayload = {
  timezone?: string;
  overview: AnalyticsCsvOverview;
  queues: Array<{
    queue_name: string;
    total_customers: number;
    served: number;
    cancelled: number;
    skipped: number;
    avg_wait_seconds: number | null;
    avg_service_seconds: number | null;
  }>;
  services: Array<{
    service_name: string;
    total_customers: number;
    served: number;
    avg_wait_seconds: number | null;
    avg_service_seconds: number | null;
  }>;
  trend: Array<{
    day: string;
    total_customers: number;
    served: number;
    cancelled: number;
  }>;
  busiest_day: { day: string; total_customers: number } | null;
};

export type AnalyticsCsvRange = {
  start: Date;
  end: Date;
};

/** Same formula as lib/analytics/metrics.completionRatePercent (Phase 8). */
function queueCompletionRate(
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

const FORMULA_PREFIX = /^[=+\-@]/;

/** Escape a single CSV field (RFC 4180) and neutralize spreadsheet formulas. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  let text = typeof value === "number" ? formatCsvNumber(value) : String(value);

  // Formula injection: neutralize leading = + - @
  if (FORMULA_PREFIX.test(text) || text.startsWith("\t") || text.startsWith("\r")) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatCsvNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return String(value);
}

/** Counts → integer string; null → empty. */
export function formatCsvCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return String(Math.trunc(value));
}

/** Percentage with 2 decimal places; null → empty (not 0). */
export function formatCsvPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return `${value.toFixed(2)}%`;
}

/** Seconds → minutes with 2 decimal places; null → empty. */
export function formatCsvMinutesFromSeconds(
  seconds: number | null | undefined,
): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "";
  }
  return (seconds / 60).toFixed(2);
}

export function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(",");
}

export function inclusiveUtcEndDate(rangeEndExclusive: Date): string {
  const inclusive = new Date(rangeEndExclusive.getTime() - 24 * 60 * 60 * 1000);
  return inclusive.toISOString().slice(0, 10);
}

export function formatAnalyticsDateRangeLabel(range: AnalyticsCsvRange): string {
  const start = range.start.toISOString().slice(0, 10);
  const endInclusive = inclusiveUtcEndDate(range.end);
  return `${start} to ${endInclusive}`;
}

/**
 * Safe download filename. Dates only — no business name or user input.
 * End date is inclusive UTC day (matches report label).
 */
export function buildAnalyticsExportFilename(range: AnalyticsCsvRange): string {
  const start = range.start.toISOString().slice(0, 10);
  const endInclusive = inclusiveUtcEndDate(range.end);
  return `queueless-analytics-${start}-to-${endInclusive}.csv`;
}

export type BuildAnalyticsCsvInput = {
  businessName: string;
  range: AnalyticsCsvRange;
  payload: AnalyticsCsvPayload;
  generatedAt: Date;
};

export function buildAnalyticsCsv(input: BuildAnalyticsCsvInput): string {
  const { businessName, range, payload, generatedAt } = input;
  const overview = payload.overview;
  const lines: string[] = [];

  lines.push("QueueLess Analytics Report");
  lines.push("");
  lines.push(csvRow(["Business", businessName]));
  lines.push(csvRow(["Date Range (UTC)", formatAnalyticsDateRangeLabel(range)]));
  lines.push(csvRow(["Range Start (UTC)", range.start.toISOString()]));
  lines.push(csvRow(["Range End Exclusive (UTC)", range.end.toISOString()]));
  lines.push(csvRow(["Timezone", payload.timezone || "UTC"]));
  lines.push(csvRow(["Generated At", generatedAt.toISOString()]));
  lines.push("");

  lines.push("Summary");
  lines.push(csvRow(["Metric", "Value"]));
  lines.push(csvRow(["Total Customers", formatCsvCount(overview.total_customers)]));
  lines.push(csvRow(["Served", formatCsvCount(overview.served)]));
  lines.push(csvRow(["Cancelled", formatCsvCount(overview.cancelled)]));
  lines.push(csvRow(["Skipped / No-show", formatCsvCount(overview.skipped)]));
  lines.push(
    csvRow(["Completion Rate", formatCsvPercent(overview.completion_rate)]),
  );
  lines.push(
    csvRow([
      "Average Wait (minutes)",
      formatCsvMinutesFromSeconds(overview.avg_wait_seconds),
    ]),
  );
  lines.push(
    csvRow([
      "Average Service (minutes)",
      formatCsvMinutesFromSeconds(overview.avg_service_seconds),
    ]),
  );

  if (payload.busiest_day) {
    lines.push("");
    lines.push("Busiest Day");
    lines.push(csvRow(["Date", "Total Customers"]));
    lines.push(
      csvRow([
        payload.busiest_day.day,
        formatCsvCount(payload.busiest_day.total_customers),
      ]),
    );
  }

  lines.push("");
  lines.push("Daily Trend");
  lines.push(csvRow(["Date", "Total", "Served", "Cancelled"]));
  for (const point of payload.trend ?? []) {
    lines.push(
      csvRow([
        point.day,
        formatCsvCount(point.total_customers),
        formatCsvCount(point.served),
        formatCsvCount(point.cancelled),
      ]),
    );
  }

  lines.push("");
  lines.push("Queue Breakdown");
  lines.push(
    csvRow([
      "Queue",
      "Total",
      "Served",
      "Cancelled",
      "Skipped",
      "Completion Rate",
      "Average Wait (minutes)",
      "Average Service (minutes)",
    ]),
  );
  for (const row of payload.queues ?? []) {
    const rate = queueCompletionRate(row.served, row.cancelled, row.skipped);
    lines.push(
      csvRow([
        row.queue_name,
        formatCsvCount(row.total_customers),
        formatCsvCount(row.served),
        formatCsvCount(row.cancelled),
        formatCsvCount(row.skipped),
        formatCsvPercent(rate),
        formatCsvMinutesFromSeconds(row.avg_wait_seconds),
        formatCsvMinutesFromSeconds(row.avg_service_seconds),
      ]),
    );
  }

  lines.push("");
  lines.push("Service Breakdown");
  // Services RPC does not return cancelled/skipped — do not invent columns.
  lines.push(
    csvRow([
      "Service",
      "Total",
      "Served",
      "Average Wait (minutes)",
      "Average Service (minutes)",
    ]),
  );
  for (const row of payload.services ?? []) {
    lines.push(
      csvRow([
        row.service_name,
        formatCsvCount(row.total_customers),
        formatCsvCount(row.served),
        formatCsvMinutesFromSeconds(row.avg_wait_seconds),
        formatCsvMinutesFromSeconds(row.avg_service_seconds),
      ]),
    );
  }

  lines.push("");
  return `\uFEFF${lines.join("\r\n")}`;
}
