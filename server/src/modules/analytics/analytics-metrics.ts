import {
  buildCheckGaps,
  buildMonitorSegments,
  clipIntervals,
  countExpectedChecks,
  intersectIntervals,
  normalizeIntervals,
  subtractIntervals,
  totalDuration,
  type Interval,
  type LifecycleInput,
  type MonitorSegments,
} from "./analytics-intervals.js";
import { listBuckets } from "./analytics-range.js";
import {
  emptyLatency,
  mergeHistogramRows,
  percent,
  summarizeHistogram,
  type HistogramRow,
  type LatencySummary,
} from "./analytics-stats.js";

export type MetricMonitor = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  intervalSeconds: number;
  createdAt: number;
  lastCheckAt: number | null;
};

export type MetricIncident = {
  id: string;
  monitorId: string;
  title: string;
  status: "open" | "acknowledged" | "resolved";
  firstFailureAt: number;
  resolvedAt: number | null;
  durationMs: number | null;
};

export type MetricInputs = {
  monitors: MetricMonitor[];
  lifecycle: Map<string, LifecycleInput[]>;
  stats: Map<
    string,
    { total: number; successful: number; firstCheckAt: number; lastCheckAt: number }
  >;
  internalGaps: Map<string, Array<{ prev: number; next: number }>>;
  latency: Map<string, HistogramRow[]>;
  checksInActive: Map<string, number>;
  incidents: MetricIncident[];
  from: number;
  to: number;
  now: number;
};

export type AvailabilityMetric = {
  percent: number | null;
  state: "ok" | "insufficient";
  eligibleMs: number;
  knownMs: number;
};

export type DowntimeMetric = {
  ms: number | null;
  state: "observed" | "incomplete" | "unknown";
  outages: number;
};

export type CoverageMetric = {
  expected: number;
  completed: number;
  percent: number | null;
  unknownMs: number;
  pausedMs: number;
  gapCount: number;
};

export type Summary = {
  availability: AvailabilityMetric;
  successRate: { percent: number | null; successful: number; failed: number; total: number };
  totalChecks: number;
  responseTime: LatencySummary;
  downtime: DowntimeMetric;
  incidents: { total: number; open: number; acknowledged: number; resolved: number };
  coverage: CoverageMetric;
};

export type MonitorMetrics = {
  monitor: MetricMonitor;
  segments: MonitorSegments;
  gaps: Interval[];
  unknown: Interval[];
  known: Interval[];
  outages: Interval[];
  downtime: Interval[];
  summary: Summary;
  intervalMs: number;
  windowEnd: number;
  dataQuality: "complete" | "partial" | "insufficient";
};

const outageIntervals = (incidents: MetricIncident[], from: number, end: number): Interval[] =>
  clipIntervals(
    incidents.map((incident) => ({
      start: incident.firstFailureAt,
      end: incident.resolvedAt ?? end,
    })),
    from,
    end,
  );

const incidentCounts = (incidents: MetricIncident[], from: number, end: number) => {
  const counts = { total: 0, open: 0, acknowledged: 0, resolved: 0 };
  for (const incident of incidents) {
    if (incident.firstFailureAt < from || incident.firstFailureAt >= end) continue;
    counts.total += 1;
    counts[incident.status] += 1;
  }
  return counts;
};

