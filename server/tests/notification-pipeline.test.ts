import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "../src/modules/auth/user.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { IncidentTimeline } from "../src/modules/incidents/incident-timeline.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { NotificationDelivery } from "../src/modules/notifications/notification-delivery.model.js";
import { NotificationIntegration } from "../src/modules/notifications/notification-integration.model.js";
import { NotificationOutbox } from "../src/modules/notifications/notification-outbox.model.js";
import { NotificationPreferences } from "../src/modules/notifications/notification-preferences.model.js";
import {
  buildDeliveryKey,
  dispatchOutboxEvent,
  processOutboxBatch,
} from "../src/modules/notifications/notification-dispatcher.service.js";
import {
  DeliveryRetryError,
  computeBackoffMs,
  processDelivery,
  recoverStaleDeliveries,
  retryFailedDelivery,
} from "../src/modules/notifications/notification-delivery.service.js";
import {
  persistOutboxEvent,
  reconcileIncidentEvents,
  recordIncidentNotificationEvent,
} from "../src/modules/notifications/notification-outbox.service.js";
import { processNotificationJob } from "../src/workers/notification.worker.js";
import { sendDelivery } from "../src/modules/notifications/notification-sender.service.js";
import { bindMemoryModel } from "./helpers/memory-model.js";
import type { ChannelResult } from "../src/modules/notifications/notification.types.js";

const queueAdd = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(1),
  closeRedisConnections: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(),
  createRedisConnection: vi.fn(),
}));

vi.mock("../src/queues/notification.queue.js", () => ({
  getNotificationQueue: () => ({ add: queueAdd }),
  notificationJobId: (deliveryId: string, generation: number) => `${deliveryId}_${generation}`,
  closeNotificationQueue: vi.fn(),
}));

vi.mock("../src/modules/notifications/notification-sender.service.js", () => ({
  sendDelivery: vi.fn(),
}));

const stores = {
  users: bindMemoryModel(User),
  incidents: bindMemoryModel(Incident),
  timeline: bindMemoryModel(IncidentTimeline),
  monitors: bindMemoryModel(Monitor),
  prefs: bindMemoryModel(NotificationPreferences, { uniqueKeys: ["userId"] }),
  integrations: bindMemoryModel(NotificationIntegration),
  outbox: bindMemoryModel(NotificationOutbox, { uniqueKeys: ["eventId"] }),
  deliveries: bindMemoryModel(NotificationDelivery, { uniqueKeys: ["deliveryKey"] }),
};

const sendMock = vi.mocked(sendDelivery);
const ok: ChannelResult = { ok: true, responseCode: 200, durationMs: 12 };
const transient = (
  overrides: Partial<Extract<ChannelResult, { ok: false }>> = {},
): ChannelResult => ({
  ok: false,
  category: "PROVIDER_ERROR",
  transient: true,
  responseCode: 503,
  retryAfterMs: null,
  durationMs: 20,
  ...overrides,
});
const permanent: ChannelResult = {
  ok: false,
  category: "INVALID_CREDENTIALS",
  transient: false,
  responseCode: 403,
  retryAfterMs: null,
  durationMs: 9,
};

const userId = new Types.ObjectId();
const otherUserId = new Types.ObjectId();
const monitorId = new Types.ObjectId();
const incidentId = new Types.ObjectId();

