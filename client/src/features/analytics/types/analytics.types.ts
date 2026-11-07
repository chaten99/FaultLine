export type RangeKey = "24h" | "7d" | "30d" | "90d" | "custom";

export type AnalyticsQuery = {
  from: string;
  to: string;
  monitorId?: string;
};

export type AnalyticsWindow = {
  from: string;
  to: string;
  bucketSeconds: number;
  retentionDays: number;
  generatedAt: string;
};

export type AvailabilityMetric = {
  percent: number | null;
  state: "ok" | "insufficient";
  eligibleMs: number;
  knownMs: number;
};

export type SuccessRateMetric = {
  percent: number | null;
  successful: number;
  failed: number;
  total: number;
};

export type ResponseTimeSummary = {
  samples: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
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
  successRate: SuccessRateMetric;
  totalChecks: number;
  responseTime: ResponseTimeSummary;
  downtime: DowntimeMetric;
  incidents: { total: number; open: number; acknowledged: number; resolved: number };
  coverage: CoverageMetric;
};

export type Comparison = {
  availabilityDeltaPoints: number | null;
  successRateDeltaPoints: number | null;
  avgResponseDeltaPercent: number | null;
  downtimeDeltaPercent: number | null;
  incidentsDelta: number | null;
};

export type OverviewResponse = {
  window: AnalyticsWindow;
  scope: { monitorCount: number; activeMonitorCount: number };
  current: Summary;
  previous: Summary | null;
  comparison: Comparison;
};

export type ResponseTimePoint = {
  start: string;
  end: string;
  samples: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
};

export type DistributionBin = { fromMs: number; toMs: number; count: number };

export type ResponseTimesResponse = {
  window: AnalyticsWindow;
  summary: ResponseTimeSummary;
  series: ResponseTimePoint[];
  distribution: DistributionBin[];
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

export type CoverageGap = { start: string; end: string; durationMs: number };

export type AvailabilityResponse = {
  window: AnalyticsWindow;
  summary: {
    availability: AvailabilityMetric;
    downtime: DowntimeMetric;
    coverage: CoverageMetric;
  };
  timeline: TimelineCell[];
  gaps: CoverageGap[];
};

export type DataQuality = "complete" | "partial" | "insufficient";

export type MonitorSortField =
  | "name"
  | "availability"
  | "successRate"
  | "coverage"
  | "downtime"
  | "avgResponse"
  | "incidents"
  | "lastCheck";

export type SortOrder = "asc" | "desc";

export type MonitorAnalyticsRow = {
  monitorId: string;
  name: string;
  endpoint: string;
  active: boolean;
  availability: AvailabilityMetric;
  successRate: { percent: number | null; total: number };
  coverage: { percent: number | null; expected: number; completed: number };
  downtimeMs: number | null;
  avgResponseMs: number | null;
  p95Ms: number | null;
  incidentCount: number;
  lastCheckAt: string | null;
  dataQuality: DataQuality;
};

export type MonitorsQuery = AnalyticsQuery & {
  page: number;
  pageSize: number;
  sortBy: MonitorSortField;
  sortOrder: SortOrder;
  status: "all" | "active" | "paused";
  quality: "all" | DataQuality;
  search?: string;
};

export type MonitorsAnalyticsResponse = {
  window: AnalyticsWindow;
  items: MonitorAnalyticsRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type IncidentStatus = "open" | "acknowledged" | "resolved";

export type IncidentRow = {
  id: string;
  title: string;
  monitorId: string;
  monitorName: string;
  status: IncidentStatus;
  firstFailureAt: string;
  resolvedAt: string | null;
  durationMs: number;
  ongoing: boolean;
};

export type IncidentsAnalyticsResponse = {
  window: AnalyticsWindow;
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
  series: { start: string; end: string; opened: number; resolved: number }[];
  byMonitor: { monitorId: string; name: string; count: number; downtimeMs: number | null }[];
  recent: IncidentRow[];
};

export type DowntimePeriod = {
  start: string;
  end: string;
  durationMs: number;
  incidentId: string | null;
  ongoing: boolean;
};

export type MonitorAnalyticsResponse = {
  window: AnalyticsWindow;
  monitor: {
    id: string;
    name: string;
    endpoint: string;
    active: boolean;
    intervalSeconds: number;
    createdAt: string;
  };
  summary: Summary;
  responseTimes: { series: ResponseTimePoint[]; distribution: DistributionBin[] };
  availability: { timeline: TimelineCell[]; gaps: CoverageGap[] };
  downtimePeriods: DowntimePeriod[];
  incidents: { recent: IncidentRow[] };
};

export type ExportType = "overview" | "monitors" | "incidents";
