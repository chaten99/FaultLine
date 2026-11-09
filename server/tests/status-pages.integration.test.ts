import mongoose, { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { sendNotificationEmail } from "../src/lib/email/email.service.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import type { INotificationOutbox } from "../src/modules/notifications/notification-outbox.model.js";
import { StatusPageDelivery } from "../src/modules/status-pages/status-page-delivery.model.js";
import {
  dispatchSubscriberNotifications,
  processSubscriberDelivery,
} from "../src/modules/status-pages/status-page-delivery.service.js";
import { StatusPageService } from "../src/modules/status-pages/status-page-service.model.js";
import { StatusPageSubscriber } from "../src/modules/status-pages/status-page-subscriber.model.js";
import { createUnsubscribeToken } from "../src/modules/status-pages/status-page-subscriber.service.js";
import { PublicStatusPage } from "../src/modules/status-pages/status-page.model.js";
import { invalidateStatusCache } from "../src/modules/status-pages/status-page-snapshot.service.js";

const baseUri = process.env.ANALYTICS_TEST_MONGODB_URI;
const uri = baseUri
  ? `${baseUri.slice(0, baseUri.lastIndexOf("/") + 1)}faultline_status_integration`
  : undefined;

const redisState = vi.hoisted(() => {
  const counts = new Map<string, number>();
  return {
    counts,
    client: {
      status: "ready",
      incr: async (key: string) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts.get(key) as number;
      },
      expire: async () => 1,
    },
  };
});

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(undefined),
  closeRedisConnections: vi.fn(),
  getRedisClient: () => redisState.client,
  createRedisConnection: vi.fn(),
}));

vi.mock("../src/queues/notification.queue.js", () => ({
  getNotificationQueue: () => ({ add: vi.fn().mockResolvedValue({ id: "job" }) }),
  notificationJobId: (deliveryId: string, generation: number) => `${deliveryId}_${generation}`,
  closeNotificationQueue: vi.fn(),
}));

vi.mock("../src/lib/email/email.service.js", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true, responseCode: 200, durationMs: 3 }),
}));

const sendMock = vi.mocked(sendNotificationEmail);

