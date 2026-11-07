import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, formatDuration } from "../lib/analytics-format";
import { formatTimestamp, timeTickFormatter } from "../lib/analytics-series";
import type { AnalyticsWindow, IncidentsAnalyticsResponse } from "../types/analytics.types";
import { IncidentList } from "./incident-list";
import { EmptyPanel } from "./section-state";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 space-y-1 rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function IncidentsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function IncidentsAnalyticsContent({
  data,
  window,
}: {
  data: IncidentsAnalyticsResponse;
  window: AnalyticsWindow;
}) {
  const { summary } = data;
  const spanMs = new Date(window.to).getTime() - new Date(window.from).getTime();
  const chartData = data.series.map((bucket) => ({
    t: new Date(bucket.start).getTime(),
    opened: bucket.opened,
    resolved: bucket.resolved,
  }));
  const hasSeries = chartData.some((bucket) => bucket.opened > 0 || bucket.resolved > 0);
  const longest = summary.longestOutage;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total incidents" value={formatCount(summary.total)} />
        <Stat label="Open" value={formatCount(summary.open)} />
        <Stat label="Acknowledged" value={formatCount(summary.acknowledged)} />
        <Stat label="Resolved" value={formatCount(summary.resolved)} />
        <Stat
          label="Avg resolution time"
          value={
            summary.avgResolutionMs === null ? "No data" : formatDuration(summary.avgResolutionMs)
          }
          hint={
            summary.resolvedCount > 0
              ? `Across ${summary.resolvedCount} resolved ${summary.resolvedCount === 1 ? "incident" : "incidents"}`
              : "No resolved incidents yet"
          }
        />
        <Stat
          label="Longest outage"
          value={longest ? formatDuration(longest.durationMs) : "None"}
          hint={
            longest ? `${longest.monitorName}${longest.ongoing ? " (ongoing)" : ""}` : undefined
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Average resolution time uses resolved incidents only. Ongoing incidents show elapsed time
        but are never included in that average.
      </p>

      <div className="space-y-2 rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-medium">Incidents over time</h3>
        {hasSeries ? (
          <div
            className="h-56 w-full sm:h-64"
            role="img"
            aria-label="Incidents opened and resolved over time"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={timeTickFormatter(spanMs)}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  minTickGap={32}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  width={32}
                />
                <ChartTooltip
                  labelFormatter={(value) => formatTimestamp(Number(value))}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                  }}
                  isAnimationActive={false}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="opened"
                  name="Opened"
                  fill="oklch(0.577 0.245 27.325)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="resolved"
                  name="Resolved"
                  fill="var(--foreground)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyPanel
            title="No incidents in this range"
            description="Healthy periods produce no incident activity."
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-1">
          <h3 className="text-sm font-medium">Most affected monitors</h3>
          {data.byMonitor.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              No monitors had incidents in this range.
            </p>
          ) : (
            <ol className="divide-y divide-border rounded-lg border border-border bg-background">
              {data.byMonitor.map((item, index) => (
                <li key={item.monitorId}>
                  <Link
                    to={`/monitors/${item.monitorId}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {item.count} {item.count === 1 ? "incident" : "incidents"}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="space-y-2 lg:col-span-2">
          <h3 className="text-sm font-medium">Recent incidents</h3>
          <IncidentList incidents={data.recent} />
        </div>
      </div>
    </div>
  );
}
