"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  LIVE_POLL_FALLBACK_MS,
  queueRefreshChannel,
} from "@/lib/realtime/channels";

type PublicQueuesLiveRefreshProps = {
  queueIds: string[];
  /** Soft UI refresh at the next open/close boundary; does not authorize joins. */
  scheduleRefreshInMs?: number;
};

/**
 * Refetch the public queue page when any queue broadcasts a refresh signal.
 * Payloads are signals only — authoritative data comes from get_public_queues.
 */
export function PublicQueuesLiveRefresh({
  queueIds,
  scheduleRefreshInMs,
}: PublicQueuesLiveRefreshProps) {
  const router = useRouter();
  const queueIdsKey = queueIds.join(",");
  const [enabled] = useState(queueIds.length > 0);
  const refreshRef = useRef(() => {
    router.refresh();
  });

  useEffect(() => {
    refreshRef.current = () => {
      router.refresh();
    };
  }, [router]);

  const onSignal = useCallback(() => {
    refreshRef.current();
  }, []);

  useEffect(() => {
    if (!enabled || !queueIdsKey) {
      return;
    }

    const ids = queueIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    let pollTimer: number | null = null;
    let liveCount = 0;

    const ensurePoll = () => {
      if (pollTimer === null) {
        pollTimer = window.setInterval(() => {
          onSignal();
        }, LIVE_POLL_FALLBACK_MS);
      }
    };

    const clearPoll = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const supabase = createClient();
    const channels = ids.map((queueId) =>
      supabase
        .channel(queueRefreshChannel(queueId))
        .on("broadcast", { event: "refresh" }, () => {
          onSignal();
        })
        .subscribe((status) => {
          if (cancelled) {
            return;
          }
          if (status === "SUBSCRIBED") {
            liveCount += 1;
            if (liveCount >= ids.length) {
              clearPoll();
            }
            return;
          }

          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            liveCount = Math.max(0, liveCount - 1);
            ensurePoll();
          }
        }),
    );

    // Poll only until realtime is fully connected (or after a later drop).
    ensurePoll();

    return () => {
      cancelled = true;
      clearPoll();
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [enabled, queueIdsKey, onSignal]);

  useEffect(() => {
    if (
      scheduleRefreshInMs === undefined ||
      !Number.isFinite(scheduleRefreshInMs) ||
      scheduleRefreshInMs <= 0
    ) {
      return;
    }
    // Cap at 6 hours so a bad clock math cannot create a forever timer.
    const delay = Math.min(scheduleRefreshInMs + 250, 6 * 60 * 60 * 1000);
    const timer = window.setTimeout(() => {
      onSignal();
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [scheduleRefreshInMs, onSignal]);

  return null;
}
