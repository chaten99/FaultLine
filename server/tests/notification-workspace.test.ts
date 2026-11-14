import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNotificationEmail } from "../src/lib/email/email.service.js";
import { User } from "../src/modules/auth/user.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { IncidentTimeline } from "../src/modules/incidents/incident-timeline.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import {
  buildDeliveryKey,
  dispatchOutboxEvent,
} from "../src/modules/notifications/notification-dispatcher.service.js";
import { NotificationDelivery } from "../src/modules/notifications/notification-delivery.model.js";
import type { INotificationDelivery } from "../src/modules/notifications/notification-delivery.model.js";
import { NotificationIntegration } from "../src/modules/notifications/notification-integration.model.js";
import { NotificationOutbox } from "../src/modules/notifications/notification-outbox.model.js";
import { NotificationPreferences } from "../src/modules/notifications/notification-preferences.model.js";
import { persistOutboxEvent } from "../src/modules/notifications/notification-outbox.service.js";
import { sendDelivery } from "../src/modules/notifications/notification-sender.service.js";
import { bindMemoryModel } from "./helpers/memory-model.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
} from "./helpers/workspace-fixtures.js";

const queueAdd = vi.hoisted(() => vi.fn());

vi.mock("../src/modules/status-pages/status-page-delivery.service.js", () => ({
  dispatchSubscriberNotifications: vi.fn().mockResolvedValue(0),
  processSubscriberDelivery: vi.fn(),
  recoverStaleSubscriberDeliveries: vi.fn().mockResolvedValue(0),
}));

vi.mock("../src/modules/status-pages/status-page-realtime.service.js", () => ({
  publishPublicIncidentUpdates: vi.fn().mockResolvedValue(undefined),
  publishPublicStatusForMonitor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(1),
  closeRedisConnections: vi.fn(),
  getRedisClient: vi.fn(),
  createRedisConnection: vi.fn(),
}));

vi.mock("../src/queues/notification.queue.js", () => ({
  getNotificationQueue: () => ({ add: queueAdd }),
  notificationJobId: (deliveryId: string, generation: number) => `${deliveryId}_${generation}`,
  closeNotificationQueue: vi.fn(),
}));

vi.mock("../src/lib/email/email.service.js", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true, responseCode: 200, durationMs: 5 }),
}));

const workspaceStores = bindWorkspaceModels();
const stores = {
  users: bindMemoryModel(User),
  incidents: bindMemoryModel(Incident),
  timeline: bindMemoryModel(IncidentTimeline),
  monitors: bindMemoryModel(Monitor),
  prefs: bindMemoryModel(NotificationPreferences),
  integrations: bindMemoryModel(NotificationIntegration),
  outbox: bindMemoryModel(NotificationOutbox, { uniqueKeys: ["eventId"] }),
  deliveries: bindMemoryModel(NotificationDelivery, { uniqueKeys: ["deliveryKey"] }),
};
const emailMock = vi.mocked(sendNotificationEmail);

const ids = {
  owner: new Types.ObjectId(),
  admin: new Types.ObjectId(),
  member: new Types.ObjectId(),
  viewer: new Types.ObjectId(),
  quiet: new Types.ObjectId(),
  unverified: new Types.ObjectId(),
  removed: new Types.ObjectId(),
  outsider: new Types.ObjectId(),
};
const workspaceId = new Types.ObjectId();
const otherWorkspaceId = new Types.ObjectId();
const monitorId = new Types.ObjectId();
const incidentId = new Types.ObjectId();

