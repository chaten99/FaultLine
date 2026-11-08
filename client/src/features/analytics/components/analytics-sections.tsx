import { Skeleton } from "@/components/ui/skeleton";
import { useAvailability, useIncidentsAnalytics, useResponseTimes } from "../hooks/use-analytics";
import {
  formatCount,
  formatDuration,
  formatMs,
  formatPercent,
  presentAvailability,
  presentDowntime,
} from "../lib/analytics-format";
import type { AnalyticsQuery, CoverageMetric, ResponseTimeSummary } from "../types/analytics.types";
import { IncidentsAnalyticsContent, IncidentsSkeleton } from "./incidents-section";
import { LatencyDistribution, ResponseTimeChart } from "./response-time-chart";
import { AnalyticsSection, ChartSkeleton, ErrorPanel } from "./section-state";
import { UptimeTimeline } from "./uptime-timeline";

export function PercentileStrip({ summary }: { summary: ResponseTimeSummary }) {
  const items: [string, number | null][] = [
    ["Min", summary.min],
    ["P50 (median)", summary.p50],
    ["Average", summary.avg],
    ["P95", summary.p95],
    ["P99", summary.p99],
    ["Max", summary.max],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg border border-border bg-background p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate text-base font-semibold">
            {value === null ? "No data" : formatMs(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CoverageStats({ coverage }: { coverage: CoverageMetric }) {
  const items: [string, string][] = [
    ["Expected checks", formatCount(coverage.expected)],
    ["Completed checks", formatCount(coverage.completed)],
    ["Coverage", formatPercent(coverage.percent, 1) ?? "Unknown"],
    ["Unknown time", formatDuration(coverage.unknownMs)],
    ["Paused time", formatDuration(coverage.pausedMs)],
    ["Coverage gaps", formatCount(coverage.gapCount)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg border border-border bg-background p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate text-base font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ResponseTimeSection({ query }: { query: AnalyticsQuery }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useResponseTimes(query);
  return (
    <AnalyticsSection
      title="Response time"
      description="Average and percentile latency from completed checks that received an HTTP response."
    >
      {isError ? (
        <ErrorPanel error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <ChartSkeleton />
        </div>
      ) : (
        <div className="space-y-6">
          <PercentileStrip summary={data.summary} />
          <div className="rounded-lg border border-border bg-background p-4">
            <ResponseTimeChart series={data.series} window={data.window} />
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-medium">Latency distribution</h3>
            <LatencyDistribution distribution={data.distribution} summary={data.summary} />
          </div>
        </div>
      )}
    </AnalyticsSection>
  );
}

export function AvailabilitySection({ query }: { query: AnalyticsQuery }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useAvailability(query);
  const availability = data ? presentAvailability(data.summary.availability) : null;
  const downtime = data ? presentDowntime(data.summary.downtime) : null;
  return (
    <AnalyticsSection
      title="Uptime history"
      description="Availability is calculated from recorded monitoring and incident windows."
    >
      {isError ? (
        <ErrorPanel error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : isLoading || !data || !availability || !downtime ? (
        <ChartSkeleton />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">Availability</p>
              <p className="text-xl font-semibold">{availability.value}</p>
              {availability.hint ? (
                <p className="text-xs text-muted-foreground">{availability.hint}</p>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">Downtime</p>
              <p className="text-xl font-semibold">{downtime.value}</p>
              {downtime.hint ? (
                <p className="text-xs text-muted-foreground">{downtime.hint}</p>
              ) : null}
            </div>
          </div>
          <CoverageStats coverage={data.summary.coverage} />
          <div className="rounded-lg border border-border bg-background p-4">
            <UptimeTimeline timeline={data.timeline} gaps={data.gaps} />
          </div>
          <p className="text-xs text-muted-foreground">
            Paused periods are not downtime. Periods without enough completed checks are shown as
            unverified instead of being counted as healthy. Only the last{" "}
            {data.window.retentionDays} days of check history are retained.
          </p>
        </div>
      )}
    </AnalyticsSection>
  );
}

export function IncidentsSection({ query }: { query: AnalyticsQuery }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useIncidentsAnalytics(query);
  return (
    <AnalyticsSection
      title="Incident performance"
      description="Incidents that started in the selected range, from your recorded incident history."
    >
      {isError ? (
        <ErrorPanel error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : isLoading || !data ? (
        <IncidentsSkeleton />
      ) : (
        <IncidentsAnalyticsContent data={data} window={data.window} />
      )}
    </AnalyticsSection>
  );
}