const seedIncident = (overrides: Record<string, unknown> = {}) => {
  stores.incidents.docs.push({
    _id: incidentId,
    userId,
    monitorId,
    title: "Incident on Checkout API: UNEXPECTED_STATUS",
    status: "open",
    firstFailureAt: new Date("2026-11-06T09:58:00Z"),
    lastFailureAt: new Date("2026-11-06T10:00:00Z"),
    openedAt: new Date("2026-11-06T10:00:00Z"),
    failureCountAtCreation: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
};

const seedIntegration = (overrides: Record<string, unknown> = {}) => {
  const id = new Types.ObjectId();
  stores.integrations.docs.push({
    _id: id,
    userId,
    type: "slack",
    name: "Ops channel",
    enabled: true,
    events: ["incident.opened", "incident.resolved"],
    urlHint: "https://hooks.slack.com/services/••••abcd",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return id;
};

const deliveries = () => stores.deliveries.docs;
const outbox = () => stores.outbox.docs;

beforeEach(() => {
  Object.values(stores).forEach((store) => store.reset());
  queueAdd.mockReset();
  queueAdd.mockResolvedValue({ id: "job" });
  sendMock.mockReset();
  stores.users.docs.push({
    _id: userId,
    name: "Asha Rao",
    email: "owner@example.com",
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  stores.monitors.docs.push({
    _id: monitorId,
    userId,
    name: "Checkout API",
    failureThreshold: 3,
    recoveryThreshold: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  stores.timeline.docs.push({
    _id: new Types.ObjectId(),
    incidentId,
    type: "incident.created",
    metadata: { failureCategory: "UNEXPECTED_STATUS", statusCode: 503 },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("incident lifecycle events become durable notifications", () => {
  it("persists an opened event with a stable id and a snapshot of real incident values", async () => {
    seedIncident();
    const eventId = await persistOutboxEvent("incident.opened", String(incidentId));
    expect(eventId).toBe(`incident.opened:${String(incidentId)}`);
    expect(outbox()).toHaveLength(1);
    const entry = outbox()[0] as unknown as {
      status: string;
      snapshot: Record<string, unknown>;
      userId: Types.ObjectId;
    };
    expect(entry.status).toBe("pending");
    expect(String(entry.userId)).toBe(String(userId));
    expect(entry.snapshot).toMatchObject({
      monitorName: "Checkout API",
      failureCategory: "UNEXPECTED_STATUS",
      statusCode: 503,
      failureThreshold: 3,
      status: "open",
      incidentUrl: `https://app.faultline.test/incidents/${String(incidentId)}`,
    });
  });

  it("creates verified-email deliveries and enqueues them for an opened incident", async () => {
    seedIncident();
    await recordIncidentNotificationEvent("incident.opened", String(incidentId));
    await vi.waitFor(() => expect(outbox()[0]?.status).toBe("processed"));

    expect(deliveries()).toHaveLength(1);
    const delivery = deliveries()[0] as unknown as Record<string, unknown>;
    expect(delivery).toMatchObject({
      channel: "email",
      eventType: "incident.opened",
      kind: "incident",
      status: "queued",
      deliveryKey: buildDeliveryKey(`incident.opened:${String(incidentId)}`, "email"),
    });
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      "deliver",
      { deliveryId: String(delivery._id), generation: 0 },
      { jobId: `${String(delivery._id)}_0` },
    );
  });

  it("does not notify for an acknowledgement or resolution that has not happened", async () => {
    seedIncident();
    expect(await persistOutboxEvent("incident.acknowledged", String(incidentId))).toBeNull();
    expect(await persistOutboxEvent("incident.resolved", String(incidentId))).toBeNull();
    expect(outbox()).toHaveLength(0);
  });

  it("does not notify for unknown incidents", async () => {
    expect(await persistOutboxEvent("incident.opened", String(new Types.ObjectId()))).toBeNull();
    expect(outbox()).toHaveLength(0);
  });

  it("creates a resolved event only after the incident is actually resolved", async () => {
    seedIncident({
      status: "resolved",
      resolvedAt: new Date("2026-11-06T10:09:00Z"),
      resolutionType: "automatic",
      durationMs: 660_000,
      recoveryCheckCount: 2,
    });
    await persistOutboxEvent("incident.resolved", String(incidentId));
    const snapshot = (outbox()[0] as unknown as { snapshot: Record<string, unknown> }).snapshot;
    expect(snapshot).toMatchObject({
      status: "resolved",
      durationMs: 660_000,
      recoveryCheckCount: 2,
    });
  });

  it("includes the acknowledging user's name", async () => {
    seedIncident({
      status: "acknowledged",
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
    });
    await persistOutboxEvent("incident.acknowledged", String(incidentId));
    const snapshot = (outbox()[0] as unknown as { snapshot: Record<string, unknown> }).snapshot;
    expect(snapshot.acknowledgedByName).toBe("Asha Rao");
  });
});

describe("notification preferences gate delivery", () => {
  const dispatchOpened = async () => {
    seedIncident();
    await persistOutboxEvent("incident.opened", String(incidentId));
    await dispatchOutboxEvent(`incident.opened:${String(incidentId)}`);
  };

  it("sends opened and resolved by default and skips acknowledgement", async () => {
    seedIncident({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: userId });
    await persistOutboxEvent("incident.acknowledged", String(incidentId));
    await dispatchOutboxEvent(`incident.acknowledged:${String(incidentId)}`);
    expect(deliveries()).toHaveLength(0);
    expect(outbox()[0]?.status).toBe("processed");
  });

  it("sends acknowledgement when the user opts in", async () => {
    stores.prefs.docs.push({
      _id: new Types.ObjectId(),
      userId,
      events: { acknowledged: true },
    });
    seedIncident({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: userId });
    await persistOutboxEvent("incident.acknowledged", String(incidentId));
    await dispatchOutboxEvent(`incident.acknowledged:${String(incidentId)}`);
    expect(deliveries()).toHaveLength(1);
    expect(deliveries()[0]).toMatchObject({ eventType: "incident.acknowledged" });
  });

  it("sends nothing when notifications are globally disabled", async () => {
    stores.prefs.docs.push({ _id: new Types.ObjectId(), userId, enabled: false });
    seedIntegration();
    await dispatchOpened();
    expect(deliveries()).toHaveLength(0);
    expect(queueAdd).not.toHaveBeenCalled();
    expect(outbox()[0]?.status).toBe("processed");
  });

  it("sends nothing when the event type is disabled", async () => {
    stores.prefs.docs.push({ _id: new Types.ObjectId(), userId, events: { opened: false } });
    await dispatchOpened();
    expect(deliveries()).toHaveLength(0);
  });

  it("skips email when the channel is off or the address is unverified", async () => {
    stores.prefs.docs.push({ _id: new Types.ObjectId(), userId, channels: { email: false } });
    await dispatchOpened();
    expect(deliveries()).toHaveLength(0);

    stores.prefs.reset();
    stores.outbox.reset();
    (stores.users.docs[0] as Record<string, unknown>).emailVerifiedAt = null;
    await dispatchOpened();
    expect(deliveries()).toHaveLength(0);
  });

  it("only uses enabled integrations that subscribe to the event", async () => {
    const subscribed = seedIntegration({ name: "Subscribed" });
    seedIntegration({ name: "Paused", enabled: false });
    seedIntegration({ name: "Resolved only", events: ["incident.resolved"] });
    seedIntegration({ name: "Someone else", userId: otherUserId });
    await dispatchOpened();
    const slack = deliveries().filter((d) => d.channel === "slack");
    expect(slack).toHaveLength(1);
    expect(String(slack[0]?.integrationId)).toBe(String(subscribed));
    expect(slack[0]?.integrationName).toBe("Subscribed");
    expect(deliveries()).toHaveLength(2);
  });

  it("respects per-channel switches for integrations", async () => {
    seedIntegration();
    seedIntegration({ type: "webhook", name: "Hook" });
    stores.prefs.docs.push({
      _id: new Types.ObjectId(),
      userId,
      channels: { slack: false },
    });
    await dispatchOpened();
    expect(
      deliveries()
        .map((d) => d.channel)
        .sort(),
    ).toEqual(["email", "webhook"]);
  });

  it("isolates one user's events from another user's integrations", async () => {
    seedIntegration({ userId: otherUserId });
    await dispatchOpened();
    expect(deliveries().every((d) => String(d.userId) === String(userId))).toBe(true);
  });
});

describe("deduplication and idempotency", () => {
  it("records a lifecycle event once even when recorded repeatedly", async () => {
    seedIncident();
    await persistOutboxEvent("incident.opened", String(incidentId));
    await persistOutboxEvent("incident.opened", String(incidentId));
    await persistOutboxEvent("incident.opened", String(incidentId));
    expect(outbox()).toHaveLength(1);
  });

  it("claims an outbox event exactly once across concurrent dispatchers", async () => {
    seedIncident();
    await persistOutboxEvent("incident.opened", String(incidentId));
    const eventId = `incident.opened:${String(incidentId)}`;
    const results = await Promise.all([dispatchOutboxEvent(eventId), dispatchOutboxEvent(eventId)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(deliveries()).toHaveLength(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate deliveries when an event is dispatched again after its lock expires", async () => {
    seedIncident();
    seedIntegration();
    await persistOutboxEvent("incident.opened", String(incidentId));
    const eventId = `incident.opened:${String(incidentId)}`;
    await dispatchOutboxEvent(eventId);
    expect(deliveries()).toHaveLength(2);

    const entry = outbox()[0] as Record<string, unknown>;
    entry.status = "processing";
    entry.lockedUntil = new Date(Date.now() - 1000);
    await dispatchOutboxEvent(eventId);

    expect(deliveries()).toHaveLength(2);
    expect(queueAdd).toHaveBeenCalledTimes(2);
    expect(new Set(deliveries().map((d) => d.deliveryKey)).size).toBe(2);
  });

  it("recovers from a unique-key race by reusing the existing delivery", async () => {
    seedIncident();
    await persistOutboxEvent("incident.opened", String(incidentId));
    const eventId = `incident.opened:${String(incidentId)}`;
    const key = buildDeliveryKey(eventId, "email");
    stores.deliveries.docs.push({
      _id: new Types.ObjectId(),
      deliveryKey: key,
      userId,
      channel: "email",
      eventId,
      eventType: "incident.opened",
      kind: "incident",
      status: "delivered",
      attempts: 1,
      generation: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await dispatchOutboxEvent(eventId);
    expect(deliveries()).toHaveLength(1);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("builds distinct stable keys per event, channel and integration", () => {
    expect(buildDeliveryKey("e1", "email")).toBe("e1|email|account");
    expect(buildDeliveryKey("e1", "slack", "abc")).toBe("e1|slack|abc");
    expect(buildDeliveryKey("e1", "slack", "abc")).not.toBe(buildDeliveryKey("e1", "slack", "def"));
  });
});

describe("outbox recovery", () => {
  it("keeps the event and its delivery when Redis is unavailable, then recovers", async () => {
    seedIncident();
    queueAdd.mockRejectedValue(new Error("Redis connection is closed"));
    await persistOutboxEvent("incident.opened", String(incidentId));
    const eventId = `incident.opened:${String(incidentId)}`;
    await dispatchOutboxEvent(eventId);

    expect(outbox()[0]).toMatchObject({ status: "pending" });
    expect(new Date(outbox()[0]?.nextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(deliveries()).toHaveLength(1);
    expect(deliveries()[0]?.status).toBe("pending");

    queueAdd.mockResolvedValue({ id: "job" });
    (outbox()[0] as Record<string, unknown>).nextAttemptAt = new Date(Date.now() - 1000);
    const handled = await processOutboxBatch();

    expect(handled).toBe(1);
    expect(outbox()[0]?.status).toBe("processed");
    expect(deliveries()).toHaveLength(1);
    expect(deliveries()[0]?.status).toBe("queued");
  });

  it("recovers events that were never written to the outbox by reconciling incidents", async () => {
    seedIncident({
      status: "resolved",
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
      resolvedAt: new Date(),
      resolutionType: "manual",
      durationMs: 1000,
    });
    expect(outbox()).toHaveLength(0);
    const created = await reconcileIncidentEvents();
    expect(created).toBe(3);
    expect(
      outbox()
        .map((o) => o.type)
        .sort(),
    ).toEqual(["incident.acknowledged", "incident.opened", "incident.resolved"]);
    expect(await reconcileIncidentEvents()).toBe(0);
    expect(outbox()).toHaveLength(3);
  });

  it("ignores incidents outside the reconciliation window", async () => {
    seedIncident({ updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    expect(await reconcileIncidentEvents(60)).toBe(0);
  });

  it("picks up events stuck in processing after a crash", async () => {
    seedIncident();
    await persistOutboxEvent("incident.opened", String(incidentId));
    const entry = outbox()[0] as Record<string, unknown>;
    entry.status = "processing";
    entry.lockedUntil = new Date(Date.now() - 5000);
    expect(await processOutboxBatch()).toBe(1);
    expect(outbox()[0]?.status).toBe("processed");
    expect(deliveries()).toHaveLength(1);
  });

  it("leaves live locks alone", async () => {
    seedIncident();
    await persistOutboxEvent("incident.opened", String(incidentId));
    const entry = outbox()[0] as Record<string, unknown>;
    entry.status = "processing";
    entry.lockedUntil = new Date(Date.now() + 30_000);
    expect(await processOutboxBatch()).toBe(0);
  });

  it("re-queues deliveries whose job was lost", async () => {
    const id = new Types.ObjectId();
    stores.deliveries.docs.push({
      _id: id,
      deliveryKey: "k1",
      userId,
      channel: "email",
      eventId: "e",
      eventType: "incident.opened",
      kind: "incident",
      status: "pending",
      attempts: 0,
      generation: 0,
      createdAt: new Date(),
      updatedAt: new Date(Date.now() - 10 * 60_000),
    });
    expect(await recoverStaleDeliveries()).toBe(1);
    expect(queueAdd).toHaveBeenCalledWith(
      "deliver",
      { deliveryId: String(id), generation: 1 },
      { jobId: `${String(id)}_1` },
    );
    expect(deliveries()[0]?.status).toBe("queued");
  });
});

describe("delivery processing, retry and backoff", () => {
  const seedDelivery = (overrides: Record<string, unknown> = {}) => {
    const id = new Types.ObjectId();
    stores.deliveries.docs.push({
      _id: id,
      deliveryKey: `key-${String(id)}`,
      userId,
      channel: "slack",
      integrationId: new Types.ObjectId(),
      eventId: "incident.opened:abc",
      eventType: "incident.opened",
      kind: "incident",
      status: "queued",
      attempts: 0,
      generation: 0,
      attemptHistory: [],
      eventCreatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return id;
  };
  const find = (id: Types.ObjectId) =>
    deliveries().find((d) => String(d._id) === String(id)) as unknown as Record<string, unknown>;

  it("marks a delivery delivered only after the channel confirms", async () => {
    const id = seedDelivery();
    sendMock.mockResolvedValue(ok);
    const result = await processDelivery({ deliveryId: String(id), generation: 0 });
    expect(result.outcome).toBe("delivered");
    const stored = find(id);
    expect(stored.status).toBe("delivered");
    expect(stored.attempts).toBe(1);
    expect(stored.deliveredAt).toBeInstanceOf(Date);
    expect(stored.attemptHistory).toHaveLength(1);
  });

  it("does not show delivered while the request is still in flight", async () => {
    const id = seedDelivery();
    let observed = "";
    sendMock.mockImplementation(async () => {
      observed = String(find(id).status);
      return ok;
    });
    await processDelivery({ deliveryId: String(id), generation: 0 });
    expect(observed).toBe("sending");
  });

  it("schedules a bounded exponential retry for transient failures", async () => {
    const id = seedDelivery();
    sendMock.mockResolvedValue(transient());
    const result = await processDelivery({ deliveryId: String(id), generation: 0 });
    expect(result.outcome).toBe("retrying");
    expect(result.retryDelayMs).toBeGreaterThanOrEqual(4500);
    expect(result.retryDelayMs).toBeLessThanOrEqual(5500);
    const stored = find(id);
    expect(stored).toMatchObject({
      status: "retrying",
      failureCategory: "PROVIDER_ERROR",
      responseCode: 503,
    });
    expect(stored.nextRetryAt).toBeInstanceOf(Date);
  });

  it("fails permanently without retrying for credential errors", async () => {
    const id = seedDelivery();
    sendMock.mockResolvedValue(permanent);
    const result = await processDelivery({ deliveryId: String(id), generation: 0 });
    expect(result.outcome).toBe("failed");
    expect(find(id)).toMatchObject({
      status: "failed",
      attempts: 1,
      failureCategory: "INVALID_CREDENTIALS",
    });
    expect(find(id).nextRetryAt).toBeUndefined();
  });

  it("stops after the maximum number of attempts and records a terminal failure", async () => {
    const id = seedDelivery();
    sendMock.mockResolvedValue(transient());
    const outcomes: string[] = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      outcomes.push((await processDelivery({ deliveryId: String(id), generation: 0 })).outcome);
    }
    expect(outcomes).toEqual(["retrying", "retrying", "retrying", "retrying", "failed"]);
    const stored = find(id);
    expect(stored).toMatchObject({ status: "failed", attempts: 5 });
    expect(stored.attemptHistory).toHaveLength(5);
    expect((stored.attemptHistory as Array<{ willRetry: boolean }>).at(-1)?.willRetry).toBe(false);
    expect(await processDelivery({ deliveryId: String(id), generation: 0 })).toEqual({
      outcome: "skipped",
    });
    expect(sendMock).toHaveBeenCalledTimes(5);
  });

  it("recovers after a transient failure and delivers on a later attempt", async () => {
    const id = seedDelivery();
    sendMock.mockResolvedValueOnce(transient()).mockResolvedValueOnce(ok);
    await processDelivery({ deliveryId: String(id), generation: 0 });
    await processDelivery({ deliveryId: String(id), generation: 0 });
    expect(find(id)).toMatchObject({ status: "delivered", attempts: 2 });
    expect(find(id).failureCategory).toBeUndefined();
    expect(find(id).nextRetryAt).toBeUndefined();
  });

  it("honours Retry-After but caps it at the configured maximum", async () => {
    const id = seedDelivery();
    sendMock.mockResolvedValue(
      transient({ category: "RATE_LIMITED", responseCode: 429, retryAfterMs: 60_000 }),
    );
    const first = await processDelivery({ deliveryId: String(id), generation: 0 });
    expect(first.retryDelayMs).toBe(60_000);

    const other = seedDelivery();
    sendMock.mockResolvedValue(transient({ retryAfterMs: 3_600_000 }));
    const capped = await processDelivery({ deliveryId: String(other), generation: 0 });
    expect(capped.retryDelayMs).toBe(300_000);
  });

  it("respects a lower attempt cap for single-attempt test deliveries", async () => {
    const id = seedDelivery({ kind: "test", eventType: "notification.test" });
    sendMock.mockResolvedValue(transient());
    const result = await processDelivery(
      { deliveryId: String(id), generation: 0 },
      { maxAttempts: 1 },
    );
    expect(result.outcome).toBe("failed");
    expect(find(id).status).toBe("failed");
  });

  it("ignores stale jobs from an earlier generation", async () => {
    const id = seedDelivery({ generation: 2 });
    const result = await processDelivery({ deliveryId: String(id), generation: 1 });
    expect(result.outcome).toBe("skipped");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("never lets a crashing sender take down the worker or lose the delivery", async () => {
    const id = seedDelivery();
    sendMock.mockRejectedValue(new Error("boom: https://hooks.slack.com/services/T/B/secret"));
    const result = await processDelivery({ deliveryId: String(id), generation: 0 });
    expect(result.outcome).toBe("retrying");
    expect(JSON.stringify(find(id))).not.toContain("secret");
  });

  it("isolates channel failures so other deliveries still succeed", async () => {
    const failing = seedDelivery({ channel: "slack" });
    const healthy = seedDelivery({ channel: "email" });
    sendMock.mockImplementation(async (delivery) =>
      delivery.channel === "slack" ? permanent : ok,
    );
    await processDelivery({ deliveryId: String(failing), generation: 0 });
    await processDelivery({ deliveryId: String(healthy), generation: 0 });
    expect(find(failing).status).toBe("failed");
    expect(find(healthy).status).toBe("delivered");
  });

  it("signals BullMQ to retry with the computed delay", async () => {
    const id = seedDelivery();
    sendMock.mockResolvedValue(transient());
    const job = { data: { deliveryId: String(id), generation: 0 } } as never;
    const error = await processNotificationJob(job).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeliveryRetryError);
    expect((error as DeliveryRetryError).retryDelayMs).toBeGreaterThanOrEqual(4500);
    sendMock.mockResolvedValue(permanent);
    const other = seedDelivery();
    await expect(
      processNotificationJob({ data: { deliveryId: String(other), generation: 0 } } as never),
    ).resolves.toBeUndefined();
  });

  it("computes exponential backoff with a ceiling", () => {
    const fixed = () => 0.5;
    expect(computeBackoffMs(1, null, fixed)).toBe(5000);
    expect(computeBackoffMs(2, null, fixed)).toBe(10_000);
    expect(computeBackoffMs(3, null, fixed)).toBe(20_000);
    expect(computeBackoffMs(4, null, fixed)).toBe(40_000);
    expect(computeBackoffMs(20, null, fixed)).toBe(300_000);
    expect(computeBackoffMs(1, 30_000, fixed)).toBe(30_000);
  });

  describe("manual retry", () => {
    it("re-queues a failed incident delivery under a new generation", async () => {
      const id = seedDelivery({
        status: "failed",
        attempts: 5,
        failureCategory: "INVALID_CREDENTIALS",
      });
      const updated = await retryFailedDelivery(String(userId), String(id));
      expect(updated).toMatchObject({ generation: 1, attempts: 0 });
      expect(queueAdd).toHaveBeenCalledWith(
        "deliver",
        { deliveryId: String(id), generation: 1 },
        { jobId: `${String(id)}_1` },
      );
      expect(find(id).status).toBe("queued");
      expect(find(id).failureCategory).toBeUndefined();
    });

    it("refuses to retry another user's delivery", async () => {
      const id = seedDelivery({ status: "failed", userId: otherUserId });
      await expect(retryFailedDelivery(String(userId), String(id))).rejects.toMatchObject({
        statusCode: 404,
        code: "DELIVERY_NOT_FOUND",
      });
      expect(queueAdd).not.toHaveBeenCalled();
    });

    it("only retries failed incident deliveries", async () => {
      for (const overrides of [
        { status: "delivered" },
        { status: "retrying" },
        { status: "failed", kind: "test" },
      ]) {
        const id = seedDelivery(overrides);
        await expect(retryFailedDelivery(String(userId), String(id))).rejects.toMatchObject({
          statusCode: 409,
          code: "DELIVERY_NOT_RETRYABLE",
        });
      }
      expect(queueAdd).not.toHaveBeenCalled();
    });

    it("keeps the delivery pending for recovery if Redis is down during retry", async () => {
      const id = seedDelivery({ status: "failed" });
      queueAdd.mockRejectedValue(new Error("Redis down"));
      await retryFailedDelivery(String(userId), String(id));
      expect(find(id).status).toBe("pending");
    });
  });
});
