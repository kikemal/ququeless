import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidEmail, normalizeEmail } from "../../lib/email/address.ts";
import {
  isRetryableNotificationStatus,
  isTerminalNotificationStatus,
  mapStatusToNotificationType,
  notificationIdempotencyKey,
  notificationSubject,
  notificationTextBody,
} from "../../lib/notifications/content.ts";
import {
  createConsoleEmailTransport,
  sendCustomerNotification,
} from "../../lib/notifications/email.ts";

describe("normalizeEmail / isValidEmail", () => {
  it("normalizes email addresses", () => {
    assert.equal(normalizeEmail("  A@B.Com "), "a@b.com");
  });

  it("validates practical emails", () => {
    assert.equal(isValidEmail("guest@example.com"), true);
    assert.equal(isValidEmail("bad"), false);
    assert.equal(isValidEmail("a @b.com"), false);
  });
});

describe("notification content", () => {
  it("maps subjects", () => {
    assert.equal(notificationSubject("called"), "Your QueueLess turn is ready");
    assert.equal(
      notificationSubject("cancelled"),
      "Your QueueLess ticket was cancelled",
    );
  });

  it("builds text without secrets", () => {
    const body = notificationTextBody({
      type: "called",
      businessName: "Salon",
      queueName: "Desk",
      queueNumber: 4,
      ticketUrl: "http://localhost:3000/ticket/abc",
    });
    assert.match(body, /being served/i);
    assert.match(body, /ticket\/abc/);
    assert.doesNotMatch(body, /access_token/i);
  });

  it("maps statuses and idempotency keys", () => {
    assert.equal(mapStatusToNotificationType("no_show"), "skipped");
    assert.equal(mapStatusToNotificationType("waiting"), null);
    assert.equal(
      notificationIdempotencyKey("entry-1", "called"),
      "entry-1:called:email",
    );
  });

  it("computes retry / terminal states", () => {
    assert.equal(isRetryableNotificationStatus("pending", 0), true);
    assert.equal(isRetryableNotificationStatus("failed", 2), true);
    assert.equal(isRetryableNotificationStatus("failed", 3), false);
    assert.equal(isRetryableNotificationStatus("sending", 1), false);
    assert.equal(isTerminalNotificationStatus("sent", 1), true);
    assert.equal(isTerminalNotificationStatus("failed", 3), true);
    assert.equal(isTerminalNotificationStatus("sending", 3), true);
  });
});

describe("email transport mock", () => {
  it("sends via console transport without network", async () => {
    const previous = process.env.QUEUELESS_EMAIL_FORCE_FAIL;
    delete process.env.QUEUELESS_EMAIL_FORCE_FAIL;
    const transport = createConsoleEmailTransport();
    const result = await sendCustomerNotification(
      {
        to: "guest@example.com",
        subject: "Test",
        text: "Hello",
        notificationType: "called",
      },
      transport,
    );
    assert.equal(result.ok, true);
    assert.ok(result.providerMessageId);
    if (previous === undefined) {
      delete process.env.QUEUELESS_EMAIL_FORCE_FAIL;
    } else {
      process.env.QUEUELESS_EMAIL_FORCE_FAIL = previous;
    }
  });

  it("supports forced failure for tests", async () => {
    process.env.QUEUELESS_EMAIL_FORCE_FAIL = "1";
    const transport = createConsoleEmailTransport();
    const result = await sendCustomerNotification(
      {
        to: "guest@example.com",
        subject: "Test",
        text: "Hello",
        notificationType: "completed",
      },
      transport,
    );
    assert.equal(result.ok, false);
    delete process.env.QUEUELESS_EMAIL_FORCE_FAIL;
  });
});
