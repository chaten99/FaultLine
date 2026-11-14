import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import * as repository from "../src/modules/analytics/analytics.repository.js";
import { bindMemoryModel } from "./helpers/memory-model.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
  workspaceHeaders,
} from "./helpers/workspace-fixtures.js";

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(1),
  closeRedisConnections: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(),
  createRedisConnection: vi.fn(),
}));

vi.mock("../src/modules/monitors/monitor-lifecycle.service.js", () => ({
  ensureLifecycleBaselines: vi.fn().mockResolvedValue(0),
  recordMonitorCreated: vi.fn(),
  recordMonitorActiveChange: vi.fn(),
  deleteMonitorLifecycle: vi.fn(),
}));

vi.mock("../src/modules/analytics/analytics.repository.js", () => ({
  loadCheckStats: vi.fn(),
  loadBucketCounts: vi.fn(),
  countChecksInSegments: vi.fn(),
  loadLatencyByBucket: vi.fn(),
  loadLatencyByMonitor: vi.fn(),
  loadCheckGaps: vi.fn(),
  loadLifecycleEvents: vi.fn(),
  loadIncidents: vi.fn(),
}));

const repo = vi.mocked(repository);
const monitors = bindMemoryModel(Monitor);
const workspaceStores = bindWorkspaceModels();

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();
const userViewer = new Types.ObjectId();
const wsA = new Types.ObjectId();
const wsB = new Types.ObjectId();
const tokenA = createAccessToken(String(userA));
const tokenB = createAccessToken(String(userB));
const tokenViewer = createAccessToken(String(userViewer));
const auth = (token: string) => workspaceHeaders(token, token === tokenB ? wsB : wsA);

const createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
const ids = {
  alpha: new Types.ObjectId(),
  beta: new Types.ObjectId(),
  gamma: new Types.ObjectId(),
  other: new Types.ObjectId(),
};

const addMonitor = (id: Types.ObjectId, userId: Types.ObjectId, name: string, extra = {}) => {
  monitors.docs.push({
    _id: id,
    workspaceId: userId === userB ? wsB : wsA,
    userId,
    name,
    url: `https://user:pw@api.example.com/${name.toLowerCase()}?token=SECRET_${name}`,
    active: true,
    intervalSeconds: 60,
    createdAt,
    updatedAt: createdAt,
    lastCheckAt: new Date(),
    ...extra,
  });
};

const setupRepository = (incidents: repository.IncidentRecord[] = []) => {
  repo.loadLifecycleEvents.mockImplementation(async (monitorIds) => {
    return new Map(
      monitorIds.map((id) => [
        id,
        [{ monitorId: id, at: createdAt.getTime(), type: "created" as const, active: true }],
      ]),
    );
  });
  repo.loadCheckStats.mockImplementation(async (monitorIds, from, to) =>
    monitorIds.map((id) => ({
      monitorId: id,
      total: id === String(ids.beta) ? 50 : 100,
      successful: id === String(ids.beta) ? 25 : 99,
      firstCheckAt: from.getTime() + 1000,
      lastCheckAt: to.getTime() - 1000,
    })),
  );
  repo.loadCheckGaps.mockResolvedValue(new Map());
  repo.countChecksInSegments.mockImplementation(
    async (segments) => new Map(segments.map((entry) => [entry.monitorId, 100])),
  );
  repo.loadLatencyByMonitor.mockImplementation(
    async (monitorIds) =>
      new Map(
        monitorIds.map((id) => [
          id,
          [
            {
              value: id === String(ids.gamma) ? 500 : 100,
              count: 10,
              sum: id === String(ids.gamma) ? 5000 : 1000,
              min: 90,
              max: 600,
            },
          ],
        ]),
      ),
  );
  repo.loadLatencyByBucket.mockImplementation(async (_ids, from, _to, bucketMs) => {
    const start = Math.floor(from.getTime() / bucketMs) * bucketMs + bucketMs;
    return new Map([
      [start, [{ value: 120, count: 4, sum: 480, min: 100, max: 140 }]],
      [start + 3 * bucketMs, [{ value: 300, count: 2, sum: 600, min: 280, max: 320 }]],
    ]);
  });
  repo.loadBucketCounts.mockResolvedValue(new Map());
  repo.loadIncidents.mockResolvedValue(incidents);
};

