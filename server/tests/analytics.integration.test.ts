import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { MonitorLifecycleEvent } from "../src/modules/monitors/monitor-lifecycle.model.js";
import {
  buildExport,
  getAvailability,
  getIncidentAnalytics,
  getMonitorAnalytics,
  getMonitorTable,
  getOverview,
  getResponseTimes,
} from "../src/modules/analytics/analytics.service.js";

const uri = process.env.ANALYTICS_TEST_MONGODB_URI;
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
const M = 60_000;
const H = 60 * M;
const now = new Date(T0 + 6 * H);
const range = { from: new Date(T0), to: now };

const userId = new Types.ObjectId();
const otherUserId = new Types.ObjectId();
const monitorId = new Types.ObjectId();
const otherMonitorId = new Types.ObjectId();

type Seed = {
  minute: number;
  status: "success" | "failure" | "timeout" | "error" | "queued";
  duration?: number;
  statusCode?: number;
  category?: string;
};

const seeds: Seed[] = [];
const durationFor = (minute: number) => 50 + ((minute * 37) % 400);

for (let minute = 0; minute < 360; minute += 1) {
  const paused = minute >= 120 && minute < 180;
  const workerOutage = minute >= 240 && minute < 300;
  if (paused || workerOutage) continue;
  if (minute === 50) {
    seeds.push({ minute, status: "error", category: "WORKER_ERROR" });
  } else if (minute === 51) {
    seeds.push({ minute, status: "failure", category: "SSRF_PROHIBITED", duration: 5 });
  } else if (minute >= 30 && minute < 40) {
    seeds.push({
      minute,
      status: "failure",
      category: "UNEXPECTED_STATUS",
      statusCode: 503,
      duration: durationFor(minute),
    });
  } else if (minute === 100 || minute === 101) {
    seeds.push({ minute, status: "timeout", category: "TIMEOUT", duration: 10_000 });
  } else {
    seeds.push({ minute, status: "success", statusCode: 200, duration: durationFor(minute) });
  }
}
seeds.push({ minute: 150, status: "success", statusCode: 200, duration: 77 });

const eligible = seeds.filter(
  (seed) =>
    seed.status === "success" ||
    ((seed.status === "failure" || seed.status === "timeout") &&
      ["UNEXPECTED_STATUS", "TIMEOUT", "NETWORK_ERROR", "DNS_FAILURE"].includes(
        seed.category ?? "",
      )),
);
const latencyValues = eligible
  .filter(
    (seed) =>
      (seed.status === "success" || seed.status === "failure") && seed.statusCode !== undefined,
  )
  .map((seed) => seed.duration as number)
  .sort((a, b) => a - b);
const nearestRank = (values: number[], p: number) =>
  values[Math.max(1, Math.ceil((p / 100) * values.length)) - 1] as number;

