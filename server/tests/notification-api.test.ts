import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { User } from "../src/modules/auth/user.model.js";
import { NotificationDelivery } from "../src/modules/notifications/notification-delivery.model.js";
import { NotificationIntegration } from "../src/modules/notifications/notification-integration.model.js";
import { NotificationPreferences } from "../src/modules/notifications/notification-preferences.model.js";
import { decryptSecret } from "../src/modules/notifications/notification-crypto.service.js";
import { verifyWebhookSignature } from "../src/modules/notifications/channels/webhook.channel.js";
import { sendDelivery } from "../src/modules/notifications/notification-sender.service.js";
import { bindMemoryModel } from "./helpers/memory-model.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
  workspaceHeaders,
} from "./helpers/workspace-fixtures.js";
import type { ChannelResult } from "../src/modules/notifications/notification.types.js";

const queueAdd = vi.hoisted(() => vi.fn());
const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
  default: { lookup: lookupMock },
  lookup: lookupMock,
}));

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

const redis = await import("../src/lib/redis/redis.service.js");
const sendMock = vi.mocked(sendDelivery);

const workspaceStores = bindWorkspaceModels();

const stores = {
  users: bindMemoryModel(User),
  prefs: bindMemoryModel(NotificationPreferences),
  integrations: bindMemoryModel(NotificationIntegration),
  deliveries: bindMemoryModel(NotificationDelivery, { uniqueKeys: ["deliveryKey"] }),
};

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();
const tokenA = createAccessToken(String(userA));
const tokenB = createAccessToken(String(userB));
const adminId = new Types.ObjectId();
const memberId = new Types.ObjectId();
const viewerId = new Types.ObjectId();
const tokenAdmin = createAccessToken(String(adminId));
const tokenMember = createAccessToken(String(memberId));
const tokenViewer = createAccessToken(String(viewerId));
const w1 = new Types.ObjectId();
const w2 = new Types.ObjectId();
const workspaceByToken = new Map<string, Types.ObjectId>([
  [tokenA, w1],
  [tokenAdmin, w1],
  [tokenMember, w1],
  [tokenViewer, w1],
  [tokenB, w2],
]);
const auth = (token: string) =>
  workspaceHeaders(token, workspaceByToken.get(token) as Types.ObjectId);

const slackUrl = "https://hooks.slack.com/services/T0AAAA111/B0BBBB222/SuperSecretToken9876";
const webhookUrl = "https://hooks.example.com/faultline/private-path-token";

const ok: ChannelResult = { ok: true, responseCode: 200, durationMs: 40 };

