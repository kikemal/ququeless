import type { CustomerNotificationType } from "@/lib/notifications/content";

export type SendCustomerEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  notificationType: CustomerNotificationType;
};

export type SendCustomerEmailResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
};

export type CustomerEmailTransport = {
  send(input: SendCustomerEmailInput): Promise<SendCustomerEmailResult>;
};

/**
 * Development / default transport. Records delivery without calling an external API.
 * Never logs recipient addresses or message bodies.
 */
export function createConsoleEmailTransport(): CustomerEmailTransport {
  return {
    async send(input) {
      const forceFail = process.env.QUEUELESS_EMAIL_FORCE_FAIL === "1";
      if (forceFail) {
        console.info("customer_email_delivery", {
          status: "failed",
          type: input.notificationType,
          reason: "forced_fail",
        });
        return { ok: false, error: "Delivery unavailable" };
      }

      console.info("customer_email_delivery", {
        status: "sent",
        type: input.notificationType,
        subject: input.subject,
      });
      return {
        ok: true,
        providerMessageId: `dev-${input.notificationType}-${Date.now()}`,
      };
    },
  };
}

/**
 * Optional Resend HTTP transport when QUEUELESS_EMAIL_PROVIDER=resend
 * and RESEND_API_KEY is set. Falls back to console transport otherwise.
 */
export function createResendEmailTransport(): CustomerEmailTransport {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.QUEUELESS_EMAIL_FROM?.trim() || "QueueLess <onboarding@resend.dev>";

  if (!apiKey) {
    return createConsoleEmailTransport();
  }

  return {
    async send(input) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [input.to],
            subject: input.subject,
            text: input.text,
            html: input.html,
          }),
        });

        if (!response.ok) {
          console.info("customer_email_delivery", {
            status: "failed",
            type: input.notificationType,
            httpStatus: response.status,
          });
          return { ok: false, error: "Delivery unavailable" };
        }

        const body = (await response.json()) as { id?: string };
        console.info("customer_email_delivery", {
          status: "sent",
          type: input.notificationType,
        });
        return { ok: true, providerMessageId: body.id };
      } catch {
        console.info("customer_email_delivery", {
          status: "failed",
          type: input.notificationType,
          reason: "network",
        });
        return { ok: false, error: "Delivery unavailable" };
      }
    },
  };
}

export function getCustomerEmailTransport(): CustomerEmailTransport {
  const provider = (process.env.QUEUELESS_EMAIL_PROVIDER ?? "console")
    .trim()
    .toLowerCase();

  if (provider === "resend") {
    return createResendEmailTransport();
  }

  return createConsoleEmailTransport();
}

export async function sendCustomerNotification(
  input: SendCustomerEmailInput,
  transport: CustomerEmailTransport = getCustomerEmailTransport(),
): Promise<SendCustomerEmailResult> {
  return transport.send(input);
}
