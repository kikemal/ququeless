import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HISTORY_PAGE_SIZE,
  formatHistoryTimestamp,
  formatHistoryWait,
  historyOffsetForPage,
  historyOutcomeLabel,
  historyRowKey,
  historyTotalPages,
  isHistoryOutcome,
  parseHistoryPage,
  type HistoryRow,
} from "../../lib/dashboard/history.ts";

describe("history outcome helpers", () => {
  it("accepts only known outcomes", () => {
    assert.equal(isHistoryOutcome("completed"), true);
    assert.equal(isHistoryOutcome("cancelled"), true);
    assert.equal(isHistoryOutcome("waiting"), false);
    assert.equal(historyOutcomeLabel("no_show"), "No-show");
  });
});

describe("history pagination", () => {
  it("parses pages and computes offsets", () => {
    assert.equal(parseHistoryPage(undefined), 1);
    assert.equal(parseHistoryPage("0"), 1);
    assert.equal(parseHistoryPage("3"), 3);
    assert.equal(historyOffsetForPage(1), 0);
    assert.equal(historyOffsetForPage(2, HISTORY_PAGE_SIZE), HISTORY_PAGE_SIZE);
    assert.equal(historyTotalPages(0), 1);
    assert.equal(historyTotalPages(26), 2);
  });
});

describe("history formatting", () => {
  it("handles missing timestamps and wait", () => {
    assert.equal(formatHistoryTimestamp(null), "—");
    assert.equal(formatHistoryWait(null), "—");
    assert.match(formatHistoryWait(90), /min/);
  });

  it("builds stable row keys without internal ids", () => {
    const row: HistoryRow = {
      queue_name: "Main",
      service_name: "Desk",
      queue_number: 4,
      customer_name: "Ada",
      customer_phone: null,
      customer_email: null,
      status: "completed",
      outcome: "completed",
      joined_at: "2026-06-01T10:00:00Z",
      called_at: null,
      serving_at: null,
      completed_at: "2026-06-01T10:10:00Z",
      cancelled_at: null,
      wait_seconds: 120,
      total_count: 1,
    };
    assert.equal(
      historyRowKey(row),
      "Main|4|2026-06-01T10:00:00Z|completed",
    );
    assert.equal(historyRowKey(row).includes("token"), false);
  });
});
