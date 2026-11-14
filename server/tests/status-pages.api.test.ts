import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/modules/auth/auth-token.service.js";
import { MonitorCheck } from "../src/modules/checks/monitor-check.model.js";
import { Incident } from "../src/modules/incidents/incident.model.js";
import { Monitor } from "../src/modules/monitors/monitor.model.js";
import { StatusPageDelivery } from "../src/modules/status-pages/status-page-delivery.model.js";
import { StatusPageService } from "../src/modules/status-pages/status-page-service.model.js";
import { StatusPageSubscriber } from "../src/modules/status-pages/status-page-subscriber.model.js";
import { PublicStatusPage } from "../src/modules/status-pages/status-page.model.js";
import { invalidateStatusCache } from "../src/modules/status-pages/status-page-snapshot.service.js";
import { bindMemoryModel } from "./helpers/memory-model.js";
import {
  bindWorkspaceModels,
  resetWorkspaceModels,
  seedWorkspace,
  workspaceHeaders,
} from "./helpers/workspace-fixtures.js";

const redisState = vi.hoisted(() => {
  const counts = new Map<string, number>();
  return {
    counts,
    published: [] as Array<{ type: string; payload: Record<string, unknown> }>,
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
  publishDomainEvent: vi.fn(async (type: string, payload: Record<string, unknown>) => {
    redisState.published.push({ type, payload });
  }),
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
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true, responseCode: 200, durationMs: 5 }),
}));

vi.mock("../src/modules/analytics/analytics.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/modules/analytics/analytics.service.js")>()),
  getScopedAvailability: vi.fn(async (_user: string, ids: string[]) => ({
    window: {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
      bucketSeconds: 900,
    },
    availability:
      ids.length > 0
        ? { percent: 99.5, state: "ok", eligibleMs: 1000, knownMs: 1000 }
        : { percent: null, state: "insufficient", eligibleMs: 0, knownMs: 0 },
    timeline: [
      {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:15:00.000Z",
        state: "up",
      },
    ],
  })),
}));

const monitors = bindMemoryModel(Monitor);
const checks = bindMemoryModel(MonitorCheck);
const incidents = bindMemoryModel(Incident);
const pages = bindMemoryModel(PublicStatusPage, { uniqueKeys: ["slug"] });
const services = bindMemoryModel(StatusPageService);
const subscribers = bindMemoryModel(StatusPageSubscriber);
const deliveries = bindMemoryModel(StatusPageDelivery);
const workspaceStores = bindWorkspaceModels();

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();
const userViewer = new Types.ObjectId();
const userMember = new Types.ObjectId();
const wsA = new Types.ObjectId();
const wsB = new Types.ObjectId();
const tokenA = createAccessToken(String(userA));
const tokenB = createAccessToken(String(userB));
const tokenViewer = createAccessToken(String(userViewer));
const tokenMember = createAccessToken(String(userMember));
const auth = (token: string) => workspaceHeaders(token, token === tokenB ? wsB : wsA);

const ids = {
  api: new Types.ObjectId(),
  web: new Types.ObjectId(),
  foreign: new Types.ObjectId(),
};

const addMonitor = (id: Types.ObjectId, owner: Types.ObjectId, name: string, extra = {}) =>
  monitors.docs.push({
    _id: id,
    workspaceId: owner === userB ? wsB : wsA,
    userId: owner,
    name,
    url: `https://${name.toLowerCase()}.acme.test/health?token=SECRET_${name}`,
    active: true,
    intervalSeconds: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  });

