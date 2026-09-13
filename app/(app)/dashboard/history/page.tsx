import type { Metadata } from "next";
import { Suspense } from "react";

import { loadBusinessQueueHistory } from "@/app/(app)/dashboard/history/actions";
import { HistoryDashboard } from "@/components/dashboard/history-dashboard";
import type { AnalyticsPreset } from "@/lib/analytics/metrics";
import { isHistoryOutcome, parseHistoryPage } from "@/lib/dashboard/history";

export const metadata: Metadata = {
  title: "History",
};

type HistoryPageProps = {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    queue?: string;
    outcome?: string;
    page?: string;
  }>;
};

function parsePreset(value: string | undefined): AnalyticsPreset {
  if (value === "7d" || value === "30d" || value === "custom" || value === "today") {
    return value;
  }
  return "7d";
}

async function HistoryBody({
  searchParams,
}: {
  searchParams: HistoryPageProps["searchParams"];
}) {
  const params = await searchParams;
  const preset = parsePreset(params.range);
  const customStart = params.from ?? null;
  const customEnd = params.to ?? null;
  const queueId = params.queue ?? null;
  const outcome =
    params.outcome && isHistoryOutcome(params.outcome) ? params.outcome : null;
  const page = parseHistoryPage(params.page);

  const result = await loadBusinessQueueHistory({
    preset,
    customStart,
    customEnd,
    queueId,
    outcome,
    page,
  });

  return (
    <HistoryDashboard
      initialPreset={preset}
      customStart={customStart}
      customEnd={customEnd}
      queueId={queueId}
      outcome={outcome}
      page={page}
      rows={result.rows}
      totalCount={result.totalCount}
      queues={result.queues}
      error={result.error ?? null}
    />
  );
}

export default function HistoryPage({ searchParams }: HistoryPageProps) {
  return (
    <main>
      <Suspense
        fallback={
          <p className="text-sm text-muted" role="status">
            Loading queue history…
          </p>
        }
      >
        <HistoryBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
