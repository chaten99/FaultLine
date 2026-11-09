import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  collectGaps,
  computeIncidentAnalytics,
  computeMonitorMetrics,
  poolSummaries,
  type MetricIncident,
  type MetricInputs,
  type MetricMonitor,
} from "../src/modules/analytics/analytics-metrics.js";
import type { HistogramRow } from "../src/modules/analytics/analytics-stats.js";

const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
const M = 60_000;
const H = 60 * M;

const monitor = (overrides: Partial<MetricMonitor> = {}): MetricMonitor => ({
  id: "m1",
  name: "Checkout API",
  url: "https://api.example.com/health",
  active: true,
  intervalSeconds: 60,
  createdAt: T0 - 5 * H,
  lastCheckAt: null,
  ...overrides,
});

const incident = (overrides: Partial<MetricIncident> = {}): MetricIncident => ({
  id: "i1",
  monitorId: "m1",
  title: "Incident",
  status: "resolved",
  firstFailureAt: T0 + 2 * H,
  resolvedAt: T0 + 3 * H,
  durationMs: H,
  ...overrides,
});

const inputs = (overrides: Partial<MetricInputs> = {}): MetricInputs => ({
  monitors: [monitor()],
  lifecycle: new Map([["m1", [{ at: T0 - 5 * H, type: "created", active: true }]]]),
  stats: new Map([
    [
      "m1",
      { total: 1440, successful: 1440, firstCheckAt: T0 + 1000, lastCheckAt: T0 + 24 * H - 1000 },
    ],
  ]),
  internalGaps: new Map(),
  latency: new Map(),
  checksInActive: new Map([["m1", 1440]]),
  incidents: [],
  from: T0,
  to: T0 + 24 * H,
  now: T0 + 24 * H,
  ...overrides,
});

const metricsFor = (input: MetricInputs, id = "m1") =>
  computeMonitorMetrics(input.monitors.find((item) => item.id === id) as MetricMonitor, input);

