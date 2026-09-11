import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isValidEmail as isValidInviteEmail,
  normalizeEmail as normalizeInviteEmail,
} from "../../lib/email/address.ts";
import {
  buildInvitePath,
  buildInviteUrl,
  invitationStatus,
  isInvitationAcceptable,
} from "../../lib/team/invitation.ts";
import { getSafeAuthRedirect } from "../../lib/auth/redirect.ts";

describe("normalizeInviteEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeInviteEmail("  Alex@Example.COM "), "alex@example.com");
  });
});

describe("isValidInviteEmail", () => {
  it("accepts simple emails", () => {
    assert.equal(isValidInviteEmail("staff@example.com"), true);
  });

  it("rejects blanks and spaces", () => {
    assert.equal(isValidInviteEmail(""), false);
    assert.equal(isValidInviteEmail("a @b.com"), false);
  });
});

describe("invitationStatus", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  it("returns pending for future expiry", () => {
    assert.equal(
      invitationStatus({
        acceptedAt: null,
        revokedAt: null,
        expiresAt: "2026-09-11T12:00:00.000Z",
        now,
      }),
      "pending",
    );
  });

  it("returns expired, revoked, accepted correctly", () => {
    assert.equal(
      invitationStatus({
        acceptedAt: null,
        revokedAt: null,
        expiresAt: "2026-09-09T12:00:00.000Z",
        now,
      }),
      "expired",
    );
    assert.equal(
      invitationStatus({
        acceptedAt: null,
        revokedAt: "2026-09-10T11:00:00.000Z",
        expiresAt: "2026-09-11T12:00:00.000Z",
        now,
      }),
      "revoked",
    );
    assert.equal(
      invitationStatus({
        acceptedAt: "2026-09-10T11:00:00.000Z",
        revokedAt: null,
        expiresAt: "2026-09-11T12:00:00.000Z",
        now,
      }),
      "accepted",
    );
  });
});

describe("isInvitationAcceptable", () => {
  it("only pending is acceptable", () => {
    assert.equal(isInvitationAcceptable("pending"), true);
    assert.equal(isInvitationAcceptable("expired"), false);
  });
});

describe("buildInvitePath / buildInviteUrl", () => {
  it("builds a path for hex tokens", () => {
    const token = "a".repeat(64);
    assert.equal(buildInvitePath(token), `/invite/${token}`);
  });

  it("rejects unsafe tokens", () => {
    assert.equal(buildInvitePath("../x"), null);
    assert.equal(buildInvitePath("ab/cd"), null);
  });

  it("builds absolute urls with origin", () => {
    const token = "b".repeat(64);
    assert.equal(
      buildInviteUrl(token, "http://localhost:3000"),
      `http://localhost:3000/invite/${token}`,
    );
  });
});

describe("getSafeAuthRedirect", () => {
  it("allows invite and dashboard paths", () => {
    const token = "c".repeat(64);
    assert.equal(getSafeAuthRedirect(`/invite/${token}`), `/invite/${token}`);
    assert.equal(getSafeAuthRedirect("/dashboard/team"), "/dashboard/team");
  });

  it("rejects open redirects", () => {
    assert.equal(getSafeAuthRedirect("//evil.com"), null);
    assert.equal(getSafeAuthRedirect("https://evil.com"), null);
    assert.equal(getSafeAuthRedirect("/onboarding"), null);
  });
});
