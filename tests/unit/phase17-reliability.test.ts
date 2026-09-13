import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  mapJoinQueueErrorMessage,
  mapQueueEntryErrorMessage,
  mapTicketErrorMessage,
} from "../../lib/dashboard/errors.ts";
import {
  NOTIFICATION_STALE_AFTER_MS,
  isRetryableNotificationStatus,
  isTerminalNotificationStatus,
} from "../../lib/notifications/content.ts";
import { queueEntriesChannel } from "../../lib/realtime/channels.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function assertSafeClientMessage(message: string) {
  assert.doesNotMatch(message, /violates/i);
  assert.doesNotMatch(message, /25P02|42501|P0001/);
  assert.doesNotMatch(message, /stack/i);
  assert.doesNotMatch(message, /access_token/i);
  assert.doesNotMatch(message, /token_hash/i);
  assert.doesNotMatch(message, /service.?role/i);
  assert.doesNotMatch(message, /eyJ[A-Za-z0-9_-]+\./); // JWT-ish
}

describe("Phase 17 error mappers", () => {
  it("maps staff and ticket failures without leaking database detail", () => {
    const staff = mapQueueEntryErrorMessage(
      'duplicate key value violates unique constraint "queue_entries_pkey"',
    );
    const join = mapJoinQueueErrorMessage(
      "new row violates row-level security policy",
    );
    const ticket = mapTicketErrorMessage(
      "Invalid ticket credentials access_token_hash mismatch",
    );

    assertSafeClientMessage(staff);
    assertSafeClientMessage(join);
    assertSafeClientMessage(ticket);
    assert.match(staff, /try again/i);
  });

  it("maps network failures to a retryable message", () => {
    assert.match(
      mapQueueEntryErrorMessage("TypeError: fetch failed network"),
      /network/i,
    );
  });
});

describe("Phase 17 notification retry helpers", () => {
  it("treats fresh sending as non-retryable and stale sending as retryable", () => {
    const now = new Date("2026-09-13T12:00:00.000Z");
    assert.equal(
      isRetryableNotificationStatus("sending", 1, 3, {
        updatedAt: now,
        now,
      }),
      false,
    );
    assert.equal(
      isRetryableNotificationStatus("sending", 1, 3, {
        updatedAt: new Date(now.getTime() - NOTIFICATION_STALE_AFTER_MS - 1),
        now,
      }),
      true,
    );
    assert.equal(
      isRetryableNotificationStatus("sending", 3, 3, {
        updatedAt: new Date(now.getTime() - NOTIFICATION_STALE_AFTER_MS - 1),
        now,
      }),
      false,
    );
    assert.equal(isTerminalNotificationStatus("sending", 3), true);
  });
});

describe("Phase 17 env secret boundary", () => {
  it("keeps service-role and Resend keys server-only in .env.example", () => {
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
    assert.doesNotMatch(example, /NEXT_PUBLIC_RESEND/);
    assert.match(example, /^# SUPABASE_SERVICE_ROLE_KEY=/m);
    assert.match(example, /^# RESEND_API_KEY=/m);
    assert.match(example, /Server-only secrets/);
  });
});

describe("Phase 17 realtime channel helpers", () => {
  it("builds staff entry channels without secrets", () => {
    assert.equal(queueEntriesChannel("q-1"), "queue-entries:q-1");
    assert.doesNotMatch(queueEntriesChannel("q-1"), /token/i);
  });
});