describe("availability from recorded monitoring and incident windows", () => {
  it("reports 100% with observed downtime of zero when verified monitoring saw no incident", () => {
    const { summary, dataQuality } = metricsFor(inputs());
    expect(summary.availability).toMatchObject({ percent: 100, state: "ok", knownMs: 24 * H });
    expect(summary.downtime).toEqual({ ms: 0, state: "observed", outages: 0 });
    expect(summary.successRate.percent).toBe(100);
    expect(summary.coverage).toMatchObject({ expected: 1440, completed: 1440, percent: 100 });
    expect(dataQuality).toBe("complete");
  });

  it("subtracts a resolved incident outage from verified monitored time", () => {
    const { summary } = metricsFor(inputs({ incidents: [incident()] }));
    expect(summary.availability.percent).toBe(95.83);
    expect(summary.downtime).toEqual({ ms: H, state: "observed", outages: 1 });
    expect(summary.incidents).toEqual({ total: 1, open: 0, acknowledged: 0, resolved: 1 });
  });

  it("never double counts overlapping or duplicated incident intervals", () => {
    const { summary } = metricsFor(
      inputs({
        incidents: [
          incident({ id: "a", firstFailureAt: T0 + 2 * H, resolvedAt: T0 + 4 * H }),
          incident({ id: "b", firstFailureAt: T0 + 3 * H, resolvedAt: T0 + 5 * H }),
          incident({ id: "c", firstFailureAt: T0 + 3 * H, resolvedAt: T0 + 5 * H }),
        ],
      }),
    );
    expect(summary.downtime.ms).toBe(3 * H);
    expect(summary.downtime.outages).toBe(1);
    expect(summary.availability.percent).toBe(87.5);
    expect(summary.incidents.total).toBe(3);
  });

  it("extends an open incident to the end of the report window", () => {
    const { summary } = metricsFor(
      inputs({
        incidents: [
          incident({
            status: "open",
            firstFailureAt: T0 + 22 * H,
            resolvedAt: null,
            durationMs: null,
          }),
        ],
      }),
    );
    expect(summary.downtime.ms).toBe(2 * H);
    expect(summary.incidents).toMatchObject({ total: 1, open: 1, resolved: 0 });
  });

  it("extends an open incident only to now when the window ends in the future-adjacent minute", () => {
    const now = T0 + 23 * H;
    const { summary } = metricsFor(
      inputs({
        now,
        stats: new Map([
          [
            "m1",
            { total: 1380, successful: 1380, firstCheckAt: T0 + 1000, lastCheckAt: now - 1000 },
          ],
        ]),
        incidents: [
          incident({
            status: "open",
            firstFailureAt: T0 + 22 * H,
            resolvedAt: null,
            durationMs: null,
          }),
        ],
      }),
    );
    expect(summary.downtime.ms).toBe(H);
    expect(summary.availability.knownMs).toBe(23 * H);
  });

  it("clips incidents that began before the window or ended after it", () => {
    const { summary } = metricsFor(
      inputs({
        incidents: [
          incident({ id: "early", firstFailureAt: T0 - 3 * H, resolvedAt: T0 + H }),
          incident({ id: "late", firstFailureAt: T0 + 23 * H, resolvedAt: T0 + 30 * H }),
        ],
      }),
    );
    expect(summary.downtime.ms).toBe(2 * H);
    expect(summary.incidents.total).toBe(1);
  });

  it("does not count paused time as downtime or as eligible monitored time", () => {
    const lifecycle = new Map([
      [
        "m1",
        [
          { at: T0 - 5 * H, type: "created" as const, active: true },
          { at: T0 + 6 * H, type: "paused" as const, active: false },
          { at: T0 + 12 * H, type: "resumed" as const, active: true },
        ],
      ],
    ]);
    const { summary } = metricsFor(
      inputs({
        lifecycle,
        internalGaps: new Map([["m1", [{ prev: T0 + 6 * H - 30_000, next: T0 + 12 * H + 5_000 }]]]),
        incidents: [incident({ firstFailureAt: T0 + 7 * H, resolvedAt: T0 + 9 * H })],
      }),
    );
    expect(summary.availability).toMatchObject({
      percent: 100,
      knownMs: 18 * H - 5_000,
      eligibleMs: 18 * H,
    });
    expect(summary.downtime.ms).toBe(0);
    expect(summary.coverage.pausedMs).toBe(6 * H);
    expect(summary.coverage.expected).toBe(1080);
  });

  it("counts only the active part of an incident that spans a pause", () => {
    const lifecycle = new Map([
      [
        "m1",
        [
          { at: T0 - 5 * H, type: "created" as const, active: true },
          { at: T0 + 4 * H, type: "paused" as const, active: false },
          { at: T0 + 8 * H, type: "resumed" as const, active: true },
        ],
      ],
    ]);
    const { summary } = metricsFor(
      inputs({
        lifecycle,
        internalGaps: new Map([["m1", [{ prev: T0 + 4 * H - 20_000, next: T0 + 8 * H + 3_000 }]]]),
        incidents: [incident({ firstFailureAt: T0 + 3 * H, resolvedAt: T0 + 9 * H })],
      }),
    );
    expect(summary.downtime.ms).toBe(2 * H - 3_000);
  });

  it("excludes unknown check gaps instead of assuming the endpoint was healthy", () => {
    const { summary, dataQuality } = metricsFor(
      inputs({
        internalGaps: new Map([["m1", [{ prev: T0 + 10 * H, next: T0 + 12 * H }]]]),
        stats: new Map([
          [
            "m1",
            {
              total: 1320,
              successful: 1320,
              firstCheckAt: T0 + 1000,
              lastCheckAt: T0 + 24 * H - 1000,
            },
          ],
        ]),
        checksInActive: new Map([["m1", 1320]]),
      }),
    );
    const tolerance = 90_000;
    expect(summary.coverage.unknownMs).toBe(2 * H - tolerance);
    expect(summary.availability.knownMs).toBe(22 * H + tolerance);
    expect(summary.availability.percent).toBe(100);
    expect(summary.downtime.state).toBe("incomplete");
    expect(summary.coverage.gapCount).toBe(1);
    expect(summary.coverage.percent).toBe(91.67);
    expect(dataQuality).toBe("partial");
  });

  it("does not count an outage that happened entirely inside an unknown gap as verified downtime", () => {
    const { summary } = metricsFor(
      inputs({
        internalGaps: new Map([["m1", [{ prev: T0 + 10 * H, next: T0 + 14 * H }]]]),
        incidents: [incident({ firstFailureAt: T0 + 11 * H, resolvedAt: T0 + 13 * H })],
      }),
    );
    expect(summary.downtime.ms).toBe(0);
    expect(summary.downtime.state).toBe("incomplete");
  });

  it("returns an insufficient state, not 0% or 100%, when no checks completed", () => {
    const { summary, dataQuality } = metricsFor(
      inputs({ stats: new Map(), checksInActive: new Map() }),
    );
    expect(summary.availability).toMatchObject({
      percent: null,
      state: "insufficient",
      knownMs: 0,
    });
    expect(summary.downtime).toEqual({ ms: null, state: "unknown", outages: 0 });
    expect(summary.successRate).toEqual({ percent: null, successful: 0, failed: 0, total: 0 });
    expect(summary.responseTime.avg).toBeNull();
    expect(summary.coverage.percent).toBe(0);
    expect(dataQuality).toBe("insufficient");
  });

  it("treats pre-tracking history as unknown rather than active", () => {
    const { summary } = metricsFor(
      inputs({
        lifecycle: new Map([
          ["m1", [{ at: T0 + 12 * H, type: "tracking_started" as const, active: true }]],
        ]),
        stats: new Map([
          [
            "m1",
            {
              total: 720,
              successful: 720,
              firstCheckAt: T0 + 12 * H,
              lastCheckAt: T0 + 24 * H - 1000,
            },
          ],
        ]),
        checksInActive: new Map([["m1", 720]]),
      }),
    );
    expect(summary.availability.eligibleMs).toBe(12 * H);
    expect(summary.coverage.unknownMs).toBeGreaterThanOrEqual(12 * H);
    expect(summary.downtime.state).toBe("incomplete");
  });

  it("only measures a monitor from the moment it was created", () => {
    const created = T0 + 20 * H;
    const { summary } = metricsFor(
      inputs({
        monitors: [monitor({ createdAt: created })],
        lifecycle: new Map([["m1", [{ at: created, type: "created" as const, active: true }]]]),
        stats: new Map([
          [
            "m1",
            {
              total: 240,
              successful: 240,
              firstCheckAt: created + 1000,
              lastCheckAt: T0 + 24 * H - 1000,
            },
          ],
        ]),
        checksInActive: new Map([["m1", 240]]),
      }),
    );
    expect(summary.availability.eligibleMs).toBe(4 * H);
    expect(summary.availability.percent).toBe(100);
    expect(summary.coverage.expected).toBe(240);
  });

  it("reports insufficient availability when verified monitoring is shorter than one interval", () => {
    const created = T0 + 24 * H - 30_000;
    const { summary } = metricsFor(
      inputs({
        monitors: [monitor({ createdAt: created })],
        lifecycle: new Map([["m1", [{ at: created, type: "created" as const, active: true }]]]),
        stats: new Map([
          [
            "m1",
            { total: 1, successful: 1, firstCheckAt: created + 1000, lastCheckAt: created + 1000 },
          ],
        ]),
        checksInActive: new Map([["m1", 1]]),
      }),
    );
    expect(summary.availability.state).toBe("insufficient");
    expect(summary.coverage.percent).toBeNull();
  });
});

