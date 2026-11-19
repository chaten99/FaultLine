import http from "node:http";
import dns from "node:dns/promises";
import mongoose, { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { app } from "../src/app.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { MaintenanceWindow } from "../src/modules/maintenance/maintenance.model.js";
import { NotificationOutbox } from "../src/modules/notifications/notification-outbox.model.js";
import { Workspace } from "../src/modules/workspaces/workspace.model.js";
import { WorkspaceMember } from "../src/modules/workspaces/workspace-member.model.js";
import { User } from "../src/modules/auth/user.model.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { processMonitorCheckJob } from "../src/workers/monitor-check.worker.js";
import { getResponseTimes } from "../src/modules/analytics/analytics.service.js";
import type { MonitorCheckJobData } from "../src/queues/monitor-check.queue.js";
const baseUri = process.env.ANALYTICS_TEST_MONGODB_URI;
const uri = baseUri
  ? baseUri.slice(0, baseUri.lastIndexOf("/") + 1) + "faultline_advanced_integration"
  : undefined;
vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(undefined),
  createRedisConnection: vi.fn(),
}));
vi.mock("../src/queues/monitor-scheduler.service.js", () => ({
  scheduleMonitor: vi.fn(),
  unscheduleMonitor: vi.fn(),
  enqueueImmediateCheck: vi.fn(),
}));
vi.mock("../src/queues/notification.queue.js", () => ({
  getNotificationQueue: () => ({ add: vi.fn() }),
  notificationJobId: vi.fn(),
}));
vi.mock("../src/modules/status-pages/status-page-realtime.service.js", () => ({
  publishPublicIncidentUpdates: vi.fn(),
  publishPublicStatusForMonitor: vi.fn(),
}));
describe.skipIf(!uri)(
  "advanced monitoring against MongoDB and a controlled local HTTP fixture",
  () => {
    const owner = new Types.ObjectId(),
      viewer = new Types.ObjectId(),
      workspace = new Types.ObjectId();
    const auth = (user = owner) => ({
      Authorization: "Bearer " + createAccessToken(String(user)),
      "X-Workspace-Id": String(workspace),
    });
    let fixture: http.Server;
    let fixturePort: number;
    let accepted = 0;
    const payload = {
      name: "Authenticated API",
      url: "http://fixture.example/bearer",
      method: "GET",
      intervalSeconds: 60,
      timeoutMs: 1000,
      expectedStatusCodes: [201],
      active: true,
      failureThreshold: 1,
      recoveryThreshold: 1,
    };
    const run = (id: string, runId: string) =>
      processMonitorCheckJob({
        id: runId,
        data: { monitorId: id, runId },
      } as Job<MonitorCheckJobData>);
    beforeAll(async () => {
      await mongoose.connect(uri!);
      await mongoose.connection.dropDatabase();
      await Promise.all(
        [Monitor, MonitorCheck, Incident, NotificationOutbox, Workspace, WorkspaceMember].map((m) =>
          m.syncIndexes(),
        ),
      );
      await User.create([
        {
          _id: owner,
          name: "Owner",
          email: "owner@phase9.test",
          passwordHash: "fixture-hash",
          emailVerifiedAt: new Date(),
        },
        {
          _id: viewer,
          name: "Viewer",
          email: "viewer@phase9.test",
          passwordHash: "fixture-hash",
          emailVerifiedAt: new Date(),
        },
      ]);
      await Workspace.create({
        _id: workspace,
        name: "Advanced Tests",
        slug: "advanced-tests",
        type: "team",
        ownerId: owner,
        createdBy: owner,
        status: "active",
      });
      await WorkspaceMember.create([
        { workspaceId: workspace, userId: owner, role: "owner", status: "active" },
        { workspaceId: workspace, userId: viewer, role: "viewer", status: "active" },
      ]);
      fixture = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
          const body = Buffer.concat(chunks).toString();
          const ok =
            req.url === "/bearer"
              ? req.headers.authorization === "Bearer private-token"
              : req.url === "/basic"
                ? req.headers.authorization ===
                  "Basic " + Buffer.from("user:private-password").toString("base64")
                : req.url === "/custom"
                  ? req.headers["x-secret"] === "private-header"
                  : req.url === "/body"
                    ? req.method === "POST" && body === '{"request":"private-body"}'
                    : true;
          if (ok) accepted++;
          res.writeHead(ok ? 201 : 401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", count: 1, data: { available: true } }));
        });
      });
      await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
      fixturePort = (fixture.address() as import("node:net").AddressInfo).port;
      vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
      const original = http.request;
      vi.spyOn(http, "request").mockImplementation(((...args: unknown[]) => {
        const opts = args[0] as http.RequestOptions;
        if (opts && typeof opts === "object" && opts.host === "93.184.216.34") {
          expect(opts.headers).toMatchObject({ Host: "fixture.example" });
          return original(
            { ...opts, host: "127.0.0.1", port: fixturePort },
            args[1] as (res: http.IncomingMessage) => void,
          );
        }
        return Reflect.apply(original, http, args);
      }) as never);
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      if (fixture) await new Promise<void>((resolve) => fixture.close(() => resolve()));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    });
    it.each([
      { path: "bearer", config: { authType: "bearer", token: "private-token" } },
      {
        path: "basic",
        config: { authType: "basic", username: "user", password: "private-password" },
      },
      {
        path: "custom",
        config: {
          authType: "custom",
          headers: [{ name: "x-secret", value: "private-header", secret: true }],
        },
      },
      {
        path: "body",
        config: {
          authType: "none",
          body: '{"request":"private-body"}',
          contentType: "application/json",
        },
      },
    ])(
      "executes and persists a real $path request without exposing saved secrets",
      async ({ path, config }) => {
        const created = await request(app)
          .post("/api/monitors")
          .set(auth())
          .send({
            ...payload,
            url: "http://fixture.example/" + path,
            method: path === "body" ? "POST" : "GET",
            httpConfig: {
              ...config,
              keyword: { text: "ok", caseSensitive: true },
              assertions: [{ path: "data.available", operator: "equals", value: true }],
            },
          })
          .expect(201);
        expect(JSON.stringify(created.body)).not.toMatch(
          /private-token|private-password|private-header|private-body|encryptedSecrets/,
        );
        const stored = await Monitor.findById(created.body._id).select("+encryptedSecrets").lean();
        expect(stored?.encryptedSecrets).toMatch(/^v1\./);
        expect(JSON.stringify(stored)).not.toMatch(
          /private-token|private-password|private-header|private-body/,
        );
        await run(created.body._id, "fixture-" + path);
        const check = await MonitorCheck.findOne({ runId: "fixture-" + path }).lean();
        expect(check).toMatchObject({
          status: "success",
          statusCode: 201,
          monitorType: "http",
          configRevision: 1,
        });
        expect(check?.details?.assertionResults.every((r) => r.passed)).toBe(true);
        expect(JSON.stringify(check)).not.toMatch(
          /private-token|private-password|private-header|private-body/,
        );
        const view = await request(app)
          .get("/api/monitors/" + created.body._id)
          .set(auth(viewer))
          .expect(200);
        expect(JSON.stringify(view.body)).not.toContain("encryptedSecrets");
        await request(app)
          .patch("/api/monitors/" + created.body._id)
          .set(auth(viewer))
          .send({ httpConfig: { authType: "bearer", token: "replacement" } })
          .expect(403);
      },
    );
    it("uses the latest credential revision, then preserves and removes encrypted credentials", async () => {
      const created = await request(app)
        .post("/api/monitors")
        .set(auth())
        .send({ ...payload, httpConfig: { authType: "bearer", token: "obsolete-token" } })
        .expect(201);
      const id = created.body._id;
      await request(app)
        .patch("/api/monitors/" + id)
        .set(auth())
        .send({ httpConfig: { authType: "bearer", token: "private-token" } })
        .expect(200);
      await run(id, "latest-revision");
      expect(await MonitorCheck.findOne({ runId: "latest-revision" }).lean()).toMatchObject({
        status: "success",
        configRevision: 2,
      });
      await request(app)
        .patch("/api/monitors/" + id)
        .set(auth())
        .send({ httpConfig: { authType: "bearer" } })
        .expect(200);
      await run(id, "preserved-revision");
      expect(await MonitorCheck.findOne({ runId: "preserved-revision" }).lean()).toMatchObject({
        status: "success",
        configRevision: 3,
      });
      await request(app)
        .patch("/api/monitors/" + id)
        .set(auth())
        .send({ httpConfig: { authType: "none" } })
        .expect(200);
      expect(
        (await Monitor.findById(id).select("+encryptedSecrets").lean())?.encryptedSecrets,
      ).toBeNull();
    });
    it("preserves real failures and recovery incidents while maintenance suppresses events", async () => {
      await MaintenanceWindow.create({
        workspaceId: workspace,
        title: "Fixture maintenance",
        monitorIds: [],
        startAt: new Date(Date.now() - 60000),
        endAt: new Date(Date.now() + 60000),
        timezone: "UTC",
        enabled: true,
        notifyDuring: false,
      });
      const created = await request(app)
        .post("/api/monitors")
        .set(auth())
        .send({
          ...payload,
          httpConfig: {
            authType: "bearer",
            token: "private-token",
            assertions: [{ path: "count", operator: "greater_than", value: 10 }],
          },
        })
        .expect(201);
      const id = created.body._id;
      await run(id, "assertion-failure");
      expect(await MonitorCheck.findOne({ runId: "assertion-failure" }).lean()).toMatchObject({
        status: "failure",
        statusCode: 201,
        failureCategory: "RESPONSE_ASSERTION_FAILED",
        underMaintenance: true,
      });
      const incident = await Incident.findOne({ monitorId: id }).lean();
      expect(incident?.status).toBe("open");
      expect(
        await NotificationOutbox.findOne({
          incidentId: incident?._id,
          type: "incident.opened",
        }).lean(),
      ).toMatchObject({ maintenanceSuppressed: true });
      await request(app)
        .patch("/api/monitors/" + id)
        .set(auth())
        .send({
          httpConfig: {
            authType: "bearer",
            assertions: [{ path: "count", operator: "greater_than", value: 0 }],
          },
        })
        .expect(200);
      await run(id, "assertion-recovery");
      expect((await Incident.findById(incident?._id).lean())?.status).toBe("resolved");
    });
    it("keeps non-HTTP execution durations out of HTTP latency analytics", async () => {
      const now = new Date(),
        start = new Date(now.getTime() - 600000);
      const dnsMonitor = await Monitor.create({
        ...payload,
        userId: owner,
        workspaceId: workspace,
        name: "DNS",
        type: "dns",
        url: "example.com",
        dnsConfig: { recordType: "A", expectedValues: [] },
      });
      await MonitorCheck.create({
        monitorId: dnsMonitor._id,
        userId: owner,
        runId: "dns-history",
        status: "success",
        monitorType: "dns",
        startedAt: now,
        completedAt: now,
        responseDurationMs: 999999,
        statusCode: 200,
        details: { recordType: "A", values: ["8.8.8.8"] },
        expiresAt: new Date(Date.now() + 86400000),
      });
      const response = await getResponseTimes(
        { workspaceId: String(workspace), userId: String(owner), role: "owner" },
        { from: start, to: new Date(Date.now() + 1), monitorId: String(dnsMonitor._id) },
        new Date(Date.now() + 2),
      );
      expect(JSON.stringify(response)).not.toContain("999999");
      expect(accepted).toBeGreaterThanOrEqual(6);
    });
  },
);
