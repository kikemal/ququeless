import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LIVE_POLL_FALLBACK_MS,
  TERMINAL_ENTRY_STATUSES,
  liveStatusLabel,
  queueEntriesChannel,
  queueRefreshChannel,
} from "../../lib/realtime/channels.ts";

describe("realtime channel helpers", () => {
  it("builds queue refresh channels without secrets", () => {
    const channel = queueRefreshChannel("11111111-1111-1111-1111-111111111111");
    assert.equal(
      channel,
      "queue-refresh:11111111-1111-1111-1111-111111111111",
    );
    assert.equal(channel.includes("access_token"), false);
    assert.equal(channel.includes("token"), false);
  });

  it("builds staff entry channels scoped by queue id", () => {
    assert.equal(
      queueEntriesChannel("22222222-2222-2222-2222-222222222222"),
      "queue-entries:22222222-2222-2222-2222-222222222222",
    );
  });

  it("uses a modest polling fallback interval", () => {
    assert.ok(LIVE_POLL_FALLBACK_MS >= 10_000);
    assert.ok(LIVE_POLL_FALLBACK_MS <= 30_000);
  });

  it("treats completed/skipped/no_show as terminal", () => {
    assert.equal(TERMINAL_ENTRY_STATUSES.has("completed"), true);
    assert.equal(TERMINAL_ENTRY_STATUSES.has("skipped"), true);
    assert.equal(TERMINAL_ENTRY_STATUSES.has("no_show"), true);
    assert.equal(TERMINAL_ENTRY_STATUSES.has("waiting"), false);
  });

  it("labels live connection states", () => {
    assert.equal(liveStatusLabel("live"), "Live");
    assert.equal(liveStatusLabel("connecting"), "Connecting…");
    assert.equal(liveStatusLabel("idle"), "");
  });
});