beforeEach(() => {
  monitors.reset();
  vi.clearAllMocks();
  resetWorkspaceModels(workspaceStores);
  seedWorkspace(workspaceStores, {
    ownerId: userA,
    id: wsA,
    members: [{ userId: userViewer, role: "viewer" }],
  });
  seedWorkspace(workspaceStores, { ownerId: userB, id: wsB });
  addMonitor(ids.alpha, userA, "Alpha");
  addMonitor(ids.beta, userA, "Beta");
  addMonitor(ids.gamma, userA, "Gamma", { active: false });
  addMonitor(ids.other, userB, "Other");
  setupRepository();
});

describe("analytics authentication and validation", () => {
  it.each([
    "/api/analytics/overview",
    "/api/analytics/response-times",
    "/api/analytics/availability",
    "/api/analytics/monitors",
    "/api/analytics/incidents",
    "/api/analytics/export?type=overview",
    `/api/analytics/monitors/${new Types.ObjectId()}`,
  ])("requires a session for %s", async (path) => {
    await request(app).get(path).expect(401);
  });

  it("rejects ranges that are in the future, inverted, too long or malformed", async () => {
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const cases: Array<[string, string]> = [
      [`from=${new Date(Date.now() - 86_400_000).toISOString()}&to=${future}`, "to"],
      ["from=2026-02-02T00:00:00Z&to=2026-02-01T00:00:00Z", "from"],
      ["from=2025-01-01T00:00:00Z&to=2025-12-01T00:00:00Z", "from"],
      ["from=nonsense&to=2026-02-01T00:00:00Z", "from"],
      ["", "range"],
    ];
    for (const [query, field] of cases) {
      const response = await request(app)
        .get(`/api/analytics/overview?${query}`)
        .set(auth(tokenA))
        .expect(400);
      expect(Object.keys(response.body.fieldErrors ?? {})).toContain(field);
    }
    expect(repo.loadCheckStats).not.toHaveBeenCalled();
  });

  it("rejects malformed ids and unknown enums", async () => {
    await request(app)
      .get("/api/analytics/overview?range=24h&monitorId=abc")
      .set(auth(tokenA))
      .expect(400);
    await request(app).get("/api/analytics/overview?range=1y").set(auth(tokenA)).expect(400);
    await request(app)
      .get("/api/analytics/monitors/not-an-id?range=24h")
      .set(auth(tokenA))
      .expect(400);
    await request(app)
      .get("/api/analytics/monitors?range=24h&sortBy=password")
      .set(auth(tokenA))
      .expect(400);
    await request(app)
      .get("/api/analytics/monitors?range=24h&pageSize=500")
      .set(auth(tokenA))
      .expect(400);
  });
});

describe("analytics ownership", () => {
  it("never returns another user's monitor analytics", async () => {
    await request(app)
      .get(`/api/analytics/monitors/${ids.other}?range=24h`)
      .set(auth(tokenA))
      .expect(404);
    await request(app)
      .get(`/api/analytics/overview?range=24h&monitorId=${ids.other}`)
      .set(auth(tokenA))
      .expect(404);
    await request(app)
      .get(`/api/analytics/export?type=monitors&range=24h&monitorId=${ids.other}`)
      .set(auth(tokenA))
      .expect(404);
  });

  it("scopes aggregated analytics to the caller's own monitors", async () => {
    const own = await request(app)
      .get("/api/analytics/overview?range=24h")
      .set(auth(tokenA))
      .expect(200);
    expect(own.body.scope).toEqual({ monitorCount: 3, activeMonitorCount: 2 });
    const queriedIds = repo.loadCheckStats.mock.calls.flatMap((call) => call[0]);
    expect(queriedIds).not.toContain(String(ids.other));
    expect(repo.loadIncidents.mock.calls.every((call) => call[0] === String(wsA))).toBe(true);
    vi.clearAllMocks();
    setupRepository();
    const other = await request(app)
      .get("/api/analytics/overview?range=24h")
      .set(auth(tokenB))
      .expect(200);
    expect(other.body.scope).toEqual({ monitorCount: 1, activeMonitorCount: 1 });
    expect(new Set(repo.loadCheckStats.mock.calls.flatMap((call) => call[0]))).toEqual(
      new Set([String(ids.other)]),
    );
  });
});