describe.skipIf(!uri)("status pages against MongoDB", () => {
  const owner = new Types.ObjectId();
  const stranger = new Types.ObjectId();
  const ownerToken = createAccessToken(String(owner));
  const strangerToken = createAccessToken(String(stranger));
  const apiMonitor = new Types.ObjectId();
  const webMonitor = new Types.ObjectId();
  const foreignMonitor = new Types.ObjectId();
  let pageId = "";

  const monitorDoc = (id: Types.ObjectId, userId: Types.ObjectId, name: string) => ({
    _id: id,
    userId,
    name,
    url: `https://${name.toLowerCase()}.example.test/health?token=SECRET`,
    method: "GET",
    intervalSeconds: 60,
    timeoutMs: 10_000,
    expectedStatusCodes: [200],
    active: true,
    configRevision: 1,
    failureThreshold: 3,
    recoveryThreshold: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const checkDoc = (monitorId: Types.ObjectId, ageMs = 20_000) => ({
    monitorId,
    userId: owner,
    runId: `run-${new Types.ObjectId()}`,
    status: "success",
    startedAt: new Date(Date.now() - ageMs),
    completedAt: new Date(Date.now() - ageMs),
    responseDurationMs: 120,
    statusCode: 200,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const publicStatus = () => {
    invalidateStatusCache();
    return request(app).get("/api/public/status-pages/live-status");
  };

  beforeAll(async () => {
    await mongoose.connect(uri as string);
    await mongoose.connection.dropDatabase();
    await Promise.all([
      PublicStatusPage.syncIndexes(),
      StatusPageService.syncIndexes(),
      StatusPageSubscriber.syncIndexes(),
      StatusPageDelivery.syncIndexes(),
    ]);
    await Monitor.collection.insertMany([
      monitorDoc(apiMonitor, owner, "Api"),
      monitorDoc(webMonitor, owner, "Web"),
      monitorDoc(foreignMonitor, stranger, "Foreign"),
    ]);
    await MonitorCheck.collection.insertMany([checkDoc(apiMonitor), checkDoc(webMonitor)]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("enforces unique slugs with the database index and keeps pages private to their owner", async () => {
    const created = await request(app)
      .post("/api/status-pages")
      .set(auth(ownerToken))
      .send({ name: "Live Status", slug: "live-status" })
      .expect(201);
    pageId = created.body.page.id;
    const clash = await request(app)
      .post("/api/status-pages")
      .set(auth(strangerToken))
      .send({ name: "Copycat", slug: "live-status" })
      .expect(409);
    expect(clash.body.code).toBe("SLUG_TAKEN");

    const other = await request(app)
      .post("/api/status-pages")
      .set(auth(ownerToken))
      .send({ name: "Second", slug: "second-status" })
      .expect(201);
    const collision = await request(app)
      .patch(`/api/status-pages/${other.body.page.id}`)
      .set(auth(ownerToken))
      .send({ slug: "live-status" })
      .expect(409);
    expect(collision.body.code).toBe("SLUG_TAKEN");

    await request(app).get(`/api/status-pages/${pageId}`).set(auth(strangerToken)).expect(404);
    await request(app).get("/api/public/status-pages/live-status").expect(404);
  });

  it("validates monitor ownership against real documents and stores services", async () => {
    const rejected = await request(app)
      .post(`/api/status-pages/${pageId}/services`)
      .set(auth(ownerToken))
      .send({ name: "Sneaky", monitorIds: [String(apiMonitor), String(foreignMonitor)] })
      .expect(400);
    expect(rejected.body.code).toBe("INVALID_MONITOR_SELECTION");
    expect(await StatusPageService.countDocuments({ pageId })).toBe(0);

    const created = await request(app)
      .post(`/api/status-pages/${pageId}/services`)
      .set(auth(ownerToken))
      .send({ name: "Public API", monitorIds: [String(apiMonitor), String(webMonitor)] })
      .expect(201);
    expect(created.body.service.monitors.map((monitor: { host: string }) => monitor.host)).toEqual([
      "api.example.test",
      "web.example.test",
    ]);
    expect(JSON.stringify(created.body)).not.toContain("SECRET");
  });

  it("publishes and reports real health, incidents and recovery", async () => {
    await request(app)
      .post(`/api/status-pages/${pageId}/publish`)
      .set(auth(ownerToken))
      .expect(200);
    const operational = await publicStatus().expect(200);
    expect(operational.body.status.overall).toBe("operational");
    expect(JSON.stringify(operational.body)).not.toMatch(/SECRET|example\.test|userId|ownerId/);

    const incident = await Incident.collection.insertOne({
      monitorId: apiMonitor,
      userId: owner,
      title: "Incident on Api: TIMEOUT",
      status: "open",
      firstFailureAt: new Date(Date.now() - 300_000),
      lastFailureAt: new Date(),
      openedAt: new Date(Date.now() - 240_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const partial = await publicStatus().expect(200);
    expect(partial.body.status.overall).toBe("partial_outage");
    expect(partial.body.incidents.active).toHaveLength(1);
    expect(partial.body.incidents.active[0].title).toBe("Service disruption: Public API");

    await Incident.collection.updateOne(
      { _id: incident.insertedId },
      { $set: { status: "resolved", resolvedAt: new Date(), durationMs: 300_000 } },
    );
    const recovered = await publicStatus().expect(200);
    expect(recovered.body.status.overall).toBe("operational");
    const history = await request(app)
      .get("/api/public/status-pages/live-status/incidents?status=resolved")
      .expect(200);
    expect(history.body.total).toBe(1);
    expect(history.body.items[0].updates.at(-1).status).toBe("resolved");

    await MonitorCheck.collection.deleteMany({});
    await MonitorCheck.collection.insertMany([
      checkDoc(apiMonitor, 3_600_000),
      checkDoc(webMonitor, 3_600_000),
    ]);
    expect((await publicStatus().expect(200)).body.status.overall).toBe("unknown");
    await MonitorCheck.collection.deleteMany({});
    await MonitorCheck.collection.insertMany([checkDoc(apiMonitor), checkDoc(webMonitor)]);
  });

  it("computes public uptime history with the shared analytics aggregation", async () => {
    const response = await request(app)
      .get("/api/public/status-pages/live-status/history?range=24h")
      .expect(200);
    expect(response.body.services).toHaveLength(1);
    expect(["ok", "insufficient"]).toContain(response.body.overall.availability.state);
    expect(Array.isArray(response.body.overall.timeline)).toBe(true);
  });

  it("creates exactly one subscriber under concurrent requests and activates it once", async () => {
    sendMock.mockClear();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/public/status-pages/live-status/subscribe")
          .send({ email: "Reader@Example.com" }),
      ),
    );
    expect(await StatusPageSubscriber.countDocuments({ email: "reader@example.com" })).toBe(1);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalled());
    const token = /confirm\?token=([\w-]+)/.exec(
      sendMock.mock.calls[0]?.[0].text ?? "",
    )?.[1] as string;
    const [first, second] = await Promise.all([
      request(app).post("/api/public/status-pages/live-status/subscribe/verify").send({ token }),
      request(app).post("/api/public/status-pages/live-status/subscribe/verify").send({ token }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);
    const stored = await StatusPageSubscriber.findOne({ email: "reader@example.com" });
    expect(stored?.status).toBe("active");
  });

  it("delivers to verified subscribers once, then stops after unsubscribe", async () => {
    const outbox = {
      eventId: "incident.opened:integration",
      type: "incident.opened",
      userId: owner,
      incidentId: new Types.ObjectId(),
      snapshot: {
        incidentId: String(new Types.ObjectId()),
        monitorId: String(apiMonitor),
        monitorName: "Api",
        title: "Incident on Api: TIMEOUT",
        status: "open",
        openedAt: new Date().toISOString(),
        firstFailureAt: new Date(Date.now() - 60_000).toISOString(),
        acknowledgedAt: null,
        resolvedAt: null,
        durationMs: null,
      },
    } as unknown as INotificationOutbox;

    expect(await dispatchSubscriberNotifications(outbox)).toBe(1);
    expect(await dispatchSubscriberNotifications(outbox)).toBe(0);
    expect(await StatusPageDelivery.countDocuments({})).toBe(1);

    sendMock.mockClear();
    const delivery = await StatusPageDelivery.findOne({});
    expect(
      await processSubscriberDelivery({ deliveryId: String(delivery?._id), generation: 0 }),
    ).toEqual({
      outcome: "delivered",
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0].to).toBe("reader@example.com");

    const subscriber = await StatusPageSubscriber.findOne({ email: "reader@example.com" });
    const unsubscribeToken = createUnsubscribeToken(pageId, String(subscriber?._id));
    await request(app)
      .post("/api/public/status-pages/live-status/unsubscribe")
      .send({ token: unsubscribeToken })
      .expect(200);
    expect(
      await dispatchSubscriberNotifications({
        ...outbox,
        eventId: "incident.opened:after",
      } as INotificationOutbox),
    ).toBe(0);
  });

  it("makes unpublished and deleted pages inaccessible and removes their data", async () => {
    await publicStatus().expect(200);
    await request(app)
      .post(`/api/status-pages/${pageId}/unpublish`)
      .set(auth(ownerToken))
      .expect(200);
    await publicStatus().expect(404);
    await request(app).get("/api/public/status-pages/live-status/incidents").expect(404);

    await request(app)
      .post(`/api/status-pages/${pageId}/publish`)
      .set(auth(ownerToken))
      .expect(200);
    await publicStatus().expect(200);
    await request(app).delete(`/api/status-pages/${pageId}`).set(auth(ownerToken)).expect(200);
    await publicStatus().expect(404);
    expect(await StatusPageService.countDocuments({ pageId })).toBe(0);
    expect(await StatusPageSubscriber.countDocuments({ pageId })).toBe(0);
    expect(await StatusPageDelivery.countDocuments({ pageId })).toBe(0);
  });
});
