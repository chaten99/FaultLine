import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import {
  maintenanceSchema,
  isMaintenanceActive,
  matchingMaintenance,
} from "../src/modules/maintenance/maintenance.service.js";
import {
  suppressForMaintenance,
  notifyAfterMaintenance,
  suppressQueuedNotification,
} from "../src/modules/maintenance/maintenance-notifications.service.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { IncidentTimeline } from "../src/modules/incidents/incident-timeline.model.js";
import {
  NotificationOutbox,
  type INotificationOutbox,
} from "../src/modules/notifications/notification-outbox.model.js";
import { NotificationDelivery } from "../src/modules/notifications/notification-delivery.model.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import { User } from "../src/modules/auth/user.model.js";
import { processMonitorCheckJob } from "../src/workers/monitor-check.worker.js";
import { processDelivery } from "../src/modules/notifications/notification-delivery.service.js";
import { executeMonitorHttpCheck } from "../src/modules/monitors/monitor-executor.service.js";
import { sendDelivery } from "../src/modules/notifications/notification-sender.service.js";
import { bindMemoryModel } from "./helpers/memory-model.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
  workspaceHeaders,
} from "./helpers/workspace-fixtures.js";
import type { Job } from "bullmq";
import type { MonitorCheckJobData } from "../src/queues/monitor-check.queue.js";
vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(true),
  publishDomainEvent: vi.fn().mockResolvedValue(undefined),
  createRedisConnection: vi.fn(),
}));
vi.mock("../src/modules/notifications/notification-sender.service.js", () => ({
  sendDelivery: vi.fn().mockResolvedValue({ ok: true, responseCode: 200, durationMs: 1 }),
}));
vi.mock("../src/modules/monitors/monitor-executor.service.js", async (original) => ({
  ...(await original<typeof import("../src/modules/monitors/monitor-executor.service.js")>()),
  executeMonitorHttpCheck: vi.fn().mockResolvedValue({
    success: false,
    durationMs: 10,
    statusCode: 503,
    failureCategory: "UNEXPECTED_STATUS",
    errorMessage: "Unexpected status.",
  }),
}));
vi.mock("../src/queues/notification.queue.js", () => ({
  getNotificationQueue: () => ({ add: vi.fn() }),
  notificationJobId: vi.fn(),
}));
vi.mock("../src/modules/status-pages/status-page-realtime.service.js", () => ({
  publishPublicIncidentUpdates: vi.fn(),
  publishPublicStatusForMonitor: vi.fn(),
}));
const workspaces = bindWorkspaceModels();
const stores = {
  monitors: bindMemoryModel(Monitor),
  incidents: bindMemoryModel(Incident),
  timeline: bindMemoryModel(IncidentTimeline),
  outbox: bindMemoryModel(NotificationOutbox, { uniqueKeys: ["eventId"] }),
  deliveries: bindMemoryModel(NotificationDelivery),
  checks: bindMemoryModel(MonitorCheck),
  users: bindMemoryModel(User),
};
const owner = new Types.ObjectId(),
  viewer = new Types.ObjectId(),
  workspace = new Types.ObjectId(),
  monitorId = new Types.ObjectId(),
  otherMonitorId = new Types.ObjectId();
