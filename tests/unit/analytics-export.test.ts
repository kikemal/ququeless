import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAnalyticsCsv,
  buildAnalyticsExportFilename,
  escapeCsvCell,
  formatAnalyticsDateRangeLabel,
  formatCsvCount,
  formatCsvMinutesFromSeconds,
  formatCsvPercent,
} from "../../lib/analytics/csv.ts";
import { resolveAnalyticsRange } from "../../lib/analytics/metrics.ts";

describe("escapeCsvCell", () => {
  it("escapes commas, quotes, and newlines", () => {
    assert.equal(escapeCsvCell("Main, Queue"), '"Main, Queue"');
    assert.equal(escapeCsvCell('VIP "Express"'), '"VIP ""Express"""');
    assert.equal(escapeCsvCell("Line\nBreak"), '"Line\nBreak"');
  });

  it("neutralizes spreadsheet formula injection", () => {
    assert.equal(escapeCsvCell("=1+1"), "'=1+1");
    assert.equal(escapeCsvCell("+cmd"), "'+cmd");
    assert.equal(escapeCsvCell("-2"), "'-2");
    assert.equal(escapeCsvCell("@SUM(A1)"), "'@SUM(A1)");
  });

  it("represents null as empty", () => {
    assert.equal(escapeCsvCell(null), "");
    assert.equal(escapeCsvCell(undefined), "");
  });
});

describe("numeric CSV formatters", () => {
  it("formats null metrics as empty cells", () => {
    assert.equal(formatCsvPercent(null), "");
    assert.equal(formatCsvMinutesFromSeconds(null), "");
    assert.equal(formatCsvCount(null), "");
  });

  it("formats percentages, minutes, and counts", () => {
    assert.equal(formatCsvPercent(74.5), "74.50%");
    assert.equal(formatCsvMinutesFromSeconds(744), "12.40");
    assert.equal(formatCsvCount(123), "123");
  });
});

describe("filename and range label", () => {
  it("builds a safe date-only filename using Phase 8 range semantics", () => {
    const now = new Date("2026-09-12T15:30:00.000Z");
    const range = resolveAnalyticsRange("custom", now, "2026-09-01", "2026-09-12");
    assert.ok(!("error" in range));
    assert.equal(
      buildAnalyticsExportFilename(range),
      "queueless-analytics-2026-09-01-to-2026-09-12.csv",
    );
    assert.equal(formatAnalyticsDateRangeLabel(range), "2026-09-01 to 2026-09-12");
  });

  it("matches 7d preset start/end for export labeling", () => {
    const now = new Date("2026-09-12T15:30:00.000Z");
    const range = resolveAnalyticsRange("7d", now);
    assert.ok(!("error" in range));
    assert.equal(
      buildAnalyticsExportFilename(range),
      "queueless-analytics-2026-09-06-to-2026-09-12.csv",
    );
  });
});

describe("buildAnalyticsCsv", () => {
  it("builds a readable aggregate report without customer fields", () => {
    const range = {
      start: new Date("2026-09-01T00:00:00.000Z"),
      end: new Date("2026-09-03T00:00:00.000Z"),
    };
    const csv = buildAnalyticsCsv({
      businessName: 'Acme, "Dental"',
      range,
      generatedAt: new Date("2026-09-12T18:00:00.000Z"),
      payload: {
        timezone: "UTC",
        overview: {
          total_customers: 0,
          served: 0,
          cancelled: 0,
          skipped: 0,
          completion_rate: null,
          avg_wait_seconds: null,
          avg_service_seconds: null,
        },
        queues: [
          {
            queue_name: "=Dangerous Queue",
            total_customers: 2,
            served: 1,
            cancelled: 1,
            skipped: 0,
            avg_wait_seconds: 120,
            avg_service_seconds: null,
          },
        ],
        services: [],
        trend: [],
        busiest_day: null,
      },
    });

    assert.match(csv, /^﻿?QueueLess Analytics Report/m);
    assert.match(csv, /Business,"Acme, ""Dental"""/);
    assert.match(csv, /Completion Rate,/);
    assert.match(csv, /Average Wait \(minutes\),/);
    assert.match(csv, /'=Dangerous Queue/);
    assert.doesNotMatch(csv, /customer_email|access_token|phone|NaN|undefined|Infinity/);
  });
});
