import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { StatusPageService } from "../src/modules/status-pages/status-page-service.model.js";
import { PublicStatusPage } from "../src/modules/status-pages/status-page.model.js";
import {
  publishPageUnpublished,
  publishPublicIncidentUpdates,
  publishPublicStatusForMonitor,
} from "../src/modules/status-pages/status-page-realtime.service.js";
import { invalidateStatusCache } from "../src/modules/status-pages/status-page-snapshot.service.js";
import {
  handlePublicSubscribe,
  publicRoom,
  registerPublicNamespace,
  routePublicEvent,
} from "../src/realtime/public-realtime.js";
import { bindMemoryModel } from "./helpers/memory-model.js";

const published = vi.hoisted(() => ({
  events: [] as Array<{ type: string; payload: Record<string, unknown> }>,
}));

vi.mock("../src/lib/redis/redis.service.js", () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  publishDomainEvent: vi.fn(async (type: string, payload: Record<string, unknown>) => {
    published.events.push({ type, payload });
  }),
  getRedisClient: vi.fn(),
  createRedisConnection: vi.fn(),
  closeRedisConnections: vi.fn(),
}));

const monitors = bindMemoryModel(Monitor);
const checks = bindMemoryModel(MonitorCheck);
const incidents = bindMemoryModel(Incident);
const pages = bindMemoryModel(PublicStatusPage, { uniqueKeys: ["slug"] });
const services = bindMemoryModel(StatusPageService);

const owner = new Types.ObjectId();
const monitorId = new Types.ObjectId();
const incidentId = new Types.ObjectId();
const livePage = new Types.ObjectId();
const draftPage = new Types.ObjectId();

