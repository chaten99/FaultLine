import request from "supertest";
import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import * as redisService from "../src/lib/redis/redis.service.js";

vi.mock("../src/queues/monitor-scheduler.service.js", () => ({
  scheduleMonitor: vi.fn().mockResolvedValue(undefined),
  unscheduleMonitor: vi.fn().mockResolvedValue(undefined),
  enqueueImmediateCheck: vi.fn().mockResolvedValue("mock-run-id-12345"),
  reconcileSchedulers: vi.fn().mockResolvedValue({ added: 0, removed: 0, updated: 0 }),
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
    if (filter.userId && m.userId !== String(filter.userId)) return false;
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
  const tokenA = createAccessToken(userAId);
  const tokenB = createAccessToken(userBId);

  let store: MockMonitor[] = [];
  let checkStore: MockCheck[] = [];

  beforeEach(() => {
    store = [];
    checkStore = [];

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
          if (q.userId && m.userId !== String(q.userId)) return false;
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
          if (q.userId && m.userId !== String(q.userId)) return false;
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
          if (q._id && m._id === String(q._id) && q.userId && m.userId === String(q.userId)) {
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
          if (f.userId && c.userId !== String(f.userId)) return false;
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
          if (q.userId && c.userId === String(q.userId)) return false;
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
          if (f.userId && c.userId !== String(f.userId)) return false;
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
      .set("Authorization", `Bearer ${tokenA}`)
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

    const getRes = await request(app)
      .get(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(getRes.body._id).toBe(monitorId);
    expect(getRes.body.name).toBe("Test API Health");

    const updateRes = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Updated API Health",
        intervalSeconds: 300,
        timeoutMs: 8000,
      })
      .expect(200);

    expect(updateRes.body.name).toBe("Updated API Health");
    expect(updateRes.body.intervalSeconds).toBe(300);
    expect(updateRes.body.timeoutMs).toBe(8000);

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(204);

    await request(app)
      .get(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);
  });

  it("denies cross-user access to monitors", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set("Authorization", `Bearer ${tokenA}`)
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

    await request(app)
      .get(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);

    await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Hacked Name" })
      .expect(404);

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);

    await request(app)
      .post(`/api/monitors/${monitorId}/check-now`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);

    await request(app)
      .get(`/api/monitors/${monitorId}/checks`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(204);
  });

  it("handles pause and resume operations", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set("Authorization", `Bearer ${tokenA}`)
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
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ active: false })
      .expect(200);

    expect(pauseRes.body.active).toBe(false);

    const resumeRes = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ active: true })
      .expect(200);

    expect(resumeRes.body.active).toBe(true);

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(204);
  });

  it("supports pagination, searching, and sorting", async () => {
    const createdIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post("/api/monitors")
        .set("Authorization", `Bearer ${tokenA}`)
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
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(pagedRes.body.items).toHaveLength(2);
    expect(pagedRes.body.total).toBe(5);
    expect(pagedRes.body.totalPages).toBe(3);

    const activeRes = await request(app)
      .get("/api/monitors?status=active")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(activeRes.body.items.every((m: { active: boolean }) => m.active)).toBe(true);

    const searchRes = await request(app)
      .get("/api/monitors?search=Batch Monitor 3")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(searchRes.body.items).toHaveLength(1);
    expect(searchRes.body.items[0].name).toBe("Batch Monitor 3");

    const sortRes = await request(app)
      .get("/api/monitors?sortBy=name&sortOrder=asc&pageSize=10")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    const names = sortRes.body.items.map((m: { name: string }) => m.name);
    expect(names).toEqual([...names].sort());

    for (const id of createdIds) {
      await request(app)
        .delete(`/api/monitors/${id}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(204);
    }
  });

  it("handles concurrency conflict error when version is mismatched", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set("Authorization", `Bearer ${tokenA}`)
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
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Conflicting Update",
        version: 999,
      })
      .expect(409);

    expect(conflictRes.body.code).toBe("CONCURRENT_UPDATE_CONFLICT");

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(204);
  });

  it("rejects SSRF and private destinations on monitor creation", async () => {
    const ssrfRes = await request(app)
      .post("/api/monitors")
      .set("Authorization", `Bearer ${tokenA}`)
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
      .set("Authorization", `Bearer ${tokenA}`)
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
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(202);

    expect(checkRes.body.status).toBe("queued");
    expect(checkRes.body.runId).toBeDefined();

    const stored = store.find((m) => m._id === monitorId);
    expect(stored?.lastCheckStatus).toBe("queued");

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(204);
  });

  it("enforces cooldown rate limiting on check-now", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set("Authorization", `Bearer ${tokenA}`)
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
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(429);

    expect(rateLimitedRes.body.code).toBe("RATE_LIMITED");

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(204);
  });

  it("lists monitor checks with pagination", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set("Authorization", `Bearer ${tokenA}`)
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
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(listRes.body.items).toHaveLength(2);
    expect(listRes.body.total).toBe(3);
    expect(listRes.body.totalPages).toBe(2);

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(204);
  });
});