export const computeMonitorMetrics = (
  monitor: MetricMonitor,
  inputs: MetricInputs,
): MonitorMetrics => {
  const windowEnd = Math.min(inputs.to, inputs.now);
  const intervalMs = monitor.intervalSeconds * 1000;
  const segments = buildMonitorSegments(
    { createdAt: monitor.createdAt },
    inputs.lifecycle.get(monitor.id) ?? [],
    inputs.from,
    windowEnd,
  );
  const stats = inputs.stats.get(monitor.id);
  const gaps = buildCheckGaps({
    intervalMs,
    windowStart: inputs.from,
    windowEnd,
    internalGaps: inputs.internalGaps.get(monitor.id) ?? [],
    firstCheck: stats?.firstCheckAt ?? null,
    lastCheck: stats?.lastCheckAt ?? null,
  });
  const gapsInActive = intersectIntervals(gaps, segments.active);
  const known = subtractIntervals(segments.active, gapsInActive);
  const monitorIncidents = inputs.incidents.filter((incident) => incident.monitorId === monitor.id);
  const outages = outageIntervals(monitorIncidents, inputs.from, windowEnd);
  const downtime = intersectIntervals(outages, known);
  const outageInUnknown = totalDuration(
    intersectIntervals(outages, normalizeIntervals([...gapsInActive, ...segments.untracked])),
  );

  const activeMs = totalDuration(segments.active);
  const knownMs = totalDuration(known);
  const downtimeMs = totalDuration(downtime);
  const unknownMs = totalDuration(gapsInActive) + totalDuration(segments.untracked);
  const availabilityOk = knownMs >= intervalMs;

  const total = stats?.total ?? 0;
  const successful = stats?.successful ?? 0;
  const expected = countExpectedChecks(segments.active, intervalMs);
  const completed = inputs.checksInActive.get(monitor.id) ?? 0;

  const downtimeState: DowntimeMetric["state"] = !availabilityOk
    ? "unknown"
    : unknownMs > 0 || outageInUnknown > 0
      ? "incomplete"
      : "observed";

  const summary: Summary = {
    availability: {
      percent: availabilityOk
        ? Math.round(((knownMs - downtimeMs) / knownMs) * 10_000) / 100
        : null,
      state: availabilityOk ? "ok" : "insufficient",
      eligibleMs: activeMs,
      knownMs,
    },
    successRate: {
      percent: percent(successful, total),
      successful,
      failed: total - successful,
      total,
    },
    totalChecks: total,
    responseTime: summarizeHistogram(inputs.latency.get(monitor.id) ?? []),
    downtime: {
      ms: availabilityOk ? downtimeMs : null,
      state: downtimeState,
      outages: downtime.length,
    },
    incidents: incidentCounts(monitorIncidents, inputs.from, windowEnd),
    coverage: {
      expected,
      completed,
      percent:
        expected > 0 ? Math.min(100, Math.round((completed / expected) * 10_000) / 100) : null,
      unknownMs,
      pausedMs: totalDuration(segments.paused),
      gapCount: gapsInActive.length,
    },
  };

  const dataQuality: MonitorMetrics["dataQuality"] = !availabilityOk
    ? "insufficient"
    : unknownMs > 0 || (summary.coverage.percent !== null && summary.coverage.percent < 90)
      ? "partial"
      : "complete";

  return {
    monitor,
    segments,
    gaps: gapsInActive,
    unknown: normalizeIntervals([...gapsInActive, ...segments.untracked]),
    known,
    outages,
    downtime,
    summary,
    intervalMs,
    windowEnd,
    dataQuality,
  };
};

export const emptySummary = (): Summary => ({
  availability: { percent: null, state: "insufficient", eligibleMs: 0, knownMs: 0 },
  successRate: { percent: null, successful: 0, failed: 0, total: 0 },
  totalChecks: 0,
  responseTime: { ...emptyLatency },
  downtime: { ms: null, state: "unknown", outages: 0 },
  incidents: { total: 0, open: 0, acknowledged: 0, resolved: 0 },
  coverage: { expected: 0, completed: 0, percent: null, unknownMs: 0, pausedMs: 0, gapCount: 0 },
});

export const poolSummaries = (
  metrics: MonitorMetrics[],
  latency: Map<string, HistogramRow[]>,
): Summary => {
  if (metrics.length === 0) return emptySummary();
  const qualifying = metrics.filter((entry) => entry.summary.availability.state === "ok");
  const knownMs = qualifying.reduce((sum, entry) => sum + entry.summary.availability.knownMs, 0);
  const downMs = qualifying.reduce((sum, entry) => sum + (entry.summary.downtime.ms ?? 0), 0);
  const total = metrics.reduce((sum, entry) => sum + entry.summary.totalChecks, 0);
  const successful = metrics.reduce((sum, entry) => sum + entry.summary.successRate.successful, 0);
  const expected = metrics.reduce((sum, entry) => sum + entry.summary.coverage.expected, 0);
  const completed = metrics.reduce((sum, entry) => sum + entry.summary.coverage.completed, 0);
  const unknownMs = metrics.reduce((sum, entry) => sum + entry.summary.coverage.unknownMs, 0);
  const incomplete = metrics.some(
    (entry) =>
      entry.summary.downtime.state === "incomplete" || entry.summary.downtime.state === "unknown",
  );

  const rows = metrics.flatMap((entry) => latency.get(entry.monitor.id) ?? []);

  return {
    availability: {
      percent: knownMs > 0 ? Math.round(((knownMs - downMs) / knownMs) * 10_000) / 100 : null,
      state: knownMs > 0 ? "ok" : "insufficient",
      eligibleMs: metrics.reduce((sum, entry) => sum + entry.summary.availability.eligibleMs, 0),
      knownMs,
    },
    successRate: {
      percent: percent(successful, total),
      successful,
      failed: total - successful,
      total,
    },
    totalChecks: total,
    responseTime: summarizeHistogram(mergeHistogramRows(rows)),
    downtime: {
      ms: knownMs > 0 ? downMs : null,
      state: knownMs === 0 ? "unknown" : incomplete ? "incomplete" : "observed",
      outages: metrics.reduce((sum, entry) => sum + entry.summary.downtime.outages, 0),
    },
    incidents: metrics.reduce(
      (acc, entry) => ({
        total: acc.total + entry.summary.incidents.total,
        open: acc.open + entry.summary.incidents.open,
        acknowledged: acc.acknowledged + entry.summary.incidents.acknowledged,
        resolved: acc.resolved + entry.summary.incidents.resolved,
      }),
      { total: 0, open: 0, acknowledged: 0, resolved: 0 },
    ),
    coverage: {
      expected,
      completed,
      percent:
        expected > 0 ? Math.min(100, Math.round((completed / expected) * 10_000) / 100) : null,
      unknownMs,
      pausedMs: metrics.reduce((sum, entry) => sum + entry.summary.coverage.pausedMs, 0),
      gapCount: metrics.reduce((sum, entry) => sum + entry.summary.coverage.gapCount, 0),
    },
  };
};

