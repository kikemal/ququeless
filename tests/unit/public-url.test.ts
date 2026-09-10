import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPublicQueuePath,
  buildPublicQueueUrl,
  isPublicQueueUrlForSlug,
} from "../../lib/public-url.ts";

describe("buildPublicQueuePath", () => {
  it("builds the existing /q/[slug] path", () => {
    assert.equal(buildPublicQueuePath("acme-clinic"), "/q/acme-clinic");
  });

  it("rejects unsafe slug values", () => {
    assert.equal(buildPublicQueuePath("../admin"), null);
    assert.equal(buildPublicQueuePath("a/b"), null);
    assert.equal(buildPublicQueuePath("https://evil.example"), null);
    assert.equal(buildPublicQueuePath(""), null);
  });
});

describe("buildPublicQueueUrl", () => {
  it("encodes only the public queue URL for a known origin", () => {
    const url = buildPublicQueueUrl("my-business", "https://app.example.com");
    assert.equal(url, "https://app.example.com/q/my-business");
    assert.equal(url?.includes("access_token"), false);
    assert.equal(url?.includes("business_id"), false);
    assert.equal(url?.includes("ticket"), false);
  });

  it("returns null when origin is missing", () => {
    assert.equal(buildPublicQueueUrl("my-business", null), null);
  });

  it("rejects non-http origins", () => {
    assert.equal(
      buildPublicQueueUrl("my-business", "javascript:alert(1)"),
      null,
    );
  });
});

describe("isPublicQueueUrlForSlug", () => {
  it("accepts only the exact public queue URL", () => {
    assert.equal(
      isPublicQueueUrlForSlug(
        "https://app.example.com/q/my-business",
        "my-business",
        "https://app.example.com",
      ),
      true,
    );
    assert.equal(
      isPublicQueueUrlForSlug(
        "https://evil.example/q/my-business",
        "my-business",
        "https://app.example.com",
      ),
      false,
    );
  });
});
