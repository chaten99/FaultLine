import crypto from "node:crypto";
import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { sendNotificationEmail } from "../src/lib/email/email.service.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import type { INotificationOutbox } from "../src/modules/notifications/notification-outbox.model.js";
import { StatusPageDelivery } from "../src/modules/status-pages/status-page-delivery.model.js";
import {
  dispatchSubscriberNotifications,
  processSubscriberDelivery,
  recoverStaleSubscriberDeliveries,
} from "../src/modules/status-pages/status-page-delivery.service.js";
import { StatusPageService } from "../src/modules/status-pages/status-page-service.model.js";
import { StatusPageSubscriber } from "../src/modules/status-pages/status-page-subscriber.model.js";
import { createUnsubscribeToken } from "../src/modules/status-pages/status-page-subscriber.service.js";
import { PublicStatusPage } from "../src/modules/status-pages/status-page.model.js";
import { DeliveryRetryError } from "../src/modules/notifications/notification-delivery.service.js";
import { processNotificationJob } from "../src/workers/notification.worker.js";
import { bindMemoryModel } from "./helpers/memory-model.js";

const state = vi.hoisted(() => {
  const counts = new Map<string, number>();
  return {
    counts,
    queueAdd: vi.fn(),
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
  getRedisClient: () => state.client,
  createRedisConnection: vi.fn(),
}));

vi.mock("../src/queues/notification.queue.js", () => ({
  getNotificationQueue: () => ({ add: state.queueAdd }),
  notificationJobId: (deliveryId: string, generation: number) => `${deliveryId}_${generation}`,
  closeNotificationQueue: vi.fn(),
}));

vi.mock("../src/lib/email/email.service.js", () => ({
  sendNotificationEmail: vi.fn(),
}));

const sendMock = vi.mocked(sendNotificationEmail);
const monitors = bindMemoryModel(Monitor);
const incidents = bindMemoryModel(Incident);
const pages = bindMemoryModel(PublicStatusPage, { uniqueKeys: ["slug"] });
const services = bindMemoryModel(StatusPageService);
const subscribers = bindMemoryModel(StatusPageSubscriber);
const deliveries = bindMemoryModel(StatusPageDelivery, { uniqueKeys: ["deliveryKey"] });

const owner = new Types.ObjectId();
const otherOwner = new Types.ObjectId();
const monitorId = new Types.ObjectId();
const pageId = new Types.ObjectId();

const okResult = { ok: true as const, responseCode: 200, durationMs: 4 };

