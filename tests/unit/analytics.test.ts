import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completionRatePercent,
  formatCompletionRate,
  formatDurationSeconds,
  formatMetricNumber,
  hasAnalyticsActivity,
  resolveAnalyticsRange,
} from "../../lib/analytics/metrics.ts";

describe("resolveAnalyticsRange", () => {
  const now = new Date("2026-09-11T15:30:00.000Z");

  it("resolves today in UTC", () => {
    const range = resolveAnalyticsRange("today", now);
    assert.ok(!("error" in range));
    assert.equal(range.start.toISOString(), "2026-09-11T00:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-09-12T00:00:00.000Z");
  });

  it("resolves last 7 UTC days inclusive of today", () => {
    const range = resolveAnalyticsRange("7d", now);
    assert.ok(!("error" in range));
    assert.equal(range.start.toISOString(), "2026-09-05T00:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-09-12T00:00:00.000Z");
  });

  it("resolves custom YYYY-MM-DD as UTC half-open range", () => {
    const range = resolveAnalyticsRange("custom", now, "2026-09-01", "2026-09-03");
    assert.ok(!("error" in range));
    assert.equal(range.start.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-09-04T00:00:00.000Z");
  });

  it("rejects inverted custom ranges", () => {
    const range = resolveAnalyticsRange("custom", now, "2026-09-10", "2026-09-01");
    assert.ok("error" in range);
  });
});

describe("completionRatePercent", () => {
  it("returns null when there are no eligible outcomes", () => {
    assert.equal(completionRatePercent(0, 0, 0), null);
  });

  it("computes served / eligible", () => {
    assert.equal(completionRatePercent(2, 1, 1), 50);
  });
});

describe("formatters", () => {
  it("formats empty metrics as em dash", () => {
    assert.equal(formatMetricNumber(null), "—");
    assert.equal(formatDurationSeconds(null), "—");
    assert.equal(formatCompletionRate(null), "—");
  });

  it("formats durations", () => {
    assert.equal(formatDurationSeconds(45), "45s");
    assert.equal(formatDurationSeconds(120), "2 min");
  });

  it("detects activity", () => {
    assert.equal(hasAnalyticsActivity(0), false);
    assert.equal(hasAnalyticsActivity(3), true);
  });
});
