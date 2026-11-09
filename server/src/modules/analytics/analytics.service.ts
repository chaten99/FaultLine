import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { Monitor } from "../monitors/monitor.model.js";
import { ensureLifecycleBaselines } from "../monitors/monitor-lifecycle.service.js";
import { buildMonitorSegments } from "./analytics-intervals.js";
import { buildCsv, sanitizeEndpoint } from "./analytics-csv.js";
import {
  buildTimeline,
  collectGaps,
  computeIncidentAnalytics,
  computeMonitorMetrics,
  poolSummaries,
  type MetricInputs,
  type MetricMonitor,
  type MonitorMetrics,
  type Summary,
} from "./analytics-metrics.js";
import {
  bucketSecondsFor,
  previousWindow,
  resolveWindow,
  type AnalyticsWindow,
  type RangePreset,
} from "./analytics-range.js";
import { buildDistribution, mergeHistogramRows, summarizeHistogram } from "./analytics-stats.js";
import {
  countChecksInSegments,
  loadBucketCounts,
  loadCheckGaps,
  loadCheckStats,
  loadIncidents,
  loadLatencyByBucket,
  loadLatencyByMonitor,
  loadLifecycleEvents,
} from "./analytics.repository.js";

const maxMonitors = 500;
const maxExportRows = 10_000;

export type RangeQuery = { range?: RangePreset; from?: Date; to?: Date; monitorId?: string };

type MonitorFilters = {
  monitorId?: string;
  monitorIds?: string[];
  status?: "all" | "active" | "paused";
  search?: string;
};

const loadMonitors = async (
  userId: string,
  filters: MonitorFilters = {},
): Promise<MetricMonitor[]> => {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (filters.monitorId) filter._id = new Types.ObjectId(filters.monitorId);
  if (filters.monitorIds) {
    filter._id = { $in: filters.monitorIds.map((id) => new Types.ObjectId(id)) };
  }
  if (filters.status === "active") filter.active = true;
  if (filters.status === "paused") filter.active = false;
  if (filters.search?.trim()) {
    const escaped = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { url: { $regex: escaped, $options: "i" } },
    ];
  }
  const rows = await Monitor.find(filter)
    .sort({ createdAt: -1 })
    .limit(maxMonitors)
    .select("name url active intervalSeconds createdAt lastCheckAt")
    .lean();
  if (filters.monitorId && rows.length === 0) {
    throw createApiError("Monitor not found.", 404, "MONITOR_NOT_FOUND");
  }
  return rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    url: row.url,
    active: row.active,
    intervalSeconds: row.intervalSeconds,
    createdAt: new Date(row.createdAt as Date).getTime(),
    lastCheckAt: row.lastCheckAt ? new Date(row.lastCheckAt).getTime() : null,
  }));
};

const toWindow = (query: RangeQuery, now: Date): AnalyticsWindow =>
  resolveWindow({ range: query.range, from: query.from, to: query.to }, now);

const windowMeta = (window: AnalyticsWindow, now: Date) => ({
  from: window.from.toISOString(),
  to: window.to.toISOString(),
  bucketSeconds: bucketSecondsFor(window.to.getTime() - window.from.getTime()),
  retentionDays: env.CHECK_RETENTION_DAYS,
  generatedAt: now.toISOString(),
});

const gatherInputs = async (
  userId: string,
  monitors: MetricMonitor[],
  window: AnalyticsWindow,
  now: Date,
): Promise<MetricInputs> => {
  const ids = monitors.map((monitor) => monitor.id);
  const end = new Date(Math.min(window.to.getTime(), now.getTime()));
  const from = window.from;
  const lifecycleRecords = await loadLifecycleEvents(ids, end);
  const lifecycle = new Map(
    [...lifecycleRecords.entries()].map(([id, records]) => [
      id,
      records.map((record) => ({ at: record.at, type: record.type, active: record.active })),
    ]),
  );
  const activeSegments = monitors.map((monitor) => ({
    monitorId: monitor.id,
    intervals: buildMonitorSegments(
      { createdAt: monitor.createdAt },
      lifecycle.get(monitor.id) ?? [],
      from.getTime(),
      end.getTime(),
    ).active,
  }));
  const [stats, internalGaps, latency, checksInActive, incidents] = await Promise.all([
    loadCheckStats(userId, ids, from, end),
    loadCheckGaps(
      userId,
      monitors.map((monitor) => ({ id: monitor.id, intervalSeconds: monitor.intervalSeconds })),
      from,
      end,
    ),
    loadLatencyByMonitor(userId, ids, from, end),
    countChecksInSegments(userId, activeSegments),
    loadIncidents(userId, ids, from, end),
  ]);
  return {
    monitors,
    lifecycle,
    stats: new Map(stats.map((row) => [row.monitorId, row])),
    internalGaps,
    latency,
    checksInActive,
    incidents,
    from: from.getTime(),
    to: window.to.getTime(),
    now: now.getTime(),
  };
};

