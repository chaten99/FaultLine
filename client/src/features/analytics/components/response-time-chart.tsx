import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatCount, formatMs } from "../lib/analytics-format";
import {
  distributionLabel,
  fillSeriesGaps,
  formatTimestamp,
  hasObservations,
  placePercentileMarkers,
  timeTickFormatter,
  type ChartPoint,
} from "../lib/analytics-series";
import type {
  AnalyticsWindow,
  DistributionBin,
  ResponseTimePoint,
  ResponseTimeSummary,
} from "../types/analytics.types";
import { EmptyPanel } from "./section-state";

type SeriesKey = "avg" | "p50" | "p95" | "p99" | "min" | "max";

const seriesConfig: {
  key: SeriesKey;
  label: string;
  stroke: string;
  dash?: string;
  width: number;
  defaultOn: boolean;
}[] = [
  { key: "avg", label: "Average", stroke: "var(--foreground)", width: 2, defaultOn: true },
  {
    key: "p50",
    label: "P50",
    stroke: "oklch(0.556 0 0)",
    dash: "6 3",
    width: 1.5,
    defaultOn: true,
  },
  {
    key: "p95",
    label: "P95",
    stroke: "oklch(0.62 0.16 70)",
    dash: "2 3",
    width: 1.5,
    defaultOn: true,
  },
  {
    key: "p99",
    label: "P99",
    stroke: "oklch(0.577 0.245 27.325)",
    dash: "10 3 2 3",
    width: 1.5,
    defaultOn: true,
  },
  { key: "min", label: "Min", stroke: "oklch(0.75 0 0)", dash: "1 3", width: 1, defaultOn: false },
  {
    key: "max",
    label: "Max",
    stroke: "oklch(0.55 0.05 250)",
    dash: "1 3",
    width: 1,
    defaultOn: false,
  },
];

type TooltipProps = {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
};

function PointTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="min-w-44 rounded-md border border-border bg-background p-3 text-xs shadow-md">
      <p className="mb-2 font-medium">{formatTimestamp(point.start)}</p>
      {point.samples === 0 ? (
        <p className="text-muted-foreground">No completed checks in this period.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Samples</dt>
          <dd className="text-right">{formatCount(point.samples)}</dd>
          <dt className="text-muted-foreground">Average</dt>
          <dd className="text-right">{formatMs(point.avg)}</dd>
          <dt className="text-muted-foreground">P95</dt>
          <dd className="text-right">{formatMs(point.p95)}</dd>
          <dt className="text-muted-foreground">P99</dt>
          <dd className="text-right">{formatMs(point.p99)}</dd>
        </dl>
      )}
    </div>
  );
}

type DotProps = { cx?: number; cy?: number; index?: number; value?: unknown };

export function ResponseTimeChart({
  series,
  window,
}: {
  series: ResponseTimePoint[];
  window: AnalyticsWindow;
}) {
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>(
    () =>
      Object.fromEntries(seriesConfig.map((item) => [item.key, item.defaultOn])) as Record<
        SeriesKey,
        boolean
      >,
  );
  const points = useMemo(() => fillSeriesGaps(series, window), [series, window]);
  const spanMs = new Date(window.to).getTime() - new Date(window.from).getTime();
  const sparse = points.length <= 60;

  if (!hasObservations(points)) {
    return (
      <EmptyPanel
        title="No response-time data"
        description="No completed checks with a measured response exist for this range yet."
      />
    );
  }

  const renderDot = (key: SeriesKey, stroke: string) => {
    function Dot({ cx, cy, index }: DotProps) {
      if (cx === undefined || cy === undefined || index === undefined) return <g />;
      const current = points[index]?.[key];
      if (current === null || current === undefined) return <g />;
      const previous = points[index - 1]?.[key] ?? null;
      const next = points[index + 1]?.[key] ?? null;
      const isolated = previous === null && next === null;
      if (!sparse && !isolated) return <g />;
      return <circle cx={cx} cy={cy} r={isolated ? 3 : 2} fill={stroke} />;
    }
    return Dot;
  };

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Chart series" className="flex flex-wrap gap-2">
        {seriesConfig.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={enabled[item.key]}
            onClick={() =>
              setEnabled((current) => ({ ...current, [item.key]: !current[item.key] }))
            }
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              enabled[item.key]
                ? "border-foreground/40 bg-accent text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                stroke={item.stroke}
                strokeWidth={2}
                strokeDasharray={item.dash}
              />
            </svg>
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="h-64 w-full sm:h-80"
        role="img"
        aria-label="Response time over time with average and percentile lines"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
              tickFormatter={(value: number) => formatMs(value)}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              width={64}
              allowDecimals={false}
            />
            <ChartTooltip content={<PointTooltip />} isAnimationActive={false} />
            {seriesConfig
              .filter((item) => enabled[item.key])
              .map((item) => (
                <Line
                  key={item.key}
                  type="linear"
                  dataKey={item.key}
                  name={item.label}
                  stroke={item.stroke}
                  strokeWidth={item.width}
                  strokeDasharray={item.dash}
                  connectNulls={false}
                  dot={renderDot(item.key, item.stroke)}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Gaps mean no completed checks with a measured response in that period, not zero latency.
        Each point covers {formatBucket(window.bucketSeconds)}.
      </p>
    </div>
  );
}

const formatBucket = (seconds: number): string => {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} hour${seconds === 3600 ? "" : "s"}`;
  return `${Math.round(seconds / 86_400)} day${seconds === 86_400 ? "" : "s"}`;
};

export function LatencyDistribution({
  distribution,
  summary,
}: {
  distribution: DistributionBin[];
  summary: Pick<ResponseTimeSummary, "p50" | "p95" | "p99">;
}) {
  const data = useMemo(
    () => distribution.map((bin) => ({ label: distributionLabel(bin), count: bin.count })),
    [distribution],
  );
  const markers = useMemo(
    () => placePercentileMarkers(distribution, summary),
    [distribution, summary],
  );

  if (distribution.length === 0) {
    return (
      <EmptyPanel
        title="No latency distribution"
        description="The distribution appears once completed checks have measured responses."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="h-56 w-full sm:h-64"
        role="img"
        aria-label="Distribution of measured response times"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              stroke="var(--muted-foreground)"
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              width={44}
              allowDecimals={false}
            />
            <ChartTooltip
              formatter={(value) => [formatCount(Number(value)), "Checks"]}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)" }}
              isAnimationActive={false}
            />
            <Bar
              dataKey="count"
              fill="var(--foreground)"
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
            {markers.map((marker) => (
              <ReferenceLine
                key={marker.key}
                x={data[marker.binIndex]?.label}
                stroke="oklch(0.577 0.245 27.325)"
                strokeDasharray="4 3"
                label={{
                  value: marker.label,
                  position: "top",
                  fontSize: 10,
                  fill: "var(--foreground)",
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Bars show how many measured responses fell into each latency range. Percentile markers are
        placed in the range that contains the value.
      </p>
    </div>
  );
}
