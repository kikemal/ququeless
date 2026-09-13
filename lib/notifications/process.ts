import {
  notificationSubject,
  notificationTextBody,
  type CustomerNotificationType,
} from "@/lib/notifications/content";
import { sendCustomerNotification } from "@/lib/notifications/email";
import { getAppOrigin } from "@/lib/public-url";
import { createClient } from "@/lib/supabase/server";

type ClaimedNotification = {
  id: string;
  type: CustomerNotificationType;
  channel: string;
  recipient: string;
  attempts: number;
  business_name: string;
  queue_name: string;
  queue_number: number;
  public_id: string;
};

function buildTicketUrl(publicId: string): string | null {
  const origin = getAppOrigin();
  if (!origin || !publicId) {
    return null;
  }
  return `${origin}/ticket/${publicId}`;
}

async function deliverClaimed(
  rows: ClaimedNotification[],
  finalize: (
    id: string,
    success: boolean,
    providerMessageId?: string,
    error?: string,
  ) => Promise<void>,
): Promise<void> {
  for (const row of rows) {
    const subject = notificationSubject(row.type);
    const text = notificationTextBody({
      type: row.type,
      businessName: row.business_name,
      queueName: row.queue_name,
      queueNumber: row.queue_number,
      ticketUrl: buildTicketUrl(row.public_id),
    });

    const result = await sendCustomerNotification({
      to: row.recipient,
      subject,
      text,
      notificationType: row.type,
      // Reclaim-after-send races: same notification id → same provider key.
      idempotencyKey: row.id,
    });

    await finalize(
      row.id,
      result.ok,
      result.providerMessageId,
      result.ok ? undefined : result.error ?? "Delivery unavailable",
    );
  }
}

/**
 * Deliver pending notifications for a queue entry (staff/member path).
 * Failures are recorded; callers should not fail the queue transition.
 */
export async function processNotificationsForEntry(
  entryId: string,
): Promise<void> {
  if (!entryId) {
    return;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "claim_customer_notifications_for_entry",
      { p_entry_id: entryId },
    );

    if (error) {
      console.error("claim_customer_notifications_for_entry", error.code);
      return;
    }

    const rows = (data ?? []) as ClaimedNotification[];
    if (rows.length === 0) {
      return;
    }

    await deliverClaimed(rows, async (id, success, providerMessageId, err) => {
      const { error: finalizeError } = await supabase.rpc(
        "finalize_customer_notification",
        {
          p_notification_id: id,
          p_success: success,
          p_provider_message_id: providerMessageId,
          p_error: err,
        },
      );
      if (finalizeError) {
        console.error("finalize_customer_notification", finalizeError.code);
      }
    });
  } catch {
    console.error("processNotificationsForEntry failed");
  }
}

/**
 * Deliver pending notifications after customer cancel (ticket-token path).
 */
export async function processNotificationsForTicket(
  publicId: string,
  accessToken: string,
): Promise<void> {
  if (!publicId || !accessToken.trim()) {
    return;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "claim_customer_notifications_for_ticket",
      {
        p_public_id: publicId,
        p_access_token: accessToken,
      },
    );

    if (error) {
      console.error("claim_customer_notifications_for_ticket", error.code);
      return;
    }

    const rows = (data ?? []) as ClaimedNotification[];
    if (rows.length === 0) {
      return;
    }

    await deliverClaimed(rows, async (id, success, providerMessageId, err) => {
      const { error: finalizeError } = await supabase.rpc(
        "finalize_customer_notification_for_ticket",
        {
          p_notification_id: id,
          p_public_id: publicId,
          p_access_token: accessToken,
          p_success: success,
          p_provider_message_id: providerMessageId,
          p_error: err,
        },
      );
      if (finalizeError) {
        console.error(
          "finalize_customer_notification_for_ticket",
          finalizeError.code,
        );
      }
    });
  } catch {
    console.error("processNotificationsForTicket failed");
  }
}