beforeEach(() => {
  Object.values(stores).forEach((store) => store.reset());
  resetWorkspaceModels(workspaceStores);
  seedWorkspace(workspaceStores, {
    id: w1,
    ownerId: userA,
    members: [
      { userId: adminId, role: "admin" },
      { userId: memberId, role: "member" },
      { userId: viewerId, role: "viewer" },
    ],
  });
  seedWorkspace(workspaceStores, { id: w2, ownerId: userB });
  queueAdd.mockReset();
  queueAdd.mockResolvedValue({ id: "job" });
  sendMock.mockReset();
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  vi.mocked(redis.acquireLock).mockResolvedValue(true);
  stores.users.docs.push(
    {
      _id: userA,
      name: "Asha",
      email: "asha@example.com",
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: userB,
      name: "Ben",
      email: "ben@example.com",
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  );
});

describe("authentication", () => {
  it.each([
    ["get", "/api/notifications/preferences"],
    ["patch", "/api/notifications/preferences"],
    ["get", "/api/notifications/integrations"],
    ["post", "/api/notifications/integrations/slack"],
    ["post", "/api/notifications/integrations/webhooks"],
    ["post", "/api/notifications/email/test"],
    ["get", "/api/notifications/deliveries"],
  ] as const)("requires a session for %s %s", async (method, path) => {
    await request(app)[method](path).expect(401);
  });
});

describe("preferences", () => {
  it("returns sensible defaults with the verified account email", async () => {
    const response = await request(app)
      .get("/api/notifications/preferences")
      .set(auth(tokenA))
      .expect(200);
    expect(response.body).toMatchObject({
      enabled: true,
      channels: { email: true, slack: true, webhook: true },
      events: { opened: true, acknowledged: false, resolved: true },
      email: { address: "asha@example.com", verified: true },
      updatedAt: null,
    });
  });

  it("reports an unverified email honestly", async () => {
    const response = await request(app)
      .get("/api/notifications/preferences")
      .set(auth(tokenB))
      .expect(200);
    expect(response.body.email).toEqual({ address: "ben@example.com", verified: false });
  });

  it("saves and retrieves partial updates", async () => {
    const patch = await request(app)
      .patch("/api/notifications/preferences")
      .set(auth(tokenA))
      .send({ events: { acknowledged: true }, channels: { slack: false } })
      .expect(200);
    expect(patch.body.events).toEqual({ opened: true, acknowledged: true, resolved: true });
    expect(patch.body.channels).toEqual({ email: true, slack: false, webhook: true });

    const master = await request(app)
      .patch("/api/notifications/preferences")
      .set(auth(tokenA))
      .send({ enabled: false })
      .expect(200);
    expect(master.body.enabled).toBe(false);
    expect(master.body.events.acknowledged).toBe(true);

    const read = await request(app).get("/api/notifications/preferences").set(auth(tokenA));
    expect(read.body).toMatchObject({ enabled: false, events: { acknowledged: true } });
  });

  it("keeps preferences private to each user", async () => {
    await request(app)
      .patch("/api/notifications/preferences")
      .set(auth(tokenA))
      .send({ enabled: false })
      .expect(200);
    const other = await request(app).get("/api/notifications/preferences").set(auth(tokenB));
    expect(other.body.enabled).toBe(true);
  });

  it("rejects empty, unknown and malformed updates, including recipient overrides", async () => {
    for (const body of [
      {},
      { enabled: "yes" },
      { email: "attacker@example.com" },
      { channels: { sms: true } },
      { userId: String(userB) },
    ]) {
      const response = await request(app)
        .patch("/api/notifications/preferences")
        .set(auth(tokenA))
        .send(body)
        .expect(400);
      expect(response.body.code).toBe("INVALID_REQUEST");
    }
  });
});

describe("slack integrations", () => {
  const create = (overrides: Record<string, unknown> = {}, token = tokenA) =>
    request(app)
      .post("/api/notifications/integrations/slack")
      .set(auth(token))
      .send({ name: "Ops alerts", webhookUrl: slackUrl, ...overrides });

  it("creates an integration, encrypts the URL and never returns it", async () => {
    const response = await create().expect(201);
    const serialized = JSON.stringify(response.body);
    expect(response.body.integration).toMatchObject({
      type: "slack",
      name: "Ops alerts",
      enabled: true,
      events: ["incident.opened", "incident.resolved"],
      urlHint: "https://hooks.slack.com/services/••••9876",
    });
    expect(serialized).not.toContain("SuperSecretToken");
    expect(serialized).not.toContain("T0AAAA111");

    const stored = stores.integrations.docs[0] as unknown as {
      encryptedUrl: string;
      _id: Types.ObjectId;
      userId: Types.ObjectId;
    };
    expect(stored.encryptedUrl).not.toContain("SuperSecretToken");
    expect(
      decryptSecret(stored.encryptedUrl, `${String(stored.userId)}:${String(stored._id)}:url`),
    ).toBe(slackUrl);
  });

  it("does not expose the URL through list responses either", async () => {
    await create().expect(201);
    const list = await request(app).get("/api/notifications/integrations").set(auth(tokenA));
    expect(JSON.stringify(list.body)).not.toContain("SuperSecretToken");
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).not.toHaveProperty("encryptedUrl");
    expect(list.body.items[0]).not.toHaveProperty("webhookUrl");
  });

  it.each([
    "http://hooks.slack.com/services/T0AAAA111/B0BBBB222/token",
    "https://evil.example.com/services/T0AAAA111/B0BBBB222/token",
    "https://hooks.slack.com.evil.com/services/T0AAAA111/B0BBBB222/token",
    "https://127.0.0.1/services/T0AAAA111/B0BBBB222/token",
    "not a url",
  ])("rejects non-Slack destination %s", async (webhookUrl) => {
    const response = await create({ webhookUrl }).expect(400);
    expect(response.body.code).toMatch(/INVALID_INTEGRATION_URL|INVALID_REQUEST/);
    expect(stores.integrations.docs).toHaveLength(0);
  });

  it("validates the name and events", async () => {
    await create({ name: "   " }).expect(400);
    await create({ events: [] }).expect(400);
    await create({ events: ["incident.exploded"] }).expect(400);
    await create({ extra: true }).expect(400);
  });

  it("scopes integrations to their owner", async () => {
    const created = await create().expect(201);
    const id = created.body.integration.id as string;

    const list = await request(app).get("/api/notifications/integrations").set(auth(tokenB));
    expect(list.body.items).toHaveLength(0);

    await request(app)
      .patch(`/api/notifications/integrations/${id}`)
      .set(auth(tokenB))
      .send({ name: "Hijacked" })
      .expect(404);
    await request(app)
      .delete(`/api/notifications/integrations/${id}`)
      .set(auth(tokenB))
      .expect(404);
    await request(app)
      .post(`/api/notifications/integrations/${id}/test`)
      .set(auth(tokenB))
      .expect(404);
    expect(stores.integrations.docs).toHaveLength(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("edits the name, toggles state, and replaces the URL without revealing the old one", async () => {
    const created = await create().expect(201);
    const id = created.body.integration.id as string;
    const before = (stores.integrations.docs[0] as unknown as { encryptedUrl: string })
      .encryptedUrl;

    const renamed = await request(app)
      .patch(`/api/notifications/integrations/${id}`)
      .set(auth(tokenA))
      .send({ name: "Renamed", enabled: false, events: ["incident.acknowledged"] })
      .expect(200);
    expect(renamed.body.integration).toMatchObject({
      name: "Renamed",
      enabled: false,
      events: ["incident.acknowledged"],
    });

    const replaced = await request(app)
      .patch(`/api/notifications/integrations/${id}`)
      .set(auth(tokenA))
      .send({ webhookUrl: "https://hooks.slack.com/services/T0CCCC333/B0DDDD444/NewTokenZZZZ" })
      .expect(200);
    expect(replaced.body.integration.urlHint).toBe("https://hooks.slack.com/services/••••ZZZZ");
    expect(JSON.stringify(replaced.body)).not.toContain("NewToken");
    expect(
      (stores.integrations.docs[0] as unknown as { encryptedUrl: string }).encryptedUrl,
    ).not.toBe(before);
  });

  it("rejects a bad replacement URL and keeps the existing credential", async () => {
    const created = await create().expect(201);
    const id = created.body.integration.id as string;
    const before = (stores.integrations.docs[0] as unknown as { encryptedUrl: string })
      .encryptedUrl;
    await request(app)
      .patch(`/api/notifications/integrations/${id}`)
      .set(auth(tokenA))
      .send({ webhookUrl: "https://example.com/hook" })
      .expect(400);
    expect((stores.integrations.docs[0] as unknown as { encryptedUrl: string }).encryptedUrl).toBe(
      before,
    );
  });

  it("deletes an integration", async () => {
    const created = await create().expect(201);
    await request(app)
      .delete(`/api/notifications/integrations/${created.body.integration.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(stores.integrations.docs).toHaveLength(0);
  });

  it("enforces the per-type integration limit", async () => {
    for (let index = 0; index < 10; index += 1)
      await create({ name: `Slack ${index}` }).expect(201);
    const response = await create({ name: "One too many" }).expect(409);
    expect(response.body.code).toBe("INTEGRATION_LIMIT_REACHED");
  });

  it("rejects malformed ids without touching the database", async () => {
    await request(app)
      .patch("/api/notifications/integrations/not-an-id")
      .set(auth(tokenA))
      .send({ name: "x" })
      .expect(400);
  });
});

describe("webhook integrations", () => {
  const create = (overrides: Record<string, unknown> = {}, token = tokenA) =>
    request(app)
      .post("/api/notifications/integrations/webhooks")
      .set(auth(token))
      .send({ name: "Pager bridge", url: webhookUrl, ...overrides });

  it("returns the signing secret exactly once and stores it encrypted", async () => {
    const response = await create().expect(201);
    expect(response.body.signingSecret).toMatch(/^whsec_/);
    expect(response.body.integration.urlHint).toBe("https://hooks.example.com/••••");
    expect(JSON.stringify(response.body.integration)).not.toContain("private-path-token");
    expect(response.body.integration.hasSigningSecret).toBe(true);

    const stored = stores.integrations.docs[0] as unknown as {
      encryptedSigningSecret: string;
      encryptedUrl: string;
      _id: Types.ObjectId;
      userId: Types.ObjectId;
    };
    expect(stored.encryptedSigningSecret).not.toContain(response.body.signingSecret);
    const context = `${String(stored.userId)}:${String(stored._id)}`;
    expect(decryptSecret(stored.encryptedSigningSecret, `${context}:secret`)).toBe(
      response.body.signingSecret,
    );
    expect(decryptSecret(stored.encryptedUrl, `${context}:url`)).toBe(webhookUrl);

    const list = await request(app).get("/api/notifications/integrations").set(auth(tokenA));
    expect(JSON.stringify(list.body)).not.toContain(response.body.signingSecret);
    expect(JSON.stringify(list.body)).not.toContain("private-path-token");
  });

  it("rejects unsafe destinations at save time", async () => {
    for (const url of [
      "http://hooks.example.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x",
      "https://user:pw@hooks.example.com/x",
      "https://hooks.example.com:8080/x",
      "https://service.internal/x",
    ]) {
      const response = await create({ url }).expect(400);
      expect(response.body.code).toBe("INVALID_INTEGRATION_URL");
    }
    expect(stores.integrations.docs).toHaveLength(0);
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.8", family: 4 }]);
    const response = await create({ url: "https://rebind.example.com/x" }).expect(400);
    expect(response.body.fieldErrors).toHaveProperty("url");
    expect(stores.integrations.docs).toHaveLength(0);
  });

  it("rejects hostnames that cannot be resolved", async () => {
    lookupMock.mockRejectedValue(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
    await create({ url: "https://nonexistent.example.com/x" }).expect(400);
  });

  it("rotates the signing secret and invalidates the previous one", async () => {
    const created = await create().expect(201);
    const oldSecret = created.body.signingSecret as string;
    const id = created.body.integration.id as string;

    const rotated = await request(app)
      .post(`/api/notifications/integrations/${id}/rotate-secret`)
      .set(auth(tokenA))
      .expect(200);
    expect(rotated.body.signingSecret).toMatch(/^whsec_/);
    expect(rotated.body.signingSecret).not.toBe(oldSecret);

    const stored = stores.integrations.docs[0] as unknown as {
      encryptedSigningSecret: string;
      _id: Types.ObjectId;
      userId: Types.ObjectId;
    };
    const current = decryptSecret(
      stored.encryptedSigningSecret,
      `${String(stored.userId)}:${String(stored._id)}:secret`,
    );
    expect(current).toBe(rotated.body.signingSecret);
    expect(verifyWebhookSignature(current, "1", "{}", "v1=00")).toBe(false);

    await request(app)
      .post(`/api/notifications/integrations/${id}/rotate-secret`)
      .set(auth(tokenB))
      .expect(404);
  });

  it("does not allow rotating a Slack integration or changing the wrong URL field", async () => {
    const slack = await request(app)
      .post("/api/notifications/integrations/slack")
      .set(auth(tokenA))
      .send({ name: "Slack", webhookUrl: slackUrl })
      .expect(201);
    await request(app)
      .post(`/api/notifications/integrations/${slack.body.integration.id}/rotate-secret`)
      .set(auth(tokenA))
      .expect(400);
    await request(app)
      .patch(`/api/notifications/integrations/${slack.body.integration.id}`)
      .set(auth(tokenA))
      .send({ url: webhookUrl })
      .expect(400);
  });
});

describe("test notifications", () => {
  const createSlack = async () =>
    (
      await request(app)
        .post("/api/notifications/integrations/slack")
        .set(auth(tokenA))
        .send({ name: "Ops", webhookUrl: slackUrl })
        .expect(201)
    ).body.integration.id as string;

  it("performs a real delivery and reports the actual success", async () => {
    const id = await createSlack();
    sendMock.mockResolvedValue(ok);
    const response = await request(app)
      .post(`/api/notifications/integrations/${id}/test`)
      .set(auth(tokenA))
      .expect(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(response.body.delivery).toMatchObject({
      kind: "test",
      eventType: "notification.test",
      channel: "slack",
      status: "delivered",
      attempts: 1,
      retryable: false,
    });
    expect(queueAdd).not.toHaveBeenCalled();
    expect(stores.deliveries.docs).toHaveLength(1);
  });

  it("reports the actual failure instead of claiming success", async () => {
    const id = await createSlack();
    sendMock.mockResolvedValue({
      ok: false,
      category: "INVALID_CREDENTIALS",
      transient: false,
      responseCode: 404,
      retryAfterMs: null,
      durationMs: 5,
    });
    const response = await request(app)
      .post(`/api/notifications/integrations/${id}/test`)
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.delivery).toMatchObject({
      status: "failed",
      failureCategory: "INVALID_CREDENTIALS",
      responseCode: 404,
      retryable: false,
    });
    expect(JSON.stringify(response.body)).not.toContain("SuperSecretToken");
  });

  it("does not retry transient test failures in the background", async () => {
    const id = await createSlack();
    sendMock.mockResolvedValue({
      ok: false,
      category: "PROVIDER_ERROR",
      transient: true,
      responseCode: 503,
      retryAfterMs: null,
      durationMs: 5,
    });
    const response = await request(app)
      .post(`/api/notifications/integrations/${id}/test`)
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.delivery.status).toBe("failed");
    expect(response.body.delivery.maxAttempts).toBe(1);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("refuses to test a disabled integration", async () => {
    const id = await createSlack();
    await request(app)
      .patch(`/api/notifications/integrations/${id}`)
      .set(auth(tokenA))
      .send({ enabled: false })
      .expect(200);
    await request(app)
      .post(`/api/notifications/integrations/${id}/test`)
      .set(auth(tokenA))
      .expect(409);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rate limits repeated tests of the same integration", async () => {
    const id = await createSlack();
    sendMock.mockResolvedValue(ok);
    vi.mocked(redis.acquireLock).mockResolvedValue(false);
    const response = await request(app)
      .post(`/api/notifications/integrations/${id}/test`)
      .set(auth(tokenA))
      .expect(429);
    expect(response.body.code).toBe("RATE_LIMITED");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends the email test only to the verified account address", async () => {
    sendMock.mockResolvedValue(ok);
    const response = await request(app)
      .post("/api/notifications/email/test")
      .set(auth(tokenA))
      .send({ to: "attacker@example.com" })
      .expect(200);
    expect(response.body.delivery).toMatchObject({ channel: "email", status: "delivered" });
    const delivery = sendMock.mock.calls[0]?.[0];
    expect(String(delivery?.userId)).toBe(String(userA));
    expect(JSON.stringify(delivery)).not.toContain("attacker@example.com");
  });

  it("refuses the email test for unverified accounts", async () => {
    const response = await request(app)
      .post("/api/notifications/email/test")
      .set(auth(tokenB))
      .expect(409);
    expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not create incidents or alter monitors as a side effect", async () => {
    sendMock.mockResolvedValue(ok);
    await request(app).post("/api/notifications/email/test").set(auth(tokenA)).expect(200);
    expect(stores.deliveries.docs[0]).toMatchObject({
      kind: "test",
      eventType: "notification.test",
    });
    expect(stores.deliveries.docs[0]?.incidentId).toBeUndefined();
  });
});

describe("delivery history", () => {
  const seed = (overrides: Record<string, unknown> = {}) => {
    const id = new Types.ObjectId();
    stores.deliveries.docs.push({
      _id: id,
      deliveryKey: `k-${String(id)}`,
      kind: "incident",
      eventId: "incident.opened:1",
      eventType: "incident.opened",
      workspaceId: w1,
      userId: userA,
      channel: "email",
      status: "delivered",
      attempts: 1,
      generation: 0,
      attemptHistory: [
        {
          attempt: 1,
          at: new Date(),
          outcome: "delivered",
          responseCode: 200,
          failureCategory: null,
          durationMs: 30,
          willRetry: false,
        },
      ],
      snapshot: { secretish: "should-not-leak" },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return String(id);
  };

  it("paginates and filters only the caller's deliveries", async () => {
    for (let index = 0; index < 12; index += 1) {
      seed({ createdAt: new Date(Date.now() - index * 1000) });
    }
    seed({ status: "failed", channel: "slack", eventType: "incident.resolved" });
    seed({ workspaceId: w2, userId: userB });

    const first = await request(app)
      .get("/api/notifications/deliveries?pageSize=5")
      .set(auth(tokenA))
      .expect(200);
    expect(first.body).toMatchObject({ page: 1, pageSize: 5, total: 13, totalPages: 3 });
    expect(first.body.items).toHaveLength(5);

    const failed = await request(app)
      .get("/api/notifications/deliveries?status=failed&channel=slack&eventType=incident.resolved")
      .set(auth(tokenA));
    expect(failed.body.total).toBe(1);
    expect(failed.body.items[0]).toMatchObject({ status: "failed", retryable: true });

    const none = await request(app)
      .get("/api/notifications/deliveries?status=retrying")
      .set(auth(tokenA));
    expect(none.body.total).toBe(0);
  });

  it("filters by date range", async () => {
    seed({ createdAt: new Date("2026-01-01T00:00:00Z") });
    seed({ createdAt: new Date("2026-06-01T00:00:00Z") });
    const response = await request(app)
      .get("/api/notifications/deliveries?from=2026-05-01T00:00:00Z&to=2026-07-01T00:00:00Z")
      .set(auth(tokenA));
    expect(response.body.total).toBe(1);
  });

  it("rejects invalid filters", async () => {
    await request(app)
      .get("/api/notifications/deliveries?status=exploded")
      .set(auth(tokenA))
      .expect(400);
    await request(app).get("/api/notifications/deliveries?from=nope").set(auth(tokenA)).expect(400);
    await request(app)
      .get("/api/notifications/deliveries?pageSize=500")
      .set(auth(tokenA))
      .expect(400);
  });

  it("returns safe details with attempt history", async () => {
    const id = seed({ status: "failed", failureCategory: "PROVIDER_ERROR", message: "x" });
    const response = await request(app)
      .get(`/api/notifications/deliveries/${id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.delivery.attemptHistory).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain("should-not-leak");
    expect(response.body.delivery).not.toHaveProperty("snapshot");
  });

  it("hides other users' deliveries", async () => {
    const id = seed({ workspaceId: w2, userId: userB });
    await request(app).get(`/api/notifications/deliveries/${id}`).set(auth(tokenA)).expect(404);
    await request(app)
      .post(`/api/notifications/deliveries/${id}/retry`)
      .set(auth(tokenA))
      .expect(404);
  });

  it("retries only eligible failed deliveries via the API", async () => {
    const failed = seed({ status: "failed", attempts: 5 });
    const response = await request(app)
      .post(`/api/notifications/deliveries/${failed}/retry`)
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.delivery).toMatchObject({ id: failed, attempts: 0, status: "queued" });
    expect(queueAdd).toHaveBeenCalledTimes(1);

    const delivered = seed({ status: "delivered" });
    const conflict = await request(app)
      .post(`/api/notifications/deliveries/${delivered}/retry`)
      .set(auth(tokenA))
      .expect(409);
    expect(conflict.body.code).toBe("DELIVERY_NOT_RETRYABLE");
  });
});

describe("workspace roles and isolation", () => {
  const createAs = (token: string) =>
    request(app)
      .post("/api/notifications/integrations/slack")
      .set(auth(token))
      .send({ name: "Ops", webhookUrl: slackUrl });

  const seedDelivery = (overrides: Record<string, unknown> = {}) => {
    const id = new Types.ObjectId();
    stores.deliveries.docs.push({
      _id: id,
      deliveryKey: `role-${String(id)}`,
      kind: "incident",
      eventId: "incident.opened:1",
      eventType: "incident.opened",
      workspaceId: w1,
      userId: userA,
      channel: "email",
      status: "failed",
      attempts: 5,
      generation: 0,
      attemptHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return String(id);
  };

  it("lets owners and admins manage integrations and deliveries", async () => {
    for (const token of [tokenA, tokenAdmin]) {
      const created = await createAs(token);
      expect(created.status).toBe(201);
      await request(app).get("/api/notifications/integrations").set(auth(token)).expect(200);
      await request(app).get("/api/notifications/deliveries").set(auth(token)).expect(200);
    }
    expect(stores.integrations.docs).toHaveLength(2);
    expect(stores.integrations.docs.every((doc) => String(doc.workspaceId) === String(w1))).toBe(
      true,
    );
  });

  it("forbids members and viewers from every integration and delivery operation", async () => {
    const created = await createAs(tokenA).expect(201);
    const integrationId = created.body.integration.id as string;
    const deliveryId = seedDelivery();
    for (const token of [tokenMember, tokenViewer]) {
      const attempts = [
        request(app).get("/api/notifications/integrations").set(auth(token)),
        createAs(token),
        request(app)
          .patch(`/api/notifications/integrations/${integrationId}`)
          .set(auth(token))
          .send({ name: "Hijack" }),
        request(app).delete(`/api/notifications/integrations/${integrationId}`).set(auth(token)),
        request(app)
          .post(`/api/notifications/integrations/${integrationId}/rotate-secret`)
          .set(auth(token)),
        request(app).post(`/api/notifications/integrations/${integrationId}/test`).set(auth(token)),
        request(app).get("/api/notifications/deliveries").set(auth(token)),
        request(app).get(`/api/notifications/deliveries/${deliveryId}`).set(auth(token)),
        request(app).post(`/api/notifications/deliveries/${deliveryId}/retry`).set(auth(token)),
      ];
      for (const attempt of attempts) {
        const response = await attempt;
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("INSUFFICIENT_PERMISSIONS");
      }
    }
    expect(stores.integrations.docs).toHaveLength(1);
    expect(stores.integrations.docs[0]?.name).toBe("Ops");
    expect(queueAdd).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("lets every role manage their own preferences and send themselves a test email", async () => {
    for (const [userId, token] of [
      [adminId, tokenAdmin],
      [memberId, tokenMember],
      [viewerId, tokenViewer],
    ] as const) {
      stores.users.docs.push({
        _id: userId,
        name: "Teammate",
        email: `${String(userId)}@example.com`,
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const patched = await request(app)
        .patch("/api/notifications/preferences")
        .set(auth(token))
        .send({ events: { acknowledged: true } })
        .expect(200);
      expect(patched.body.events.acknowledged).toBe(true);
      expect(patched.body.email.address).toBe(`${String(userId)}@example.com`);
    }
    sendMock.mockResolvedValue(ok);
    await request(app).post("/api/notifications/email/test").set(auth(tokenViewer)).expect(200);
    expect(String(sendMock.mock.calls[0]?.[0].userId)).toBe(String(viewerId));
    const owner = await request(app)
      .get("/api/notifications/preferences")
      .set(auth(tokenA))
      .expect(200);
    expect(owner.body.events.acknowledged).toBe(false);
  });

  it("stores preferences per workspace for the same user", async () => {
    workspaceStores.members.docs.push({
      _id: new Types.ObjectId(),
      workspaceId: w2,
      userId: userA,
      role: "member",
      status: "active",
      joinedAt: new Date(),
    });
    await request(app)
      .patch("/api/notifications/preferences")
      .set(auth(tokenA))
      .send({ enabled: false })
      .expect(200);
    const other = await request(app)
      .get("/api/notifications/preferences")
      .set({ Authorization: `Bearer ${tokenA}`, "X-Workspace-Id": String(w2) })
      .expect(200);
    expect(other.body.enabled).toBe(true);
    const here = await request(app)
      .get("/api/notifications/preferences")
      .set(auth(tokenA))
      .expect(200);
    expect(here.body.enabled).toBe(false);
    expect(stores.prefs.docs).toHaveLength(1);
    expect(String(stores.prefs.docs[0]?.workspaceId)).toBe(String(w1));
  });

  it("rejects workspaces the caller does not belong to, and removed members", async () => {
    await createAs(tokenA).expect(201);
    const foreign = { Authorization: `Bearer ${tokenB}`, "X-Workspace-Id": String(w1) };
    for (const path of [
      "/api/notifications/integrations",
      "/api/notifications/deliveries",
      "/api/notifications/preferences",
    ]) {
      const response = await request(app).get(path).set(foreign);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("WORKSPACE_NOT_FOUND");
    }
    await request(app)
      .post("/api/notifications/integrations/slack")
      .set(foreign)
      .send({ name: "x", webhookUrl: slackUrl })
      .expect(404);

    const member = workspaceStores.members.docs.find(
      (doc) => String(doc.userId) === String(adminId),
    );
    (member as Record<string, unknown>).status = "removed";
    const removed = await request(app).get("/api/notifications/integrations").set(auth(tokenAdmin));
    expect(removed.status).toBe(404);
    expect(removed.body.code).toBe("WORKSPACE_NOT_FOUND");
  });

  it("keeps integrations and deliveries invisible across workspaces", async () => {
    const created = await createAs(tokenA).expect(201);
    const integrationId = created.body.integration.id as string;
    const mine = seedDelivery();
    const theirs = seedDelivery({ workspaceId: w2, userId: userB });
    const list = await request(app)
      .get("/api/notifications/integrations")
      .set(auth(tokenB))
      .expect(200);
    expect(list.body.items).toHaveLength(0);
    const own = await request(app)
      .get("/api/notifications/deliveries")
      .set(auth(tokenA))
      .expect(200);
    expect(own.body.items.map((item: { id: string }) => item.id)).toEqual([mine]);
    await request(app).get(`/api/notifications/deliveries/${theirs}`).set(auth(tokenA)).expect(404);
    await request(app)
      .post(`/api/notifications/deliveries/${theirs}/retry`)
      .set(auth(tokenA))
      .expect(404);
    await request(app)
      .delete(`/api/notifications/integrations/${integrationId}`)
      .set(auth(tokenB))
      .expect(404);
    await request(app)
      .post(`/api/notifications/integrations/${integrationId}/test`)
      .set(auth(tokenB))
      .expect(404);
    expect(sendMock).not.toHaveBeenCalled();
    expect(stores.integrations.docs).toHaveLength(1);
  });

  it("scopes the integration limit and test deliveries to the workspace", async () => {
    for (let index = 0; index < 10; index += 1) {
      await createAs(tokenA).expect(201);
    }
    await createAs(tokenA).expect(409);
    await createAs(tokenB).expect(201);
    const integrationId = stores.integrations.docs.find(
      (doc) => String(doc.workspaceId) === String(w2),
    )?._id;
    sendMock.mockResolvedValue(ok);
    const result = await request(app)
      .post(`/api/notifications/integrations/${String(integrationId)}/test`)
      .set(auth(tokenB))
      .expect(200);
    expect(result.body.delivery.status).toBe("delivered");
    expect(String(stores.deliveries.docs[0]?.workspaceId)).toBe(String(w2));
  });

  it("retries a failed delivery only inside its own workspace for permitted roles", async () => {
    const deliveryId = seedDelivery();
    const response = await request(app)
      .post(`/api/notifications/deliveries/${deliveryId}/retry`)
      .set(auth(tokenAdmin))
      .expect(200);
    expect(response.body.delivery).toMatchObject({ id: deliveryId, attempts: 0 });
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });
});
