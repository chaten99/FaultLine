import { Types } from "mongoose";
import { createApiError } from "../../lib/errors/create-api-error.js";
import { getScopedAvailability } from "../analytics/analytics.service.js";
import { Monitor } from "../monitors/monitor.model.js";
import { StatusPageService } from "./status-page-service.model.js";
import { StatusPageDelivery } from "./status-page-delivery.model.js";
import { StatusPageSubscriber } from "./status-page-subscriber.model.js";
import { PublicStatusPage, type IPublicStatusPage } from "./status-page.model.js";
import { hostOf } from "./status-calculation.js";
import {
  buildStatusSnapshot,
  computeServiceBlocks,
  invalidateStatusCache,
  listPublicIncidents,
  loadMonitorSnapshots,
  monitorStateMap,
  type ServiceLite,
} from "./status-page-snapshot.service.js";
import {
  loadServiceLites,
  publishPageStatusUpdate,
  publishPageUnpublished,
  toServiceLite,
} from "./status-page-realtime.service.js";
import { maskEmail, publicUrlFor, toPublicPayload } from "./status-page-view.js";
import { slugPattern } from "./status-page.validation.js";
import type { PublicStatus, SubscriberEvents } from "./status-page.types.js";
import { aggregateOverall } from "./status-calculation.js";

const maxPages = 10;
const maxServices = 20;

type PageDoc = IPublicStatusPage;

const findOwnedPage = async (ownerId: string, id: string): Promise<PageDoc> => {
  if (!Types.ObjectId.isValid(id)) {
    throw createApiError("Status page not found.", 404, "STATUS_PAGE_NOT_FOUND");
  }
  const page = await PublicStatusPage.findOne({ _id: id, ownerId: new Types.ObjectId(ownerId) });
  if (!page) throw createApiError("Status page not found.", 404, "STATUS_PAGE_NOT_FOUND");
  return page as unknown as PageDoc;
};

const slugTaken = () =>
  createApiError("That URL slug is already in use.", 409, "SLUG_TAKEN", {
    slug: "That URL slug is already in use.",
  });

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);

const toSummary = (page: PageDoc, serviceCount: number, overall: PublicStatus) => ({
  id: String(page._id),
  name: page.name,
  slug: page.slug,
  description: page.description ?? "",
  status: page.status,
  publicUrl: publicUrlFor(page.slug),
  serviceCount,
  overallStatus: overall,
  branding: {
    companyName: page.branding?.companyName ?? "",
    logoUrl: page.branding?.logoUrl ?? null,
  },
  subscribersEnabled: page.subscribersEnabled,
  createdAt: new Date(page.createdAt).toISOString(),
  updatedAt: new Date(page.updatedAt).toISOString(),
  publishedAt: iso(page.publishedAt),
});