export type TimelineState = "up" | "down" | "paused" | "unknown" | "insufficient";

export type TimelineCell = {
  start: string;
  end: string;
  state: TimelineState;
  checks: number;
  failedChecks: number;
  coveragePercent: number | null;
  downtimeMs: number;
  incidentId: string | null;
};

export const buildTimeline = (
  metrics: MonitorMetrics[],
  incidents: MetricIncident[],
  counts: Map<number, { total: number; failed: number }>,
  from: number,
  to: number,
  bucketMs: number,
): TimelineCell[] =>
  listBuckets(from, to, bucketMs).map((bucket) => {
    const span: Interval[] = [{ start: bucket.start, end: bucket.end }];
    let active = 0;
    let known = 0;
    let down = 0;
    let paused = 0;
    let expected = 0;
    let incidentId: string | null = null;
    let incidentStart = Number.POSITIVE_INFINITY;
    for (const entry of metrics) {
      const activeHere = intersectIntervals(entry.segments.active, span);
      const knownHere = intersectIntervals(entry.known, span);
      const downHere = intersectIntervals(entry.downtime, span);
      active += totalDuration(activeHere);
      known += totalDuration(knownHere);
      down += totalDuration(downHere);
      paused += totalDuration(intersectIntervals(entry.segments.paused, span));
      expected += countExpectedChecks(activeHere, entry.intervalMs);
      if (totalDuration(downHere) > 0) {
        for (const incident of incidents) {
          if (incident.monitorId !== entry.monitor.id) continue;
          const outage = clipIntervals(
            [{ start: incident.firstFailureAt, end: incident.resolvedAt ?? entry.windowEnd }],
            bucket.start,
            bucket.end,
          );
          if (
            totalDuration(intersectIntervals(outage, downHere)) > 0 &&
            incident.firstFailureAt < incidentStart
          ) {
            incidentStart = incident.firstFailureAt;
            incidentId = incident.id;
          }
        }
      }
    }
    const bucketCounts = counts.get(Math.floor(bucket.start / bucketMs) * bucketMs) ?? {
      total: 0,
      failed: 0,
    };
    let state: TimelineState;
    if (down > 0) state = "down";
    else if (active > 0) state = known >= active / 2 ? "up" : "insufficient";
    else if (paused > 0) state = "paused";
    else state = "unknown";
    return {
      start: new Date(bucket.start).toISOString(),
      end: new Date(bucket.end).toISOString(),
      state,
      checks: bucketCounts.total,
      failedChecks: bucketCounts.failed,
      coveragePercent:
        expected > 0
          ? Math.min(100, Math.round((bucketCounts.total / expected) * 10_000) / 100)
          : null,
      downtimeMs: down,
      incidentId,
    };
  });

