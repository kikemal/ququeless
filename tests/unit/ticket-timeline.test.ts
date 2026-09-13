import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MISSING_TOKEN_RECOVERY,
  buildTicketTimeline,
  customerStatusLabel,
  formatTicketTimestamp,
  isTerminalTicketStatus,
  mapTicketCredentialError,
  resolveCustomerFacingStatus,
  ticketAvailabilityNote,
} from "../../lib/ticket/timeline.ts";

describe("resolveCustomerFacingStatus", () => {
  it("maps cancelled_at + skipped to cancelled", () => {
    assert.equal(
      resolveCustomerFacingStatus("skipped", "2026-06-01T12:00:00Z"),
      "cancelled",
    );
  });

  it("keeps skipped without cancelled_at", () => {
    assert.equal(resolveCustomerFacingStatus("skipped", null), "skipped");
  });

  it("passes through other statuses", () => {
    assert.equal(resolveCustomerFacingStatus("waiting", null), "waiting");
    assert.equal(resolveCustomerFacingStatus("called", null), "called");
    assert.equal(resolveCustomerFacingStatus("serving", null), "serving");
    assert.equal(resolveCustomerFacingStatus("completed", null), "completed");
    assert.equal(resolveCustomerFacingStatus("no_show", null), "no_show");
  });
});

describe("buildTicketTimeline", () => {
  it("marks joined current while waiting", () => {
    const steps = buildTicketTimeline({
      status: "waiting",
      joined_at: "2026-06-01T10:00:00Z",
      called_at: null,
      serving_at: null,
      completed_at: null,
      cancelled_at: null,
    });
    assert.equal(steps[0].state, "current");
    assert.equal(steps[1].state, "pending");
    assert.equal(steps[2].state, "pending");
    assert.equal(steps[0].at, "2026-06-01T10:00:00Z");
  });

  it("marks called current when called", () => {
    const steps = buildTicketTimeline({
      status: "called",
      joined_at: "2026-06-01T10:00:00Z",
      called_at: "2026-06-01T10:20:00Z",
      serving_at: null,
      completed_at: null,
      cancelled_at: null,
    });
    assert.equal(steps[0].state, "done");
    assert.equal(steps[1].state, "current");
    assert.equal(steps[1].label, "Called");
    assert.equal(steps[2].state, "pending");
  });

  it("labels serving while being served", () => {
    const steps = buildTicketTimeline({
      status: "serving",
      joined_at: "2026-06-01T10:00:00Z",
      called_at: "2026-06-01T10:20:00Z",
      serving_at: "2026-06-01T10:22:00Z",
      completed_at: null,
      cancelled_at: null,
    });
    assert.equal(steps[1].state, "current");
    assert.equal(steps[1].label, "Serving");
  });

  it("shows completed outcome", () => {
    const steps = buildTicketTimeline({
      status: "completed",
      joined_at: "2026-06-01T10:00:00Z",
      called_at: "2026-06-01T10:20:00Z",
      serving_at: "2026-06-01T10:22:00Z",
      completed_at: "2026-06-01T10:30:00Z",
      cancelled_at: null,
    });
    assert.equal(steps[1].state, "done");
    assert.equal(steps[2].state, "current");
    assert.equal(steps[2].label, "Completed");
    assert.equal(steps[2].at, "2026-06-01T10:30:00Z");
  });

  it("shows skipped and no-show outcomes", () => {
    assert.equal(
      buildTicketTimeline({
        status: "skipped",
        joined_at: "2026-06-01T10:00:00Z",
        called_at: null,
        serving_at: null,
        completed_at: "2026-06-01T10:15:00Z",
        cancelled_at: null,
      })[2].label,
      "Skipped",
    );
    assert.equal(
      buildTicketTimeline({
        status: "no_show",
        joined_at: "2026-06-01T10:00:00Z",
        called_at: "2026-06-01T10:20:00Z",
        serving_at: null,
        completed_at: "2026-06-01T10:25:00Z",
        cancelled_at: null,
      })[2].label,
      "No-show",
    );
  });

  it("shows cancelled when cancelled_at is set", () => {
    const steps = buildTicketTimeline({
      status: "skipped",
      joined_at: "2026-06-01T10:00:00Z",
      called_at: null,
      serving_at: null,
      completed_at: "2026-06-01T10:10:00Z",
      cancelled_at: "2026-06-01T10:10:00Z",
    });
    assert.equal(steps[1].state, "pending");
    assert.equal(steps[2].label, "Cancelled");
    assert.equal(steps[2].state, "current");
    assert.equal(customerStatusLabel("cancelled"), "This ticket was cancelled");
    assert.equal(customerStatusLabel("skipped"), "This ticket was skipped");
  });

  it("tolerates missing timestamps", () => {
    const steps = buildTicketTimeline({
      status: "waiting",
      joined_at: null,
      called_at: null,
      serving_at: null,
      completed_at: null,
      cancelled_at: null,
    });
    assert.equal(steps[0].at, null);
    assert.equal(formatTicketTimestamp(null), "—");
  });
});

describe("ticketAvailabilityNote", () => {
  it("returns null for terminal tickets", () => {
    assert.equal(
      ticketAvailabilityNote({
        queueStatus: "closed",
        businessIsOpen: false,
        isTerminal: true,
      }),
      null,
    );
  });

  it("notes business closed without changing ticket status semantics", () => {
    const note = ticketAvailabilityNote({
      queueStatus: "open",
      businessIsOpen: false,
      isTerminal: false,
    });
    assert.equal(note?.kind, "business_closed");
    assert.match(note?.message ?? "", /still valid/i);
  });

  it("notes queue closed / paused", () => {
    assert.equal(
      ticketAvailabilityNote({
        queueStatus: "closed",
        businessIsOpen: true,
        isTerminal: false,
      })?.kind,
      "queue_closed",
    );
    assert.equal(
      ticketAvailabilityNote({
        queueStatus: "paused",
        businessIsOpen: true,
        isTerminal: false,
      })?.kind,
      "queue_paused",
    );
  });
});

describe("credential recovery messaging", () => {
  it("explains missing token without offering public_id recovery", () => {
    const mapped = mapTicketCredentialError(
      "Your ticket access credential is not available in this browser.",
    );
    assert.equal(mapped.title, "Ticket credential missing");
    assert.ok(mapped.recovery?.includes("cannot recover"));
    assert.equal(MISSING_TOKEN_RECOVERY.includes("email"), false);
  });

  it("maps invalid ticket errors", () => {
    const mapped = mapTicketCredentialError(
      "This ticket could not be found. Check that you opened it on this device.",
    );
    assert.equal(mapped.title, "Ticket not found");
  });
});

describe("isTerminalTicketStatus", () => {
  it("treats completed/skipped/no_show/cancelled as terminal", () => {
    assert.equal(isTerminalTicketStatus("completed"), true);
    assert.equal(isTerminalTicketStatus("skipped"), true);
    assert.equal(isTerminalTicketStatus("no_show"), true);
    assert.equal(isTerminalTicketStatus("waiting", "2026-01-01T00:00:00Z"), true);
    assert.equal(isTerminalTicketStatus("waiting"), false);
    assert.equal(isTerminalTicketStatus("called"), false);
  });
});
