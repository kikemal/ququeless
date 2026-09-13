import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  customerStatusHeadline,
  customerStatusLabel,
} from "../../lib/ticket/timeline.ts";
import {
  DASHBOARD_GET_STARTED_DESCRIPTION,
  publicJoinStatusMessage,
  removeStaffConfirmMessage,
  revokeInvitationConfirmMessage,
} from "../../lib/ux/copy.ts";

describe("Phase 18 customer status copy", () => {
  it("uses friendly customer-facing headlines", () => {
    assert.equal(customerStatusLabel("waiting"), "You're waiting");
    assert.equal(customerStatusHeadline("waiting", 0), "You're next");
    assert.equal(customerStatusHeadline("waiting", 2), "You're waiting");
    assert.equal(customerStatusLabel("called"), "Please get ready");
    assert.equal(customerStatusLabel("serving"), "You're being served");
    assert.equal(customerStatusLabel("completed"), "Your visit is complete");
    assert.equal(customerStatusLabel("skipped"), "This ticket was skipped");
    assert.equal(customerStatusLabel("cancelled"), "This ticket was cancelled");
  });
});

describe("Phase 18 join status messages", () => {
  it("explains blocked and open join states clearly", () => {
    assert.match(
      publicJoinStatusMessage(false, "open", false),
      /business is closed/i,
    );
    assert.match(
      publicJoinStatusMessage(true, "open", true),
      /queue is full/i,
    );
    assert.match(
      publicJoinStatusMessage(true, "paused", false),
      /paused/i,
    );
    assert.match(
      publicJoinStatusMessage(true, "open", false),
      /open/i,
    );
  });
});

describe("Phase 18 confirmation copy", () => {
  it("builds clear destructive confirmations", () => {
    assert.match(removeStaffConfirmMessage("Alex"), /Alex/);
    assert.match(revokeInvitationConfirmMessage("a@b.com"), /a@b.com/);
    assert.match(DASHBOARD_GET_STARTED_DESCRIPTION, /QR|public link/i);
  });
});