export const collectGaps = (
  metrics: MonitorMetrics[],
  limit = 50,
): Array<{ start: string; end: string; durationMs: number }> =>
  normalizeIntervals(metrics.flatMap((entry) => entry.gaps))
    .map((gap) => ({
      start: new Date(gap.start).toISOString(),
      end: new Date(gap.end).toISOString(),
      durationMs: gap.end - gap.start,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit)
    .sort((a, b) => a.start.localeCompare(b.start));

export type IncidentAnalytics = {
  summary: {
    total: number;
    open: number;
    acknowledged: number;
    resolved: number;
    resolvedCount: number;
    avgResolutionMs: number | null;
    longestOutage: null | {
      durationMs: number;
      incidentId: string;
      monitorId: string;
      monitorName: string;
      ongoing: boolean;
    };
  };
  series: Array<{ start: string; end: string; opened: number; resolved: number }>;
  byMonitor: Array<{ monitorId: string; name: string; count: number; downtimeMs: number | null }>;
  recent: Array<{
    id: string;
    title: string;
    monitorId: string;
    monitorName: string;
    status: "open" | "acknowledged" | "resolved";
    firstFailureAt: string;
    resolvedAt: string | null;
    durationMs: number;
    ongoing: boolean;
  }>;
};

export const computeIncidentAnalytics = (
  incidents: MetricIncident[],
  monitors: MetricMonitor[],
  metrics: MonitorMetrics[],
  from: number,
  to: number,
  now: number,
  bucketMs: number,
): IncidentAnalytics => {
  const names = new Map(monitors.map((monitor) => [monitor.id, monitor.name]));
  const end = Math.min(to, now);
  const inWindow = incidents.filter(
    (incident) => incident.firstFailureAt >= from && incident.firstFailureAt < end,
  );
  const duration = (incident: MetricIncident) =>
    Math.max(0, (incident.resolvedAt ?? now) - incident.firstFailureAt);

  const resolved = inWindow.filter(
    (incident) => incident.status === "resolved" && incident.resolvedAt,
  );
  const resolutionTotal = resolved.reduce((sum, incident) => sum + duration(incident), 0);

  let longest: IncidentAnalytics["summary"]["longestOutage"] = null;
  for (const incident of inWindow) {
    const value = duration(incident);
    if (!longest || value > longest.durationMs) {
      longest = {
        durationMs: value,
        incidentId: incident.id,
        monitorId: incident.monitorId,
        monitorName: names.get(incident.monitorId) ?? "Monitor",
        ongoing: incident.resolvedAt === null,
      };
    }
  }

  const buckets = listBuckets(from, end, bucketMs).map((bucket) => ({
    start: bucket.start,
    end: bucket.end,
    opened: 0,
    resolved: 0,
  }));
  for (const incident of inWindow) {
    const target = buckets.find(
      (bucket) => incident.firstFailureAt >= bucket.start && incident.firstFailureAt < bucket.end,
    );
    if (target) target.opened += 1;
  }
  for (const incident of resolved) {
    const at = incident.resolvedAt as number;
    const target = buckets.find((bucket) => at >= bucket.start && at < bucket.end);
    if (target) target.resolved += 1;
  }

  const perMonitor = new Map<string, number>();
  for (const incident of inWindow) {
    perMonitor.set(incident.monitorId, (perMonitor.get(incident.monitorId) ?? 0) + 1);
  }
  const downtimeByMonitor = new Map(
    metrics.map((entry) => [
      entry.monitor.id,
      entry.summary.downtime.ms === null ? null : entry.summary.downtime.ms,
    ]),
  );

  const counts = incidentCounts(incidents, from, end);

  return {
    summary: {
      total: counts.total,
      open: counts.open,
      acknowledged: counts.acknowledged,
      resolved: counts.resolved,
      resolvedCount: resolved.length,
      avgResolutionMs: resolved.length > 0 ? Math.round(resolutionTotal / resolved.length) : null,
      longestOutage: longest,
    },
    series: buckets.map((bucket) => ({
      start: new Date(bucket.start).toISOString(),
      end: new Date(bucket.end).toISOString(),
      opened: bucket.opened,
      resolved: bucket.resolved,
    })),
    byMonitor: [...perMonitor.entries()]
      .map(([monitorId, count]) => ({
        monitorId,
        name: names.get(monitorId) ?? "Monitor",
        count,
        downtimeMs: downtimeByMonitor.get(monitorId) ?? null,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 10),
    recent: inWindow
      .slice()
      .sort((a, b) => b.firstFailureAt - a.firstFailureAt)
      .slice(0, 10)
      .map((incident) => ({
        id: incident.id,
        title: incident.title,
        monitorId: incident.monitorId,
        monitorName: names.get(incident.monitorId) ?? "Monitor",
        status: incident.status,
        firstFailureAt: new Date(incident.firstFailureAt).toISOString(),
        resolvedAt: incident.resolvedAt ? new Date(incident.resolvedAt).toISOString() : null,
        durationMs: duration(incident),
        ongoing: incident.resolvedAt === null,
      })),
  };
};
