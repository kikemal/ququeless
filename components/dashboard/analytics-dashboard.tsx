"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  exportBusinessAnalyticsCsv,
  type AnalyticsPayload,
} from "@/app/(app)/dashboard/analytics/actions";
import {
  formatCompletionRate,
  formatDurationSeconds,
  formatMetricNumber,
  hasAnalyticsActivity,
  type AnalyticsPreset,
} from "@/lib/analytics/metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AnalyticsDashboardProps = {
  initialPreset: AnalyticsPreset;
  customStart: string | null;
  customEnd: string | null;
  data: AnalyticsPayload | null;
  error: string | null;
};

const presets: { id: AnalyticsPreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];

function downloadCsvFile(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AnalyticsDashboard({
  initialPreset,
  customStart,
  customEnd,
  data,
  error,
}: AnalyticsDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState(customStart ?? "");
  const [customTo, setCustomTo] = useState(customEnd ?? "");

  const overview = data?.overview;
  const empty = overview ? !hasAnalyticsActivity(overview.total_customers) : false;
  const trend = data?.trend ?? [];
  const maxTrend = Math.max(
    1,
    ...trend.map((point) => point.total_customers),
  );

  function navigate(preset: AnalyticsPreset, from?: string, to?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);
    if (preset === "custom") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    } else {
      params.delete("from");
      params.delete("to");
    }
    startTransition(() => {
      router.push(`/dashboard/analytics?${params.toString()}`);
    });
  }

  async function handleExportCsv() {
    if (isExporting) {
      return;
    }
    setExportError(null);
    setIsExporting(true);
    try {
      const result = await exportBusinessAnalyticsCsv({
        preset: initialPreset,
        customStart:
          initialPreset === "custom" ? customFrom || customStart : null,
        customEnd: initialPreset === "custom" ? customTo || customEnd : null,
      });
      if (result.error || !result.csv || !result.filename) {
        setExportError(result.error ?? "Could not export analytics.");
        return;
      }
      downloadCsvFile(result.csv, result.filename);
    } catch {
      setExportError("Could not export analytics. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
            Operational queue reporting for your business. Ranges use UTC day
            boundaries.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending || isExporting}
          onClick={() => {
            void handleExportCsv();
          }}
        >
          {isExporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Date range</h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant={initialPreset === preset.id ? "primary" : "secondary"}
              className="h-9 px-3 text-xs"
              disabled={isPending || isExporting}
              onClick={() => {
                if (preset.id === "custom") {
                  navigate(
                    "custom",
                    customFrom || customStart || undefined,
                    customTo || customEnd || undefined,
                  );
                  return;
                }
                navigate(preset.id);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        {initialPreset === "custom" ? (
          <form
            className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              navigate("custom", customFrom, customTo);
            }}
          >
            <div className="flex-1">
              <Label htmlFor="analytics-from">From (UTC)</Label>
              <Input
                id="analytics-from"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                required
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="analytics-to">To (UTC)</Label>
              <Input
                id="analytics-to"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={isPending || isExporting}>
              Apply
            </Button>
          </form>
        ) : null}
        {isPending ? (
          <p className="text-sm text-muted" role="status">
            Loading analytics…
          </p>
        ) : null}
      </section>

      {exportError ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {exportError}
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!error && empty ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          No queue activity for this period.
        </p>
      ) : null}

      {!error && overview && !empty ? (
        <>
          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Overview
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total customers" value={formatMetricNumber(overview.total_customers)} />
              <MetricCard label="Served" value={formatMetricNumber(overview.served)} />
              <MetricCard label="Cancelled" value={formatMetricNumber(overview.cancelled)} />
              <MetricCard label="Skipped / no-show" value={formatMetricNumber(overview.skipped)} />
              <MetricCard
                label="Completion rate"
                value={formatCompletionRate(overview.completion_rate)}
              />
              <MetricCard
                label="Average wait"
                value={formatDurationSeconds(overview.avg_wait_seconds)}
              />
              <MetricCard
                label="Average service"
                value={formatDurationSeconds(overview.avg_service_seconds)}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Customer volume
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4">
              <div className="flex h-40 min-w-[28rem] items-end gap-1">
                {trend.map((point) => {
                  const height = Math.max(
                    2,
                    Math.round((point.total_customers / maxTrend) * 100),
                  );
                  const servedHeight = Math.max(
                    point.served > 0 ? 2 : 0,
                    Math.round((point.served / maxTrend) * 100),
                  );
                  return (
                    <div
                      key={point.day}
                      className="flex flex-1 flex-col items-center justify-end gap-1"
                      title={`${point.day}: ${point.total_customers} total, ${point.served} served`}
                    >
                      <div className="relative flex h-28 w-full items-end justify-center">
                        <div
                          className="w-full max-w-[1.25rem] rounded-t bg-accent/30"
                          style={{ height: `${height}%` }}
                        />
                        <div
                          className="absolute bottom-0 w-full max-w-[1.25rem] rounded-t bg-accent"
                          style={{ height: `${servedHeight}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted">
                        {point.day.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">
                Bars show daily customers (light) and served (solid). Timezone: UTC.
              </p>
            </div>
          </section>

          {data?.busiest_day ? (
            <section className="rounded-xl border border-border bg-accent-soft/40 px-4 py-3 text-sm text-foreground">
              <strong className="font-medium">Busiest day:</strong>{" "}
              {data.busiest_day.day} · {data.busiest_day.total_customers} customers
            </section>
          ) : null}

          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Queue performance
            </h2>
            <AnalyticsTable
              headers={[
                "Queue",
                "Customers",
                "Served",
                "Cancelled",
                "Skipped",
                "Avg wait",
                "Avg service",
              ]}
              rows={(data?.queues ?? []).map((row) => [
                row.queue_name,
                formatMetricNumber(row.total_customers),
                formatMetricNumber(row.served),
                formatMetricNumber(row.cancelled),
                formatMetricNumber(row.skipped),
                formatDurationSeconds(row.avg_wait_seconds),
                formatDurationSeconds(row.avg_service_seconds),
              ])}
            />
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Service performance
            </h2>
            <AnalyticsTable
              headers={[
                "Service",
                "Customers",
                "Served",
                "Avg wait",
                "Avg service",
              ]}
              rows={(data?.services ?? []).map((row) => [
                row.service_name,
                formatMetricNumber(row.total_customers),
                formatMetricNumber(row.served),
                formatDurationSeconds(row.avg_wait_seconds),
                formatDurationSeconds(row.avg_service_seconds),
              ])}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function AnalyticsTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">No rows for this period.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border text-muted">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${headers[cellIndex]}-${cellIndex}`}
                  className={cn(
                    "px-3 py-3",
                    cellIndex === 0
                      ? "font-medium text-foreground"
                      : "text-muted",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
