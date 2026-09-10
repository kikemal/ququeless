import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { slugifyBusinessName, slugWithSuffix } from "../../lib/business/slug.ts";


describe("slugifyBusinessName", () => {
  it("converts a salon name into a url-safe slug", () => {
    assert.equal(slugifyBusinessName("ABC Beauty Salon"), "abc-beauty-salon");
  });

  it("strips punctuation and collapses separators", () => {
    assert.equal(slugifyBusinessName("  Joe's Barbershop!! "), "joe-s-barbershop");
  });

  it("falls back when the name has no usable characters", () => {
    assert.equal(slugifyBusinessName("***"), "business");
  });
});

describe("slugWithSuffix", () => {
  it("returns the base slug on the first attempt", () => {
    assert.equal(slugWithSuffix("abc-beauty-salon", 1), "abc-beauty-salon");
  });

  it("appends a numeric suffix for collisions", () => {
    assert.equal(slugWithSuffix("abc-beauty-salon", 2), "abc-beauty-salon-2");
  });
});
