import request from "supertest";
import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { app } from "../src/app.js";
import { recordIncidentNotificationEvent } from "../src/modules/notifications/notification-outbox.service.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { IncidentTimeline } from "../src/modules/incidents/incident-timeline.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";

vi.mock("../src/modules/notifications/notification-outbox.service.js", () => ({
  recordIncidentNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(1),
  closeRedisConnections: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(),
  getRedisSubscriberClient: vi.fn(),
}));

type MockIncident = {
  _id: string;
  monitorId: unknown;
  userId: string;
  title: string;
  status: "open" | "acknowledged" | "resolved";
  firstFailureAt: Date;
  lastFailureAt: Date;
  openedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: unknown;
  resolvedAt?: Date;
  resolutionType?: "automatic" | "manual";
  resolutionReason?: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
  save?: () => Promise<MockIncident>;
};

type MockTimeline = {
  _id: string;
  incidentId: string;
  monitorId: string;
  userId: string;
  type: string;
  actorType: "system" | "user";
  actorId?: unknown;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

describe("Incident API Integration Tests", () => {
  const userAId = new mongoose.Types.ObjectId().toString();
  const userBId = new mongoose.Types.ObjectId().toString();
  const tokenA = createAccessToken(userAId);
  const tokenB = createAccessToken(userBId);

  let incidentsStore: MockIncident[] = [];
  let timelineStore: MockTimeline[] = [];
  let monitorsStore: Array<{
    _id: string;
    userId: string;
    name: string;
    url: string;
    activeIncidentId?: unknown;
  }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    incidentsStore = [];
    timelineStore = [];
    monitorsStore = [];

    (vi.spyOn(Incident, "find") as unknown as MockInstance).mockImplementation(
      (filter: unknown) => {
        const f = filter as Record<string, unknown>;
        return {
          sort: () => ({
            skip: (skipAmount: number) => ({
              limit: (limitAmount: number) => ({
                populate: () => ({
                  lean: () => {
                    const results = incidentsStore.filter((inc) => {
                      if (f.userId && inc.userId !== String(f.userId)) return false;
                      if (f.status && inc.status !== f.status) return false;
                      if (f.monitorId && String(inc.monitorId) !== String(f.monitorId))
                        return false;
                      return true;
                    });
                    return Promise.resolve(results.slice(skipAmount, skipAmount + limitAmount));
                  },
                }),
              }),
            }),
          }),
        };
      },
    );

    (vi.spyOn(Incident, "countDocuments") as unknown as MockInstance).mockImplementation(
      (filter: unknown) => {
        const f = filter as Record<string, unknown>;
        const count = incidentsStore.filter((inc) => {
          if (f.userId && inc.userId !== String(f.userId)) return false;
          if (f.status && inc.status !== f.status) return false;
          if (f.monitorId && String(inc.monitorId) !== String(f.monitorId)) return false;
          return true;
        }).length;
        return Promise.resolve(count);
      },
    );

    (vi.spyOn(Incident, "findOne") as unknown as MockInstance).mockImplementation(
      (query: unknown) => {
        const q = query as Record<string, unknown>;
        const found = incidentsStore.find((inc) => {
          if (q._id && inc._id !== String(q._id)) return false;
          if (q.userId && inc.userId !== String(q.userId)) return false;
          return true;
        });
        const docWithSave: MockIncident | null = found
          ? {
              ...found,
              save: async function () {
                const index = incidentsStore.findIndex((i) => i._id === this._id);
                if (index !== -1) {
                  incidentsStore[index] = { ...this };
                }
                return this;
              },
            }
          : null;

        return {
          populate: () => ({
            lean: () => Promise.resolve(found ? { ...found } : null),
          }),
          then: (resolve: (val: unknown) => void, reject?: (reason?: unknown) => void) =>
            Promise.resolve(docWithSave).then(resolve, reject),
        };
      },
    );

    (vi.spyOn(IncidentTimeline, "find") as unknown as MockInstance).mockImplementation(
      (query: unknown) => {
        const q = query as Record<string, unknown>;
        return {
          sort: () => ({
            populate: () => ({
              lean: () => {
                const results = timelineStore.filter(
                  (t) => String(t.incidentId) === String(q.incidentId),
                );
                return Promise.resolve(results);
              },
            }),
          }),
        };
      },
    );

    (vi.spyOn(IncidentTimeline, "create") as unknown as MockInstance).mockImplementation(
      (doc: unknown) => {
        const item: MockTimeline = {
          _id: new mongoose.Types.ObjectId().toString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(doc as Record<string, unknown>),
        } as MockTimeline;
        timelineStore.push(item);
        return Promise.resolve(item);
      },
    );

    (vi.spyOn(Monitor, "findOneAndUpdate") as unknown as MockInstance).mockImplementation(
      (filter: unknown, update: unknown) => {
        const f = filter as Record<string, unknown>;
        const u = update as { $set?: Record<string, unknown> };
        const mon = monitorsStore.find((m) => {
          if (f._id && m._id !== String(f._id)) return false;
          return true;
        });
        if (mon && u.$set) {
          Object.assign(mon, u.$set);
        }
        return Promise.resolve(mon ?? null);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enforces authentication on all incident endpoints", async () => {
    const validId = new mongoose.Types.ObjectId().toString();

    await request(app).get("/api/incidents").expect(401);
    await request(app).get("/api/incidents/summary").expect(401);
    await request(app).get(`/api/incidents/${validId}`).expect(401);
    await request(app).post(`/api/incidents/${validId}/acknowledge`).expect(401);
    await request(app).post(`/api/incidents/${validId}/resolve`).expect(401);
  });

  it("denies cross-user access to incident details and actions", async () => {
    const monA = new mongoose.Types.ObjectId().toString();
    const incAId = new mongoose.Types.ObjectId().toString();
    const incA: MockIncident = {
      _id: incAId,
      monitorId: monA,
      userId: userAId,
      title: "Incident on API A",
      status: "open",
      firstFailureAt: new Date(),
      lastFailureAt: new Date(),
      openedAt: new Date(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    incidentsStore.push(incA);

    await request(app)
      .get(`/api/incidents/${incAId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);

    await request(app)
      .post(`/api/incidents/${incAId}/acknowledge`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);

    await request(app)
      .post(`/api/incidents/${incAId}/resolve`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ reason: "Unauthorized attempt" })
      .expect(404);

    const listResB = await request(app)
      .get("/api/incidents")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);

    expect(listResB.body.items).toHaveLength(0);
    expect(listResB.body.counts.total).toBe(0);
  });

  it("handles the complete incident lifecycle with acknowledge and manual resolve", async () => {
    const monId = new mongoose.Types.ObjectId().toString();
    const incId = new mongoose.Types.ObjectId().toString();

    monitorsStore.push({
      _id: monId,
      userId: userAId,
      name: "Payment Gateway",
      url: "https://pay.example.com",
      activeIncidentId: incId,
    });

    const incident: MockIncident = {
      _id: incId,
      monitorId: monId,
      userId: userAId,
      title: "Incident on Payment Gateway: TIMEOUT",
      status: "open",
      firstFailureAt: new Date(Date.now() - 60000),
      lastFailureAt: new Date(Date.now() - 10000),
      openedAt: new Date(Date.now() - 30000),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    incidentsStore.push(incident);

    timelineStore.push({
      _id: new mongoose.Types.ObjectId().toString(),
      incidentId: incId,
      monitorId: monId,
      userId: userAId,
      type: "incident.created",
      actorType: "system",
      message: "Incident detected: 3 consecutive checks failed (TIMEOUT)",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const summaryRes = await request(app)
      .get("/api/incidents/summary")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(summaryRes.body.open).toBe(1);
    expect(summaryRes.body.acknowledged).toBe(0);
    expect(summaryRes.body.resolved).toBe(0);
    expect(summaryRes.body.total).toBe(1);

    const listRes = await request(app)
      .get("/api/incidents?page=1&pageSize=10")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.counts.open).toBe(1);

    const detailRes = await request(app)
      .get(`/api/incidents/${incId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(detailRes.body.incident._id).toBe(incId);
    expect(detailRes.body.timeline).toHaveLength(1);
    expect(detailRes.body.timeline[0].type).toBe("incident.created");

    const ackRes = await request(app)
      .post(`/api/incidents/${incId}/acknowledge`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(ackRes.body.status).toBe("acknowledged");
    expect(ackRes.body.acknowledgedAt).toBeDefined();
    expect(recordIncidentNotificationEvent).toHaveBeenCalledWith("incident.acknowledged", incId);

    const ackAgainRes = await request(app)
      .post(`/api/incidents/${incId}/acknowledge`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(400);

    expect(ackAgainRes.body.code).toBe("INCIDENT_ALREADY_ACKNOWLEDGED");

    const resolveRes = await request(app)
      .post(`/api/incidents/${incId}/resolve`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ reason: "Database rebooted and healthy" })
      .expect(200);

    expect(resolveRes.body.status).toBe("resolved");
    expect(resolveRes.body.resolutionType).toBe("manual");
    expect(resolveRes.body.resolutionReason).toBe("Database rebooted and healthy");
    expect(resolveRes.body.durationMs).toBeGreaterThanOrEqual(0);
    expect(recordIncidentNotificationEvent).toHaveBeenCalledWith("incident.resolved", incId);

    const mon = monitorsStore.find((m) => m._id === monId);
    expect(mon?.activeIncidentId).toBeNull();

    const resolveAgainRes = await request(app)
      .post(`/api/incidents/${incId}/resolve`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ reason: "Another attempt" })
      .expect(400);

    expect(resolveAgainRes.body.code).toBe("INCIDENT_ALREADY_RESOLVED");
    expect(recordIncidentNotificationEvent).toHaveBeenCalledTimes(2);

    const ackAfterResolve = await request(app)
      .post(`/api/incidents/${incId}/acknowledge`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(400);

    expect(ackAfterResolve.body.code).toBe("INCIDENT_ALREADY_RESOLVED");
  });
});
