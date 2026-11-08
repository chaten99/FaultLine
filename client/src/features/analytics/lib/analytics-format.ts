import type {
  AvailabilityMetric,
  Comparison,
  DowntimeMetric,
  SuccessRateMetric,
} from "../types/analytics.types";

export const NO_DATA = "No data";
export const INSUFFICIENT = "Insufficient data";

export const formatPercent = (value: number | null | undefined, digits = 2): string | null => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `${value.toFixed(digits)}%`;
};

export const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || Number.isNaN(ms) || ms < 0) return "-";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
};

export const formatMs = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)} s`;
  return `${Math.round(ms)} ms`;
};

export const formatCount = (value: number): string => value.toLocaleString("en-US");

export type MetricDisplay = {
  value: string;
  state: "ok" | "empty" | "insufficient";
  hint?: string;
};

export const presentAvailability = (metric: AvailabilityMetric): MetricDisplay => {
  const percent = formatPercent(metric.percent, 3);
  if (metric.state === "insufficient" || percent === null) {
    return { value: INSUFFICIENT, state: "insufficient", hint: "Not enough verified monitoring." };
  }
  return {
    value: percent,
    state: "ok",
    hint: `Based on ${formatDuration(metric.knownMs)} of verified monitoring`,
  };
};

export const presentSuccessRate = (metric: SuccessRateMetric): MetricDisplay => {
  const percent = formatPercent(metric.percent, 2);
  if (metric.total === 0 || percent === null) return { value: NO_DATA, state: "empty" };
  return {
    value: percent,
    state: "ok",
    hint: `${formatCount(metric.successful)} of ${formatCount(metric.total)} checks succeeded`,
  };
};

export const presentTotalChecks = (total: number): MetricDisplay =>
  total === 0 ? { value: NO_DATA, state: "empty" } : { value: formatCount(total), state: "ok" };

export const presentAvgResponse = (avg: number | null, samples: number): MetricDisplay =>
  avg === null || samples === 0
    ? { value: NO_DATA, state: "empty" }
    : { value: formatMs(avg), state: "ok", hint: `${formatCount(samples)} measured responses` };

export const presentDowntime = (metric: DowntimeMetric): MetricDisplay => {
  if (metric.state === "unknown" || metric.ms === null) {
    return { value: INSUFFICIENT, state: "insufficient", hint: "Downtime could not be verified." };
  }
  const outages = `${metric.outages} ${metric.outages === 1 ? "outage" : "outages"}`;
  return {
    value: formatDuration(metric.ms),
    state: "ok",
    hint: metric.state === "incomplete" ? `${outages}, some history incomplete` : outages,
  };
};

export const presentIncidentCount = (total: number, open: number): MetricDisplay => ({
  value: formatCount(total),
  state: "ok",
  hint: open > 0 ? `${open} currently open` : total === 0 ? "No incidents recorded" : undefined,
});

export type DeltaDisplay = { text: string; tone: "better" | "worse" | "neutral" };

export type DeltaKind = keyof Comparison;

const higherIsBetter: Record<DeltaKind, boolean> = {
  availabilityDeltaPoints: true,
  successRateDeltaPoints: true,
  avgResponseDeltaPercent: false,
  downtimeDeltaPercent: false,
  incidentsDelta: false,
};

export const presentDelta = (kind: DeltaKind, value: number | null): DeltaDisplay | null => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return { text: "No change vs previous period", tone: "neutral" };
  const sign = rounded > 0 ? "+" : "-";
  const magnitude = Math.abs(rounded);
  const unit =
    kind === "availabilityDeltaPoints" || kind === "successRateDeltaPoints"
      ? " pts"
      : kind === "incidentsDelta"
        ? ""
        : "%";
  const better = higherIsBetter[kind] ? rounded > 0 : rounded < 0;
  return {
    text: `${sign}${magnitude}${unit} vs previous period`,
    tone: better ? "better" : "worse",
  };
};
