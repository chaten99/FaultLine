import { formatMs } from "./analytics-format";
import type {
  AnalyticsWindow,
  DataQuality,
  DistributionBin,
  ExportType,
  MonitorSortField,
  ResponseTimePoint,
  ResponseTimeSummary,
  SortOrder,
  TimelineState,
} from "../types/analytics.types";

export type ChartPoint = {
  t: number;
  start: string;
  end: string;
  samples: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
};

const emptyPoint = (startMs: number, bucketMs: number): ChartPoint => ({
  t: startMs,
  start: new Date(startMs).toISOString(),
  end: new Date(startMs + bucketMs).toISOString(),
  samples: 0,
  avg: null,
  min: null,
  max: null,
  p50: null,
  p95: null,
  p99: null,
});

export const fillSeriesGaps = (
  series: ResponseTimePoint[],
  window: Pick<AnalyticsWindow, "from" | "to" | "bucketSeconds">,
  maxPoints = 2000,
): ChartPoint[] => {
  const bucketMs = Math.max(1000, window.bucketSeconds * 1000);
  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  const byStart = new Map<number, ChartPoint>();
  for (const point of series) {
    const t = new Date(point.start).getTime();
    if (Number.isNaN(t)) continue;
    byStart.set(t, { ...point, t });
  }
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) {
    return [...byStart.values()].sort((a, b) => a.t - b.t);
  }
  const first = Math.floor(fromMs / bucketMs) * bucketMs;
  const count = Math.ceil((toMs - first) / bucketMs);
  if (count > maxPoints) return [...byStart.values()].sort((a, b) => a.t - b.t);
  const starts = new Set<number>(byStart.keys());
  for (let index = 0; index < count; index += 1) starts.add(first + index * bucketMs);
  return [...starts]
    .sort((a, b) => a - b)
    .map((start) => byStart.get(start) ?? emptyPoint(start, bucketMs));
};

export const hasObservations = (points: ChartPoint[]): boolean =>
  points.some((point) => point.samples > 0);

export const timeTickFormatter = (windowSpanMs: number) => (value: number) => {
  const date = new Date(value);
  if (windowSpanMs <= 2 * 86_400_000) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const formatTimestamp = (value: string | number): string =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export type TimelineMeta = { label: string; description: string; swatch: string };

export const timelineMeta: Record<TimelineState, TimelineMeta> = {
  up: {
    label: "Up",
    description: "Verified monitoring with no recorded outage.",
    swatch: "bg-emerald-500",
  },
  down: {
    label: "Down",
    description: "An incident was open while the monitor was active.",
    swatch: "bg-destructive",
  },
  paused: {
    label: "Paused",
    description: "The monitor was intentionally paused. This is not downtime.",
    swatch: "bg-muted-foreground/50",
  },
  unknown: {
    label: "Unknown",
    description: "No reliable monitoring history for this period.",
    swatch: "border border-dashed border-muted-foreground/50 bg-background",
  },
  insufficient: {
    label: "Insufficient coverage",
    description: "Too few checks completed to verify this period.",
    swatch: "bg-amber-400",
  },
};

export const timelineOrder: TimelineState[] = ["up", "down", "paused", "unknown", "insufficient"];

export const dataQualityLabel: Record<DataQuality, string> = {
  complete: "Complete",
  partial: "Partial data",
  insufficient: "Insufficient data",
};

export type PercentileMarker = { key: "p50" | "p95" | "p99"; label: string; binIndex: number };

export const distributionLabel = (bin: DistributionBin): string =>
  `${formatMs(bin.fromMs)} - ${formatMs(bin.toMs)}`;

export const placePercentileMarkers = (
  distribution: DistributionBin[],
  summary: Pick<ResponseTimeSummary, "p50" | "p95" | "p99">,
): PercentileMarker[] => {
  if (distribution.length === 0) return [];
  const keys: PercentileMarker["key"][] = ["p50", "p95", "p99"];
  const markers: PercentileMarker[] = [];
  for (const key of keys) {
    const value = summary[key];
    if (value === null || value === undefined) continue;
    const binIndex = distribution.findIndex(
      (bin, index) =>
        value >= bin.fromMs &&
        (value < bin.toMs || (index === distribution.length - 1 && value <= bin.toMs)),
    );
    if (binIndex >= 0) markers.push({ key, label: key.toUpperCase(), binIndex });
  }
  return markers;
};

export const defaultSortOrder = (field: MonitorSortField): SortOrder =>
  field === "name" ? "asc" : "desc";

export const nextSort = (
  current: { sortBy: MonitorSortField; sortOrder: SortOrder },
  field: MonitorSortField,
): { sortBy: MonitorSortField; sortOrder: SortOrder } => {
  if (current.sortBy !== field) return { sortBy: field, sortOrder: defaultSortOrder(field) };
  return { sortBy: field, sortOrder: current.sortOrder === "asc" ? "desc" : "asc" };
};

export const ariaSort = (
  current: { sortBy: MonitorSortField; sortOrder: SortOrder },
  field: MonitorSortField,
): "ascending" | "descending" | "none" => {
  if (current.sortBy !== field) return "none";
  return current.sortOrder === "asc" ? "ascending" : "descending";
};

const datePart = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "range" : date.toISOString().slice(0, 10);
};

export const buildExportFilename = (
  type: ExportType,
  from: string,
  to: string,
  contentDisposition?: string | null,
): string => {
  const match = contentDisposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const header = match?.[1]?.trim();
  if (header && /^[\w.-]+$/.test(header)) return header;
  return `faultline-${type}-${datePart(from)}-${datePart(to)}.csv`;
};