describe("check success rate and coverage", () => {
  it("is computed from completed eligible checks with the sample size reported", () => {
    const { summary } = metricsFor(
      inputs({
        stats: new Map([
          [
            "m1",
            {
              total: 200,
              successful: 190,
              firstCheckAt: T0 + 1000,
              lastCheckAt: T0 + 24 * H - 1000,
            },
          ],
        ]),
      }),
    );
    expect(summary.successRate).toEqual({ percent: 95, successful: 190, failed: 10, total: 200 });
    expect(summary.totalChecks).toBe(200);
  });

  it("is independent of availability", () => {
    const { summary } = metricsFor(
      inputs({
        stats: new Map([
          [
            "m1",
            {
              total: 100,
              successful: 50,
              firstCheckAt: T0 + 1000,
              lastCheckAt: T0 + 24 * H - 1000,
            },
          ],
        ]),
      }),
    );
    expect(summary.successRate.percent).toBe(50);
    expect(summary.availability.percent).toBe(100);
  });

  it("caps coverage at 100% when extra manual checks exist", () => {
    const { summary } = metricsFor(inputs({ checksInActive: new Map([["m1", 1500]]) }));
    expect(summary.coverage.percent).toBe(100);
  });
});

describe("pooling across monitors", () => {
  const second = monitor({ id: "m2", name: "Search API" });
  const pooledInputs = () =>
    inputs({
      monitors: [monitor(), second],
      lifecycle: new Map([
        ["m1", [{ at: T0 - 5 * H, type: "created" as const, active: true }]],
        ["m2", [{ at: T0 + 18 * H, type: "created" as const, active: true }]],
      ]),
      stats: new Map([
        [
          "m1",
          {
            total: 1440,
            successful: 1400,
            firstCheckAt: T0 + 1000,
            lastCheckAt: T0 + 24 * H - 1000,
          },
        ],
        [
          "m2",
          {
            total: 360,
            successful: 360,
            firstCheckAt: T0 + 18 * H + 1000,
            lastCheckAt: T0 + 24 * H - 1000,
          },
        ],
      ]),
      checksInActive: new Map([
        ["m1", 1440],
        ["m2", 360],
      ]),
      incidents: [incident({ firstFailureAt: T0, resolvedAt: T0 + 2.4 * H })],
    });

  it("weights availability by verified monitored time rather than averaging percentages", () => {
    const input = pooledInputs();
    const metrics = input.monitors.map((item) => computeMonitorMetrics(item, input));
    const pooled = poolSummaries(metrics, input.latency);
    expect(metrics[0]?.summary.availability.percent).toBe(90);
    expect(metrics[1]?.summary.availability.percent).toBe(100);
    expect(pooled.availability.percent).toBe(92);
    expect(pooled.availability.percent).not.toBe(95);
    expect(pooled.downtime.ms).toBe(2.4 * H);
    expect(pooled.successRate).toMatchObject({ successful: 1760, total: 1800 });
  });

  it("merges latency observations instead of averaging per-monitor averages", () => {
    const rows1: HistogramRow[] = [{ value: 100, count: 1, sum: 100, min: 100, max: 100 }];
    const rows2: HistogramRow[] = [{ value: 200, count: 99, sum: 19_800, min: 200, max: 200 }];
    const input = pooledInputs();
    input.latency = new Map([
      ["m1", rows1],
      ["m2", rows2],
    ]);
    const metrics = input.monitors.map((item) => computeMonitorMetrics(item, input));
    const pooled = poolSummaries(metrics, input.latency);
    expect(pooled.responseTime.samples).toBe(100);
    expect(pooled.responseTime.avg).toBe(199);
    expect(pooled.responseTime.p50).toBe(200);
  });

  it("returns an empty insufficient summary for no monitors", () => {
    const pooled = poolSummaries([], new Map());
    expect(pooled.availability.percent).toBeNull();
    expect(pooled.totalChecks).toBe(0);
  });
});