describe("overview", () => {
  it("returns pooled metrics, window metadata and honest comparison fields", async () => {
    const response = await request(app)
      .get("/api/analytics/overview?range=7d")
      .set(auth(tokenA))
      .expect(200);
    const { window, current, previous, comparison } = response.body;
    expect(window).toMatchObject({ bucketSeconds: 3600 });
    expect(window.retentionDays).toBeGreaterThan(0);
    expect(current.totalChecks).toBe(250);
    expect(current.successRate).toEqual({ percent: 89.2, successful: 223, failed: 27, total: 250 });
    expect(current.availability.state).toBe("ok");
    expect(current.responseTime.samples).toBe(30);
    expect(previous).not.toBeNull();
    expect(comparison.availabilityDeltaPoints).toBe(0);
    expect(comparison.successRateDeltaPoints).toBe(0);
  });

  it("omits comparison and previous data when the previous period has no checks", async () => {
    repo.loadCheckStats.mockImplementation(async (monitorIds, from, to) => {
      const isCurrent = to.getTime() > Date.now() - 120_000;
      return isCurrent
        ? monitorIds.map((id) => ({
            monitorId: id,
            total: 10,
            successful: 10,
            firstCheckAt: from.getTime() + 1000,
            lastCheckAt: to.getTime() - 1000,
          }))
        : [];
    });
    const response = await request(app)
      .get("/api/analytics/overview?range=24h")
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.previous).toBeNull();
    expect(response.body.comparison).toEqual({
      availabilityDeltaPoints: null,
      successRateDeltaPoints: null,
      avgResponseDeltaPercent: null,
      downtimeDeltaPercent: null,
      incidentsDelta: null,
    });
  });

  it("returns null metrics, not zero, when nothing was monitored", async () => {
    repo.loadCheckStats.mockResolvedValue([]);
    repo.loadLatencyByMonitor.mockResolvedValue(new Map());
    repo.countChecksInSegments.mockResolvedValue(new Map());
    const response = await request(app)
      .get("/api/analytics/overview?range=24h")
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.current.availability.percent).toBeNull();
    expect(response.body.current.availability.state).toBe("insufficient");
    expect(response.body.current.successRate.percent).toBeNull();
    expect(response.body.current.responseTime.avg).toBeNull();
    expect(response.body.current.downtime).toMatchObject({ ms: null, state: "unknown" });
  });

  it("counts incidents with their statuses", async () => {
    const now = Date.now();
    setupRepository([
      {
        id: "i1",
        monitorId: String(ids.alpha),
        title: "Down",
        status: "open",
        firstFailureAt: now - 3_600_000,
        resolvedAt: null,
        durationMs: null,
      },
    ]);
    const response = await request(app)
      .get("/api/analytics/overview?range=24h")
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.current.incidents).toEqual({
      total: 1,
      open: 1,
      acknowledged: 0,
      resolved: 0,
    });
    expect(response.body.current.downtime.outages).toBe(1);
    expect(response.body.current.downtime.ms).toBeGreaterThanOrEqual(3_500_000);
  });
});

describe("response times", () => {
  it("returns only buckets with observations plus a distribution from real values", async () => {
    const response = await request(app)
      .get("/api/analytics/response-times?range=7d")
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.series).toHaveLength(2);
    expect(response.body.series[0]).toMatchObject({
      samples: 4,
      avg: 120,
      min: 100,
      max: 140,
      p50: 120,
      p95: 120,
      p99: 120,
    });
    expect(response.body.summary).toMatchObject({ samples: 6 });
    const total = response.body.distribution.reduce(
      (sum: number, bin: { count: number }) => sum + bin.count,
      0,
    );
    expect(total).toBe(6);
  });
});

describe("availability", () => {
  it("returns a timeline with explicit states", async () => {
    const response = await request(app)
      .get("/api/analytics/availability?range=24h")
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.summary.availability.state).toBe("ok");
    expect(response.body.timeline.length).toBeGreaterThan(90);
    expect(new Set(response.body.timeline.map((cell: { state: string }) => cell.state))).toContain(
      "up",
    );
    expect(response.body.gaps).toEqual([]);
  });
});

