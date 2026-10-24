import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";

describe("Monitor API Integration Tests", () => {
  const userAId = new mongoose.Types.ObjectId().toString();
  const userBId = new mongoose.Types.ObjectId().toString();
  const tokenA = createAccessToken(userAId);
  const tokenB = createAccessToken(userBId);

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(env.MONGODB_URI);
    }
  });

  afterAll(async () => {
    await Monitor.deleteMany({ userId: { $in: [userAId, userBId] } });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
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
