import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapQueueEntryErrorMessage } from "../../lib/dashboard/errors.ts";
import {
  callNextDisableReason,
  callNextDisabledMessage,
  callNextPendingKey,
  entryActionPendingKey,
  entryStatusLabel,
  formatWaitingDuration,
  isDestructiveStaffAction,
  partitionQueueEntries,
  staffActionLabel,
  staffActionSuccessMessage,
  staffActionsForStatus,
} from "../../lib/dashboard/queue-workflow.ts";

describe("staffActionsForStatus", () => {
  it("matches transition_entry rules", () => {
    assert.deepEqual(staffActionsForStatus("waiting"), ["skipped"]);
    assert.deepEqual(staffActionsForStatus("called"), [
      "serving",
      "skipped",
      "no_show",
    ]);
    assert.deepEqual(staffActionsForStatus("serving"), [
      "completed",
      "no_show",
    ]);
    assert.deepEqual(staffActionsForStatus("completed"), []);
    assert.deepEqual(staffActionsForStatus("skipped"), []);
    assert.deepEqual(staffActionsForStatus("no_show"), []);
  });

  it("does not invent serving → skipped", () => {
    assert.equal(staffActionsForStatus("serving").includes("skipped"), false);
  });
});

describe("callNextDisableReason", () => {
  it("disables for pending, paused, closed, and empty", () => {
    assert.equal(
      callNextDisableReason({
        queueStatus: "open",
        waitingCount: 2,
        pending: true,
      }),
      "pending",
    );
    assert.equal(
      callNextDisableReason({
        queueStatus: "paused",
        waitingCount: 2,
        pending: false,
      }),
      "paused",
    );
    assert.equal(
      callNextDisableReason({
        queueStatus: "closed",
        waitingCount: 2,
        pending: false,
      }),
      "closed",
    );
    assert.equal(
      callNextDisableReason({
        queueStatus: "open",
        waitingCount: 0,
        pending: false,
      }),
      "empty",
    );
    assert.equal(
      callNextDisableReason({
        queueStatus: "open",
        waitingCount: 1,
        pending: false,
      }),
      null,
    );
  });

  it("exposes clear disabled messages", () => {
    assert.equal(callNextDisabledMessage("empty"), "No customers are waiting.");
    assert.equal(callNextDisabledMessage("paused"), "Queue is paused.");
    assert.equal(callNextDisabledMessage("closed"), "Queue is closed.");
    assert.equal(callNextDisabledMessage(null), null);
  });
});

describe("partitionQueueEntries", () => {
  it("splits waiting / active / terminal and counts", () => {
    const parts = partitionQueueEntries([
      { status: "waiting" as const },
      { status: "waiting" as const },
      { status: "called" as const },
      { status: "serving" as const },
      { status: "completed" as const },
      { status: "skipped" as const },
      { status: "no_show" as const },
    ]);
    assert.equal(parts.waiting.length, 2);
    assert.equal(parts.active.length, 2);
    assert.equal(parts.terminal.length, 3);
    assert.equal(parts.counts.waiting, 2);
    assert.equal(parts.counts.serving, 1);
    assert.equal(parts.counts.completed, 1);
  });
});

describe("pending keys and labels", () => {
  it("builds stable pending keys for duplicate-click protection", () => {
    assert.equal(callNextPendingKey(), "call-next");
    assert.equal(entryActionPendingKey("abc", "completed"), "abc:completed");
  });

  it("labels actions and marks destructive ones", () => {
    assert.equal(staffActionLabel("completed"), "Complete");
    assert.equal(isDestructiveStaffAction("no_show"), true);
    assert.equal(isDestructiveStaffAction("completed"), false);
    assert.equal(entryStatusLabel("no_show"), "No-show");
    assert.match(staffActionSuccessMessage("completed"), /completed/i);
  });
});

describe("formatWaitingDuration", () => {
  it("formats relative waiting time", () => {
    const now = Date.parse("2026-06-01T12:00:00Z");
    assert.equal(
      formatWaitingDuration("2026-06-01T11:59:30Z", now),
      "Just now",
    );
    assert.equal(
      formatWaitingDuration("2026-06-01T11:45:00Z", now),
      "15 min",
    );
    assert.equal(
      formatWaitingDuration("2026-06-01T10:00:00Z", now),
      "2h",
    );
  });
});

describe("mapQueueEntryErrorMessage (Phase 15)", () => {
  it("maps expected staff workflow errors", () => {
    assert.equal(
      mapQueueEntryErrorMessage("No waiting customers"),
      "No customers are waiting.",
    );
    assert.equal(mapQueueEntryErrorMessage("Queue is paused."), "Queue is paused.");
    assert.equal(mapQueueEntryErrorMessage("Queue is closed."), "Queue is closed.");
    assert.equal(
      mapQueueEntryErrorMessage("Invalid transition from called to completed"),
      "This action is no longer available.",
    );
    assert.equal(
      mapQueueEntryErrorMessage("Entry is already in status completed"),
      "This customer has already been served.",
    );
  });
});