describe("uptime timeline", () => {
  it("distinguishes up, down, paused and insufficient periods", () => {
    const lifecycle = new Map([
      [
        "m1",
        [
          { at: T0 - 5 * H, type: "created" as const, active: true },
          { at: T0 + 6 * H, type: "paused" as const, active: false },
          { at: T0 + 12 * H, type: "resumed" as const, active: true },
        ],
      ],
    ]);
    const input = inputs({
      lifecycle,
      internalGaps: new Map([
        [
          "m1",
          [
            { prev: T0 + 6 * H - 20_000, next: T0 + 12 * H + 3_000 },
            { prev: T0 + 17 * H, next: T0 + 20 * H },
          ],
        ],
      ]),
      incidents: [incident({ id: "down", firstFailureAt: T0 + 2 * H, resolvedAt: T0 + 3 * H })],
    });
    const metrics = [computeMonitorMetrics(monitor(), input)];
    const counts = new Map([[T0 + 2 * H, { total: 58, failed: 58 }]]);
    const timeline = buildTimeline(metrics, input.incidents, counts, input.from, input.to, H);

    expect(timeline).toHaveLength(24);
    expect(timeline[0]?.state).toBe("up");
    expect(timeline[2]).toMatchObject({
      state: "down",
      incidentId: "down",
      downtimeMs: H,
      checks: 58,
      failedChecks: 58,
    });
    expect(timeline[7]?.state).toBe("paused");
    expect(timeline[18]?.state).toBe("insufficient");
    expect(timeline[18]?.downtimeMs).toBe(0);
    expect(timeline[23]?.state).toBe("up");
  });

  it("marks time before a monitor existed as unknown", () => {
    const created = T0 + 12 * H;
    const input = inputs({
      monitors: [monitor({ createdAt: created })],
      lifecycle: new Map([["m1", [{ at: created, type: "created" as const, active: true }]]]),
      stats: new Map([
        [
          "m1",
          {
            total: 720,
            successful: 720,
            firstCheckAt: created + 1000,
            lastCheckAt: T0 + 24 * H - 1000,
          },
        ],
      ]),
    });
    const metrics = [computeMonitorMetrics(input.monitors[0] as MetricMonitor, input)];
    const timeline = buildTimeline(metrics, [], new Map(), input.from, input.to, H);
    expect(timeline[0]?.state).toBe("unknown");
    expect(timeline[12]?.state).toBe("up");
  });

  it("lists the largest unknown gaps for display", () => {
    const input = inputs({
      internalGaps: new Map([
        [
          "m1",
          [
            { prev: T0 + 2 * H, next: T0 + 3 * H },
            { prev: T0 + 10 * H, next: T0 + 15 * H },
          ],
        ],
      ]),
    });
    const gaps = collectGaps([computeMonitorMetrics(monitor(), input)]);
    expect(gaps).toHaveLength(2);
    expect(Math.max(...gaps.map((gap) => gap.durationMs))).toBe(5 * H - 90_000);
  });
});