describe.skipIf(!uri)("analytics aggregations against MongoDB", () => {
  beforeAll(async () => {
    await mongoose.connect(uri as string);
    await mongoose.connection.dropDatabase();

    const monitorDoc = (id: Types.ObjectId, owner: Types.ObjectId, name: string) => ({
      _id: id,
      userId: owner,
      name,
      url: "https://api.example.com/health?token=SECRET",
      method: "GET",
      intervalSeconds: 60,
      timeoutMs: 10_000,
      expectedStatusCodes: [200],
      active: true,
      configRevision: 1,
      failureThreshold: 3,
      recoveryThreshold: 2,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      createdAt: new Date(T0 - H),
      updatedAt: new Date(T0 - H),
      lastCheckAt: new Date(T0 + 359 * M),
    });
    await Monitor.collection.insertMany([
      monitorDoc(monitorId, userId, "Checkout API"),
      monitorDoc(otherMonitorId, otherUserId, "Someone Else"),
    ]);

    await MonitorLifecycleEvent.insertMany([
      { monitorId, userId, type: "created", active: true, at: new Date(T0 - H) },
      { monitorId, userId, type: "paused", active: false, at: new Date(T0 + 2 * H) },
      { monitorId, userId, type: "resumed", active: true, at: new Date(T0 + 3 * H) },
      {
        monitorId: otherMonitorId,
        userId: otherUserId,
        type: "created",
        active: true,
        at: new Date(T0 - H),
      },
    ]);

    await MonitorCheck.collection.insertMany([
      ...seeds.map((seed, index) => ({
        monitorId,
        userId,
        runId: `run-${index}`,
        status: seed.status,
        startedAt: new Date(T0 + seed.minute * M),
        completedAt: new Date(T0 + seed.minute * M),
        responseDurationMs: seed.duration,
        statusCode: seed.statusCode,
        failureCategory: seed.category,
        expiresAt: new Date(T0 + 400 * H),
        createdAt: new Date(T0 + seed.minute * M),
        updatedAt: new Date(T0 + seed.minute * M),
      })),
      {
        monitorId,
        userId,
        runId: "queued-run",
        status: "queued",
        startedAt: new Date(T0 + 5 * H),
        expiresAt: new Date(T0 + 400 * H),
        createdAt: new Date(T0 + 5 * H),
        updatedAt: new Date(T0 + 5 * H),
      },
      {
        monitorId: otherMonitorId,
        userId: otherUserId,
        runId: "other-run",
        status: "success",
        startedAt: new Date(T0 + M),
        completedAt: new Date(T0 + M),
        responseDurationMs: 9999,
        statusCode: 200,
        expiresAt: new Date(T0 + 400 * H),
        createdAt: new Date(T0 + M),
        updatedAt: new Date(T0 + M),
      },
    ]);

    await Incident.collection.insertMany([
      {
        monitorId,
        userId,
        title: "Incident A",
        status: "resolved",
        firstFailureAt: new Date(T0 + 30 * M),
        lastFailureAt: new Date(T0 + 39 * M),
        openedAt: new Date(T0 + 32 * M),
        resolvedAt: new Date(T0 + 41 * M),
        durationMs: 11 * M,
        createdAt: new Date(T0 + 32 * M),
        updatedAt: new Date(T0 + 41 * M),
      },
      {
        monitorId,
        userId,
        title: "Incident B (overlaps A)",
        status: "resolved",
        firstFailureAt: new Date(T0 + 35 * M),
        lastFailureAt: new Date(T0 + 39 * M),
        openedAt: new Date(T0 + 36 * M),
        resolvedAt: new Date(T0 + 45 * M),
        durationMs: 10 * M,
        createdAt: new Date(T0 + 36 * M),
        updatedAt: new Date(T0 + 45 * M),
      },
    ]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("computes check success rate from eligible terminal checks only", async () => {
    const { current } = await getOverview(String(userId), range, now);
    const successful = eligible.filter((seed) => seed.status === "success").length;
    expect(current.totalChecks).toBe(eligible.length);
    expect(current.successRate).toEqual({
      percent: Math.round((successful / eligible.length) * 10_000) / 100,
      successful,
      failed: eligible.length - successful,
      total: eligible.length,
    });
  });

  it("computes availability, downtime and coverage from lifecycle, gaps and incident windows", async () => {
    const { current } = await getOverview(String(userId), range, now);
    expect(current.availability).toEqual({
      percent: 93.72,
      state: "ok",
      eligibleMs: 300 * M,
      knownMs: 239 * M,
    });
    expect(current.downtime).toEqual({ ms: 15 * M, state: "incomplete", outages: 1 });
    expect(current.coverage.expected).toBe(300);
    expect(current.coverage.completed).toBe(238);
    expect(current.coverage.percent).toBe(79.33);
    expect(current.coverage.pausedMs).toBe(60 * M);
    expect(current.coverage.unknownMs).toBe(61 * M);
    expect(current.coverage.gapCount).toBe(2);
    expect(current.incidents).toEqual({ total: 2, open: 0, acknowledged: 0, resolved: 2 });
  });

  it("computes latency statistics with exact nearest-rank percentiles from real observations", async () => {
    const { current } = await getOverview(String(userId), range, now);
    const sum = latencyValues.reduce((total, value) => total + value, 0);
    expect(current.responseTime).toEqual({
      samples: latencyValues.length,
      avg: Math.round((sum / latencyValues.length) * 10) / 10,
      min: latencyValues[0],
      max: latencyValues[latencyValues.length - 1],
      p50: nearestRank(latencyValues, 50),
      p95: nearestRank(latencyValues, 95),
      p99: nearestRank(latencyValues, 99),
    });
  });

  it("buckets response times without inventing points for periods without observations", async () => {
    const result = await getResponseTimes(String(userId), range, now);
    const hours = result.series.map((bucket) => Date.parse(bucket.start));
    expect(result.window.bucketSeconds).toBe(900);
    expect(hours.every((start) => start % (15 * M) === 0)).toBe(true);
    const bucketSamples = result.series.reduce((sum, bucket) => sum + bucket.samples, 0);
    expect(bucketSamples).toBe(latencyValues.length);
    const worker = result.series.filter(
      (bucket) =>
        Date.parse(bucket.start) >= T0 + 245 * M && Date.parse(bucket.start) < T0 + 300 * M,
    );
    expect(worker).toHaveLength(0);
    const distributionTotal = result.distribution.reduce((sum, bin) => sum + bin.count, 0);
    expect(distributionTotal).toBe(latencyValues.length);
    expect(result.summary.p95).toBe(nearestRank(latencyValues, 95));
  });

  it("builds a timeline that separates paused, unknown and down periods", async () => {
    const result = await getAvailability(String(userId), range, now);
    const state = (minute: number) =>
      result.timeline.find((cell) => Date.parse(cell.start) === T0 + minute * M)?.state;
    expect(state(0)).toBe("up");
    expect(state(30)).toBe("down");
    expect(state(60)).toBe("up");
    expect(state(135)).toBe("paused");
    expect(state(255)).toBe("insufficient");
    expect(state(330)).toBe("up");
    const down = result.timeline.find((cell) => cell.state === "down");
    expect(down?.incidentId).not.toBeNull();
    expect(result.gaps.some((gap) => gap.durationMs > 3_500_000)).toBe(true);
  });

  it("reports per-monitor analytics with sanitized endpoints", async () => {
    const result = await getMonitorTable(
      String(userId),
      {
        ...range,
        page: 1,
        pageSize: 10,
        sortBy: "name",
        sortOrder: "asc",
        status: "all",
        quality: "all",
      },
      now,
    );
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      name: "Checkout API",
      endpoint: "https://api.example.com/health",
      incidentCount: 2,
      dataQuality: "partial",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("scopes everything to the owning user", async () => {
    const other = await getOverview(String(otherUserId), range, now);
    expect(other.current.totalChecks).toBe(1);
    expect(other.current.responseTime.max).toBe(9999);
    await expect(
      getMonitorAnalytics(String(otherUserId), String(monitorId), range, now),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    const mine = await getMonitorAnalytics(String(userId), String(monitorId), range, now);
    expect(mine.summary.totalChecks).toBe(eligible.length);
    expect(mine.downtimePeriods).toHaveLength(1);
    expect(mine.downtimePeriods[0]?.durationMs).toBe(15 * M);
  });

  it("summarizes incidents and excludes nothing it should keep", async () => {
    const result = await getIncidentAnalytics(String(userId), range, now);
    expect(result.summary).toMatchObject({
      total: 2,
      resolved: 2,
      resolvedCount: 2,
      avgResolutionMs: 10.5 * M,
    });
    expect(result.summary.longestOutage).toMatchObject({ durationMs: 11 * M, ongoing: false });
  });

  it("exports CSV that matches the computed values", async () => {
    const report = await buildExport(String(userId), "overview", range, now);
    expect(report.csv).toContain("availability,93.72,percent,state=ok");
    expect(report.csv).toContain(`total_completed_checks,${eligible.length},count,`);
    expect(report.filename).toBe("faultline-overview-2026-01-01_2026-01-01.csv");
  });

  it("returns an insufficient state for a window before the monitor existed", async () => {
    const early = { from: new Date(T0 - 10 * H), to: new Date(T0 - 5 * H) };
    const { current } = await getOverview(String(userId), early, now);
    expect(current.availability).toMatchObject({
      percent: null,
      state: "insufficient",
      eligibleMs: 0,
    });
    expect(current.totalChecks).toBe(0);
    expect(current.successRate.percent).toBeNull();
  });
});