const buildServiceDetails = async (ownerId: string, rows: ServiceRow[]) => {
  const lites = rows.map(toServiceLite);
  const { blocks, monitors } = await computeServiceBlocks(ownerId, lites, Date.now());
  const states = monitorStateMap(monitors, Date.now());
  return rows.map((row) => {
    const lite = toServiceLite(row);
    const existing = lite.monitorIds.filter((id) => monitors.has(id));
    const block = blocks.get(lite.id);
    return {
      id: lite.id,
      name: row.name,
      description: row.description ?? "",
      order: row.order,
      enabled: row.enabled,
      monitorIds: existing,
      monitors: existing.map((id) => {
        const monitor = monitors.get(id);
        return {
          id,
          name: monitor?.name ?? "Monitor",
          host: monitor ? hostOf(monitor.url) : null,
          state: states.get(id) ?? "unknown",
        };
      }),
      status: block?.status ?? "unknown",
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  });
};

type ServiceRow = {
  _id: unknown;
  name: string;
  description?: string;
  monitorIds: unknown[];
  order: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const loadServiceRows = async (pageId: string): Promise<ServiceRow[]> =>
  (await StatusPageService.find({ pageId: new Types.ObjectId(pageId) })
    .sort({ order: 1 })
    .lean()) as unknown as ServiceRow[];

const toDetail = async (page: PageDoc) => {
  const rows = await loadServiceRows(String(page._id));
  const services = await buildServiceDetails(String(page.ownerId), rows);
  const overall = aggregateOverall(
    services.filter((service) => service.enabled).map((service) => service.status),
  );
  return {
    ...toSummary(page, services.length, overall),
    services,
    subscriberEvents: {
      opened: page.subscriberEvents?.opened ?? true,
      acknowledged: page.subscriberEvents?.acknowledged ?? false,
      resolved: page.subscriberEvents?.resolved ?? true,
    },
  };
};

export const listStatusPages = async (ownerId: string) => {
  const pages = (await PublicStatusPage.find({ ownerId: new Types.ObjectId(ownerId) })
    .sort({ createdAt: -1 })
    .limit(maxPages)
    .lean()) as unknown as PageDoc[];
  const items = await Promise.all(
    pages.map(async (page) => {
      const rows = await loadServiceRows(String(page._id));
      const enabled = rows.filter((row) => row.enabled).map(toServiceLite);
      const { blocks } = await computeServiceBlocks(ownerId, enabled, Date.now());
      const overall = aggregateOverall([...blocks.values()].map((block) => block.status));
      return toSummary(page, rows.length, overall);
    }),
  );
  return { items, total: items.length };
};

export const checkSlugAvailability = async (slug: string, excludeId?: string) => {
  const normalized = slug.trim().toLowerCase();
  if (!slugPattern.test(normalized) || normalized.length < 3 || normalized.length > 48) {
    return {
      slug: normalized,
      valid: false,
      available: false,
      message: "Use 3-48 lowercase letters, numbers and single hyphens.",
    };
  }
  const existing = await PublicStatusPage.findOne({ slug: normalized }).select("_id").lean();
  const available = !existing || (excludeId !== undefined && String(existing._id) === excludeId);
  return {
    slug: normalized,
    valid: true,
    available,
    message: available ? null : "That URL slug is already in use.",
  };
};

type CreateInput = {
  name: string;
  slug: string;
  description?: string;
  branding?: { companyName?: string; logoUrl?: string | null };
  subscribersEnabled?: boolean;
};

export const createStatusPage = async (ownerId: string, input: CreateInput) => {
  const count = await PublicStatusPage.countDocuments({ ownerId: new Types.ObjectId(ownerId) });
  if (count >= maxPages) {
    throw createApiError(
      `You can create up to ${maxPages} status pages.`,
      409,
      "STATUS_PAGE_LIMIT_REACHED",
    );
  }
  try {
    const page = await PublicStatusPage.create({
      ownerId: new Types.ObjectId(ownerId),
      name: input.name,
      slug: input.slug,
      description: input.description ?? "",
      branding: {
        companyName: input.branding?.companyName ?? "",
        logoUrl: input.branding?.logoUrl || null,
      },
      subscribersEnabled: input.subscribersEnabled ?? true,
      status: "draft",
    });
    return { page: await toDetail(page as unknown as PageDoc) };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw slugTaken();
    throw error;
  }
};

export const getStatusPage = async (ownerId: string, id: string) => ({
  page: await toDetail(await findOwnedPage(ownerId, id)),
});

type UpdateInput = {
  name?: string;
  slug?: string;
  description?: string;
  branding?: { companyName?: string; logoUrl?: string | null };
  subscribersEnabled?: boolean;
  subscriberEvents?: Partial<SubscriberEvents>;
};

export const updateStatusPage = async (ownerId: string, id: string, input: UpdateInput) => {
  const page = await findOwnedPage(ownerId, id);
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.slug !== undefined) set.slug = input.slug;
  if (input.description !== undefined) set.description = input.description;
  if (input.subscribersEnabled !== undefined) set.subscribersEnabled = input.subscribersEnabled;
  if (input.branding?.companyName !== undefined) {
    set["branding.companyName"] = input.branding.companyName;
  }
  if (input.branding?.logoUrl !== undefined)
    set["branding.logoUrl"] = input.branding.logoUrl || null;
  for (const [key, value] of Object.entries(input.subscriberEvents ?? {})) {
    if (value !== undefined) set[`subscriberEvents.${key}`] = value;
  }
  try {
    const updated = await PublicStatusPage.findOneAndUpdate(
      { _id: page._id, ownerId: new Types.ObjectId(ownerId) },
      { $set: set },
      { new: true },
    );
    if (!updated) throw createApiError("Status page not found.", 404, "STATUS_PAGE_NOT_FOUND");
    invalidateStatusCache(String(page._id));
    return { page: await toDetail(updated as unknown as PageDoc) };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw slugTaken();
    throw error;
  }
};

export const deleteStatusPage = async (ownerId: string, id: string) => {
  const page = await findOwnedPage(ownerId, id);
  const pageId = String(page._id);
  await PublicStatusPage.deleteOne({ _id: page._id, ownerId: new Types.ObjectId(ownerId) });
  await StatusPageService.deleteMany({ pageId: page._id });
  await StatusPageSubscriber.deleteMany({ pageId: page._id });
  await StatusPageDelivery.deleteMany({ pageId: page._id });
  await publishPageUnpublished(pageId);
  return { status: "ok" as const };
};

export const publishStatusPage = async (ownerId: string, id: string) => {
  const page = await findOwnedPage(ownerId, id);
  const services = await loadServiceLites(String(page._id));
  if (!services.some((service) => service.enabled && service.monitorIds.length > 0)) {
    throw createApiError(
      "Add at least one enabled service with a monitor before publishing.",
      409,
      "STATUS_PAGE_INCOMPLETE",
    );
  }
  const updated = await PublicStatusPage.findOneAndUpdate(
    { _id: page._id, ownerId: new Types.ObjectId(ownerId) },
    { $set: { status: "published", publishedAt: new Date() } },
    { new: true },
  );
  if (!updated) throw createApiError("Status page not found.", 404, "STATUS_PAGE_NOT_FOUND");
  invalidateStatusCache(String(page._id));
  await publishPageStatusUpdate(updated as unknown as PageDoc);
  return { page: await toDetail(updated as unknown as PageDoc) };
};

export const unpublishStatusPage = async (ownerId: string, id: string) => {
  const page = await findOwnedPage(ownerId, id);
  const updated = await PublicStatusPage.findOneAndUpdate(
    { _id: page._id, ownerId: new Types.ObjectId(ownerId) },
    { $set: { status: "unpublished" } },
    { new: true },
  );
  if (!updated) throw createApiError("Status page not found.", 404, "STATUS_PAGE_NOT_FOUND");
  await publishPageUnpublished(String(page._id));
  return { page: await toDetail(updated as unknown as PageDoc) };
};

const assertOwnedMonitors = async (ownerId: string, monitorIds: string[]) => {
  if (monitorIds.length === 0) return;
  const owned = await Monitor.find({
    _id: { $in: monitorIds.map((monitorId) => new Types.ObjectId(monitorId)) },
    userId: new Types.ObjectId(ownerId),
  })
    .select("_id")
    .lean();
  if (owned.length !== monitorIds.length) {
    throw createApiError(
      "One or more selected monitors could not be found in your account.",
      400,
      "INVALID_MONITOR_SELECTION",
      { monitorIds: "Select only monitors from your account." },
    );
  }
};

const notifyIfPublished = async (page: PageDoc) => {
  invalidateStatusCache(String(page._id));
  if (page.status === "published") await publishPageStatusUpdate(page);
};

export const listServices = async (ownerId: string, id: string) => {
  const page = await findOwnedPage(ownerId, id);
  return { items: await buildServiceDetails(ownerId, await loadServiceRows(String(page._id))) };
};

export const createService = async (
  ownerId: string,
  id: string,
  input: { name: string; description?: string; monitorIds: string[]; enabled?: boolean },
) => {
  const page = await findOwnedPage(ownerId, id);
  const rows = await loadServiceRows(String(page._id));
  if (rows.length >= maxServices) {
    throw createApiError(
      `A status page can have up to ${maxServices} services.`,
      409,
      "SERVICE_LIMIT_REACHED",
    );
  }
  await assertOwnedMonitors(ownerId, input.monitorIds);
  const created = await StatusPageService.create({
    pageId: page._id,
    ownerId: new Types.ObjectId(ownerId),
    name: input.name,
    description: input.description ?? "",
    monitorIds: input.monitorIds.map((monitorId) => new Types.ObjectId(monitorId)),
    order: rows.reduce((max, row) => Math.max(max, row.order), -1) + 1,
    enabled: input.enabled ?? true,
  });
  await notifyIfPublished(page);
  const [service] = await buildServiceDetails(ownerId, [created as unknown as ServiceRow]);
  return { service };
};

const findOwnedService = async (ownerId: string, pageId: string, serviceId: string) => {
  if (!Types.ObjectId.isValid(serviceId)) {
    throw createApiError("Service not found.", 404, "SERVICE_NOT_FOUND");
  }
  const service = await StatusPageService.findOne({
    _id: serviceId,
    pageId: new Types.ObjectId(pageId),
    ownerId: new Types.ObjectId(ownerId),
  });
  if (!service) throw createApiError("Service not found.", 404, "SERVICE_NOT_FOUND");
  return service;
};

export const updateService = async (
  ownerId: string,
  id: string,
  serviceId: string,
  input: { name?: string; description?: string; monitorIds?: string[]; enabled?: boolean },
) => {
  const page = await findOwnedPage(ownerId, id);
  const service = await findOwnedService(ownerId, String(page._id), serviceId);
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;
  if (input.enabled !== undefined) set.enabled = input.enabled;
  if (input.monitorIds !== undefined) {
    await assertOwnedMonitors(ownerId, input.monitorIds);
    set.monitorIds = input.monitorIds.map((monitorId) => new Types.ObjectId(monitorId));
  }
  const updated = await StatusPageService.findOneAndUpdate(
    { _id: service._id, ownerId: new Types.ObjectId(ownerId) },
    { $set: set },
    { new: true },
  );
  if (!updated) throw createApiError("Service not found.", 404, "SERVICE_NOT_FOUND");
  await notifyIfPublished(page);
  const [detail] = await buildServiceDetails(ownerId, [updated as unknown as ServiceRow]);
  return { service: detail };
};

export const deleteService = async (ownerId: string, id: string, serviceId: string) => {
  const page = await findOwnedPage(ownerId, id);
  const service = await findOwnedService(ownerId, String(page._id), serviceId);
  await StatusPageService.deleteOne({ _id: service._id, ownerId: new Types.ObjectId(ownerId) });
  await notifyIfPublished(page);
  return { status: "ok" as const };
};

export const reorderServices = async (ownerId: string, id: string, serviceIds: string[]) => {
  const page = await findOwnedPage(ownerId, id);
  const rows = await loadServiceRows(String(page._id));
  const existing = new Set(rows.map((row) => String(row._id)));
  const requested = new Set(serviceIds);
  if (
    requested.size !== serviceIds.length ||
    requested.size !== existing.size ||
    serviceIds.some((serviceId) => !existing.has(serviceId))
  ) {
    throw createApiError("The service order is invalid.", 400, "INVALID_REQUEST", {
      serviceIds: "Provide every service of this page exactly once.",
    });
  }
  for (const [index, serviceId] of serviceIds.entries()) {
    await StatusPageService.updateOne(
      {
        _id: new Types.ObjectId(serviceId),
        pageId: page._id,
        ownerId: new Types.ObjectId(ownerId),
      },
      { $set: { order: index } },
    );
  }
  await notifyIfPublished(page);
  return { items: await buildServiceDetails(ownerId, await loadServiceRows(String(page._id))) };
};

export const getMonitorOptions = async (ownerId: string, search?: string) => {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(ownerId) };
  if (search?.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { url: { $regex: escaped, $options: "i" } },
    ];
  }
  const rows = await Monitor.find(filter)
    .sort({ name: 1 })
    .limit(50)
    .select("name url active")
    .lean();
  const snapshots = await loadMonitorSnapshots(
    ownerId,
    rows.map((row) => String(row._id)),
  );
  const states = monitorStateMap(snapshots, Date.now());
  return {
    items: rows.map((row) => ({
      id: String(row._id),
      name: row.name,
      host: hostOf(row.url),
      active: row.active,
      state: states.get(String(row._id)) ?? "unknown",
    })),
  };
};

