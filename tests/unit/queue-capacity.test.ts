import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatWaitingCapacityLabel,
  isQueueAtCapacity,
  parseMaxWaitingCustomersInput,
} from "../../lib/dashboard/queue-capacity.ts";

describe("parseMaxWaitingCustomersInput", () => {
  it("treats blank as unlimited", () => {
    assert.deepEqual(parseMaxWaitingCustomersInput(""), {
      ok: true,
      value: null,
    });
    assert.deepEqual(parseMaxWaitingCustomersInput("unlimited"), {
      ok: true,
      value: null,
    });
  });

  it("accepts positive integers", () => {
    assert.deepEqual(parseMaxWaitingCustomersInput("20"), {
      ok: true,
      value: 20,
    });
  });

  it("rejects zero, negatives, and non-integers", () => {
    assert.equal(parseMaxWaitingCustomersInput("0").ok, false);
    assert.equal(parseMaxWaitingCustomersInput("-1").ok, false);
    assert.equal(parseMaxWaitingCustomersInput("1.5").ok, false);
    assert.equal(parseMaxWaitingCustomersInput("abc").ok, false);
  });
});

describe("capacity helpers", () => {
  it("detects full vs open capacity", () => {
    assert.equal(isQueueAtCapacity(20, 20), true);
    assert.equal(isQueueAtCapacity(19, 20), false);
    assert.equal(isQueueAtCapacity(100, null), false);
  });

  it("formats waiting labels", () => {
    assert.equal(formatWaitingCapacityLabel(8, null), "Waiting: 8");
    assert.equal(formatWaitingCapacityLabel(8, 20), "Waiting: 8 / 20");
  });
});
