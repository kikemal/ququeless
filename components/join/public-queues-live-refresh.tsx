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
};

/**
 * Refetch the public queue page when any queue broadcasts a refresh signal.
 * Payloads are signals only — authoritative data comes from get_public_queues.
 */
export function PublicQueuesLiveRefresh({
  queueIds,
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
            if (pollTimer !== null && liveCount === ids.length) {
              window.clearInterval(pollTimer);
              pollTimer = null;
            }
          }
        }),
    );

    pollTimer = window.setInterval(() => {
      onSignal();
    }, LIVE_POLL_FALLBACK_MS);

    return () => {
      cancelled = true;
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [enabled, queueIdsKey, onSignal]);

  return null;
}
