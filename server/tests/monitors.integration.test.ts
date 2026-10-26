import request from "supertest";
import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";

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
  __v: number;
  createdAt: string;
  updatedAt: string;
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

  beforeEach(() => {
    store = [];

    (vi.spyOn(Monitor, "create") as unknown as MockInstance).mockImplementation(
      async (doc: unknown) => {
        const item: MockMonitor = {
          _id: new mongoose.Types.ObjectId().toString(),
          __v: 0,
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

    (vi.spyOn(Monitor, "findOneAndUpdate") as unknown as MockInstance).mockImplementation(
      (query: unknown, update: unknown) => {
        const q = query as Record<string, unknown>;
        const u = update as { $set?: Record<string, unknown>; $inc?: { __v?: number } };
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
            if (a[field] < b[field]) return -1 * dir;
            if (a[field] > b[field]) return 1 * dir;
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
  });

  it("handles the complete monitor CRUD lifecycle", async () => {
    const createRes = await request(app)
      .post("/api/monitors")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Test API Health",
        url: "https://api.example.com/health",
        method: "GET",
        intervalSeconds: 300,
        timeoutMs: 10000,
        expectedStatusCodes: [200, 201],
        active: true,
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      name: "Test API Health",
      url: "https://api.example.com/health",
      method: "GET",
      intervalSeconds: 300,
      timeoutMs: 10000,
      expectedStatusCodes: [200, 201],
      active: true,
    });
    expect(createRes.body._id).toBeDefined();
    const monitorId = createRes.body._id as string;

    const getRes = await request(app)
      .get(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(getRes.body.name).toBe("Test API Health");

    const patchRes = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Updated API Health",
        timeoutMs: 5000,
      })
      .expect(200);

    expect(patchRes.body.name).toBe("Updated API Health");
    expect(patchRes.body.timeoutMs).toBe(5000);

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
        url: "https://api.example.com/private",
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
      .send({ name: "Hacked by User B" })
      .expect(404);

    await request(app)
      .delete(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);

    const listB = await request(app)
      .get("/api/monitors")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);

    expect(listB.body.items).toHaveLength(0);
    expect(listB.body.counts.total).toBe(0);

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
        name: "Toggle Monitor",
        url: "https://api.example.com/toggle",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        expectedStatusCodes: [200],
        active: true,
      })
      .expect(201);

    const monitorId = createRes.body._id as string;

    const pauseRes = await request(app)
      .patch(`/api/monitors/${monitorId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ active: false })
      .expect(200);

    expect(pauseRes.body.active).toBe(false);

    const listPaused = await request(app)
      .get("/api/monitors?status=paused")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(listPaused.body.items.some((m: { _id: string }) => m._id === monitorId)).toBe(true);
    expect(listPaused.body.counts.paused).toBeGreaterThanOrEqual(1);

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
          url: `https://api${i}.example.com/health`,
          method: "GET",
          intervalSeconds: i === 1 ? 60 : 300,
          timeoutMs: 10000,
          expectedStatusCodes: [200],
          active: i % 2 === 0,
        })
        .expect(201);
      createdIds.push(res.body._id as string);
    }

    const page1 = await request(app)
      .get("/api/monitors?page=1&pageSize=2")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(5);
    expect(page1.body.totalPages).toBe(3);
    expect(page1.body.page).toBe(1);

    const page2 = await request(app)
      .get("/api/monitors?page=2&pageSize=2")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.page).toBe(2);

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
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);

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
});