const headers = (user = owner) => workspaceHeaders(createAccessToken(String(user)), workspace);
const payload = {
  title: "Release",
  description: "Deploying",
  monitorIds: [String(monitorId)],
  startAt: "2026-11-17T10:00:00Z",
  endAt: "2026-11-17T12:00:00Z",
  timezone: "Asia/Kolkata",
  recurrence: "once",
  enabled: true,
  notifyDuring: false,
  notifyAfter: true,
};
beforeEach(() => {
  resetWorkspaceModels(workspaces);
  Object.values(stores).forEach((s) => s.reset());
  seedWorkspace(workspaces, {
    id: workspace,
    ownerId: owner,
    members: [{ userId: viewer, role: "viewer" }],
  });
  stores.monitors.docs.push({
    _id: monitorId,
    userId: owner,
    workspaceId: workspace,
    name: "API",
    url: "https://example.com",
    method: "GET",
    timeoutMs: 1000,
    expectedStatusCodes: [200],
    active: true,
    configRevision: 1,
    failureThreshold: 1,
    recoveryThreshold: 1,
    intervalSeconds: 60,
  });
  vi.mocked(sendDelivery).mockClear();
});
describe("maintenance ranges and weekly local times", () => {
  it("validates explicit instants, IANA timezones and bounded ranges", () => {
    expect(maintenanceSchema.safeParse(payload).success).toBe(true);
    for (const patch of [
      { endAt: payload.startAt },
      { endAt: "2026-11-16T10:00:00Z" },
      { startAt: "2026-11-17T10:00:00" },
      { timezone: "Invalid/Zone" },
      { endAt: "2026-12-17T12:00:00Z" },
    ])
      expect(maintenanceSchema.safeParse({ ...payload, ...patch }).success).toBe(false);
  });
  it("uses inclusive start and exclusive end", () => {
    expect(isMaintenanceActive(payload, new Date(payload.startAt))).toBe(true);
    expect(isMaintenanceActive(payload, new Date(payload.endAt))).toBe(false);
    expect(isMaintenanceActive({ ...payload, enabled: false }, new Date(payload.startAt))).toBe(
      false,
    );
  });
  it("keeps weekly wall time through spring daylight saving", () => {
    const w = {
      startAt: "2026-03-01T14:00:00Z",
      endAt: "2026-03-01T15:00:00Z",
      timezone: "America/New_York",
      recurrence: "weekly",
      enabled: true,
    };
    expect(isMaintenanceActive(w, new Date("2026-03-08T13:30:00Z"))).toBe(true);
    expect(isMaintenanceActive(w, new Date("2026-03-08T14:30:00Z"))).toBe(false);
    expect(isMaintenanceActive(w, new Date("2026-02-22T14:30:00Z"))).toBe(false);
  });
  it("includes both repeated fall clock hours and handles overnight recurrence", () => {
    const w = {
      startAt: "2026-10-25T05:00:00Z",
      endAt: "2026-10-25T07:00:00Z",
      timezone: "America/New_York",
      recurrence: "weekly",
      enabled: true,
    };
    expect(isMaintenanceActive(w, new Date("2026-11-01T05:30:00Z"))).toBe(true);
    expect(isMaintenanceActive(w, new Date("2026-11-01T06:30:00Z"))).toBe(true);
    const overnight = {
      ...w,
      timezone: "UTC",
      startAt: "2026-11-01T23:00:00Z",
      endAt: "2026-11-02T01:00:00Z",
    };
    expect(isMaintenanceActive(overnight, new Date("2026-11-09T00:30:00Z"))).toBe(true);
  });
});
describe("workspace maintenance API", () => {
  it("requires authentication and write permission", async () => {
    await request(app).get("/api/maintenance-windows").expect(401);
    await request(app)
      .post("/api/maintenance-windows")
      .set(headers(viewer))
      .send(payload)
      .expect(403);
    await request(app).get("/api/maintenance-windows").set(headers(viewer)).expect(200);
  });
  it("creates, edits, disables and cancels a window", async () => {
    const created = await request(app)
      .post("/api/maintenance-windows")
      .set(headers())
      .send(payload)
      .expect(201);
    expect(created.body.workspaceId).toBe(String(workspace));
    const edited = await request(app)
      .patch("/api/maintenance-windows/" + created.body._id)
      .set(headers())
      .send({ ...payload, title: "Revised", enabled: false })
      .expect(200);
    expect(edited.body.enabled).toBe(false);
    await request(app)
      .delete("/api/maintenance-windows/" + created.body._id)
      .set(headers())
      .expect(204);
    expect(workspaces.maintenance.docs).toHaveLength(0);
  });
  it("rejects cross-workspace monitors and windows", async () => {
    await request(app)
      .post("/api/maintenance-windows")
      .set(headers())
      .send({ ...payload, monitorIds: [String(otherMonitorId)] })
      .expect(400);
    const other = new Types.ObjectId();
    workspaces.maintenance.docs.push({ _id: other, workspaceId: new Types.ObjectId(), ...payload });
    await request(app)
      .patch("/api/maintenance-windows/" + other)
      .set(headers())
      .send(payload)
      .expect(404);
  });
  it("matches workspace-wide and per-monitor scopes without crossing workspaces", async () => {
    const startAt = new Date(Date.now() - 10000),
      endAt = new Date(Date.now() + 60000);
    for (const [scope, ws] of [
      [[], workspace],
      [[monitorId], workspace],
      [[otherMonitorId], workspace],
      [[], new Types.ObjectId()],
    ] as const)
      workspaces.maintenance.docs.push({
        _id: new Types.ObjectId(),
        ...payload,
        workspaceId: ws,
        monitorIds: [...scope],
        startAt,
        endAt,
      });
    expect(await matchingMaintenance(String(workspace), String(monitorId))).toHaveLength(2);
  });
});
const activeWindow = (extra: Record<string, unknown> = {}) =>
  workspaces.maintenance.docs.push({
    _id: new Types.ObjectId(),
    ...payload,
    workspaceId: workspace,
    monitorIds: [monitorId],
    startAt: new Date(Date.now() - 60000),
    endAt: new Date(Date.now() + 60000),
    ...extra,
  });
