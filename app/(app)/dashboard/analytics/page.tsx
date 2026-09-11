import type { Metadata } from "next";
import { Suspense } from "react";

import { loadBusinessAnalytics } from "@/app/(app)/dashboard/analytics/actions";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import type { AnalyticsPreset } from "@/lib/analytics/metrics";

export const metadata: Metadata = {
  title: "Analytics",
};

type AnalyticsPageProps = {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
};

function parsePreset(value: string | undefined): AnalyticsPreset {
  if (value === "7d" || value === "30d" || value === "custom" || value === "today") {
    return value;
  }
  return "today";
}

async function AnalyticsBody({
  searchParams,
}: {
  searchParams: AnalyticsPageProps["searchParams"];
}) {
  const params = await searchParams;
  const preset = parsePreset(params.range);
  const customStart = params.from ?? null;
  const customEnd = params.to ?? null;

  const result = await loadBusinessAnalytics({
    preset,
    customStart,
    customEnd,
  });

  return (
    <AnalyticsDashboard
      initialPreset={preset}
      customStart={customStart}
      customEnd={customEnd}
      data={result.data ?? null}
      error={result.error ?? null}
    />
  );
}

export default function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  return (
    <main>
      <Suspense
        fallback={
          <p className="text-sm text-muted" role="status">
            Loading analytics…
          </p>
        }
      >
        <AnalyticsBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
