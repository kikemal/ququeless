"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  LIVE_POLL_FALLBACK_MS,
  queueEntriesChannel,
  queueRefreshChannel,
  type LiveStatus,
} from "@/lib/realtime/channels";

type UseQueueRefreshSignalOptions = {
  queueId: string | null | undefined;
  enabled: boolean;
  onSignal: () => void;
};

/**
 * Customer-safe live signal: public broadcast with no ticket payload.
 * Always re-fetch via get_ticket after a signal.
 */
export function useQueueRefreshSignal({
  queueId,
  enabled,
  onSignal,
}: UseQueueRefreshSignalOptions) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const onSignalRef = useRef(onSignal);

  useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!enabled || !queueId) {
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let live = false;

    const supabase = createClient();
    const channel = supabase
      .channel(queueRefreshChannel(queueId))
      .on("broadcast", { event: "refresh" }, () => {
        onSignalRef.current();
      })
      .subscribe((subscribeStatus) => {
        if (cancelled) {
          return;
        }

        if (subscribeStatus === "SUBSCRIBED") {
          live = true;
          setStatus("live");
          if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
          return;
        }

        if (
          subscribeStatus === "CHANNEL_ERROR" ||
          subscribeStatus === "TIMED_OUT" ||
          subscribeStatus === "CLOSED"
        ) {
          live = false;
          setStatus("polling");
          if (pollTimer === null) {
            pollTimer = window.setInterval(() => {
              onSignalRef.current();
            }, LIVE_POLL_FALLBACK_MS);
          }
        }
      });

    pollTimer = window.setInterval(() => {
      if (!live) {
        onSignalRef.current();
      }
    }, LIVE_POLL_FALLBACK_MS);

    const connectingTimer = window.setTimeout(() => {
      if (!cancelled && !live) {
        setStatus("connecting");
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(connectingTimer);
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [queueId, enabled]);

  return enabled && queueId ? status : "idle";
}

type UseQueueEntriesLiveOptions = {
  queueId: string;
  enabled?: boolean;
  onChange: () => void;
};

/**
 * Dashboard live updates via RLS-scoped postgres_changes.
 * Payload is treated only as a refresh signal.
 */
export function useQueueEntriesLive({
  queueId,
  enabled = true,
  onChange,
}: UseQueueEntriesLiveOptions) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const refresh = useCallback(() => {
    onChangeRef.current();
  }, []);

  useEffect(() => {
    if (!enabled || !queueId) {
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let live = false;

    const supabase = createClient();
    const channel = supabase
      .channel(queueEntriesChannel(queueId))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_entries",
          filter: `queue_id=eq.${queueId}`,
        },
        () => {
          refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "queues",
          filter: `id=eq.${queueId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe((subscribeStatus) => {
        if (cancelled) {
          return;
        }

        if (subscribeStatus === "SUBSCRIBED") {
          live = true;
          setStatus("live");
          if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
          return;
        }

        if (
          subscribeStatus === "CHANNEL_ERROR" ||
          subscribeStatus === "TIMED_OUT" ||
          subscribeStatus === "CLOSED"
        ) {
          live = false;
          setStatus(
            subscribeStatus === "CLOSED" ? "reconnecting" : "polling",
          );
          if (pollTimer === null) {
            pollTimer = window.setInterval(() => {
              refresh();
            }, LIVE_POLL_FALLBACK_MS);
          }
        }
      });

    pollTimer = window.setInterval(() => {
      if (!live) {
        refresh();
      }
    }, LIVE_POLL_FALLBACK_MS);

    const connectingTimer = window.setTimeout(() => {
      if (!cancelled && !live) {
        setStatus("connecting");
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(connectingTimer);
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [queueId, enabled, refresh]);

  return enabled ? status : "idle";
}