const computeAll = (inputs: MetricInputs): { metrics: MonitorMetrics[]; summary: Summary } => {
  const metrics = inputs.monitors.map((monitor) => computeMonitorMetrics(monitor, inputs));
  return { metrics, summary: poolSummaries(metrics, inputs.latency) };
};

const delta = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null ? null : Math.round((current - previous) * 100) / 100;

const relativeChange = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null || previous === 0
    ? null
    : Math.round(((current - previous) / previous) * 10_000) / 100;

export const getOverview = async (userId: string, query: RangeQuery, now = new Date()) => {
  const window = toWindow(query, now);
  await ensureLifecycleBaselines(userId, now);
  const monitors = await loadMonitors(userId, { monitorId: query.monitorId });
  const current = computeAll(await gatherInputs(userId, monitors, window, now));
  const previousRange = previousWindow(window);
  const previous = computeAll(await gatherInputs(userId, monitors, previousRange, now));
  const both = current.summary.totalChecks > 0 && previous.summary.totalChecks > 0;
  const currentSummary = current.summary;
  const previousSummary = previous.summary;
  const hasPrevious = previousSummary.totalChecks > 0;
  return {
    window: windowMeta(window, now),
    scope: {
      monitorCount: monitors.length,
      activeMonitorCount: monitors.filter((monitor) => monitor.active).length,
    },
    current: currentSummary,
    previous: hasPrevious ? previousSummary : null,
    comparison: {
      availabilityDeltaPoints:
        both &&
        currentSummary.availability.state === "ok" &&
        previousSummary.availability.state === "ok"
          ? delta(currentSummary.availability.percent, previousSummary.availability.percent)
          : null,
      successRateDeltaPoints: both
        ? delta(currentSummary.successRate.percent, previousSummary.successRate.percent)
        : null,
      avgResponseDeltaPercent:
        both && currentSummary.responseTime.samples > 0 && previousSummary.responseTime.samples > 0
          ? relativeChange(currentSummary.responseTime.avg, previousSummary.responseTime.avg)
          : null,
      downtimeDeltaPercent:
        currentSummary.downtime.state === "observed" &&
        previousSummary.downtime.state === "observed"
          ? relativeChange(currentSummary.downtime.ms, previousSummary.downtime.ms)
          : null,
      incidentsDelta: both
        ? currentSummary.incidents.total - previousSummary.incidents.total
        : null,
    },
  };
};

const responseTimePayload = async (
  userId: string,
  monitors: MetricMonitor[],
  window: AnalyticsWindow,
  now: Date,
) => {
  const ids = monitors.map((monitor) => monitor.id);
  const end = new Date(Math.min(window.to.getTime(), now.getTime()));
  const bucketMs = bucketSecondsFor(window.to.getTime() - window.from.getTime()) * 1000;
  const byBucket = await loadLatencyByBucket(userId, ids, window.from, end, bucketMs);
  const series = [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, rows]) => {
      const summary = summarizeHistogram(rows);
      return {
        start: new Date(start).toISOString(),
        end: new Date(start + bucketMs).toISOString(),
        samples: summary.samples,
        avg: summary.avg as number,
        min: summary.min as number,
        max: summary.max as number,
        p50: summary.p50 as number,
        p95: summary.p95 as number,
        p99: summary.p99 as number,
      };
    });
  const allRows = mergeHistogramRows([...byBucket.values()].flat());
  return {
    summary: summarizeHistogram(allRows),
    series,
    distribution: buildDistribution(allRows),
  };
};

export const getResponseTimes = async (userId: string, query: RangeQuery, now = new Date()) => {
  const window = toWindow(query, now);
  const monitors = await loadMonitors(userId, { monitorId: query.monitorId });
  return {
    window: windowMeta(window, now),
    ...(await responseTimePayload(userId, monitors, window, now)),
  };
};

const availabilityPayload = async (
  userId: string,
  inputs: MetricInputs,
  window: AnalyticsWindow,
  now: Date,
) => {
  const { metrics, summary } = computeAll(inputs);
  const end = new Date(Math.min(window.to.getTime(), now.getTime()));
  const bucketMs = bucketSecondsFor(window.to.getTime() - window.from.getTime()) * 1000;
  const counts = await loadBucketCounts(
    userId,
    inputs.monitors.map((monitor) => monitor.id),
    window.from,
    end,
    bucketMs,
  );
  return {
    metrics,
    summary,
    timeline: buildTimeline(
      metrics,
      inputs.incidents,
      counts,
      window.from.getTime(),
      end.getTime(),
      bucketMs,
    ),
    gaps: collectGaps(metrics),
  };
};