describe("incident analytics", () => {
  const now = T0 + 24 * H;
  const names = [monitor(), monitor({ id: "m2", name: "Search API" })];
  const incidents: MetricIncident[] = [
    incident({ id: "r1", firstFailureAt: T0 + H, resolvedAt: T0 + 2 * H }),
    incident({ id: "r2", firstFailureAt: T0 + 5 * H, resolvedAt: T0 + 8 * H }),
    incident({
      id: "o1",
      monitorId: "m2",
      status: "open",
      firstFailureAt: T0 + 20 * H,
      resolvedAt: null,
      durationMs: null,
    }),
    incident({
      id: "a1",
      monitorId: "m2",
      status: "acknowledged",
      firstFailureAt: T0 + 10 * H,
      resolvedAt: null,
      durationMs: null,
    }),
    incident({ id: "old", firstFailureAt: T0 - 5 * H, resolvedAt: T0 - 4 * H }),
  ];
  const input = inputs({ monitors: names, incidents });
  const metrics = names.map((item) => computeMonitorMetrics(item, input));
  const analytics = computeIncidentAnalytics(
    incidents,
    names,
    metrics,
    T0,
    T0 + 24 * H,
    now,
    6 * H,
  );

  it("counts incidents that started in the window by their current status", () => {
    expect(analytics.summary).toMatchObject({ total: 4, open: 1, acknowledged: 1, resolved: 2 });
  });

  it("averages resolution time over resolved incidents only", () => {
    expect(analytics.summary.resolvedCount).toBe(2);
    expect(analytics.summary.avgResolutionMs).toBe(2 * H);
  });

  it("reports the longest observed outage and flags it as ongoing when unresolved", () => {
    expect(analytics.summary.longestOutage).toMatchObject({
      incidentId: "a1",
      durationMs: 14 * H,
      ongoing: true,
      monitorName: "Search API",
    });
  });

  it("buckets opened and resolved incidents over time with real zeros", () => {
    expect(analytics.series).toHaveLength(4);
    expect(analytics.series.map((bucket) => bucket.opened)).toEqual([2, 1, 0, 1]);
    expect(analytics.series.map((bucket) => bucket.resolved)).toEqual([1, 1, 0, 0]);
  });

  it("ranks monitors by incident frequency", () => {
    expect(analytics.byMonitor.map((entry) => [entry.name, entry.count])).toEqual([
      ["Checkout API", 2],
      ["Search API", 2],
    ]);
  });

  it("lists recent incidents newest first with elapsed time for ongoing ones", () => {
    expect(analytics.recent.map((entry) => entry.id)).toEqual(["o1", "a1", "r2", "r1"]);
    expect(analytics.recent[0]).toMatchObject({ ongoing: true, durationMs: 4 * H });
    expect(analytics.recent[2]).toMatchObject({ ongoing: false, durationMs: 3 * H });
  });

  it("returns null averages when no incident has resolved", () => {
    const only = [incidents[2] as MetricIncident];
    const result = computeIncidentAnalytics(only, names, metrics, T0, T0 + 24 * H, now, 6 * H);
    expect(result.summary.avgResolutionMs).toBeNull();
    expect(result.summary.resolvedCount).toBe(0);
  });
});
