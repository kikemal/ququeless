import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Phase 19 secret boundary", () => {
  it("keeps service-role and Resend keys server-only", () => {
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
    assert.doesNotMatch(example, /NEXT_PUBLIC_RESEND/);
    assert.match(example, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(example, /RESEND_API_KEY/);
  });

  it("guards createAdminClient against browser execution", () => {
    const source = readFileSync(
      path.join(root, "lib/supabase/admin.ts"),
      "utf8",
    );
    assert.match(source, /typeof window !== "undefined"/);
    assert.match(source, /must not run in the browser/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
  });
});

describe("Phase 19 owner action gates", () => {
  it("requires business_owner role in services and queues actions", () => {
    const queues = readFileSync(
      path.join(root, "app/(app)/dashboard/queues/actions.ts"),
      "utf8",
    );
    const services = readFileSync(
      path.join(root, "app/(app)/dashboard/services/actions.ts"),
      "utf8",
    );
    assert.match(queues, /getPrimaryMembership/);
    assert.match(queues, /business_owner/);
    assert.match(queues, /Only business owners can manage queues/);
    assert.match(services, /getPrimaryMembership/);
    assert.match(services, /Only business owners can manage services/);
  });
});
