import request from "supertest";
import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import * as redisService from "../src/lib/redis/redis.service.js";
import * as lifecycleService from "../src/modules/monitors/monitor-lifecycle.service.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
  workspaceHeaders,
} from "./helpers/workspace-fixtures.js";

vi.mock("../src/queues/monitor-scheduler.service.js", () => ({
  scheduleMonitor: vi.fn().mockResolvedValue(undefined),
  unscheduleMonitor: vi.fn().mockResolvedValue(undefined),
  enqueueImmediateCheck: vi.fn().mockResolvedValue("mock-run-id-12345"),
  reconcileSchedulers: vi.fn().mockResolvedValue({ added: 0, removed: 0, updated: 0 }),
}));

vi.mock("../src/modules/monitors/monitor-lifecycle.service.js", () => ({
  recordMonitorCreated: vi.fn().mockResolvedValue(undefined),
  recordMonitorActiveChange: vi.fn().mockResolvedValue(undefined),
  deleteMonitorLifecycle: vi.fn().mockResolvedValue(undefined),
  ensureLifecycleBaselines: vi.fn().mockResolvedValue(0),
}));

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(1),
  closeRedisConnections: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(),
  getRedisSubscriberClient: vi.fn(),
}));

type MockMonitor = {
  _id: string;
  userId: string;
  workspaceId: string;
  name: string;
  url: string;
  method: string;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCodes: number[];
  active: boolean;
  configRevision: number;
  lastCheckStatus?: string;
  __v: number;
  createdAt: string;
  updatedAt: string;
};

type MockCheck = {
  _id: string;
  monitorId: string;
  userId: string;
  runId: string;
  status: string;
  startedAt: Date;
  completedAt?: Date;
  statusCode?: number;
  responseDurationMs?: number;
  createdAt: string;
};

const filterItems = (list: MockMonitor[], filter: Record<string, unknown>): MockMonitor[] => {
  return list.filter((m) => {
    if (filter.workspaceId && m.workspaceId !== String(filter.workspaceId)) return false;
    if (typeof filter.active === "boolean" && m.active !== filter.active) return false;
    if (filter.$or && Array.isArray(filter.$or)) {
      const clauses = filter.$or as Array<{
        name?: { $regex: string; $options?: string };
        url?: { $regex: string; $options?: string };
      }>;
      const matchesOr = clauses.some((clause) => {
        if (clause.name?.$regex) {
          const reg = new RegExp(clause.name.$regex, clause.name.$options);
          return reg.test(m.name);
        }
        if (clause.url?.$regex) {
          const reg = new RegExp(clause.url.$regex, clause.url.$options);
          return reg.test(m.url);
        }
        return false;
      });
      if (!matchesOr) return false;
    }
    return true;
  });
};