export const getAvailability = async (userId: string, query: RangeQuery, now = new Date()) => {
  const window = toWindow(query, now);
  await ensureLifecycleBaselines(userId, now);
  const monitors = await loadMonitors(userId, { monitorId: query.monitorId });
  const inputs = await gatherInputs(userId, monitors, window, now);
  const payload = await availabilityPayload(userId, inputs, window, now);
  return {
    window: windowMeta(window, now),
    summary: {
      availability: payload.summary.availability,
      downtime: payload.summary.downtime,
      coverage: payload.summary.coverage,
    },
    timeline: payload.timeline,
    gaps: payload.gaps,
  };
};

export const getScopedAvailability = async (
  userId: string,
  monitorIds: string[],
  range: { range: RangePreset },
  now = new Date(),
) => {
  const window = toWindow(range, now);
  const monitors = monitorIds.length > 0 ? await loadMonitors(userId, { monitorIds }) : [];
  const inputs = await gatherInputs(userId, monitors, window, now);
  const payload = await availabilityPayload(userId, inputs, window, now);
  return {
    window: windowMeta(window, now),
    availability: payload.summary.availability,
    timeline: payload.timeline.map((cell) => ({
      start: cell.start,
      end: cell.end,
      state: cell.state,
    })),
  };
};

export type MonitorTableQuery = RangeQuery & {
  page: number;
  pageSize: number;
  sortBy:
    | "name"
    | "availability"
    | "successRate"
    | "coverage"
    | "downtime"
    | "avgResponse"
    | "incidents"
    | "lastCheck";
  sortOrder: "asc" | "desc";
  status: "all" | "active" | "paused";
  search?: string;
  quality: "all" | "complete" | "partial" | "insufficient";
};

const sortValue = (
  entry: MonitorMetrics,
  key: MonitorTableQuery["sortBy"],
): number | string | null => {
  switch (key) {
    case "name":
      return entry.monitor.name.toLowerCase();
    case "availability":
      return entry.summary.availability.percent;
    case "successRate":
      return entry.summary.successRate.percent;
    case "coverage":
      return entry.summary.coverage.percent;
    case "downtime":
      return entry.summary.downtime.ms;
    case "avgResponse":
      return entry.summary.responseTime.avg;
    case "incidents":
      return entry.summary.incidents.total;
    case "lastCheck":
      return entry.monitor.lastCheckAt;
  }
};