const addUser = (id: Types.ObjectId, name: string, verified = true) =>
  stores.users.docs.push({
    _id: id,
    name,
    email: `${name.toLowerCase()}@example.com`,
    emailVerifiedAt: verified ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const seedIncident = (overrides: Record<string, unknown> = {}) =>
  stores.incidents.docs.push({
    _id: incidentId,
    workspaceId,
    userId: ids.owner,
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

const seedIntegration = (overrides: Record<string, unknown> = {}) => {
  const id = new Types.ObjectId();
  stores.integrations.docs.push({
    _id: id,
    workspaceId,
    userId: ids.admin,
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

const dispatchOpened = async () => {
  const eventId = await persistOutboxEvent("incident.opened", String(incidentId));
  await dispatchOutboxEvent(eventId as string);
  return eventId as string;
};

const recipients = () =>
  stores.deliveries.docs
    .filter((delivery) => delivery.channel === "email")
    .map((delivery) => String(delivery.userId))
    .sort();

beforeEach(() => {
  Object.values(stores).forEach((store) => store.reset());
  resetWorkspaceModels(workspaceStores);
  queueAdd.mockReset();
  queueAdd.mockResolvedValue({ id: "job" });
  emailMock.mockClear();
  emailMock.mockResolvedValue({ ok: true, responseCode: 200, durationMs: 5 });
  seedWorkspace(workspaceStores, {
    id: workspaceId,
    ownerId: ids.owner,
    members: [
      { userId: ids.admin, role: "admin" },
      { userId: ids.member, role: "member" },
      { userId: ids.viewer, role: "viewer" },
      { userId: ids.quiet, role: "member" },
      { userId: ids.unverified, role: "member" },
    ],
  });
  workspaceStores.members.docs.push({
    _id: new Types.ObjectId(),
    workspaceId,
    userId: ids.removed,
    role: "member",
    status: "removed",
    joinedAt: new Date(),
  });
  seedWorkspace(workspaceStores, { id: otherWorkspaceId, ownerId: ids.outsider });
  addUser(ids.owner, "Owner");
  addUser(ids.admin, "Admin");
  addUser(ids.member, "Member");
  addUser(ids.viewer, "Viewer");
  addUser(ids.quiet, "Quiet");
  addUser(ids.unverified, "Unverified", false);
  addUser(ids.removed, "Removed");
  addUser(ids.outsider, "Outsider");
  stores.monitors.docs.push({
    _id: monitorId,
    workspaceId,
    userId: ids.owner,
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
  stores.prefs.docs.push({
    _id: new Types.ObjectId(),
    workspaceId,
    userId: ids.quiet,
    enabled: false,
  });
});

describe("team email dispatch", () => {
  it("emails every active, verified member who has alerts on, and nobody else", async () => {
    seedIncident();
    await dispatchOpened();
    expect(recipients()).toEqual([ids.owner, ids.admin, ids.member, ids.viewer].map(String).sort());
    expect(
      stores.deliveries.docs.every(
        (delivery) => String(delivery.workspaceId) === String(workspaceId),
      ),
    ).toBe(true);
    expect(stores.outbox.docs[0]).toMatchObject({ status: "processed" });
    expect(String(stores.outbox.docs[0]?.workspaceId)).toBe(String(workspaceId));
  });

  it("never sends to removed members, unverified members or members who turned alerts off", async () => {
    seedIncident();
    await dispatchOpened();
    const sent = recipients();
    for (const excluded of [ids.removed, ids.unverified, ids.quiet, ids.outsider]) {
      expect(sent).not.toContain(String(excluded));
    }
  });

  it("uses each member's own event preferences", async () => {
    stores.prefs.docs.push({
      _id: new Types.ObjectId(),
      workspaceId,
      userId: ids.member,
      events: { opened: false },
    });
    seedIncident();
    await dispatchOpened();
    expect(recipients()).not.toContain(String(ids.member));
    expect(recipients()).toContain(String(ids.admin));
  });

  it("keeps preferences separate per workspace", async () => {
    stores.prefs.docs.push({
      _id: new Types.ObjectId(),
      workspaceId: otherWorkspaceId,
      userId: ids.member,
      enabled: false,
    });
    seedIncident();
    await dispatchOpened();
    expect(recipients()).toContain(String(ids.member));
  });

  it("creates one delivery per recipient and does not duplicate on repeat dispatch", async () => {
    seedIncident();
    const eventId = await dispatchOpened();
    const first = stores.deliveries.docs.length;
    const entry = stores.outbox.docs[0] as Record<string, unknown>;
    entry.status = "processing";
    entry.lockedUntil = new Date(Date.now() - 1000);
    await dispatchOutboxEvent(eventId);
    expect(stores.deliveries.docs).toHaveLength(first);
    const keys = new Set(stores.deliveries.docs.map((delivery) => delivery.deliveryKey));
    expect(keys.size).toBe(first);
    expect(keys.has(buildDeliveryKey(eventId, "email", undefined, String(ids.admin)))).toBe(true);
  });

  it("fires a shared integration once per event regardless of member count", async () => {
    seedIncident();
    const integrationId = seedIntegration();
    seedIntegration({
      name: "Other workspace",
      workspaceId: otherWorkspaceId,
      userId: ids.outsider,
    });
    await dispatchOpened();
    const slack = stores.deliveries.docs.filter((delivery) => delivery.channel === "slack");
    expect(slack).toHaveLength(1);
    expect(String(slack[0]?.integrationId)).toBe(String(integrationId));
    expect(String(slack[0]?.userId)).toBe(String(ids.admin));
  });

  it("still notifies the shared integration when every member turned email alerts off", async () => {
    for (const userId of [ids.owner, ids.admin, ids.member, ids.viewer]) {
      stores.prefs.docs.push({ _id: new Types.ObjectId(), workspaceId, userId, enabled: false });
    }
    seedIncident();
    seedIntegration();
    await dispatchOpened();
    expect(recipients()).toEqual([]);
    expect(stores.deliveries.docs.map((delivery) => delivery.channel)).toEqual(["slack"]);
  });

  it("does not notify another workspace's members for this incident", async () => {
    seedIncident();
    seedWorkspace(workspaceStores, { ownerId: ids.outsider });
    await dispatchOpened();
    expect(recipients()).not.toContain(String(ids.outsider));
  });

  it("skips incidents that have no workspace instead of guessing one", async () => {
    seedIncident({ workspaceId: undefined });
    const eventId = await persistOutboxEvent("incident.opened", String(incidentId));
    expect(eventId).toBeNull();
    expect(stores.outbox.docs).toHaveLength(0);
  });
});

describe("send-time authorization", () => {
  const emailDelivery = (userId: Types.ObjectId, overrides: Record<string, unknown> = {}) =>
    ({
      _id: new Types.ObjectId(),
      workspaceId,
      userId,
      channel: "email",
      eventType: "incident.opened",
      eventId: "incident.opened:x",
      snapshot: null,
      ...overrides,
    }) as unknown as INotificationDelivery;

  it("sends to a member who is still active", async () => {
    const result = await sendDelivery(
      emailDelivery(ids.member, { eventType: "notification.test" }),
    );
    expect(result.ok).toBe(true);
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(emailMock.mock.calls[0]?.[0].to).toBe("member@example.com");
  });

  it("refuses to send to a member removed after the job was queued", async () => {
    const result = await sendDelivery(
      emailDelivery(ids.removed, { eventType: "notification.test" }),
    );
    expect(result).toMatchObject({
      ok: false,
      category: "SUBSCRIPTION_INACTIVE",
      transient: false,
    });
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("refuses to send to a user who was never a member of the delivery's workspace", async () => {
    const result = await sendDelivery(
      emailDelivery(ids.outsider, { eventType: "notification.test" }),
    );
    expect(result).toMatchObject({ ok: false, category: "SUBSCRIPTION_INACTIVE" });
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("does not load an integration that belongs to a different workspace", async () => {
    const foreign = seedIntegration({
      workspaceId: otherWorkspaceId,
      userId: ids.outsider,
    });
    const result = await sendDelivery(
      emailDelivery(ids.admin, { channel: "slack", integrationId: foreign }),
    );
    expect(result).toMatchObject({
      ok: false,
      category: "INTEGRATION_UNAVAILABLE",
      transient: false,
    });
  });
});
