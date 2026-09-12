import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { getSafeAuthRedirect } from "../../lib/auth/redirect.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Phase 11 env exposure", () => {
  it("does not document service-role or Resend keys as NEXT_PUBLIC_", () => {
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
    assert.doesNotMatch(example, /NEXT_PUBLIC_RESEND/);
    assert.match(example, /Server-only secrets/);
    assert.match(example, /SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("Phase 11 auth redirect hardening", () => {
  it("rejects open redirects and non-allowlisted paths", () => {
    assert.equal(getSafeAuthRedirect("https://evil.example/phish"), null);
    assert.equal(getSafeAuthRedirect("//evil.example"), null);
    assert.equal(getSafeAuthRedirect("/login"), null);
    assert.equal(getSafeAuthRedirect("/onboarding"), null);
    assert.equal(getSafeAuthRedirect("/dashboard/analytics"), "/dashboard/analytics");
  });
});