export const previewStatusPage = async (ownerId: string, id: string) => {
  const page = await findOwnedPage(ownerId, id);
  const services = await loadServiceLites(String(page._id));
  const snapshot = await buildStatusSnapshot(ownerId, services, Date.now());
  const recent = await listPublicIncidents(
    ownerId,
    services,
    { status: "resolved", page: 1, pageSize: 20 },
    Date.now(),
  );
  return {
    preview: toPublicPayload(page, snapshot, { preview: true }),
    incidents: [...snapshot.activeIncidents, ...recent.items],
  };
};

export const countSubscribers = async (pageId: Types.ObjectId) => {
  const [pending, active, unsubscribed] = await Promise.all([
    StatusPageSubscriber.countDocuments({ pageId, status: "pending" }),
    StatusPageSubscriber.countDocuments({ pageId, status: "active" }),
    StatusPageSubscriber.countDocuments({ pageId, status: "unsubscribed" }),
  ]);
  return { pending, active, unsubscribed };
};

export const listSubscribers = async (
  ownerId: string,
  id: string,
  query: { page: number; pageSize: number; status: "all" | "pending" | "active" | "unsubscribed" },
) => {
  const page = await findOwnedPage(ownerId, id);
  const filter: Record<string, unknown> = { pageId: page._id };
  if (query.status !== "all") filter.status = query.status;
  const [items, total, counts] = await Promise.all([
    StatusPageSubscriber.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    StatusPageSubscriber.countDocuments(filter),
    countSubscribers(page._id),
  ]);
  return {
    counts,
    items: items.map((row) => ({
      id: String(row._id),
      emailMasked: maskEmail(row.email),
      status: row.status,
      events: row.events,
      verifiedAt: iso(row.verifiedAt),
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
};

export const getStatusPageAnalytics = async (ownerId: string, id: string, now = new Date()) => {
  const page = await findOwnedPage(ownerId, id);
  const services = (await loadServiceLites(String(page._id))).filter(
    (service: ServiceLite) => service.enabled,
  );
  const snapshot = await buildStatusSnapshot(ownerId, services, now.getTime());
  const all = [...new Set(services.flatMap((service) => service.monitorIds))];
  const [overall, perService, subscribers] = await Promise.all([
    getScopedAvailability(ownerId, all, { range: "30d" }, now),
    Promise.all(
      services.map(async (service) => ({
        service,
        result: await getScopedAvailability(ownerId, service.monitorIds, { range: "30d" }, now),
      })),
    ),
    countSubscribers(page._id),
  ]);
  return {
    status: snapshot.status.overall,
    subscribers,
    uptime: {
      rangeDays: 30,
      availability: { percent: overall.availability.percent, state: overall.availability.state },
      services: perService.map(({ service, result }) => ({
        id: service.id,
        name: service.name,
        percent: result.availability.percent,
        state: result.availability.state,
      })),
    },
  };
};