const addPage = (overrides: Record<string, unknown> = {}) => {
  const _id = (overrides._id as Types.ObjectId | undefined) ?? new Types.ObjectId();
  pages.docs.push({
    _id,
    ownerId: owner,
    name: "Acme Status",
    slug: "acme-status",
    description: "",
    branding: { companyName: "Acme", logoUrl: null },
    status: "published",
    subscribersEnabled: true,
    subscriberEvents: { opened: true, acknowledged: false, resolved: true },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return _id;
};

const addService = (page: Types.ObjectId, overrides: Record<string, unknown> = {}) =>
  services.docs.push({
    _id: new Types.ObjectId(),
    pageId: page,
    ownerId: owner,
    name: "Public API",
    description: "",
    monitorIds: [monitorId],
    order: 0,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const addSubscriber = (overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  subscribers.docs.push({
    _id,
    pageId,
    email: `person-${String(_id).slice(-6)}@example.com`,
    status: "active",
    events: { opened: true, acknowledged: false, resolved: true },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return _id;
};

const confirmationToken = (call = -1): string => {
  const message = sendMock.mock.calls.at(call)?.[0];
  const match = /confirm\?token=([\w-]+)/.exec(message?.text ?? "");
  if (!match?.[1]) throw new Error("No confirmation token in email");
  return match[1];
};

const subscribe = (email: string, body: Record<string, unknown> = {}, slug = "acme-status") =>
  request(app)
    .post(`/api/public/status-pages/${slug}/subscribe`)
    .send({ email, ...body });

const flush = () => vi.waitFor(() => expect(sendMock).toHaveBeenCalled());

beforeEach(() => {
  [monitors, incidents, pages, services, subscribers, deliveries].forEach((store) => store.reset());
  state.counts.clear();
  state.queueAdd.mockReset();
  state.queueAdd.mockResolvedValue({ id: "job" });
  sendMock.mockReset();
  sendMock.mockResolvedValue(okResult);
  addPage({ _id: pageId });
  addService(pageId);
});

describe("subscription requests", () => {
  it("creates a pending subscription and emails a confirmation without subscribing anyone yet", async () => {
    const response = await subscribe("visitor@example.com").expect(202);
    expect(response.body.status).toBe("ok");
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0].to).toBe("visitor@example.com");
    expect(sendMock.mock.calls[0]?.[0].subject).toContain("Confirm your subscription");

    expect(subscribers.docs).toHaveLength(1);
    const record = subscribers.docs[0] as Record<string, unknown>;
    expect(record).toMatchObject({
      email: "visitor@example.com",
      status: "pending",
      events: { opened: true, acknowledged: false, resolved: true },
    });
    const token = confirmationToken();
    expect(record.confirmationTokenHash).toBe(
      crypto.createHash("sha256").update(token).digest("hex"),
    );
    expect(JSON.stringify(record)).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("normalizes email addresses so duplicates collapse", async () => {
    await subscribe("Visitor@Example.com ").expect(202);
    await flush();
    await subscribe("visitor@example.com").expect(202);
    expect(subscribers.docs).toHaveLength(1);
    expect(subscribers.docs[0]?.email).toBe("visitor@example.com");
  });

  it("answers identically for new, pending, active and unsubscribed addresses", async () => {
    addSubscriber({ email: "active@example.com", status: "active" });
    addSubscriber({ email: "gone@example.com", status: "unsubscribed" });
    const bodies = [];
    for (const email of ["new@example.com", "active@example.com", "gone@example.com"]) {
      const response = await subscribe(email);
      expect(response.status).toBe(202);
      bodies.push(JSON.stringify(response.body));
    }
    expect(new Set(bodies).size).toBe(1);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
    expect(sendMock.mock.calls.map((call) => call[0].to).sort()).toEqual([
      "gone@example.com",
      "new@example.com",
    ]);
    expect(subscribers.docs.find((doc) => doc.email === "active@example.com")?.status).toBe(
      "active",
    );
    expect(subscribers.docs.find((doc) => doc.email === "gone@example.com")?.status).toBe(
      "pending",
    );
  });

  it("validates the request body", async () => {
    await subscribe("not-an-email").expect(400);
    await subscribe("").expect(400);
    await subscribe("a@example.com", { extra: true }).expect(400);
    await subscribe("a@example.com", { events: { opened: false, resolved: false } }).expect(400);
    await request(app).post("/api/public/status-pages/acme-status/subscribe").send({}).expect(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("only offers event types the page supports and respects visitor choices", async () => {
    await subscribe("a@example.com", { events: { acknowledged: true, resolved: false } }).expect(
      202,
    );
    expect(subscribers.docs[0]?.events).toEqual({
      opened: true,
      acknowledged: false,
      resolved: false,
    });

    pages.docs[0]!.subscriberEvents = { opened: true, acknowledged: true, resolved: true };
    await subscribe("b@example.com", { events: { acknowledged: true } }).expect(202);
    expect(subscribers.docs.find((doc) => doc.email === "b@example.com")?.events).toEqual({
      opened: true,
      acknowledged: true,
      resolved: true,
    });
  });

  it("hides subscription for draft, unpublished and subscriber-disabled pages", async () => {
    pages.docs[0]!.subscribersEnabled = false;
    await subscribe("a@example.com").expect(404);
    pages.docs[0]!.subscribersEnabled = true;
    pages.docs[0]!.status = "unpublished";
    await subscribe("a@example.com").expect(404);
    pages.docs[0]!.status = "draft";
    await subscribe("a@example.com").expect(404);
    expect(subscribers.docs).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("enforces a resend cooldown and invalidates the previous token on a new request", async () => {
    await subscribe("visitor@example.com").expect(202);
    await flush();
    const first = confirmationToken();
    await subscribe("visitor@example.com").expect(202);
    expect(sendMock).toHaveBeenCalledTimes(1);

    subscribers.docs[0]!.lastConfirmationSentAt = new Date(Date.now() - 120_000);
    await subscribe("visitor@example.com").expect(202);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
    const second = confirmationToken();
    expect(second).not.toBe(first);

    await request(app)
      .post("/api/public/status-pages/acme-status/subscribe/verify")
      .send({ token: first })
      .expect(400);
    await request(app)
      .post("/api/public/status-pages/acme-status/subscribe/verify")
      .send({ token: second })
      .expect(200);
  });

  it("limits requests per email without revealing it", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await subscribe("busy@example.com").expect(202);
      if (subscribers.docs[0])
        subscribers.docs[0].lastConfirmationSentAt = new Date(Date.now() - 120_000);
    }
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(3));
    const fourth = await subscribe("busy@example.com");
    expect(fourth.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it("rate limits requests per client address", async () => {
    for (let index = 0; index < 10; index += 1) {
      await subscribe(`user${index}@example.com`).expect(202);
    }
    const blocked = await subscribe("user11@example.com");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
  });
});

describe("confirmation", () => {
  const verify = (token: string, slug = "acme-status") =>
    request(app).post(`/api/public/status-pages/${slug}/subscribe/verify`).send({ token });

  it("activates the subscription once and consumes the token", async () => {
    await subscribe("visitor@example.com").expect(202);
    await flush();
    const token = confirmationToken();
    const response = await verify(token).expect(200);
    expect(response.body).toEqual({ status: "confirmed", pageName: "Acme Status" });
    const record = subscribers.docs[0] as Record<string, unknown>;
    expect(record.status).toBe("active");
    expect(record.verifiedAt).toBeInstanceOf(Date);
    expect(record.confirmationTokenHash).toBeUndefined();

    const reuse = await verify(token);
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe("INVALID_TOKEN");
  });

  it("rejects unknown, malformed, expired and cross-page tokens with the same error", async () => {
    await subscribe("visitor@example.com").expect(202);
    await flush();
    const token = confirmationToken();
    subscribers.docs[0]!.confirmationExpiresAt = new Date(Date.now() - 1000);
    const otherPage = addPage({ slug: "other-page", name: "Other" });
    subscribers.docs.push({
      _id: new Types.ObjectId(),
      pageId: otherPage,
      email: "x@example.com",
      status: "pending",
    });
    const results = await Promise.all([
      verify(token),
      verify("A".repeat(43)),
      verify("short"),
      verify(token, "other-page"),
    ]);
    expect(results.map((result) => result.status)).toEqual([400, 400, 400, 400]);
    expect(new Set(results.slice(0, 2).map((result) => JSON.stringify(result.body))).size).toBe(1);
    expect(subscribers.docs[0]?.status).toBe("pending");
  });

  it("sends no notifications to subscribers who never confirmed", async () => {
    await subscribe("visitor@example.com").expect(202);
    await dispatchSubscriberNotifications(outbox("incident.opened"));
    expect(deliveries.docs).toHaveLength(0);
  });
});

describe("resend", () => {
  const resend = (email: string) =>
    request(app).post("/api/public/status-pages/acme-status/subscribe/resend").send({ email });

  it("re-sends only to pending subscribers and honours the cooldown", async () => {
    await subscribe("visitor@example.com").expect(202);
    await flush();
    await resend("visitor@example.com").expect(202);
    expect(sendMock).toHaveBeenCalledTimes(1);
    subscribers.docs[0]!.lastConfirmationSentAt = new Date(Date.now() - 120_000);
    await resend("visitor@example.com").expect(202);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));

    addSubscriber({ email: "active@example.com" });
    const unknown = await resend("nobody@example.com");
    const active = await resend("active@example.com");
    expect(unknown.body).toEqual(active.body);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe("unsubscribe", () => {
  const info = (token: string, slug = "acme-status") =>
    request(app).get(`/api/public/status-pages/${slug}/unsubscribe`).query({ token });
  const confirmUnsubscribe = (token: string, slug = "acme-status") =>
    request(app).post(`/api/public/status-pages/${slug}/unsubscribe`).send({ token });

  it("validates the link without changing anything, then unsubscribes on explicit action", async () => {
    const id = addSubscriber({ email: "jane.doe@example.com" });
    const token = createUnsubscribeToken(String(pageId), String(id));
    const preview = await info(token).expect(200);
    expect(preview.body).toEqual({
      pageName: "Acme Status",
      emailMasked: "j******@example.com",
      alreadyUnsubscribed: false,
    });
    expect(subscribers.docs[0]?.status).toBe("active");

    const done = await confirmUnsubscribe(token).expect(200);
    expect(done.body).toEqual({ status: "unsubscribed", pageName: "Acme Status" });
    expect(subscribers.docs[0]?.status).toBe("unsubscribed");
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));
    expect(sendMock.mock.calls[0]?.[0].subject).toContain("unsubscribed");

    await confirmUnsubscribe(token).expect(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect((await info(token).expect(200)).body.alreadyUnsubscribed).toBe(true);
  });

  it("rejects tampered, foreign and malformed tokens", async () => {
    const first = addSubscriber();
    const second = addSubscriber();
    const good = createUnsubscribeToken(String(pageId), String(first));
    const otherPage = addPage({ slug: "other-page" });
    const foreign = createUnsubscribeToken(String(otherPage), String(first));
    const swapped = `${String(second)}.${good.split(".")[1]}`;
    for (const token of [
      `${good}x`,
      foreign,
      swapped,
      "garbage",
      `${String(first)}.`,
      `${good}.extra`,
    ]) {
      const response = await confirmUnsubscribe(token.padEnd(24, "x"));
      expect(response.status, token).toBe(400);
      expect(response.body.code).toBe("INVALID_TOKEN");
    }
    expect(subscribers.docs.every((doc) => doc.status === "active")).toBe(true);
    await info(foreign).expect(400);
    await confirmUnsubscribe(good, "unknown-page").expect(400);
  });

  it("keeps working after a page is unpublished", async () => {
    const id = addSubscriber();
    pages.docs[0]!.status = "unpublished";
    const token = createUnsubscribeToken(String(pageId), String(id));
    await confirmUnsubscribe(token).expect(200);
    expect(subscribers.docs[0]?.status).toBe("unsubscribed");
  });

  it("requires explicit confirmation to resubscribe afterwards", async () => {
    const id = addSubscriber({ email: "back@example.com" });
    await confirmUnsubscribe(createUnsubscribeToken(String(pageId), String(id))).expect(200);
    sendMock.mockClear();
    await subscribe("back@example.com").expect(202);
    await flush();
    expect(subscribers.docs[0]?.status).toBe("pending");
    await dispatchSubscriberNotifications(outbox("incident.opened"));
    expect(deliveries.docs).toHaveLength(0);
  });
});

const outbox = (type: INotificationOutbox["type"], overrides: Record<string, unknown> = {}) =>
  ({
    _id: new Types.ObjectId(),
    eventId: `${type}:inc1`,
    type,
    userId: owner,
    incidentId: new Types.ObjectId(),
    snapshot: {
      incidentId: "inc1",
      monitorId: String(monitorId),
      monitorName: "Internal Checkout Monitor",
      title: "Incident on Internal Checkout Monitor: UNEXPECTED_STATUS",
      status: type === "incident.resolved" ? "resolved" : "open",
      openedAt: new Date(Date.now() - 600_000).toISOString(),
      firstFailureAt: new Date(Date.now() - 700_000).toISOString(),
      acknowledgedAt: type === "incident.acknowledged" ? new Date().toISOString() : null,
      resolvedAt: type === "incident.resolved" ? new Date().toISOString() : null,
      durationMs: type === "incident.resolved" ? 600_000 : null,
      failureCategory: "UNEXPECTED_STATUS",
      statusCode: 503,
      incidentUrl: "https://app.faultline.test/incidents/inc1",
    },
    eventAt: new Date(),
    ...overrides,
  }) as unknown as INotificationOutbox;

describe("subscriber notification dispatch", () => {
  it("creates deliveries only for verified, matching, active subscribers", async () => {
    const wanted = addSubscriber({ email: "wanted@example.com" });
    addSubscriber({ email: "pending@example.com", status: "pending" });
    addSubscriber({ email: "gone@example.com", status: "unsubscribed" });
    addSubscriber({
      email: "no-opened@example.com",
      events: { opened: false, acknowledged: false, resolved: true },
    });
    const queued = await dispatchSubscriberNotifications(outbox("incident.opened"));
    expect(queued).toBe(1);
    expect(deliveries.docs).toHaveLength(1);
    expect(String(deliveries.docs[0]?.subscriberId)).toBe(String(wanted));
    expect(state.queueAdd).toHaveBeenCalledTimes(1);
    expect(state.queueAdd.mock.calls[0]?.[0]).toBe("deliver-subscriber");
    expect(state.queueAdd.mock.calls[0]?.[1]).toMatchObject({ kind: "subscriber", generation: 0 });
    expect(deliveries.docs[0]?.status).toBe("queued");
  });

  it("matches the event type to each subscriber's preferences", async () => {
    addSubscriber({
      email: "resolved-only@example.com",
      events: { opened: false, acknowledged: false, resolved: true },
    });
    expect(await dispatchSubscriberNotifications(outbox("incident.opened"))).toBe(0);
    expect(await dispatchSubscriberNotifications(outbox("incident.resolved"))).toBe(1);
  });

  it("sends acknowledgements only when the page offers them and the subscriber opted in", async () => {
    addSubscriber({ events: { opened: true, acknowledged: true, resolved: true } });
    expect(await dispatchSubscriberNotifications(outbox("incident.acknowledged"))).toBe(0);
    pages.docs[0]!.subscriberEvents = { opened: true, acknowledged: true, resolved: true };
    expect(await dispatchSubscriberNotifications(outbox("incident.acknowledged"))).toBe(1);
    addSubscriber({ email: "no-ack@example.com" });
    expect(
      await dispatchSubscriberNotifications(outbox("incident.acknowledged", { eventId: "ack:2" })),
    ).toBe(1);
  });

  it("deduplicates repeated dispatch of the same event", async () => {
    addSubscriber();
    const event = outbox("incident.opened");
    await dispatchSubscriberNotifications(event);
    await dispatchSubscriberNotifications(event);
    expect(deliveries.docs).toHaveLength(1);
    expect(state.queueAdd).toHaveBeenCalledTimes(1);
  });

  it("only notifies for published pages, enabled services and the right owner", async () => {
    addSubscriber();
    pages.docs[0]!.status = "unpublished";
    expect(await dispatchSubscriberNotifications(outbox("incident.opened"))).toBe(0);
    pages.docs[0]!.status = "published";
    services.docs[0]!.enabled = false;
    expect(await dispatchSubscriberNotifications(outbox("incident.opened"))).toBe(0);
    services.docs[0]!.enabled = true;
    pages.docs[0]!.subscribersEnabled = false;
    expect(await dispatchSubscriberNotifications(outbox("incident.opened"))).toBe(0);
    pages.docs[0]!.subscribersEnabled = true;
    expect(
      await dispatchSubscriberNotifications(outbox("incident.opened", { userId: otherOwner })),
    ).toBe(0);
    expect(await dispatchSubscriberNotifications(outbox("incident.opened"))).toBe(1);
  });

  it("keeps each page's subscribers separate and stores only public-safe content", async () => {
    addSubscriber({ email: "one@example.com" });
    const second = addPage({ slug: "second-page", name: "Second Status" });
    addService(second, { name: "Website" });
    addSubscriber({ pageId: second, email: "two@example.com" });
    await dispatchSubscriberNotifications(outbox("incident.opened"));
    expect(deliveries.docs).toHaveLength(2);
    const serialized = JSON.stringify(deliveries.docs.map((doc) => doc.snapshot));
    expect(serialized).not.toMatch(/Internal Checkout|UNEXPECTED_STATUS|incidentUrl|503/);
    expect(serialized).toContain("Service disruption: Public API");
    expect(serialized).toContain("Service disruption: Website");
  });
});

describe("subscriber delivery processing", () => {
  const prepare = async (type: INotificationOutbox["type"] = "incident.opened") => {
    const subscriberId = addSubscriber({ email: "reader@example.com" });
    await dispatchSubscriberNotifications(outbox(type));
    const delivery = deliveries.docs[0] as Record<string, unknown>;
    return { subscriberId, deliveryId: String(delivery._id), delivery };
  };

  it("sends a branded email with an unsubscribe link and no internal details", async () => {
    pages.docs[0]!.name = "Acme <b>Status</b>";
    const { deliveryId, subscriberId } = await prepare();
    const result = await processSubscriberDelivery({ deliveryId, generation: 0 });
    expect(result.outcome).toBe("delivered");
    const message = sendMock.mock.calls[0]?.[0];
    expect(message?.to).toBe("reader@example.com");
    const token = createUnsubscribeToken(String(pageId), String(subscriberId));
    expect(message?.text).toContain(`/status/acme-status/unsubscribe?token=${token}`);
    expect(message?.html).toContain("Unsubscribe");
    expect(message?.headers?.["List-Unsubscribe"]).toContain(token);
    expect(message?.html).not.toContain("<b>Status</b>");
    expect(`${message?.html}${message?.text}${message?.subject}`).not.toMatch(
      /Internal Checkout|UNEXPECTED_STATUS/,
    );
    expect(message?.subject).toMatch(/^\[Acme/);
    expect(deliveries.docs[0]?.status).toBe("delivered");
  });

  it("renders resolved updates with duration", async () => {
    const { deliveryId } = await prepare("incident.resolved");
    await processSubscriberDelivery({ deliveryId, generation: 0 });
    const message = sendMock.mock.calls[0]?.[0];
    expect(message?.subject).toContain("Resolved");
    expect(message?.text).toContain("Duration: 10m 0s");
  });

  it("does not send after unsubscribing, even if a job was already queued", async () => {
    const { deliveryId } = await prepare();
    subscribers.docs[0]!.status = "unsubscribed";
    const result = await processSubscriberDelivery({ deliveryId, generation: 0 });
    expect(result.outcome).toBe("failed");
    expect(sendMock).not.toHaveBeenCalled();
    expect(deliveries.docs[0]).toMatchObject({
      status: "failed",
      failureCategory: "SUBSCRIPTION_INACTIVE",
    });
  });

  it("does not send when the page was unpublished or the preference was turned off", async () => {
    const first = await prepare();
    pages.docs[0]!.status = "unpublished";
    await processSubscriberDelivery({ deliveryId: first.deliveryId, generation: 0 });
    expect(sendMock).not.toHaveBeenCalled();

    pages.docs[0]!.status = "published";
    deliveries.reset();
    subscribers.docs[0]!.events = { opened: false, acknowledged: false, resolved: true };
    await dispatchSubscriberNotifications(outbox("incident.opened", { eventId: "other:event" }));
    expect(deliveries.docs).toHaveLength(0);
  });

  it("retries transient failures with backoff and stops permanent ones", async () => {
    const { deliveryId } = await prepare();
    sendMock.mockResolvedValue({
      ok: false,
      category: "PROVIDER_ERROR",
      transient: true,
      responseCode: 503,
      retryAfterMs: null,
      durationMs: 3,
    });
    const retry = await processSubscriberDelivery({ deliveryId, generation: 0 });
    expect(retry.outcome).toBe("retrying");
    expect(retry.retryDelayMs).toBeGreaterThanOrEqual(4500);
    expect(deliveries.docs[0]).toMatchObject({
      status: "retrying",
      attempts: 1,
      failureCategory: "PROVIDER_ERROR",
    });

    sendMock.mockResolvedValue(okResult);
    expect((await processSubscriberDelivery({ deliveryId, generation: 0 })).outcome).toBe(
      "delivered",
    );

    deliveries.reset();
    sendMock.mockReset();
    const second = await prepare();
    sendMock.mockResolvedValue({
      ok: false,
      category: "INVALID_CREDENTIALS",
      transient: false,
      responseCode: 403,
      retryAfterMs: null,
      durationMs: 3,
    });
    expect(
      (await processSubscriberDelivery({ deliveryId: second.deliveryId, generation: 0 })).outcome,
    ).toBe("failed");
  });

  it("sends at most once per delivery and ignores stale generations", async () => {
    const { deliveryId } = await prepare();
    expect((await processSubscriberDelivery({ deliveryId, generation: 5 })).outcome).toBe(
      "skipped",
    );
    await processSubscriberDelivery({ deliveryId, generation: 0 });
    expect((await processSubscriberDelivery({ deliveryId, generation: 0 })).outcome).toBe(
      "skipped",
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("re-queues deliveries whose job was lost", async () => {
    const { deliveryId } = await prepare();
    (deliveries.docs[0] as Record<string, unknown>).status = "pending";
    (deliveries.docs[0] as Record<string, unknown>).updatedAt = new Date(Date.now() - 10 * 60_000);
    state.queueAdd.mockClear();
    expect(await recoverStaleSubscriberDeliveries()).toBe(1);
    expect(state.queueAdd.mock.calls[0]?.[1]).toMatchObject({
      kind: "subscriber",
      deliveryId,
      generation: 1,
    });
  });

  it("is processed by the shared notification worker and signals retries", async () => {
    const { deliveryId } = await prepare();
    sendMock.mockResolvedValue({
      ok: false,
      category: "RATE_LIMITED",
      transient: true,
      responseCode: 429,
      retryAfterMs: 20_000,
      durationMs: 3,
    });
    const error = await processNotificationJob({
      data: { kind: "subscriber", deliveryId, generation: 0 },
    } as never).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DeliveryRetryError);
    expect((error as DeliveryRetryError).retryDelayMs).toBeGreaterThanOrEqual(20_000);
  });
});
