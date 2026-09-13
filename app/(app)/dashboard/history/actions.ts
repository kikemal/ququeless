"use server";

import { resolveAnalyticsRange, type AnalyticsPreset } from "@/lib/analytics/metrics";
import {
  HISTORY_PAGE_SIZE,
  historyOffsetForPage,
  isHistoryOutcome,
  type HistoryRow,
} from "@/lib/dashboard/history";
import { getPrimaryBusiness, getPrimaryMembership } from "@/lib/auth/business";
import { createClient } from "@/lib/supabase/server";

export type HistoryLoadResult = {
  rows: HistoryRow[];
  totalCount: number;
  error?: string;
  queues: { id: string; name: string }[];
};

function mapHistoryError(message: string | undefined): string {
  const value = (message ?? "").toLowerCase();
  if (value.includes("authentication required") || value.includes("jwt")) {
    return "Your session expired. Please log in again.";
  }
  if (
    value.includes("business membership required") ||
    value.includes("insufficient_privilege") ||
    value.includes("permission denied")
  ) {
    return "You do not have permission to view queue history.";
  }
  if (value.includes("invalid date range") || value.includes("date range too large")) {
    return "Choose a valid date range.";
  }
  if (value.includes("invalid outcome")) {
    return "Choose a valid status filter.";
  }
  if (value.includes("invalid page")) {
    return "That page is not available.";
  }
  if (value.includes("queue not found")) {
    return "Choose a queue that belongs to your business.";
  }
  return "Could not load queue history. Please try again.";
}

export async function loadBusinessQueueHistory(options: {
  preset: AnalyticsPreset;
  customStart?: string | null;
  customEnd?: string | null;
  queueId?: string | null;
  outcome?: string | null;
  page?: number;
}): Promise<HistoryLoadResult> {
  const empty: HistoryLoadResult = { rows: [], totalCount: 0, queues: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ...empty, error: "Your session expired. Please log in again." };
  }

  const membership = await getPrimaryMembership(user.id);
  const business = await getPrimaryBusiness(user.id);
  if (!membership || !business) {
    return { ...empty, error: "Create a business before viewing history." };
  }

  const range = resolveAnalyticsRange(
    options.preset,
    new Date(),
    options.customStart,
    options.customEnd,
  );
  if ("error" in range) {
    return { ...empty, error: range.error };
  }

  const outcome =
    options.outcome && isHistoryOutcome(options.outcome)
      ? options.outcome
      : null;

  const page = Math.max(1, options.page ?? 1);
  const offset = historyOffsetForPage(page, HISTORY_PAGE_SIZE);

  const { data: queues, error: queuesError } = await supabase
    .from("queues")
    .select("id, name")
    .eq("business_id", business.id)
    .order("name", { ascending: true });

  if (queuesError) {
    console.error("loadBusinessQueueHistory queues", queuesError.code);
  }

  const queueList = queues ?? [];
  const queueId =
    options.queueId && queueList.some((q) => q.id === options.queueId)
      ? options.queueId
      : null;

  const { data, error } = await supabase.rpc("get_my_business_queue_history", {
    p_start: range.start.toISOString(),
    p_end: range.end.toISOString(),
    p_queue_id: queueId,
    p_outcome: outcome,
    p_limit: HISTORY_PAGE_SIZE,
    p_offset: offset,
  });

  if (error) {
    console.error("get_my_business_queue_history error", error.code);
    return {
      ...empty,
      queues: queueList,
      error: mapHistoryError(error.message),
    };
  }

  const rows = (data ?? []) as HistoryRow[];
  const totalCount = rows[0]?.total_count ?? 0;

  return {
    rows,
    totalCount: Number(totalCount),
    queues: queueList,
  };
}