const addPage = (id: Types.ObjectId, slug: string, status: string) =>
  pages.docs.push({
    _id: id,
    ownerId: owner,
    name: `Page ${slug}`,
    slug,
    status,
    subscribersEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const addService = (pageId: Types.ObjectId, name: string) =>
  services.docs.push({
    _id: new Types.ObjectId(),
    pageId,
    ownerId: owner,
    name,
    description: "",
    monitorIds: [monitorId],
    order: 0,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const fakeSocket = (rooms: string[] = ["socket-id"]) => ({
  rooms: new Set(rooms),
  data: {} as Record<string, unknown>,
  join: vi.fn(async function (this: unknown, room: string) {
    void room;
  }),
  leave: vi.fn(async () => undefined),
});

beforeEach(() => {
  [monitors, checks, incidents, pages, services].forEach((store) => store.reset());
  published.events.length = 0;
  invalidateStatusCache();
  monitors.docs.push({
    _id: monitorId,
    userId: owner,
    name: "Internal Checkout Monitor",
    url: "https://secret.internal.example/health?token=SECRET",
    active: true,
    intervalSeconds: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  incidents.docs.push({
    _id: incidentId,
    userId: owner,
    monitorId,
    title: "Incident on Internal Checkout Monitor: UNEXPECTED_STATUS",
    status: "open",
    firstFailureAt: new Date(Date.now() - 300_000),
    openedAt: new Date(Date.now() - 200_000),
    resolutionReason: "Internal note",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  addPage(livePage, "live-page", "published");
  addPage(draftPage, "draft-page", "draft");
  addService(livePage, "Public API");
  addService(draftPage, "Draft Service");
});

describe("public socket subscriptions", () => {
  it("lets a visitor join only the room of a published page", async () => {
    const socket = fakeSocket();
    const ack = vi.fn();
    expect(await handlePublicSubscribe(socket as never, { slug: "live-page" }, ack)).toBe(true);
    expect(socket.join).toHaveBeenCalledWith(publicRoom(String(livePage)));
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it("rejects unpublished, draft, unknown and malformed slugs without joining anything", async () => {
    pages.docs.push({
      _id: new Types.ObjectId(),
      ownerId: owner,
      name: "Old",
      slug: "old-page",
      status: "unpublished",
    });
    for (const payload of [
      { slug: "draft-page" },
      { slug: "old-page" },
      { slug: "unknown-page" },
      { slug: "Bad_Slug" },
      { slug: 123 },
      { slug: { $ne: null } },
      {},
      null,
      "live-page",
    ]) {
      const socket = fakeSocket();
      const ack = vi.fn();
      expect(
        await handlePublicSubscribe(socket as never, payload, ack),
        JSON.stringify(payload),
      ).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({ ok: false });
    }
  });

  it("works without an ack callback", async () => {
    const socket = fakeSocket();
    await expect(handlePublicSubscribe(socket as never, { slug: "live-page" })).resolves.toBe(true);
  });

  it("moves a socket between pages instead of keeping both rooms", async () => {
    const other = new Types.ObjectId();
    addPage(other, "second-page", "published");
    const socket = fakeSocket(["socket-id", `page:${String(livePage)}`]);
    await handlePublicSubscribe(socket as never, { slug: "second-page" });
    expect(socket.leave).toHaveBeenCalledWith(`page:${String(livePage)}`);
    expect(socket.join).toHaveBeenCalledWith(publicRoom(String(other)));
  });

  it("limits repeated subscription attempts on one connection", async () => {
    const socket = fakeSocket();
    const results = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      results.push(await handlePublicSubscribe(socket as never, { slug: "live-page" }));
    }
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results.slice(10)).toEqual([false, false]);
  });

  it("allows a reconnecting client to subscribe again", async () => {
    const first = fakeSocket();
    await handlePublicSubscribe(first as never, { slug: "live-page" });
    const reconnected = fakeSocket();
    expect(await handlePublicSubscribe(reconnected as never, { slug: "live-page" })).toBe(true);
    expect(reconnected.join).toHaveBeenCalledWith(publicRoom(String(livePage)));
  });

  it("registers subscribe and unsubscribe handlers on the namespace", async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const socket = {
      ...fakeSocket(["socket-id", `page:${String(livePage)}`]),
      on: (event: string, handler: (...args: unknown[]) => unknown) => handlers.set(event, handler),
    };
    let connection: ((socket: unknown) => void) | undefined;
    registerPublicNamespace({
      on: (_event: string, handler: (socket: unknown) => void) => {
        connection = handler;
      },
    } as never);
    connection?.(socket);
    const ack = vi.fn();
    handlers.get("subscribe")?.({ slug: "live-page" }, ack);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ ok: true }));
    await handlers.get("unsubscribe")?.();
    expect(socket.leave).toHaveBeenCalledWith(`page:${String(livePage)}`);
  });
});

describe("routing domain events to public rooms", () => {
  const namespace = () => {
    const emit = vi.fn();
    const socketsLeave = vi.fn();
    return {
      emit,
      socketsLeave,
      ns: {
        to: vi.fn(() => ({ emit })),
        in: vi.fn(() => ({ socketsLeave })),
      },
    };
  };

  it("emits public events only to the matching page room", () => {
    const { ns, emit } = namespace();
    const pageId = String(livePage);
    expect(
      routePublicEvent(ns as never, {
        type: "public.status.updated",
        pageId,
        payload: { overall: "operational" },
      }),
    ).toBe(true);
    expect(ns.to).toHaveBeenCalledWith(`page:${pageId}`);
    expect(emit).toHaveBeenCalledWith("public.status.updated", { overall: "operational" });
  });

  it("ignores non-public events so private events never reach public sockets", () => {
    const { ns, emit } = namespace();
    for (const type of [
      "incident.created",
      "monitor.check.completed",
      "notification.delivery_updated",
    ]) {
      expect(
        routePublicEvent(ns as never, {
          type,
          userId: String(owner),
          pageId: String(livePage),
          payload: { monitorName: "Internal" },
        }),
      ).toBe(false);
    }
    expect(emit).not.toHaveBeenCalled();
  });

  it("drops public events with missing or malformed page ids", () => {
    const { ns, emit } = namespace();
    expect(routePublicEvent(ns as never, { type: "public.status.updated", payload: {} })).toBe(
      true,
    );
    expect(
      routePublicEvent(ns as never, {
        type: "public.status.updated",
        pageId: "../etc",
        payload: {},
      }),
    ).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it("removes sockets from the room when a page is unpublished", () => {
    const { ns, emit, socketsLeave } = namespace();
    const pageId = String(livePage);
    routePublicEvent(ns as never, { type: "public.page.unpublished", pageId, payload: {} });
    expect(emit).toHaveBeenCalledWith("public.page.unpublished", {});
    expect(socketsLeave).toHaveBeenCalledWith(`page:${pageId}`);
  });
});

describe("publishing public updates after persisted incident changes", () => {
  const forbidden = [
    "SECRET",
    "secret.internal",
    "Internal Checkout",
    "Internal note",
    "UNEXPECTED_STATUS",
    "ownerId",
    "userId",
    String(owner),
    String(monitorId),
    "monitorId",
    "resolutionReason",
  ];

  it("publishes a public-safe incident and status event for published pages only", async () => {
    await publishPublicIncidentUpdates({
      ownerId: String(owner),
      monitorId: String(monitorId),
      incidentId: String(incidentId),
      eventType: "incident.opened",
    });
    const types = published.events.map((event) => event.type);
    expect(types).toEqual(["public.incident.created", "public.status.updated"]);
    for (const event of published.events) {
      expect(event.payload.pageId).toBe(String(livePage));
      const serialized = JSON.stringify(event.payload);
      for (const secret of forbidden) expect(serialized, secret).not.toContain(secret);
    }
    expect(published.events[0]?.payload.payload).toMatchObject({
      id: String(incidentId),
      title: "Service disruption: Public API",
      status: "investigating",
      ongoing: true,
    });
    expect(published.events[1]?.payload.payload).toMatchObject({
      overall: "major_outage",
    });
    expect(published.events.some((event) => event.payload.pageId === String(draftPage))).toBe(
      false,
    );
  });

  it("maps acknowledgement and resolution to update and resolved events", async () => {
    const incident = incidents.docs[0] as Record<string, unknown>;
    incident.status = "acknowledged";
    incident.acknowledgedAt = new Date();
    await publishPublicIncidentUpdates({
      ownerId: String(owner),
      monitorId: String(monitorId),
      incidentId: String(incidentId),
      eventType: "incident.acknowledged",
    });
    incident.status = "resolved";
    incident.resolvedAt = new Date();
    await publishPublicIncidentUpdates({
      ownerId: String(owner),
      monitorId: String(monitorId),
      incidentId: String(incidentId),
      eventType: "incident.resolved",
    });
    expect(published.events.map((event) => event.type)).toEqual([
      "public.incident.updated",
      "public.status.updated",
      "public.incident.resolved",
      "public.status.updated",
    ]);
    expect(published.events[2]?.payload.payload).toMatchObject({
      status: "resolved",
      ongoing: false,
    });
  });

  it("publishes nothing when no published page includes the monitor", async () => {
    pages.docs[0]!.status = "unpublished";
    await publishPublicIncidentUpdates({
      ownerId: String(owner),
      monitorId: String(monitorId),
      incidentId: String(incidentId),
      eventType: "incident.opened",
    });
    expect(published.events).toHaveLength(0);
    await publishPublicIncidentUpdates({
      ownerId: String(new Types.ObjectId()),
      monitorId: String(monitorId),
      incidentId: String(incidentId),
      eventType: "incident.opened",
    });
    expect(published.events).toHaveLength(0);
  });

  it("publishes a refreshed status when a monitor is paused or resumed", async () => {
    incidents.docs.length = 0;
    (monitors.docs[0] as Record<string, unknown>).active = false;
    await publishPublicStatusForMonitor(String(owner), String(monitorId));
    expect(published.events).toHaveLength(1);
    expect(published.events[0]?.type).toBe("public.status.updated");
    const status = published.events[0]?.payload.payload as {
      overall: string;
      services: Array<{ monitorCounts: { paused: number } }>;
    };
    expect(status.overall).toBe("unknown");
    expect(status.services[0]?.monitorCounts.paused).toBe(1);
  });

  it("announces unpublishing to the page room only", async () => {
    await publishPageUnpublished(String(livePage));
    expect(published.events).toEqual([
      { type: "public.page.unpublished", payload: { pageId: String(livePage), payload: {} } },
    ]);
  });
});