describe("per-monitor analytics table", () => {
  const table = (query: string) =>
    request(app).get(`/api/analytics/monitors?range=7d&${query}`).set(auth(tokenA));

  it("paginates and sorts with nulls last", async () => {
    const first = await table("pageSize=2&sortBy=name&sortOrder=asc").expect(200);
    expect(first.body.items.map((item: { name: string }) => item.name)).toEqual(["Alpha", "Beta"]);
    expect(first.body).toMatchObject({ total: 3, totalPages: 2, page: 1, pageSize: 2 });
    const second = await table("pageSize=2&page=2&sortBy=name&sortOrder=asc").expect(200);
    expect(second.body.items.map((item: { name: string }) => item.name)).toEqual(["Gamma"]);

    const byRate = await table("sortBy=successRate&sortOrder=asc").expect(200);
    expect(byRate.body.items[0].name).toBe("Beta");
    const byLatency = await table("sortBy=avgResponse&sortOrder=desc").expect(200);
    expect(byLatency.body.items[0].name).toBe("Gamma");
  });

  it("filters by status, search and data quality", async () => {
    const paused = await table("status=paused").expect(200);
    expect(paused.body.items.map((item: { name: string }) => item.name)).toEqual(["Gamma"]);
    const search = await table("search=bet").expect(200);
    expect(search.body.items.map((item: { name: string }) => item.name)).toEqual(["Beta"]);
    const single = await table(`monitorId=${ids.alpha}`).expect(200);
    expect(single.body.total).toBe(1);
    const insufficient = await table("quality=insufficient").expect(200);
    expect(insufficient.body.total).toBe(0);
  });

  it("never exposes credentials or query strings from monitor URLs", async () => {
    const response = await table("pageSize=50").expect(200);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("SECRET_");
    expect(serialized).not.toContain("user:pw");
    expect(response.body.items[0].endpoint).toBe("https://api.example.com/alpha");
  });
});

describe("incident analytics", () => {
  it("summarizes real incidents and excludes ongoing ones from resolution averages", async () => {
    const now = Date.now();
    setupRepository([
      {
        id: "r",
        monitorId: String(ids.alpha),
        title: "Resolved",
        status: "resolved",
        firstFailureAt: now - 7_200_000,
        resolvedAt: now - 3_600_000,
        durationMs: 3_600_000,
      },
      {
        id: "o",
        monitorId: String(ids.beta),
        title: "Open",
        status: "open",
        firstFailureAt: now - 1_800_000,
        resolvedAt: null,
        durationMs: null,
      },
    ]);
    const response = await request(app)
      .get("/api/analytics/incidents?range=24h")
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.summary).toMatchObject({
      total: 2,
      open: 1,
      resolved: 1,
      resolvedCount: 1,
      avgResolutionMs: 3_600_000,
    });
    expect(response.body.recent[0]).toMatchObject({ id: "o", ongoing: true });
    expect(response.body.summary.longestOutage).toMatchObject({ incidentId: "r", ongoing: false });
  });
});

describe("monitor detail analytics", () => {
  it("returns the same definitions for a single monitor", async () => {
    const response = await request(app)
      .get(`/api/analytics/monitors/${ids.alpha}?range=7d`)
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.monitor).toMatchObject({
      id: String(ids.alpha),
      name: "Alpha",
      endpoint: "https://api.example.com/alpha",
      intervalSeconds: 60,
    });
    expect(response.body.summary.totalChecks).toBe(100);
    expect(response.body.summary.successRate.percent).toBe(99);
    expect(response.body.responseTimes.series.length).toBe(2);
    expect(response.body.availability.timeline.length).toBeGreaterThan(100);
    expect(JSON.stringify(response.body)).not.toContain("SECRET_");
  });
});