export const getMonitorTable = async (
  userId: string,
  query: MonitorTableQuery,
  now = new Date(),
) => {
  const window = toWindow(query, now);
  await ensureLifecycleBaselines(userId, now);
  const monitors = await loadMonitors(userId, {
    monitorId: query.monitorId,
    status: query.status,
    search: query.search,
  });
  const { metrics } = computeAll(await gatherInputs(userId, monitors, window, now));
  const filtered = metrics.filter(
    (entry) => query.quality === "all" || entry.dataQuality === query.quality,
  );
  const direction = query.sortOrder === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    const left = sortValue(a, query.sortBy);
    const right = sortValue(b, query.sortBy);
    if (left === null && right === null) return a.monitor.name.localeCompare(b.monitor.name);
    if (left === null) return 1;
    if (right === null) return -1;
    if (left < right) return -direction;
    if (left > right) return direction;
    return a.monitor.name.localeCompare(b.monitor.name);
  });
  const total = filtered.length;
  const items = filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  return {
    window: windowMeta(window, now),
    items: items.map((entry) => ({
      monitorId: entry.monitor.id,
      name: entry.monitor.name,
      endpoint: sanitizeEndpoint(entry.monitor.url),
      active: entry.monitor.active,
      availability: entry.summary.availability,
      successRate: {
        percent: entry.summary.successRate.percent,
        total: entry.summary.successRate.total,
      },
      coverage: {
        percent: entry.summary.coverage.percent,
        expected: entry.summary.coverage.expected,
        completed: entry.summary.coverage.completed,
      },
      downtimeMs: entry.summary.downtime.ms,
      avgResponseMs: entry.summary.responseTime.avg,
      p95Ms: entry.summary.responseTime.p95,
      incidentCount: entry.summary.incidents.total,
      lastCheckAt: entry.monitor.lastCheckAt
        ? new Date(entry.monitor.lastCheckAt).toISOString()
        : null,
      dataQuality: entry.dataQuality,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
};

export const getIncidentAnalytics = async (userId: string, query: RangeQuery, now = new Date()) => {
  const window = toWindow(query, now);
  await ensureLifecycleBaselines(userId, now);
  const monitors = await loadMonitors(userId, { monitorId: query.monitorId });
  const inputs = await gatherInputs(userId, monitors, window, now);
  const { metrics } = computeAll(inputs);
  const bucketMs = bucketSecondsFor(window.to.getTime() - window.from.getTime()) * 1000;
  return {
    window: windowMeta(window, now),
    ...computeIncidentAnalytics(
      inputs.incidents,
      monitors,
      metrics,
      window.from.getTime(),
      window.to.getTime(),
      now.getTime(),
      bucketMs,
    ),
  };
};

export const getMonitorAnalytics = async (
  userId: string,
  monitorId: string,
  query: RangeQuery,
  now = new Date(),
) => {
  const window = toWindow(query, now);
  await ensureLifecycleBaselines(userId, now);
  const monitors = await loadMonitors(userId, { monitorId });
  const monitor = monitors[0] as MetricMonitor;
  const inputs = await gatherInputs(userId, monitors, window, now);
  const availability = await availabilityPayload(userId, inputs, window, now);
  const responseTimes = await responseTimePayload(userId, monitors, window, now);
  const entry = availability.metrics[0] as MonitorMetrics;
  const bucketMs = bucketSecondsFor(window.to.getTime() - window.from.getTime()) * 1000;
  const incidentView = computeIncidentAnalytics(
    inputs.incidents,
    monitors,
    availability.metrics,
    window.from.getTime(),
    window.to.getTime(),
    now.getTime(),
    bucketMs,
  );
  const downtimePeriods = entry.downtime.map((interval) => {
    const incident = inputs.incidents.find(
      (candidate) =>
        candidate.firstFailureAt < interval.end &&
        (candidate.resolvedAt ?? Number.POSITIVE_INFINITY) > interval.start,
    );
    return {
      start: new Date(interval.start).toISOString(),
      end: new Date(interval.end).toISOString(),
      durationMs: interval.end - interval.start,
      incidentId: incident?.id ?? null,
      ongoing: incident ? incident.resolvedAt === null : false,
    };
  });
  return {
    window: windowMeta(window, now),
    monitor: {
      id: monitor.id,
      name: monitor.name,
      endpoint: sanitizeEndpoint(monitor.url),
      active: monitor.active,
      intervalSeconds: monitor.intervalSeconds,
      createdAt: new Date(monitor.createdAt).toISOString(),
    },
    summary: availability.summary,
    responseTimes: { series: responseTimes.series, distribution: responseTimes.distribution },
    availability: { timeline: availability.timeline, gaps: availability.gaps },
    downtimePeriods,
    incidents: { recent: incidentView.recent },
  };
};

export type ExportType = "overview" | "monitors" | "incidents";

const formatMs = (value: number | null): number | null =>
  value === null ? null : Math.round(value);

export const buildExport = async (
  userId: string,
  type: ExportType,
  query: RangeQuery,
  now = new Date(),
): Promise<{ filename: string; csv: string }> => {
  const window = toWindow(query, now);
  await ensureLifecycleBaselines(userId, now);
  const monitors = await loadMonitors(userId, { monitorId: query.monitorId });
  const inputs = await gatherInputs(userId, monitors, window, now);
  const { metrics, summary } = computeAll(inputs);
  const generatedAt = now;
  const stamp = `${window.from.toISOString().slice(0, 10)}_${window.to.toISOString().slice(0, 10)}`;
  const filename = `faultline-${type}-${stamp}.csv`;

  if (type === "overview") {
    const rows: Array<Array<string | number | Date | null>> = [
      ["report_generated_at", generatedAt, "timestamp_utc", ""],
      ["range_start", window.from, "timestamp_utc", ""],
      ["range_end", window.to, "timestamp_utc", ""],
      ["monitor_count", monitors.length, "count", ""],
      [
        "availability",
        summary.availability.percent,
        "percent",
        `state=${summary.availability.state}`,
      ],
      ["verified_monitored_time", Math.round(summary.availability.knownMs / 1000), "seconds", ""],
      ["check_success_rate", summary.successRate.percent, "percent", ""],
      ["successful_checks", summary.successRate.successful, "count", ""],
      ["failed_checks", summary.successRate.failed, "count", ""],
      ["total_completed_checks", summary.totalChecks, "count", ""],
      ["response_time_samples", summary.responseTime.samples, "count", ""],
      ["response_time_avg", summary.responseTime.avg, "ms", ""],
      ["response_time_min", summary.responseTime.min, "ms", ""],
      ["response_time_max", summary.responseTime.max, "ms", ""],
      ["response_time_p50", summary.responseTime.p50, "ms", ""],
      ["response_time_p95", summary.responseTime.p95, "ms", ""],
      ["response_time_p99", summary.responseTime.p99, "ms", ""],
      [
        "downtime",
        summary.downtime.ms === null ? null : Math.round(summary.downtime.ms / 1000),
        "seconds",
        `state=${summary.downtime.state}`,
      ],
      ["incidents_total", summary.incidents.total, "count", ""],
      ["incidents_open", summary.incidents.open, "count", ""],
      ["incidents_acknowledged", summary.incidents.acknowledged, "count", ""],
      ["incidents_resolved", summary.incidents.resolved, "count", ""],
      ["expected_checks", summary.coverage.expected, "count", ""],
      ["completed_checks_in_active_periods", summary.coverage.completed, "count", ""],
      ["coverage", summary.coverage.percent, "percent", ""],
      ["unknown_time", Math.round(summary.coverage.unknownMs / 1000), "seconds", ""],
      ["paused_time", Math.round(summary.coverage.pausedMs / 1000), "seconds", ""],
    ];
    return { filename, csv: buildCsv(["metric", "value", "unit", "note"], rows) };
  }

  if (type === "monitors") {
    const rows = metrics.map((entry) => [
      generatedAt,
      entry.monitor.name,
      sanitizeEndpoint(entry.monitor.url),
      entry.monitor.active ? "active" : "paused",
      window.from,
      window.to,
      entry.summary.availability.percent,
      entry.summary.availability.state,
      entry.summary.successRate.percent,
      entry.summary.totalChecks,
      entry.summary.successRate.failed,
      entry.summary.coverage.percent,
      entry.summary.coverage.expected,
      entry.summary.coverage.completed,
      entry.summary.downtime.ms === null ? null : Math.round(entry.summary.downtime.ms / 1000),
      entry.summary.downtime.state,
      formatMs(entry.summary.responseTime.avg),
      entry.summary.responseTime.p50,
      entry.summary.responseTime.p95,
      entry.summary.responseTime.p99,
      entry.summary.incidents.total,
      entry.monitor.lastCheckAt ? new Date(entry.monitor.lastCheckAt) : null,
      entry.dataQuality,
    ]);
    return {
      filename,
      csv: buildCsv(
        [
          "report_generated_at",
          "monitor",
          "endpoint",
          "state",
          "range_start",
          "range_end",
          "availability_percent",
          "availability_state",
          "check_success_rate_percent",
          "completed_checks",
          "failed_checks",
          "coverage_percent",
          "expected_checks",
          "completed_checks_in_active_periods",
          "downtime_seconds",
          "downtime_state",
          "avg_response_ms",
          "p50_response_ms",
          "p95_response_ms",
          "p99_response_ms",
          "incident_count",
          "last_check_at",
          "data_quality",
        ],
        rows,
      ),
    };
  }

  const end = Math.min(window.to.getTime(), now.getTime());
  const incidents = (
    await loadIncidents(
      userId,
      monitors.map((monitor) => monitor.id),
      window.from,
      new Date(end),
      maxExportRows + 1,
    )
  ).filter((incident) => incident.firstFailureAt >= window.from.getTime());
  if (incidents.length > maxExportRows) {
    throw createApiError(
      "This report is too large. Choose a shorter date range or a single monitor.",
      413,
      "EXPORT_TOO_LARGE",
    );
  }
  const names = new Map(monitors.map((monitor) => [monitor.id, monitor.name]));
  const rows = incidents
    .sort((a, b) => a.firstFailureAt - b.firstFailureAt)
    .map((incident) => [
      generatedAt,
      incident.id,
      names.get(incident.monitorId) ?? "",
      incident.title,
      incident.status,
      new Date(incident.firstFailureAt),
      incident.resolvedAt ? new Date(incident.resolvedAt) : null,
      Math.round(((incident.resolvedAt ?? now.getTime()) - incident.firstFailureAt) / 1000),
      incident.resolvedAt === null,
    ]);
  return {
    filename,
    csv: buildCsv(
      [
        "report_generated_at",
        "incident_id",
        "monitor",
        "title",
        "status",
        "first_failure_at",
        "resolved_at",
        "duration_seconds",
        "ongoing",
      ],
      rows,
    ),
  };
};