const addCheck = (monitorId: Types.ObjectId, ageMs = 30_000, status = "success") =>
  checks.docs.push({
    _id: new Types.ObjectId(),
    monitorId,
    userId: userA,
    runId: `run-${String(monitorId)}-${checks.docs.length}`,
    status,
    completedAt: new Date(Date.now() - ageMs),
    failureCategory: status === "success" ? undefined : "UNEXPECTED_STATUS",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const addIncident = (monitorId: Types.ObjectId, overrides: Record<string, unknown> = {}) => {
  const _id = new Types.ObjectId();
  incidents.docs.push({
    _id,
    workspaceId: wsA,
    userId: userA,
    monitorId,
    title: "Incident on Internal Checkout: UNEXPECTED_STATUS",
    status: "open",
    firstFailureAt: new Date(Date.now() - 600_000),
    openedAt: new Date(Date.now() - 500_000),
    resolutionReason: "Internal note: database failover",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return String(_id);
};

const createPage = async (token = tokenA, body: Record<string, unknown> = {}) => {
  const response = await request(app)
    .post("/api/status-pages")
    .set(auth(token))
    .send({ name: "Acme Status", slug: "acme-status", ...body });
  return response;
};

const addService = (pageId: string, body: Record<string, unknown>, token = tokenA) =>
  request(app).post(`/api/status-pages/${pageId}/services`).set(auth(token)).send(body);

const publishedPage = async (serviceBody?: Record<string, unknown>) => {
  const page = (await createPage()).body.page;
  await addService(page.id, serviceBody ?? { name: "Public API", monitorIds: [String(ids.api)] });
  await request(app).post(`/api/status-pages/${page.id}/publish`).set(auth(tokenA)).expect(200);
  return page.id as string;
};

beforeEach(() => {
  [monitors, checks, incidents, pages, services, subscribers, deliveries].forEach((store) =>
    store.reset(),
  );
  resetWorkspaceModels(workspaceStores);
  seedWorkspace(workspaceStores, {
    ownerId: userA,
    id: wsA,
    members: [
      { userId: userViewer, role: "viewer" },
      { userId: userMember, role: "member" },
    ],
  });
  seedWorkspace(workspaceStores, { ownerId: userB, id: wsB });
  redisState.counts.clear();
  redisState.published.length = 0;
  invalidateStatusCache();
  addMonitor(ids.api, userA, "Api");
  addMonitor(ids.web, userA, "Web");
  addMonitor(ids.foreign, userB, "Foreign");
  addCheck(ids.api);
  addCheck(ids.web);
});

describe("authentication", () => {
  it.each([
    ["get", "/api/status-pages"],
    ["post", "/api/status-pages"],
    ["get", `/api/status-pages/${new Types.ObjectId()}`],
    ["post", `/api/status-pages/${new Types.ObjectId()}/preview`],
    ["get", "/api/status-pages/monitor-options"],
  ] as const)("requires a session for %s %s", async (method, path) => {
    await request(app)[method](path).expect(401);
  });
});

describe("status page management", () => {
  it("creates a draft page with the configured public URL", async () => {
    const response = await createPage(tokenA, {
      description: "Our services",
      branding: { companyName: "Acme", logoUrl: "https://cdn.acme.test/logo.png" },
    }).then((res) => {
      expect(res.status).toBe(201);
      return res;
    });
    expect(response.body.page).toMatchObject({
      name: "Acme Status",
      slug: "acme-status",
      status: "draft",
      publicUrl: "https://app.faultline.test/status/acme-status",
      serviceCount: 0,
      overallStatus: "unknown",
      branding: { companyName: "Acme", logoUrl: "https://cdn.acme.test/logo.png" },
      subscribersEnabled: true,
      publishedAt: null,
    });
    expect(response.body.page).not.toHaveProperty("ownerId");
    expect(response.body.page).not.toHaveProperty("workspaceId");
  });

  it("validates names, slugs, markup and logo URLs", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ slug: "Bad_Slug" }, "slug"],
      [{ slug: "-leading" }, "slug"],
      [{ slug: "trailing-" }, "slug"],
      [{ slug: "double--hyphen" }, "slug"],
      [{ slug: "ab" }, "slug"],
      [{ name: "<script>alert(1)</script>" }, "name"],
      [{ name: "" }, "name"],
      [{ branding: { logoUrl: "http://cdn.acme.test/logo.png" } }, "branding.logoUrl"],
      [{ branding: { logoUrl: "javascript:alert(1)" } }, "branding.logoUrl"],
      [{ branding: { logoUrl: "https://127.0.0.1/logo.png" } }, "branding.logoUrl"],
      [{ branding: { logoUrl: "https://user:pw@cdn.acme.test/logo.png" } }, "branding.logoUrl"],
      [{ description: "x".repeat(300) }, "description"],
      [{ ownerId: String(userB) }, "request"],
    ];
    for (const [body, field] of cases) {
      const response = await createPage(tokenA, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(Object.keys(response.body.fieldErrors ?? {}).join(",")).toContain(
        field === "request" ? "" : field,
      );
    }
    expect(pages.docs).toHaveLength(0);
  });

  it("enforces globally unique slugs and reports availability", async () => {
    await createPage(tokenA).then((res) => expect(res.status).toBe(201));
    const taken = await createPage(tokenB);
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("SLUG_TAKEN");
    expect(taken.body.fieldErrors.slug).toBeDefined();

    const availability = await request(app)
      .get("/api/status-pages/slug-available?slug=acme-status")
      .set(auth(tokenB))
      .expect(200);
    expect(availability.body).toMatchObject({ valid: true, available: false });
    const free = await request(app)
      .get("/api/status-pages/slug-available?slug=another-name")
      .set(auth(tokenB))
      .expect(200);
    expect(free.body).toMatchObject({ valid: true, available: true });
    const invalid = await request(app)
      .get("/api/status-pages/slug-available?slug=Not%20Valid")
      .set(auth(tokenB))
      .expect(200);
    expect(invalid.body).toMatchObject({ valid: false, available: false });
  });

  it("limits the number of pages per user", async () => {
    for (let index = 0; index < 10; index += 1) {
      await createPage(tokenA, { slug: `page-${index}` }).then((res) =>
        expect(res.status).toBe(201),
      );
    }
    const response = await createPage(tokenA, { slug: "page-extra" });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("STATUS_PAGE_LIMIT_REACHED");
  });

  it("lists, reads, updates and changes slugs for the owner", async () => {
    const page = (await createPage()).body.page;
    const list = await request(app).get("/api/status-pages").set(auth(tokenA)).expect(200);
    expect(list.body.items.map((item: { slug: string }) => item.slug)).toEqual(["acme-status"]);
    expect(list.headers["cache-control"]).toContain("no-store");

    const updated = await request(app)
      .patch(`/api/status-pages/${page.id}`)
      .set(auth(tokenA))
      .send({
        name: "Renamed",
        slug: "renamed",
        subscribersEnabled: false,
        subscriberEvents: { acknowledged: true },
        branding: { companyName: "Renamed Inc" },
      })
      .expect(200);
    expect(updated.body.page).toMatchObject({
      name: "Renamed",
      slug: "renamed",
      subscribersEnabled: false,
      subscriberEvents: { opened: true, acknowledged: true, resolved: true },
      branding: { companyName: "Renamed Inc" },
    });
    await request(app).patch(`/api/status-pages/${page.id}`).set(auth(tokenA)).send({}).expect(400);
  });

  it("rejects slug changes that collide with another page", async () => {
    await createPage(tokenB, { slug: "taken-slug" });
    const page = (await createPage()).body.page;
    const response = await request(app)
      .patch(`/api/status-pages/${page.id}`)
      .set(auth(tokenA))
      .send({ slug: "taken-slug" });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("SLUG_TAKEN");
  });

  it("hides every page operation from other users", async () => {
    const page = (await createPage()).body.page;
    const base = `/api/status-pages/${page.id}`;
    const attempts = [
      request(app).get(base).set(auth(tokenB)),
      request(app).patch(base).set(auth(tokenB)).send({ name: "Hijack" }),
      request(app).delete(base).set(auth(tokenB)),
      request(app).post(`${base}/publish`).set(auth(tokenB)),
      request(app).post(`${base}/unpublish`).set(auth(tokenB)),
      request(app).get(`${base}/services`).set(auth(tokenB)),
      request(app).post(`${base}/services`).set(auth(tokenB)).send({ name: "x", monitorIds: [] }),
      request(app).post(`${base}/preview`).set(auth(tokenB)),
      request(app).get(`${base}/subscribers`).set(auth(tokenB)),
      request(app).get(`${base}/analytics`).set(auth(tokenB)),
    ];
    for (const attempt of attempts) {
      const response = await attempt;
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("STATUS_PAGE_NOT_FOUND");
    }
    expect(pages.docs).toHaveLength(1);
    expect(pages.docs[0]?.name).toBe("Acme Status");
    const list = await request(app).get("/api/status-pages").set(auth(tokenB)).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it("rejects malformed ids", async () => {
    await request(app).get("/api/status-pages/not-an-id").set(auth(tokenA)).expect(400);
  });
});

describe("service management", () => {
  it("creates services with multiple owned monitors and never leaks full URLs", async () => {
    const page = (await createPage()).body.page;
    const response = await addService(page.id, {
      name: "Public API",
      description: "REST API",
      monitorIds: [String(ids.api), String(ids.web)],
    });
    expect(response.status).toBe(201);
    expect(response.body.service).toMatchObject({
      name: "Public API",
      description: "REST API",
      order: 0,
      enabled: true,
      status: "operational",
    });
    expect(response.body.service.monitors).toEqual([
      { id: String(ids.api), name: "Api", host: "api.acme.test", state: "operational" },
      { id: String(ids.web), name: "Web", host: "web.acme.test", state: "operational" },
    ]);
    expect(JSON.stringify(response.body)).not.toContain("SECRET");
  });

  it("refuses another user's monitors, even when the id is supplied directly", async () => {
    const page = (await createPage()).body.page;
    const response = await addService(page.id, {
      name: "Sneaky",
      monitorIds: [String(ids.api), String(ids.foreign)],
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_MONITOR_SELECTION");
    expect(services.docs).toHaveLength(0);

    const good = await addService(page.id, { name: "Fine", monitorIds: [String(ids.api)] });
    const patch = await request(app)
      .patch(`/api/status-pages/${page.id}/services/${good.body.service.id}`)
      .set(auth(tokenA))
      .send({ monitorIds: [String(ids.foreign)] });
    expect(patch.status).toBe(400);
    expect(services.docs[0]?.monitorIds).toHaveLength(1);
    expect(String((services.docs[0]?.monitorIds as Types.ObjectId[])[0])).toBe(String(ids.api));
  });

  it("allows one monitor in several services and de-duplicates ids", async () => {
    const page = (await createPage()).body.page;
    await addService(page.id, { name: "One", monitorIds: [String(ids.api), String(ids.api)] });
    const two = await addService(page.id, { name: "Two", monitorIds: [String(ids.api)] });
    expect(two.status).toBe(201);
    expect(services.docs[0]?.monitorIds).toHaveLength(1);
  });

  it("validates input and enforces service limits", async () => {
    const page = (await createPage()).body.page;
    expect((await addService(page.id, { name: "", monitorIds: [] })).status).toBe(400);
    expect((await addService(page.id, { name: "<b>x</b>", monitorIds: [] })).status).toBe(400);
    expect((await addService(page.id, { name: "x", monitorIds: ["nope"] })).status).toBe(400);
    for (let index = 0; index < 20; index += 1) {
      await addService(page.id, { name: `Service ${index}`, monitorIds: [] });
    }
    const response = await addService(page.id, { name: "Overflow", monitorIds: [] });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("SERVICE_LIMIT_REACHED");
  });

  it("updates, disables, reorders and deletes services", async () => {
    const page = (await createPage()).body.page;
    const first = (await addService(page.id, { name: "First", monitorIds: [String(ids.api)] })).body
      .service;
    const second = (await addService(page.id, { name: "Second", monitorIds: [String(ids.web)] }))
      .body.service;
    const third = (await addService(page.id, { name: "Third", monitorIds: [] })).body.service;

    const updated = await request(app)
      .patch(`/api/status-pages/${page.id}/services/${first.id}`)
      .set(auth(tokenA))
      .send({ name: "Renamed", enabled: false, monitorIds: [String(ids.api), String(ids.web)] })
      .expect(200);
    expect(updated.body.service).toMatchObject({ name: "Renamed", enabled: false });
    expect(updated.body.service.monitorIds).toHaveLength(2);

    const reordered = await request(app)
      .post(`/api/status-pages/${page.id}/services/reorder`)
      .set(auth(tokenA))
      .send({ serviceIds: [third.id, first.id, second.id] })
      .expect(200);
    expect(reordered.body.items.map((item: { name: string }) => item.name)).toEqual([
      "Third",
      "Renamed",
      "Second",
    ]);

    for (const bad of [
      [first.id],
      [first.id, first.id, second.id],
      [third.id, first.id, String(new Types.ObjectId())],
    ]) {
      await request(app)
        .post(`/api/status-pages/${page.id}/services/reorder`)
        .set(auth(tokenA))
        .send({ serviceIds: bad })
        .expect(400);
    }

    await request(app)
      .delete(`/api/status-pages/${page.id}/services/${second.id}`)
      .set(auth(tokenA))
      .expect(200);
    const remaining = await request(app)
      .get(`/api/status-pages/${page.id}/services`)
      .set(auth(tokenA))
      .expect(200);
    expect(remaining.body.items).toHaveLength(2);
    await request(app)
      .delete(`/api/status-pages/${page.id}/services/${second.id}`)
      .set(auth(tokenA))
      .expect(404);
  });

  it("does not let one page's service endpoints touch another page's services", async () => {
    const first = (await createPage(tokenA, { slug: "page-one" })).body.page;
    const second = (await createPage(tokenA, { slug: "page-two" })).body.page;
    const service = (await addService(second.id, { name: "Two", monitorIds: [] })).body.service;
    await request(app)
      .patch(`/api/status-pages/${first.id}/services/${service.id}`)
      .set(auth(tokenA))
      .send({ name: "Cross" })
      .expect(404);
    await request(app)
      .delete(`/api/status-pages/${first.id}/services/${service.id}`)
      .set(auth(tokenA))
      .expect(404);
  });

  it("drops deleted monitors from service details", async () => {
    const page = (await createPage()).body.page;
    await addService(page.id, { name: "API", monitorIds: [String(ids.api), String(ids.web)] });
    monitors.docs.splice(
      monitors.docs.findIndex((doc) => String(doc._id) === String(ids.web)),
      1,
    );
    const response = await request(app)
      .get(`/api/status-pages/${page.id}/services`)
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.items[0].monitorIds).toEqual([String(ids.api)]);
    expect(response.body.items[0].monitors).toHaveLength(1);
  });

  it("offers only the caller's monitors as options with safe hosts", async () => {
    const response = await request(app)
      .get("/api/status-pages/monitor-options?search=api")
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual(["Api"]);
    expect(response.body.items[0]).toMatchObject({ host: "api.acme.test", state: "operational" });
    expect(JSON.stringify(response.body)).not.toContain("SECRET");
    const other = await request(app).get("/api/status-pages/monitor-options").set(auth(tokenB));
    expect(other.body.items.map((item: { name: string }) => item.name)).toEqual(["Foreign"]);
  });
});

describe("publishing and privacy", () => {
  it("keeps drafts private and requires a configured service before publishing", async () => {
    const page = (await createPage()).body.page;
    await request(app).get("/api/public/status-pages/acme-status").expect(404);

    const early = await request(app)
      .post(`/api/status-pages/${page.id}/publish`)
      .set(auth(tokenA))
      .expect(409);
    expect(early.body.code).toBe("STATUS_PAGE_INCOMPLETE");
    await addService(page.id, { name: "Empty", monitorIds: [] });
    await request(app).post(`/api/status-pages/${page.id}/publish`).set(auth(tokenA)).expect(409);
    await request(app).get("/api/public/status-pages/acme-status").expect(404);
  });

  it("publishes, serves the public page, and unpublishes immediately", async () => {
    const pageId = await publishedPage();
    const live = await request(app).get("/api/public/status-pages/acme-status").expect(200);
    expect(live.body.status.overall).toBe("operational");
    expect(redisState.published.some((event) => event.type === "public.status.updated")).toBe(true);

    const unpublished = await request(app)
      .post(`/api/status-pages/${pageId}/unpublish`)
      .set(auth(tokenA))
      .expect(200);
    expect(unpublished.body.page.status).toBe("unpublished");
    for (const path of ["", "/incidents", "/history"]) {
      await request(app).get(`/api/public/status-pages/acme-status${path}`).expect(404);
    }
    expect(redisState.published.some((event) => event.type === "public.page.unpublished")).toBe(
      true,
    );

    await request(app).post(`/api/status-pages/${pageId}/publish`).set(auth(tokenA)).expect(200);
    await request(app).get("/api/public/status-pages/acme-status").expect(200);
  });

  it("makes deleted pages inaccessible and removes related data", async () => {
    const pageId = await publishedPage();
    await request(app).get("/api/public/status-pages/acme-status").expect(200);
    subscribers.docs.push({
      _id: new Types.ObjectId(),
      pageId: new Types.ObjectId(pageId),
      email: "visitor@example.com",
      status: "active",
    });
    await request(app).delete(`/api/status-pages/${pageId}`).set(auth(tokenA)).expect(200);
    await request(app).get("/api/public/status-pages/acme-status").expect(404);
    expect(pages.docs).toHaveLength(0);
    expect(services.docs).toHaveLength(0);
    expect(subscribers.docs).toHaveLength(0);
  });

  it("previews drafts only for the owner and never marks them public", async () => {
    const page = (await createPage()).body.page;
    await addService(page.id, { name: "Public API", monitorIds: [String(ids.api)] });
    const preview = await request(app)
      .post(`/api/status-pages/${page.id}/preview`)
      .set(auth(tokenA))
      .expect(200);
    expect(preview.body.preview).toMatchObject({
      preview: true,
      page: { slug: "acme-status" },
      status: { overall: "operational" },
    });
    expect(preview.headers["cache-control"]).toContain("no-store");
    await request(app).post(`/api/status-pages/${page.id}/preview`).set(auth(tokenB)).expect(404);
    await request(app).get("/api/public/status-pages/acme-status").expect(404);
  });
});

describe("public status", () => {
  it("serves only allowlisted fields", async () => {
    await publishedPage();
    addIncident(ids.api);
    invalidateStatusCache();
    const response = await request(app).get("/api/public/status-pages/acme-status").expect(200);
    expect(Object.keys(response.body).sort()).toEqual(["incidents", "page", "status"]);
    expect(Object.keys(response.body.page).sort()).toEqual([
      "branding",
      "description",
      "name",
      "slug",
      "subscriberEvents",
      "subscribersEnabled",
    ]);
    const serialized = JSON.stringify(response.body);
    for (const secret of [
      "SECRET",
      "acme.test",
      "ownerId",
      String(userA),
      String(ids.api),
      "Internal Checkout",
      "Internal note",
      "resolutionReason",
      "UNEXPECTED_STATUS",
      "userId",
    ]) {
      expect(serialized, secret).not.toContain(secret);
    }
    expect(response.body.incidents.active[0]).toMatchObject({
      title: "Service disruption: Public API",
      status: "investigating",
      ongoing: true,
    });
  });

  it("sets revalidation headers and supports conditional requests", async () => {
    await publishedPage();
    const first = await request(app).get("/api/public/status-pages/acme-status").expect(200);
    expect(first.headers["cache-control"]).toBe("no-cache");
    expect(first.headers.etag).toBeTruthy();
    await request(app)
      .get("/api/public/status-pages/acme-status")
      .set("If-None-Match", first.headers.etag as string)
      .expect(304);
  });

  it("answers 404 identically for unknown, malformed and unpublished slugs", async () => {
    await createPage();
    const bodies = [];
    for (const slug of ["acme-status", "does-not-exist", "Bad_Slug!", "x"]) {
      const response = await request(app).get(
        `/api/public/status-pages/${encodeURIComponent(slug)}`,
      );
      expect(response.status).toBe(404);
      bodies.push(response.body);
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
  });

  it("calculates operational, partial outage, major outage and unknown from real data", async () => {
    await publishedPage({ name: "Public API", monitorIds: [String(ids.api), String(ids.web)] });
    const overall = async () => {
      invalidateStatusCache();
      return (await request(app).get("/api/public/status-pages/acme-status").expect(200)).body;
    };

    expect((await overall()).status.overall).toBe("operational");

    const apiIncident = addIncident(ids.api);
    const partial = await overall();
    expect(partial.status.overall).toBe("partial_outage");
    expect(partial.status.services[0].monitorCounts).toMatchObject({ down: 1, operational: 1 });
    expect(partial.incidents.active).toHaveLength(1);

    addIncident(ids.web);
    const major = await overall();
    expect(major.status.overall).toBe("major_outage");
    expect(major.incidents.active).toHaveLength(2);

    incidents.docs.forEach((doc) => {
      doc.status = "resolved";
      doc.resolvedAt = new Date();
    });
    expect((await overall()).status.overall).toBe("operational");
    expect((await overall()).incidents.active).toHaveLength(0);
    expect(apiIncident).toBeTruthy();

    checks.docs.length = 0;
    addCheck(ids.api, 3_600_000);
    addCheck(ids.web, 3_600_000);
    const stale = await overall();
    expect(stale.status.overall).toBe("unknown");
    expect(stale.status.message).toBe(
      "We are currently unable to determine the status of all services.",
    );

    checks.docs.length = 0;
    expect((await overall()).status.overall).toBe("unknown");
  });

  it("never treats paused monitors as operational and never counts disabled services", async () => {
    const pageId = await publishedPage({ name: "Public API", monitorIds: [String(ids.api)] });
    (
      monitors.docs.find((doc) => String(doc._id) === String(ids.api)) as Record<string, unknown>
    ).active = false;
    invalidateStatusCache();
    const paused = await request(app).get("/api/public/status-pages/acme-status").expect(200);
    expect(paused.body.status.overall).toBe("unknown");
    expect(paused.body.status.services[0].monitorCounts).toMatchObject({
      paused: 1,
      operational: 0,
    });

    (
      monitors.docs.find((doc) => String(doc._id) === String(ids.api)) as Record<string, unknown>
    ).active = true;
    const hidden = (
      await addService(pageId, { name: "Hidden", monitorIds: [String(ids.web)], enabled: false })
    ).body.service;
    addIncident(ids.web);
    invalidateStatusCache();
    const live = await request(app).get("/api/public/status-pages/acme-status").expect(200);
    expect(live.body.status.services.map((service: { name: string }) => service.name)).toEqual([
      "Public API",
    ]);
    expect(live.body.status.overall).toBe("operational");
    expect(live.body.incidents.active).toHaveLength(0);
    expect(hidden.enabled).toBe(false);
  });

  it("falls back to the page name when no company name is configured", async () => {
    await publishedPage();
    const response = await request(app).get("/api/public/status-pages/acme-status").expect(200);
    expect(response.body.page.branding).toEqual({ companyName: "Acme Status", logoUrl: null });
  });

  it("paginates public incident history with safe fields", async () => {
    await publishedPage();
    for (let index = 0; index < 25; index += 1) {
      addIncident(ids.api, {
        status: "resolved",
        firstFailureAt: new Date(Date.now() - (index + 2) * 3_600_000),
        openedAt: new Date(Date.now() - (index + 2) * 3_600_000 + 60_000),
        resolvedAt: new Date(Date.now() - (index + 1) * 3_600_000),
      });
    }
    addIncident(ids.api, { status: "open" });
    const first = await request(app)
      .get("/api/public/status-pages/acme-status/incidents?status=resolved&pageSize=10")
      .expect(200);
    expect(first.body).toMatchObject({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
    expect(first.body.items).toHaveLength(10);
    expect(first.body.items[0].updates.map((update: { status: string }) => update.status)).toEqual([
      "investigating",
      "resolved",
    ]);
    const third = await request(app)
      .get("/api/public/status-pages/acme-status/incidents?status=resolved&pageSize=10&page=3")
      .expect(200);
    expect(third.body.items).toHaveLength(5);
    const active = await request(app)
      .get("/api/public/status-pages/acme-status/incidents?status=active")
      .expect(200);
    expect(active.body.total).toBe(1);
    await request(app)
      .get("/api/public/status-pages/acme-status/incidents?pageSize=500")
      .expect(400);
    expect(JSON.stringify(first.body)).not.toMatch(/Internal|SECRET|userId|monitorId/);
  });

  it("returns bounded uptime history per service from the shared analytics calculation", async () => {
    await publishedPage();
    const response = await request(app)
      .get("/api/public/status-pages/acme-status/history?range=7d")
      .expect(200);
    expect(response.body).toMatchObject({
      range: "7d",
      overall: { availability: { percent: 99.5, state: "ok" } },
      services: [{ name: "Public API", availability: { percent: 99.5, state: "ok" } }],
    });
    expect(response.body.overall.timeline[0]).toEqual({
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-01T00:15:00.000Z",
      state: "up",
    });
    expect(response.body.note).toMatch(/recorded monitoring and incident windows/);
    await request(app).get("/api/public/status-pages/acme-status/history?range=1y").expect(400);
  });
});

describe("owner views of subscribers and analytics", () => {
  it("lists masked subscribers with counts and never exposes raw addresses", async () => {
    const pageId = await publishedPage();
    const pageObject = new Types.ObjectId(pageId);
    for (const [email, status] of [
      ["jane.doe@example.com", "active"],
      ["pending.person@example.com", "pending"],
      ["gone@example.com", "unsubscribed"],
    ] as const) {
      subscribers.docs.push({
        _id: new Types.ObjectId(),
        pageId: pageObject,
        email,
        status,
        events: { opened: true, acknowledged: false, resolved: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    const response = await request(app)
      .get(`/api/status-pages/${pageId}/subscribers?status=active`)
      .set(auth(tokenA))
      .expect(200);
    expect(response.body.counts).toEqual({ pending: 1, active: 1, unsubscribed: 1 });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].emailMasked).toBe("j******@example.com");
    expect(JSON.stringify(response.body)).not.toContain("jane.doe");

    const stats = await request(app)
      .get(`/api/status-pages/${pageId}/analytics`)
      .set(auth(tokenA))
      .expect(200);
    expect(stats.body).toMatchObject({
      status: "operational",
      subscribers: { pending: 1, active: 1, unsubscribed: 1 },
      uptime: { rangeDays: 30, availability: { percent: 99.5 } },
    });
  });
});

describe("workspace roles and isolation", () => {
  const as = (token: string, workspace: Types.ObjectId = wsA) => workspaceHeaders(token, workspace);

  it("lets viewers read pages but never change anything", async () => {
    const pageId = await publishedPage();
    const reads = [
      request(app).get("/api/status-pages").set(as(tokenViewer)),
      request(app).get(`/api/status-pages/${pageId}`).set(as(tokenViewer)),
      request(app).get(`/api/status-pages/${pageId}/services`).set(as(tokenViewer)),
      request(app).post(`/api/status-pages/${pageId}/preview`).set(as(tokenViewer)),
      request(app).get("/api/status-pages/monitor-options").set(as(tokenViewer)),
      request(app).get("/api/status-pages/slug-available?slug=free-slug").set(as(tokenViewer)),
      request(app).get(`/api/status-pages/${pageId}/analytics`).set(as(tokenViewer)),
    ];
    for (const read of reads) expect((await read).status).toBe(200);

    const serviceId = (
      await request(app).get(`/api/status-pages/${pageId}/services`).set(as(tokenA))
    ).body.items[0].id as string;
    const writes = [
      request(app)
        .post("/api/status-pages")
        .set(as(tokenViewer))
        .send({ name: "X page", slug: "viewer-page" }),
      request(app)
        .patch(`/api/status-pages/${pageId}`)
        .set(as(tokenViewer))
        .send({ name: "Hacked" }),
      request(app).delete(`/api/status-pages/${pageId}`).set(as(tokenViewer)),
      request(app).post(`/api/status-pages/${pageId}/publish`).set(as(tokenViewer)),
      request(app).post(`/api/status-pages/${pageId}/unpublish`).set(as(tokenViewer)),
      request(app)
        .post(`/api/status-pages/${pageId}/services`)
        .set(as(tokenViewer))
        .send({ name: "S", monitorIds: [] }),
      request(app)
        .patch(`/api/status-pages/${pageId}/services/${serviceId}`)
        .set(as(tokenViewer))
        .send({ name: "H" }),
      request(app).delete(`/api/status-pages/${pageId}/services/${serviceId}`).set(as(tokenViewer)),
      request(app)
        .post(`/api/status-pages/${pageId}/services/reorder`)
        .set(as(tokenViewer))
        .send({ serviceIds: [serviceId] }),
      request(app).get(`/api/status-pages/${pageId}/subscribers`).set(as(tokenViewer)),
    ];
    for (const write of writes) {
      const response = await write;
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("INSUFFICIENT_PERMISSIONS");
    }
    expect(pages.docs).toHaveLength(1);
    expect(pages.docs[0]?.name).toBe("Acme Status");
    expect(pages.docs[0]?.status).toBe("published");
    expect(services.docs).toHaveLength(1);
  });

  it("lets members manage pages created by any teammate", async () => {
    const created = await request(app)
      .post("/api/status-pages")
      .set(as(tokenMember))
      .send({ name: "Team Page", slug: "team-page" })
      .expect(201);
    const pageId = created.body.page.id as string;
    expect(String(pages.docs[0]?.workspaceId)).toBe(String(wsA));
    expect(String(pages.docs[0]?.ownerId)).toBe(String(userMember));

    const shared = await request(app).get("/api/status-pages").set(as(tokenA)).expect(200);
    expect(shared.body.items.map((item: { slug: string }) => item.slug)).toEqual(["team-page"]);

    await request(app)
      .post(`/api/status-pages/${pageId}/services`)
      .set(as(tokenA))
      .send({ name: "API", monitorIds: [String(ids.api)] })
      .expect(201);
    await request(app).post(`/api/status-pages/${pageId}/publish`).set(as(tokenMember)).expect(200);
    await request(app)
      .get(`/api/status-pages/${pageId}/subscribers`)
      .set(as(tokenMember))
      .expect(200);
    await request(app)
      .patch(`/api/status-pages/${pageId}`)
      .set(as(tokenMember))
      .send({ name: "Renamed" })
      .expect(200);
    await request(app).get("/api/public/status-pages/team-page").expect(200);
  });

  it("rejects non-members and malformed workspace headers", async () => {
    const response = await request(app).get("/api/status-pages").set(as(tokenB, wsA));
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("WORKSPACE_NOT_FOUND");
    const malformed = await request(app)
      .get("/api/status-pages")
      .set({ Authorization: `Bearer ${tokenA}`, "X-Workspace-Id": "not-an-id" });
    expect(malformed.status).toBe(404);
    const unknown = await request(app)
      .get("/api/status-pages")
      .set(as(tokenA, new Types.ObjectId()));
    expect(unknown.status).toBe(404);
  });

  it("keeps pages and services of one workspace unreachable from another", async () => {
    const pageId = await publishedPage();
    const otherPage = await createPage(tokenB, { slug: "b-page", name: "B Page" });
    expect(otherPage.status).toBe(201);
    const serviceId = (
      await request(app).get(`/api/status-pages/${pageId}/services`).set(as(tokenA))
    ).body.items[0].id as string;

    const fromB = [
      request(app).get(`/api/status-pages/${pageId}`).set(as(tokenB, wsB)),
      request(app).patch(`/api/status-pages/${pageId}`).set(as(tokenB, wsB)).send({ name: "X" }),
      request(app).post(`/api/status-pages/${pageId}/publish`).set(as(tokenB, wsB)),
      request(app)
        .patch(`/api/status-pages/${pageId}/services/${serviceId}`)
        .set(as(tokenB, wsB))
        .send({ name: "X" }),
      request(app).delete(`/api/status-pages/${pageId}/services/${serviceId}`).set(as(tokenB, wsB)),
      request(app).post(`/api/status-pages/${pageId}/preview`).set(as(tokenB, wsB)),
    ];
    for (const attempt of fromB) expect((await attempt).status).toBe(404);

    const serviceOnForeign = await request(app)
      .post(`/api/status-pages/${otherPage.body.page.id}/services`)
      .set(as(tokenB, wsB))
      .send({ name: "Mine", monitorIds: [String(ids.api)] });
    expect(serviceOnForeign.status).toBe(400);
    expect(serviceOnForeign.body.code).toBe("INVALID_MONITOR_SELECTION");
    expect(services.docs).toHaveLength(1);

    const options = await request(app)
      .get("/api/status-pages/monitor-options")
      .set(as(tokenB, wsB));
    expect(options.body.items.map((item: { name: string }) => item.name)).toEqual(["Foreign"]);
  });

  it("applies the page limit per workspace", async () => {
    for (let index = 0; index < 10; index += 1) {
      await createPage(tokenA, { slug: `ws-page-${index}` }).then((res) =>
        expect(res.status).toBe(201),
      );
    }
    expect((await createPage(tokenA, { slug: "ws-page-extra" })).status).toBe(409);
    expect((await createPage(tokenB, { slug: "other-ws-page" })).status).toBe(201);
  });

  it("hides public pages once their workspace is deleted", async () => {
    await publishedPage();
    await request(app).get("/api/public/status-pages/acme-status").expect(200);
    workspaceStores.workspaces.docs.find((doc) => String(doc._id) === String(wsA))!.status =
      "deleted";
    for (const path of ["", "/incidents", "/history"]) {
      await request(app).get(`/api/public/status-pages/acme-status${path}`).expect(404);
    }
    await request(app)
      .post("/api/public/status-pages/acme-status/subscribe")
      .send({ email: "visitor@example.com" })
      .expect(404);
    const management = await request(app).get("/api/status-pages").set(as(tokenA));
    expect(management.status).toBe(404);
    expect(management.body.code).toBe("WORKSPACE_NOT_FOUND");
  });

  it("revokes access immediately when a member is removed", async () => {
    await request(app).get("/api/status-pages").set(as(tokenMember)).expect(200);
    const membership = workspaceStores.members.docs.find(
      (doc) => String(doc.userId) === String(userMember),
    )!;
    membership.status = "removed";
    const response = await request(app).get("/api/status-pages").set(as(tokenMember));
    expect(response.status).toBe(404);
  });
});
