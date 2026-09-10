import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isQueueStatus,
  queueStatusLabel,
} from "../../lib/dashboard/queue-status.ts";
import {
  optionalTrimmedText,
  parsePositiveInt,
} from "../../lib/dashboard/validation.ts";

describe("parsePositiveInt", () => {
  it("accepts positive whole numbers", () => {
    assert.equal(parsePositiveInt("30"), 30);
    assert.equal(parsePositiveInt(" 12 "), 12);
  });

  it("rejects zero, negatives, and non-integers", () => {
    assert.equal(parsePositiveInt("0"), null);
    assert.equal(parsePositiveInt("-3"), null);
    assert.equal(parsePositiveInt("1.5"), null);
    assert.equal(parsePositiveInt("abc"), null);
    assert.equal(parsePositiveInt(""), null);
  });
});

describe("optionalTrimmedText", () => {
  it("returns null for blank values", () => {
    assert.equal(optionalTrimmedText(""), null);
    assert.equal(optionalTrimmedText("   "), null);
  });

  it("returns trimmed text", () => {
    assert.equal(optionalTrimmedText("  Hello "), "Hello");
  });
});

describe("queue status helpers", () => {
  it("recognizes only schema statuses", () => {
    assert.equal(isQueueStatus("open"), true);
    assert.equal(isQueueStatus("paused"), true);
    assert.equal(isQueueStatus("closed"), true);
    assert.equal(isQueueStatus("waiting"), false);
  });

  it("labels statuses for UI", () => {
    assert.equal(queueStatusLabel("open"), "Open");
    assert.equal(queueStatusLabel("paused"), "Paused");
    assert.equal(queueStatusLabel("closed"), "Closed");
  });
});