const seedEvent = () => {
  const incidentId = new Types.ObjectId();
  stores.incidents.docs.push({
    _id: incidentId,
    workspaceId: workspace,
    userId: owner,
    monitorId,
    status: "open",
    title: "API failure",
    openedAt: new Date(),
    firstFailureAt: new Date(),
  });
  const event = {
    _id: new Types.ObjectId(),
    eventId: "incident.opened:" + incidentId,
    type: "incident.opened",
    workspaceId: workspace,
    userId: owner,
    incidentId,
    eventAt: new Date(),
    snapshot: { monitorId: String(monitorId), incidentId: String(incidentId) },
  };
  stores.outbox.docs.push(event);
  return event as INotificationOutbox;
};
describe("maintenance retains evidence and suppresses outbound alerts", () => {
  it("continues real checks, failure history and incident detection", async () => {
    activeWindow();
    await processMonitorCheckJob({
      id: "maintenance-check",
      data: { monitorId: String(monitorId) },
    } as Job<MonitorCheckJobData>);
    expect(executeMonitorHttpCheck).toHaveBeenCalled();
    expect(stores.checks.docs[0]).toMatchObject({
      status: "failure",
      underMaintenance: true,
      statusCode: 503,
      configRevision: 1,
    });
    expect(stores.incidents.docs).toHaveLength(1);
    expect(stores.monitors.docs[0]?.consecutiveFailures).toBe(1);
  });
  it("suppresses by event time and honors explicit notification override", async () => {
    activeWindow();
    const event = seedEvent();
    expect(await suppressForMaintenance(event)).toBe(true);
    expect(stores.outbox.docs[0]).toMatchObject({
      maintenanceSuppressed: true,
      notifyAfterMaintenance: true,
    });
    workspaces.maintenance.docs[0]!.notifyDuring = true;
    expect(await suppressForMaintenance({ ...event, maintenanceSuppressed: false })).toBe(false);
  });
  it("suppresses already queued deliveries at send time", async () => {
    activeWindow();
    const event = seedEvent(),
      deliveryId = new Types.ObjectId();
    stores.deliveries.docs.push({
      _id: deliveryId,
      generation: 0,
      status: "queued",
      kind: "incident",
      eventId: event.eventId,
      workspaceId: workspace,
      snapshot: event.snapshot,
      attempts: 0,
    });
    expect(await processDelivery({ deliveryId: String(deliveryId), generation: 0 })).toMatchObject({
      outcome: "skipped",
    });
    expect(sendDelivery).not.toHaveBeenCalled();
    expect(stores.deliveries.docs[0]?.failureCategory).toBe("MAINTENANCE_SUPPRESSED");
  });
  it("emits one durable post-maintenance alert and survives repeat evaluation/restarts", async () => {
    activeWindow();
    const event = seedEvent();
    await suppressForMaintenance(event);
    workspaces.maintenance.docs[0]!.endAt = new Date(Date.now() - 1000);
    await notifyAfterMaintenance(String(workspace), String(monitorId));
    await notifyAfterMaintenance(String(workspace), String(monitorId));
    expect(
      stores.outbox.docs.filter((e) => String(e.eventId).includes(":after-maintenance:")),
    ).toHaveLength(1);
    expect(stores.outbox.docs[0]?.maintenanceResumed).toBe(true);
  });
  it("does not replay resolved incidents or disabled follow-ups", async () => {
    activeWindow({ notifyAfter: false });
    const event = seedEvent();
    await suppressForMaintenance(event);
    workspaces.maintenance.docs[0]!.endAt = new Date(Date.now() - 1000);
    await notifyAfterMaintenance(String(workspace), String(monitorId));
    expect(stores.outbox.docs).toHaveLength(1);
    stores.outbox.docs[0]!.notifyAfterMaintenance = true;
    stores.incidents.docs[0]!.status = "resolved";
    await notifyAfterMaintenance(String(workspace), String(monitorId));
    expect(stores.outbox.docs).toHaveLength(1);
  });
  it("marks a queued event for follow-up without creating a second notification engine", async () => {
    activeWindow();
    const event = seedEvent();
    expect(
      await suppressQueuedNotification(String(workspace), String(monitorId), event.eventId),
    ).toBe(true);
    expect(stores.outbox.docs[0]?.maintenanceSuppressed).toBe(true);
  });
});