describe("Monitor API Integration Tests", () => {
  const userAId = new mongoose.Types.ObjectId().toString();
  const userBId = new mongoose.Types.ObjectId().toString();
  const adminId = new mongoose.Types.ObjectId();
  const memberId = new mongoose.Types.ObjectId();
  const viewerId = new mongoose.Types.ObjectId();
  const outsiderId = new mongoose.Types.ObjectId();
  const sharedId = new mongoose.Types.ObjectId();
  const tokenA = createAccessToken(userAId);
  const tokenB = createAccessToken(userBId);
  const adminToken = createAccessToken(String(adminId));
  const memberToken = createAccessToken(String(memberId));
  const viewerToken = createAccessToken(String(viewerId));
  const outsiderToken = createAccessToken(String(outsiderId));
  const sharedToken = createAccessToken(String(sharedId));

  const workspaces = bindWorkspaceModels();
  let wsA = new mongoose.Types.ObjectId();
  let wsB = new mongoose.Types.ObjectId();
  const as = (token: string, workspaceId: unknown = wsA) =>
    workspaceHeaders(token, workspaceId as string);

  let store: MockMonitor[] = [];
  let checkStore: MockCheck[] = [];

  const newMonitor = {
    name: "Role Test Monitor",
    url: "https://api.example.com/roles",
    method: "GET",
    intervalSeconds: 300,
    timeoutMs: 5000,
    expectedStatusCodes: [200],
    active: true,
  };

  beforeEach(() => {
    store = [];
    checkStore = [];
    resetWorkspaceModels(workspaces);
    wsA = seedWorkspace(workspaces, {
      ownerId: new mongoose.Types.ObjectId(userAId),
      members: [
        { userId: adminId, role: "admin" },
        { userId: memberId, role: "member" },
        { userId: viewerId, role: "viewer" },
        { userId: sharedId, role: "member" },
      ],
    });
    wsB = seedWorkspace(workspaces, {
      ownerId: new mongoose.Types.ObjectId(userBId),
      members: [{ userId: sharedId, role: "member" }],
    });

    (vi.spyOn(MonitorCheck, "create") as unknown as MockInstance).mockImplementation(
      async (doc: unknown) => {
        const check = {
          _id: new mongoose.Types.ObjectId().toString(),
          ...(doc as object),
        } as MockCheck;
        checkStore.push(check);
        return check;
      },
    );
    (vi.spyOn(MonitorCheck, "deleteOne") as unknown as MockInstance).mockImplementation(
      async (query: unknown) => {
        const q = query as Record<string, unknown>;
        const before = checkStore.length;
        checkStore = checkStore.filter((check) => check.runId !== q.runId);
        return { deletedCount: before - checkStore.length };
      },
    );

    (vi.spyOn(Monitor, "create") as unknown as MockInstance).mockImplementation(
      async (doc: unknown) => {
        const item: MockMonitor = {
          _id: new mongoose.Types.ObjectId().toString(),
          __v: 0,
          configRevision: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(doc as Record<string, unknown>),
        } as MockMonitor;
        store.push(item);
        return item;
      },
    );

    (vi.spyOn(Monitor, "findOne") as unknown as MockInstance).mockImplementation(
      (query: unknown) => {
        const q = query as Record<string, unknown>;
        const found = store.find((m) => {
          if (q._id && m._id !== String(q._id)) return false;
          if (q.workspaceId && m.workspaceId !== String(q.workspaceId)) return false;
          return true;
        });
        return Promise.resolve(found ? { ...found } : null);
      },
    );

    (vi.spyOn(Monitor, "findByIdAndUpdate") as unknown as MockInstance).mockImplementation(
      (id: unknown, update: unknown) => {
        const u = update as { $set?: Record<string, unknown> };
        const found = store.find((m) => m._id === String(id));
        if (found && u.$set) {
          Object.assign(found, u.$set);
        }
        return Promise.resolve(found ? { ...found } : null);
      },
    );

    (vi.spyOn(Monitor, "findOneAndUpdate") as unknown as MockInstance).mockImplementation(
      (query: unknown, update: unknown) => {
        const q = query as Record<string, unknown>;
        const u = update as {
          $set?: Record<string, unknown>;
          $inc?: { __v?: number; configRevision?: number };
        };
        const index = store.findIndex((m) => {
          if (q._id && m._id !== String(q._id)) return false;
          if (q.workspaceId && m.workspaceId !== String(q.workspaceId)) return false;
          if (typeof q.__v === "number" && m.__v !== q.__v) return false;
          return true;
        });
        if (index === -1) return Promise.resolve(null);

        const current = store[index]!;
        const updated: MockMonitor = {
          ...current,
          ...(u.$set || {}),
          __v: current.__v + 1,
          configRevision: current.configRevision + 1,
          updatedAt: new Date().toISOString(),
        } as MockMonitor;
        store[index] = updated;
        return Promise.resolve({ ...updated });
      },
    );

    (vi.spyOn(Monitor, "deleteOne") as unknown as MockInstance).mockImplementation(
      async (query: unknown) => {
        const q = query as Record<string, unknown>;
        const prevLen = store.length;
        store = store.filter((m) => {
          if (
            q._id &&
            m._id === String(q._id) &&
            q.workspaceId &&
            m.workspaceId === String(q.workspaceId)
          ) {
            return false;
          }
          return true;
        });
        return { deletedCount: prevLen - store.length };
      },
    );

    (vi.spyOn(Monitor, "countDocuments") as unknown as MockInstance).mockImplementation(
      async (filter: unknown) => {
        return filterItems(store, (filter || {}) as Record<string, unknown>).length;
      },
    );

    (vi.spyOn(Monitor, "find") as unknown as MockInstance).mockImplementation((filter: unknown) => {
      let matched = filterItems(store, (filter || {}) as Record<string, unknown>);
      const chain = {
        sort(sortObj: Record<string, 1 | -1>) {
          const field = Object.keys(sortObj)[0] as keyof MockMonitor;
          const dir = sortObj[field] ?? 1;
          matched.sort((a, b) => {
            const valA = a[field];
            const valB = b[field];
            if (valA !== undefined && valB !== undefined) {
              if (valA < valB) return -1 * dir;
              if (valA > valB) return 1 * dir;
            }
            return 0;
          });
          return chain;
        },
        skip(n: number) {
          matched = matched.slice(n);
          return chain;
        },
        limit(n: number) {
          matched = matched.slice(0, n);
          return chain;
        },
        lean() {
          return Promise.resolve(matched.map((m) => ({ ...m })));
        },
      };
      return chain;
    });

    (vi.spyOn(MonitorCheck, "find") as unknown as MockInstance).mockImplementation(
      (filter: unknown) => {
        const f = (filter || {}) as Record<string, unknown>;
        let matched = checkStore.filter((c) => {
          if (f.monitorId && c.monitorId !== String(f.monitorId)) return false;
          if (f.status && c.status !== f.status) return false;
          return true;
        });
        const chain = {
          sort() {
            return chain;
          },
          skip(n: number) {
            matched = matched.slice(n);
            return chain;
          },
          limit(n: number) {
            matched = matched.slice(0, n);
            return chain;
          },
          lean() {
            return Promise.resolve(matched.map((c) => ({ ...c })));
          },
        };
        return chain;
      },
    );

    (vi.spyOn(MonitorCheck, "deleteMany") as unknown as MockInstance).mockImplementation(
      async (query: unknown) => {
        const q = query as Record<string, unknown>;
        const prevLen = checkStore.length;
        checkStore = checkStore.filter((c) => {
          if (q.monitorId && c.monitorId === String(q.monitorId)) return false;
          return true;
        });
        return { deletedCount: prevLen - checkStore.length };
      },
    );

    (vi.spyOn(MonitorCheck, "countDocuments") as unknown as MockInstance).mockImplementation(
      async (filter: unknown) => {
        const f = (filter || {}) as Record<string, unknown>;
        return checkStore.filter((c) => {
          if (f.monitorId && c.monitorId !== String(f.monitorId)) return false;
          if (f.status && c.status !== f.status) return false;
          return true;
        }).length;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enforces authentication on all monitor endpoints", async () => {
    await request(app).get("/api/monitors").set("X-Workspace-Id", String(wsA)).expect(401);
    await request(app).get("/api/monitors").expect(401);
    await request(app).post("/api/monitors").send({}).expect(401);
    await request(app).get("/api/monitors/507f1f77bcf86cd799439011").expect(401);
    await request(app).patch("/api/monitors/507f1f77bcf86cd799439011").send({}).expect(401);
    await request(app).delete("/api/monitors/507f1f77bcf86cd799439011").expect(401);
    await request(app).post("/api/monitors/507f1f77bcf86cd799439011/check-now").expect(401);
    await request(app).get("/api/monitors/507f1f77bcf86cd799439011/checks").expect(401);
  });

  it("handles the complete monitor CRUD lifecycle", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set(as(tokenA))
      .send({
        name: "Test API Health",
        url: "https://api.example.com/health",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatusCodes: [200, 204],
        active: true,
      })
      .expect(201);

    expect(createRes.body.name).toBe("Test API Health");
    expect(createRes.body.url).toBe("https://api.example.com/health");
    expect(createRes.body.intervalSeconds).toBe(60);
    expect(createRes.body.active).toBe(true);
    expect(createRes.body._id).toBeDefined();

    const monitorId = createRes.body._id as string;

    const getRes = await request(app).get(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(200);

    expect(getRes.body._id).toBe(monitorId);
    expect(getRes.body.name).toBe("Test API Health");

    const updateRes = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set(as(tokenA))
      .send({
        name: "Updated API Health",
        intervalSeconds: 300,
        timeoutMs: 8000,
      })
      .expect(200);

    expect(updateRes.body.name).toBe("Updated API Health");
    expect(updateRes.body.intervalSeconds).toBe(300);
    expect(updateRes.body.timeoutMs).toBe(8000);

    await request(app).delete(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(204);

    await request(app).get(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(404);
  });

  it("denies cross-user access to monitors", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set(as(tokenA))
      .send({
        name: "User A Monitor",
        url: "https://api.example.com/a",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 10000,
        expectedStatusCodes: [200],
        active: true,
      })
      .expect(201);

    const monitorId = createRes.body._id as string;

    const notFound = await request(app)
      .get(`/api/monitors/${monitorId}`)
      .set(as(tokenB, wsB))
      .expect(404);
    expect(notFound.body.code).toBe("MONITOR_NOT_FOUND");

    await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set(as(tokenB, wsB))
      .send({ name: "Hacked Name" })
      .expect(404);

    await request(app).delete(`/api/monitors/${monitorId}`).set(as(tokenB, wsB)).expect(404);

    await request(app)
      .post(`/api/monitors/${monitorId}/check-now`)
      .set(as(tokenB, wsB))
      .expect(404);

    await request(app).get(`/api/monitors/${monitorId}/checks`).set(as(tokenB, wsB)).expect(404);

    await request(app).delete(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(204);
  });

  it("handles pause and resume operations", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set(as(tokenA))
      .send({
        name: "Pausable Monitor",
        url: "https://api.example.com/pause",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 10000,
        expectedStatusCodes: [200],
        active: true,
      })
      .expect(201);

    const monitorId = createRes.body._id as string;
    expect(createRes.body.active).toBe(true);

    const pauseRes = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set(as(tokenA))
      .send({ active: false })
      .expect(200);

    expect(pauseRes.body.active).toBe(false);

    const resumeRes = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set(as(tokenA))
      .send({ active: true })
      .expect(200);

    expect(resumeRes.body.active).toBe(true);

    expect(lifecycleService.recordMonitorCreated).toHaveBeenCalled();
    const changes = vi.mocked(lifecycleService.recordMonitorActiveChange).mock.calls;
    expect(changes.slice(-2).map(([monitor, previous]) => [monitor.active, previous])).toEqual([
      [false, true],
      [true, false],
    ]);

    await request(app).delete(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(204);
  });

  it("supports pagination, searching, and sorting", async () => {
    const createdIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post("/api/monitors")
        .set(as(tokenA))
        .send({
          name: `Batch Monitor ${i}`,
          url: `https://api.example.com/batch/${i}`,
          method: "GET",
          intervalSeconds: [60, 300, 600, 900, 1800][i - 1],
          timeoutMs: 5000,
          expectedStatusCodes: [200],
          active: i % 2 === 0,
        })
        .expect(201);
      createdIds.push(res.body._id);
    }

    const pagedRes = await request(app)
      .get("/api/monitors?page=1&pageSize=2")
      .set(as(tokenA))
      .expect(200);

    expect(pagedRes.body.items).toHaveLength(2);
    expect(pagedRes.body.total).toBe(5);
    expect(pagedRes.body.totalPages).toBe(3);

    const activeRes = await request(app)
      .get("/api/monitors?status=active")
      .set(as(tokenA))
      .expect(200);

    expect(activeRes.body.items.every((m: { active: boolean }) => m.active)).toBe(true);

    const searchRes = await request(app)
      .get("/api/monitors?search=Batch Monitor 3")
      .set(as(tokenA))
      .expect(200);

    expect(searchRes.body.items).toHaveLength(1);
    expect(searchRes.body.items[0].name).toBe("Batch Monitor 3");

    const sortRes = await request(app)
      .get("/api/monitors?sortBy=name&sortOrder=asc&pageSize=10")
      .set(as(tokenA))
      .expect(200);

    const names = sortRes.body.items.map((m: { name: string }) => m.name);
    expect(names).toEqual([...names].sort());

    for (const id of createdIds) {
      await request(app).delete(`/api/monitors/${id}`).set(as(tokenA)).expect(204);
    }
  });

  it("handles concurrency conflict error when version is mismatched", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set(as(tokenA))
      .send({
        name: "Concurrent Test",
        url: "https://api.example.com/concurrent",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 10000,
        expectedStatusCodes: [200],
        active: true,
      })
      .expect(201);

    const monitorId = createRes.body._id as string;

    const conflictRes = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set(as(tokenA))
      .send({
        name: "Conflicting Update",
        version: 999,
      })
      .expect(409);

    expect(conflictRes.body.code).toBe("CONCURRENT_UPDATE_CONFLICT");

    await request(app).delete(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(204);
  });

  it("rejects SSRF and private destinations on monitor creation", async () => {
    const ssrfRes = await request(app)
      .post("/api/monitors")
      .set(as(tokenA))
      .send({
        name: "Internal Metadata Attack",
        url: "http://169.254.169.254/latest/meta-data",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 10000,
        expectedStatusCodes: [200],
        active: true,
      })
      .expect(400);

    expect(ssrfRes.body.code).toBe("INVALID_MONITOR_URL");
  });

  it("handles manual check triggering via check-now endpoint", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set(as(tokenA))
      .send({
        name: "Manual Check Endpoint",
        url: "https://api.example.com/manual-check",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 5000,
        expectedStatusCodes: [200],
        active: true,
      })
      .expect(201);

    const monitorId = createRes.body._id as string;

    const checkRes = await request(app)
      .post(`/api/monitors/${monitorId}/check-now`)
      .set(as(tokenA))
      .expect(202);

    expect(checkRes.body.status).toBe("queued");
    expect(checkRes.body.runId).toBeDefined();

    const stored = store.find((m) => m._id === monitorId);
    expect(stored?.lastCheckStatus).toBe("queued");

    await request(app).delete(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(204);
  });

  it("enforces cooldown rate limiting on check-now", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set(as(tokenA))
      .send({
        name: "Rate Limited Endpoint",
        url: "https://api.example.com/rate-limit",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 5000,
        expectedStatusCodes: [200],
        active: true,
      })
      .expect(201);

    const monitorId = createRes.body._id as string;

    (vi.spyOn(redisService, "acquireLock") as unknown as MockInstance).mockResolvedValueOnce(false);

    const rateLimitedRes = await request(app)
      .post(`/api/monitors/${monitorId}/check-now`)
      .set(as(tokenA))
      .expect(429);

    expect(rateLimitedRes.body.code).toBe("RATE_LIMITED");

    await request(app).delete(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(204);
  });

  it("lists monitor checks with pagination", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set(as(tokenA))
      .send({
        name: "Checks Listing Monitor",
        url: "https://api.example.com/checks-test",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 5000,
        expectedStatusCodes: [200],
        active: true,
      })
      .expect(201);

    const monitorId = createRes.body._id as string;

    for (let i = 1; i <= 3; i++) {
      checkStore.push({
        _id: new mongoose.Types.ObjectId().toString(),
        monitorId,
        userId: userAId,
        runId: `run-${i}`,
        status: i === 1 ? "success" : "failure",
        statusCode: i === 1 ? 200 : 500,
        responseDurationMs: 150 * i,
        startedAt: new Date(),
        completedAt: new Date(),
        createdAt: new Date().toISOString(),
      });
    }

    const listRes = await request(app)
      .get(`/api/monitors/${monitorId}/checks?page=1&pageSize=2`)
      .set(as(tokenA))
      .expect(200);

    expect(listRes.body.items).toHaveLength(2);
    expect(listRes.body.total).toBe(3);
    expect(listRes.body.totalPages).toBe(2);

    await request(app).delete(`/api/monitors/${monitorId}`).set(as(tokenA)).expect(204);
  });

  describe("workspace scope and roles", () => {
    const createAs = (token: string, workspaceId: unknown = wsA, body: object = newMonitor) =>
      request(app).post("/api/monitors").set(as(token, workspaceId)).send(body);

    it("stores the workspace and keeps the creator as provenance", async () => {
      const response = await createAs(memberToken).expect(201);
      const stored = store.find((m) => m._id === response.body._id);
      expect(stored?.workspaceId).toBe(String(wsA));
      expect(stored?.userId).toBe(String(memberId));
    });

    it("lets owner, admin and member manage monitors", async () => {
      for (const token of [tokenA, adminToken, memberToken]) {
        const created = await createAs(token).expect(201);
        const id = created.body._id as string;
        await request(app)
          .patch(`/api/monitors/${id}`)
          .set(as(token))
          .send({ name: "Renamed" })
          .expect(200);
        await request(app).post(`/api/monitors/${id}/check-now`).set(as(token)).expect(202);
        await request(app).delete(`/api/monitors/${id}`).set(as(token)).expect(204);
      }
    });

    it("lets a viewer read monitors and checks but not change anything", async () => {
      const created = await createAs(tokenA).expect(201);
      const id = created.body._id as string;
      checkStore.push({
        _id: new mongoose.Types.ObjectId().toString(),
        monitorId: id,
        userId: userAId,
        runId: "run-viewer",
        status: "success",
        startedAt: new Date(),
        createdAt: new Date().toISOString(),
      });

      const list = await request(app).get("/api/monitors").set(as(viewerToken)).expect(200);
      expect(list.body.items).toHaveLength(1);
      await request(app).get(`/api/monitors/${id}`).set(as(viewerToken)).expect(200);
      const checks = await request(app)
        .get(`/api/monitors/${id}/checks`)
        .set(as(viewerToken))
        .expect(200);
      expect(checks.body.items).toHaveLength(1);

      const attempts = [
        request(app).post("/api/monitors").set(as(viewerToken)).send(newMonitor),
        request(app).patch(`/api/monitors/${id}`).set(as(viewerToken)).send({ name: "Nope" }),
        request(app).patch(`/api/monitors/${id}`).set(as(viewerToken)).send({ active: false }),
        request(app).delete(`/api/monitors/${id}`).set(as(viewerToken)),
        request(app).post(`/api/monitors/${id}/check-now`).set(as(viewerToken)),
      ];
      for (const attempt of attempts) {
        const response = await attempt;
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("INSUFFICIENT_PERMISSIONS");
      }
      expect(store).toHaveLength(1);
      expect(store[0]?.name).toBe("Role Test Monitor");
      expect(store[0]?.active).toBe(true);
    });

    it("answers 404 WORKSPACE_NOT_FOUND to people who are not members", async () => {
      const created = await createAs(tokenA).expect(201);
      const id = created.body._id as string;
      for (const attempt of [
        request(app).get("/api/monitors").set(as(outsiderToken)),
        request(app).get(`/api/monitors/${id}`).set(as(outsiderToken)),
        request(app).post("/api/monitors").set(as(outsiderToken)).send(newMonitor),
        request(app).delete(`/api/monitors/${id}`).set(as(outsiderToken)),
      ]) {
        const response = await attempt;
        expect(response.status).toBe(404);
        expect(response.body.code).toBe("WORKSPACE_NOT_FOUND");
      }
      expect(store).toHaveLength(1);
    });

    it("rejects malformed and unknown workspace headers the same way", async () => {
      for (const header of ["not-an-id", "507f1f77bcf86cd799439011"]) {
        const response = await request(app)
          .get("/api/monitors")
          .set({ Authorization: `Bearer ${tokenA}`, "X-Workspace-Id": header });
        expect(response.status).toBe(404);
        expect(response.body.code).toBe("WORKSPACE_NOT_FOUND");
      }
    });

    it("keeps each workspace's monitors separate for someone who belongs to both", async () => {
      const inA = await createAs(sharedToken, wsA).expect(201);
      const inB = await createAs(sharedToken, wsB, {
        ...newMonitor,
        name: "Workspace B Monitor",
      }).expect(201);

      const listA = await request(app).get("/api/monitors").set(as(sharedToken, wsA)).expect(200);
      const listB = await request(app).get("/api/monitors").set(as(sharedToken, wsB)).expect(200);
      expect(listA.body.items.map((m: { name: string }) => m.name)).toEqual(["Role Test Monitor"]);
      expect(listB.body.items.map((m: { name: string }) => m.name)).toEqual([
        "Workspace B Monitor",
      ]);
      expect(listA.body.counts.total).toBe(1);

      await request(app).get(`/api/monitors/${inB.body._id}`).set(as(sharedToken, wsA)).expect(404);
      await request(app)
        .patch(`/api/monitors/${inB.body._id}`)
        .set(as(sharedToken, wsA))
        .send({ name: "Cross edit" })
        .expect(404);
      await request(app)
        .delete(`/api/monitors/${inB.body._id}`)
        .set(as(sharedToken, wsA))
        .expect(404);
      await request(app)
        .post(`/api/monitors/${inB.body._id}/check-now`)
        .set(as(sharedToken, wsA))
        .expect(404);
      await request(app)
        .get(`/api/monitors/${inB.body._id}/checks`)
        .set(as(sharedToken, wsA))
        .expect(404);
      await request(app).get(`/api/monitors/${inA.body._id}`).set(as(sharedToken, wsB)).expect(404);
      expect(store.find((m) => m._id === inB.body._id)?.name).toBe("Workspace B Monitor");
    });

    it("denies access immediately after a membership is removed", async () => {
      await request(app).get("/api/monitors").set(as(memberToken)).expect(200);
      const membership = workspaces.members.docs.find(
        (doc) => String(doc.userId) === String(memberId),
      );
      (membership as Record<string, unknown>).status = "removed";
      const response = await request(app).get("/api/monitors").set(as(memberToken));
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("WORKSPACE_NOT_FOUND");
      await createAs(memberToken).expect(404);
    });

    it("applies role changes on the very next request", async () => {
      await createAs(memberToken).expect(201);
      const membership = workspaces.members.docs.find(
        (doc) => String(doc.userId) === String(memberId),
      );
      (membership as Record<string, unknown>).role = "viewer";
      const response = await createAs(memberToken);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("INSUFFICIENT_PERMISSIONS");
    });

    it("hides monitors of a deleted workspace", async () => {
      await createAs(tokenA).expect(201);
      const workspace = workspaces.workspaces.docs.find((doc) => String(doc._id) === String(wsA));
      (workspace as Record<string, unknown>).status = "deleted";
      const response = await request(app).get("/api/monitors").set(as(tokenA));
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("WORKSPACE_NOT_FOUND");
    });

    it("treats the workspace owner as owner even if the membership row says otherwise", async () => {
      const membership = workspaces.members.docs.find((doc) => String(doc.userId) === userAId);
      (membership as Record<string, unknown>).role = "viewer";
      await createAs(tokenA).expect(201);
    });

    it("publishes manual check events to the workspace instead of a user", async () => {
      const created = await createAs(memberToken).expect(201);
      vi.mocked(redisService.publishDomainEvent).mockClear();
      await request(app)
        .post(`/api/monitors/${created.body._id}/check-now`)
        .set(as(memberToken))
        .expect(202);
      const call = vi
        .mocked(redisService.publishDomainEvent)
        .mock.calls.find(([type]) => type === "monitor.check.queued");
      expect(call?.[1]).toMatchObject({ workspaceId: String(wsA) });
      expect(call?.[1]).not.toHaveProperty("userId");
    });

    it("never touches another workspace's checks when deleting a monitor", async () => {
      const inA = await createAs(tokenA).expect(201);
      const inB = await createAs(sharedToken, wsB, { ...newMonitor, name: "Other" }).expect(201);
      checkStore.push({
        _id: new mongoose.Types.ObjectId().toString(),
        monitorId: inB.body._id,
        userId: String(sharedId),
        runId: "run-b",
        status: "success",
        startedAt: new Date(),
        createdAt: new Date().toISOString(),
      });
      await request(app).delete(`/api/monitors/${inA.body._id}`).set(as(tokenA)).expect(204);
      expect(checkStore.map((check) => check.runId)).toEqual(["run-b"]);
    });
  });
});
