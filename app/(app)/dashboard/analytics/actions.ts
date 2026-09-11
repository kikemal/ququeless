"use server";

import { getPrimaryBusiness } from "@/lib/auth/business";
import {
  resolveAnalyticsRange,
  type AnalyticsPreset,
} from "@/lib/analytics/metrics";
import { createClient } from "@/lib/supabase/server";

export type AnalyticsOverview = {
  total_customers: number;
  served: number;
  cancelled: number;
  skipped: number;
  eligible_outcomes: number;
  completion_rate: number | null;
  avg_wait_seconds: number | null;
  avg_service_seconds: number | null;
};

export type AnalyticsQueueRow = {
  queue_name: string;
  total_customers: number;
  served: number;
  cancelled: number;
  skipped: number;
  avg_wait_seconds: number | null;
  avg_service_seconds: number | null;
};

export type AnalyticsServiceRow = {
  service_name: string;
  total_customers: number;
  served: number;
  avg_wait_seconds: number | null;
  avg_service_seconds: number | null;
};

export type AnalyticsTrendPoint = {
  day: string;
  total_customers: number;
  served: number;
  cancelled: number;
};

export type AnalyticsPayload = {
  range_start: string;
  range_end: string;
  timezone: string;
  overview: AnalyticsOverview;
  queues: AnalyticsQueueRow[];
  services: AnalyticsServiceRow[];
  trend: AnalyticsTrendPoint[];
  busiest_day: { day: string; total_customers: number } | null;
};

export type AnalyticsLoadResult = {
  error?: string;
  data?: AnalyticsPayload;
};

export async function loadBusinessAnalytics(input: {
  preset: AnalyticsPreset;
  customStart?: string | null;
  customEnd?: string | null;
}): Promise<AnalyticsLoadResult> {
  const range = resolveAnalyticsRange(
    input.preset,
    new Date(),
    input.customStart,
    input.customEnd,
  );

  if ("error" in range) {
    return { error: range.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please log in again." };
  }

  const business = await getPrimaryBusiness(user.id);
  if (!business) {
    return { error: "Create your business before viewing analytics." };
  }

  const { data, error } = await supabase.rpc("get_my_business_analytics", {
    p_start: range.start.toISOString(),
    p_end: range.end.toISOString(),
  });

  if (error || !data) {
    console.error("loadBusinessAnalytics", error?.code ?? "unknown");
    return { error: "We couldn't load analytics right now." };
  }

  const payload = data as AnalyticsPayload;
  return { data: payload };
}