describe("CSV export", () => {
  it("returns a downloadable overview report with clear units", async () => {
    const response = await request(app)
      .get("/api/analytics/export?type=overview&range=7d")
      .set(auth(tokenA))
      .expect(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toMatch(
      /^attachment; filename="faultline-overview-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    const lines = response.text.trim().split("\r\n");
    expect(lines[0]).toBe("metric,value,unit,note");
    expect(lines.some((line) => line.startsWith("report_generated_at,"))).toBe(true);
    expect(lines).toContain("monitor_count,3,count,");
    expect(lines.find((line) => line.startsWith("total_completed_checks"))).toBe(
      "total_completed_checks,250,count,",
    );
  });

  it("exports per-monitor rows with injection protection and sanitized endpoints", async () => {
    monitors.docs[0]!.name = '=HYPERLINK("http://evil","click")';
    const response = await request(app)
      .get("/api/analytics/export?type=monitors&range=7d")
      .set(auth(tokenA))
      .expect(200);
    expect(response.text).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
    expect(response.text).not.toContain("SECRET_");
    expect(response.text).not.toContain("user:pw");
    expect(response.text.split("\r\n")[0]).toContain("availability_percent");
    expect(response.text.trim().split("\r\n")).toHaveLength(4);
  });

  it("exports incidents for the selected range and flags ongoing ones", async () => {
    const now = Date.now();
    setupRepository([
      {
        id: "i1",
        monitorId: String(ids.alpha),
        title: "Outage, brief",
        status: "open",
        firstFailureAt: now - 600_000,
        resolvedAt: null,
        durationMs: null,
      },
    ]);
    const response = await request(app)
      .get("/api/analytics/export?type=incidents&range=24h")
      .set(auth(tokenA))
      .expect(200);
    const rows = response.text.trim().split("\r\n");
    expect(rows[0]).toContain("incident_id");
    expect(rows[1]).toContain('"Outage, brief"');
    expect(rows[1]?.endsWith(",true")).toBe(true);
  });

  it("refuses oversized incident exports", async () => {
    const now = Date.now();
    repo.loadIncidents.mockResolvedValue(
      Array.from({ length: 10_001 }, (_, index) => ({
        id: `i${index}`,
        monitorId: String(ids.alpha),
        title: "x",
        status: "resolved" as const,
        firstFailureAt: now - 1000,
        resolvedAt: now,
        durationMs: 1000,
      })),
    );
    const response = await request(app)
      .get("/api/analytics/export?type=incidents&range=24h")
      .set(auth(tokenA))
      .expect(413);
    expect(response.body.code).toBe("EXPORT_TOO_LARGE");
  });

  it("validates the report type and range", async () => {
    await request(app)
      .get("/api/analytics/export?type=pdf&range=24h")
      .set(auth(tokenA))
      .expect(400);
    await request(app).get("/api/analytics/export?type=overview").set(auth(tokenA)).expect(400);
  });
});

describe("analytics workspace access", () => {
  const as = (token: string, workspace: Types.ObjectId = wsA) => workspaceHeaders(token, workspace);

  it("lets viewers read every analytics endpoint and export", async () => {
    const paths = [
      "/api/analytics/overview?range=24h",
      "/api/analytics/response-times?range=24h",
      "/api/analytics/availability?range=24h",
      "/api/analytics/monitors?range=24h",
      "/api/analytics/incidents?range=24h",
      "/api/analytics/export?type=overview&range=24h",
      `/api/analytics/monitors/${ids.alpha}?range=24h`,
    ];
    for (const path of paths) {
      const response = await request(app).get(path).set(as(tokenViewer));
      expect(response.status, path).toBe(200);
    }
  });

  it("shows teammates the same workspace monitors and nothing from other workspaces", async () => {
    const viewer = await request(app)
      .get("/api/analytics/overview?range=24h")
      .set(as(tokenViewer))
      .expect(200);
    const owner = await request(app)
      .get("/api/analytics/overview?range=24h")
      .set(as(tokenA))
      .expect(200);
    expect(viewer.body.scope).toEqual(owner.body.scope);
    expect(viewer.body.scope).toEqual({ monitorCount: 3, activeMonitorCount: 2 });
    const table = await request(app)
      .get("/api/analytics/monitors?range=24h&pageSize=50")
      .set(as(tokenViewer))
      .expect(200);
    expect(table.body.items.map((item: { name: string }) => item.name).sort()).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("rejects non-members and monitors from other workspaces", async () => {
    const outsider = await request(app)
      .get("/api/analytics/overview?range=24h")
      .set(as(tokenB, wsA));
    expect(outsider.status).toBe(404);
    expect(outsider.body.code).toBe("WORKSPACE_NOT_FOUND");
    expect(repo.loadCheckStats).not.toHaveBeenCalled();
    await request(app)
      .get(`/api/analytics/monitors/${ids.alpha}?range=24h`)
      .set(as(tokenB, wsB))
      .expect(404);
    await request(app)
      .get(`/api/analytics/overview?range=24h&monitorId=${ids.alpha}`)
      .set(as(tokenB, wsB))
      .expect(404);
  });

  it("stops serving analytics when the workspace is deleted or the member removed", async () => {
    const membership = workspaceStores.members.docs.find(
      (doc) => String(doc.userId) === String(userViewer),
    )!;
    membership.status = "removed";
    await request(app).get("/api/analytics/overview?range=24h").set(as(tokenViewer)).expect(404);
    workspaceStores.workspaces.docs.find((doc) => String(doc._id) === String(wsA))!.status =
      "deleted";
    await request(app).get("/api/analytics/overview?range=24h").set(as(tokenA)).expect(404);
  });
});
