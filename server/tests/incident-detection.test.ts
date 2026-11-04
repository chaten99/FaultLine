import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { evaluateCheckForIncident } from "../src/modules/incidents/incident.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { IncidentTimeline } from "../src/modules/incidents/incident-timeline.model.js";
import * as redisService from "../src/lib/redis/redis.service.js";

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(1),
  closeRedisConnections: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(),
  getRedisSubscriberClient: vi.fn(),
}));

describe("Incident Detection Engine Unit Tests", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const monitorId = new mongoose.Types.ObjectId().toString();

  let monitorDoc: Record<string, unknown>;
  let incidentsStore: Array<Record<string, unknown>> = [];
  let timelineStore: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    incidentsStore = [];
    timelineStore = [];

    monitorDoc = {
      _id: monitorId,
      userId,
      name: "Checkout API",
      url: "https://api.example.com/checkout",
      failureThreshold: 3,
      recoveryThreshold: 2,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      activeIncidentId: null,
      firstFailureAt: null,
      firstFailureCheckId: null,
      lastEvaluatedCheckId: null,
    };

    (vi.spyOn(Monitor, "findById") as unknown as MockInstance).mockImplementation((id: unknown) => {
      if (String(id) === monitorId) {
        return Promise.resolve({ ...monitorDoc });
      }
      return Promise.resolve(null);
    });

    (vi.spyOn(Monitor, "findByIdAndUpdate") as unknown as MockInstance).mockImplementation(
      (id: unknown, update: unknown) => {
        if (String(id) === monitorId) {
          const u = update as {
            $set?: Record<string, unknown>;
            $inc?: Record<string, number>;
          };
          if (u.$set) {
            Object.assign(monitorDoc, u.$set);
          }
          if (u.$inc) {
            for (const [key, val] of Object.entries(u.$inc)) {
              const current = (monitorDoc[key] as number) || 0;
              monitorDoc[key] = current + val;
            }
          }
          return Promise.resolve({ ...monitorDoc });
        }
        return Promise.resolve(null);
      },
    );

    (vi.spyOn(Incident, "findOne") as unknown as MockInstance).mockImplementation(
      (query: unknown) => {
        const q = query as Record<string, unknown>;
        const found = incidentsStore.find((inc) => {
          if (q._id && String(inc._id) !== String(q._id)) return false;
          if (q.monitorId && String(inc.monitorId) !== String(q.monitorId)) return false;
          if (q.status && typeof q.status === "object" && "$in" in (q.status as object)) {
            const inList = (q.status as { $in: string[] }).$in;
            if (!inList.includes(inc.status as string)) return false;
          }
          return true;
        });
        return Promise.resolve(found ? { ...found } : null);
      },
    );

    (vi.spyOn(Incident, "findByIdAndUpdate") as unknown as MockInstance).mockImplementation(
      (id: unknown, update: unknown) => {
        const u = update as { $set?: Record<string, unknown> };
        const found = incidentsStore.find((inc) => String(inc._id) === String(id));
        if (found && u.$set) {
          Object.assign(found, u.$set);
        }
        return Promise.resolve(found ? { ...found } : null);
      },
    );

    (vi.spyOn(Incident, "create") as unknown as MockInstance).mockImplementation((doc: unknown) => {
      const item = {
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(doc as Record<string, unknown>),
      };
      incidentsStore.push(item);
      return Promise.resolve(item);
    });

    (vi.spyOn(IncidentTimeline, "create") as unknown as MockInstance).mockImplementation(
      (doc: unknown) => {
        const item = {
          _id: new mongoose.Types.ObjectId().toString(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(doc as Record<string, unknown>),
        };
        timelineStore.push(item);
        return Promise.resolve(item);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not increment failures or open incident on non-qualifying failures", async () => {
    await evaluateCheckForIncident(monitorId, {
      runId: "run-ssrf",
      success: false,
      failureCategory: "SSRF_PROHIBITED",
      errorMessage: "Target is local IP",
      completedAt: new Date(),
    });

    expect(monitorDoc.consecutiveFailures).toBe(0);
    expect(monitorDoc.activeIncidentId).toBeNull();
    expect(incidentsStore).toHaveLength(0);
    expect(monitorDoc.lastEvaluatedCheckId).toBe("run-ssrf");
  });

  it("skips already evaluated checks idempotently", async () => {
    monitorDoc.lastEvaluatedCheckId = "run-1";
    monitorDoc.consecutiveFailures = 1;

    await evaluateCheckForIncident(monitorId, {
      runId: "run-1",
      success: false,
      failureCategory: "TIMEOUT",
      completedAt: new Date(),
    });

    expect(monitorDoc.consecutiveFailures).toBe(1);
    expect(incidentsStore).toHaveLength(0);
  });

  it("increments consecutive failures on qualifying failures and opens incident at threshold", async () => {
    await evaluateCheckForIncident(monitorId, {
      runId: "run-fail-1",
      success: false,
      failureCategory: "UNEXPECTED_STATUS",
      statusCode: 500,
      completedAt: new Date(),
    });

    expect(monitorDoc.consecutiveFailures).toBe(1);
    expect(monitorDoc.activeIncidentId).toBeNull();
    expect(incidentsStore).toHaveLength(0);

    await evaluateCheckForIncident(monitorId, {
      runId: "run-fail-2",
      success: false,
      failureCategory: "UNEXPECTED_STATUS",
      statusCode: 502,
      completedAt: new Date(),
    });

    expect(monitorDoc.consecutiveFailures).toBe(2);
    expect(incidentsStore).toHaveLength(0);

    await evaluateCheckForIncident(monitorId, {
      runId: "run-fail-3",
      success: false,
      failureCategory: "TIMEOUT",
      completedAt: new Date(),
    });

    expect(monitorDoc.consecutiveFailures).toBe(3);
    expect(monitorDoc.activeIncidentId).not.toBeNull();
    expect(incidentsStore).toHaveLength(1);

    const incident = incidentsStore[0]!;
    expect(incident.status).toBe("open");
    expect(incident.title).toContain("Checkout API");
    expect(incident.failureCountAtCreation).toBe(3);

    expect(timelineStore).toHaveLength(1);
    expect(timelineStore[0]!.type).toBe("incident.created");
    expect(timelineStore[0]!.actorType).toBe("system");

    expect(redisService.publishDomainEvent).toHaveBeenCalledWith(
      "incident.created",
      expect.objectContaining({
        userId,
        payload: expect.objectContaining({
          incidentId: String(incident._id),
          status: "open",
        }),
      }),
    );
  });

  it("resets failure streak if a success occurs before threshold is reached", async () => {
    await evaluateCheckForIncident(monitorId, {
      runId: "fail-1",
      success: false,
      failureCategory: "NETWORK_ERROR",
      completedAt: new Date(),
    });

    await evaluateCheckForIncident(monitorId, {
      runId: "fail-2",
      success: false,
      failureCategory: "NETWORK_ERROR",
      completedAt: new Date(),
    });

    expect(monitorDoc.consecutiveFailures).toBe(2);

    await evaluateCheckForIncident(monitorId, {
      runId: "success-recovery",
      success: true,
      statusCode: 200,
      completedAt: new Date(),
    });

    expect(monitorDoc.consecutiveFailures).toBe(0);
    expect(monitorDoc.firstFailureAt).toBeNull();
    expect(incidentsStore).toHaveLength(0);
  });

  it("records failure observed timeline events when failures continue on active incident", async () => {
    monitorDoc.consecutiveFailures = 2;
    await evaluateCheckForIncident(monitorId, {
      runId: "run-trigger",
      success: false,
      failureCategory: "DNS_FAILURE",
      completedAt: new Date(),
    });

    expect(incidentsStore).toHaveLength(1);
    const incidentId = incidentsStore[0]!._id;

    await evaluateCheckForIncident(monitorId, {
      runId: "run-further-fail",
      success: false,
      failureCategory: "DNS_FAILURE",
      completedAt: new Date(),
    });

    expect(timelineStore).toHaveLength(2);
    expect(timelineStore[1]!.type).toBe("incident.failure_observed");
    expect(timelineStore[1]!.incidentId).toBe(incidentId);
    expect(redisService.publishDomainEvent).toHaveBeenCalledWith(
      "incident.updated",
      expect.objectContaining({
        payload: expect.objectContaining({ incidentId }),
      }),
    );
  });

  it("tracks recovery progress and auto-resolves incident when recovery threshold is reached", async () => {
    monitorDoc.consecutiveFailures = 2;
    const failureTime = new Date(Date.now() - 30000);
    await evaluateCheckForIncident(monitorId, {
      runId: "run-trigger",
      success: false,
      failureCategory: "UNEXPECTED_STATUS",
      completedAt: failureTime,
    });

    expect(incidentsStore).toHaveLength(1);
    const incident = incidentsStore[0]!;

    await evaluateCheckForIncident(monitorId, {
      runId: "run-rec-1",
      success: true,
      statusCode: 200,
      completedAt: new Date(Date.now() - 15000),
    });

    expect(monitorDoc.consecutiveSuccesses).toBe(1);
    expect(incident.status).toBe("open");
    expect(timelineStore.some((t) => t.type === "incident.recovery_progress")).toBe(true);

    const resolveTime = new Date();
    await evaluateCheckForIncident(monitorId, {
      runId: "run-rec-2",
      success: true,
      statusCode: 200,
      completedAt: resolveTime,
    });

    expect(incident.status).toBe("resolved");
    expect(incident.resolutionType).toBe("automatic");
    expect(incident.durationMs).toBeGreaterThanOrEqual(0);
    expect(monitorDoc.activeIncidentId).toBeNull();
    expect(monitorDoc.consecutiveSuccesses).toBe(0);
    expect(timelineStore.some((t) => t.type === "incident.resolved")).toBe(true);

    expect(redisService.publishDomainEvent).toHaveBeenCalledWith(
      "incident.resolved",
      expect.objectContaining({
        payload: expect.objectContaining({
          incidentId: String(incident._id),
          status: "resolved",
          resolutionType: "automatic",
        }),
      }),
    );
  });

  it("respects custom failure and recovery thresholds", async () => {
    monitorDoc.failureThreshold = 1;
    monitorDoc.recoveryThreshold = 1;

    await evaluateCheckForIncident(monitorId, {
      runId: "run-single-fail",
      success: false,
      failureCategory: "TIMEOUT",
      completedAt: new Date(),
    });

    expect(incidentsStore).toHaveLength(1);
    expect(incidentsStore[0]!.status).toBe("open");

    await evaluateCheckForIncident(monitorId, {
      runId: "run-single-pass",
      success: true,
      statusCode: 200,
      completedAt: new Date(),
    });

    expect(incidentsStore[0]!.status).toBe("resolved");
    expect(monitorDoc.activeIncidentId).toBeNull();
  });
});
