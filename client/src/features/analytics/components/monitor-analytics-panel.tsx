import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMonitorAnalytics } from "../hooks/use-analytics";
import { anchorNow, presetOptions, resolveWindow } from "../lib/analytics-range";
import type { RangeKey } from "../types/analytics.types";
import { CoverageStats, PercentileStrip } from "./analytics-sections";
import { DowntimePeriods, IncidentList } from "./incident-list";
import { LatencyDistribution, ResponseTimeChart } from "./response-time-chart";
import { ChartSkeleton, EmptyPanel, ErrorPanel } from "./section-state";
import { SummaryCards, SummaryCardsSkeleton } from "./summary-cards";
import { UptimeTimeline } from "./uptime-timeline";

export function MonitorAnalyticsPanel({ monitorId }: { monitorId: string }) {
  const [range, setRange] = useState<Exclude<RangeKey, "custom">>("7d");
  const [anchor] = useState(() => anchorNow(Date.now()));

  const query = useMemo(() => {
    const { from, to } = resolveWindow({ range }, anchor);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [range, anchor]);

  const { data, isLoading, isError, error, refetch, isFetching } = useMonitorAnalytics(
    monitorId,
    query,
  );

  return (
    <section className="space-y-4" aria-label="Monitor analytics">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Availability, latency and incidents for this monitor, using the same definitions as the
            Analytics page.
          </p>
        </div>
        <div role="group" aria-label="Analytics range" className="flex flex-wrap gap-2">
          {presetOptions.map((option) => (
            <Button
              key={option.key}
              size="sm"
              variant={range === option.key ? "default" : "outline"}
              aria-pressed={range === option.key}
              onClick={() => setRange(option.key as Exclude<RangeKey, "custom">)}
            >
              {option.key}
            </Button>
          ))}
        </div>
      </div>

      {isError ? (
        <ErrorPanel error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <SummaryCardsSkeleton />
          <ChartSkeleton />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : data.summary.totalChecks === 0 && data.availability.timeline.length === 0 ? (
        <EmptyPanel
          title="Not enough history yet"
          description="This monitor has no completed checks in this range. Analytics appear once checks have run, and new monitors build history over time."
        />
      ) : (
        <div className={cn("space-y-6", isFetching && "opacity-80 transition-opacity")}>
          <SummaryCards summary={data.summary} />
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Response time</h3>
            <PercentileStrip summary={data.summary.responseTime} />
            <div className="rounded-lg border border-border bg-background p-4">
              <ResponseTimeChart series={data.responseTimes.series} window={data.window} />
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <LatencyDistribution
                distribution={data.responseTimes.distribution}
                summary={data.summary.responseTime}
              />
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Uptime history</h3>
            <CoverageStats coverage={data.summary.coverage} />
            <div className="rounded-lg border border-border bg-background p-4">
              <UptimeTimeline timeline={data.availability.timeline} gaps={data.availability.gaps} />
            </div>
            <p className="text-xs text-muted-foreground">
              Availability is calculated from recorded monitoring and incident windows. Failed
              checks: {data.summary.successRate.failed} of {data.summary.successRate.total}{" "}
              completed.
            </p>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Downtime periods</h3>
            <DowntimePeriods periods={data.downtimePeriods} />
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Incident history</h3>
            <IncidentList incidents={data.incidents.recent} />
          </div>
        </div>
      )}
    </section>
  );
}
