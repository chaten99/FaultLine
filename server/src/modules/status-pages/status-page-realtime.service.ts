import { Types } from "mongoose";
import { logger } from "../../config/logger.js";
import { publishDomainEvent } from "../../lib/redis/redis.service.js";
import { Incident } from "../incidents/incident.model.js";
import type { IncidentEventType } from "../notifications/notification.types.js";
import { StatusPageService } from "./status-page-service.model.js";
import { PublicStatusPage, type IPublicStatusPage } from "./status-page.model.js";
import {
  buildStatusSnapshot,
  invalidateStatusCache,
  serviceNamesByMonitor,
  toPublicIncident,
  type ServiceLite,
} from "./status-page-snapshot.service.js";

export const toServiceLite = (service: {
  _id: unknown;
  name: string;
  description?: string;
  monitorIds: unknown[];
  enabled: boolean;
}): ServiceLite => ({
  id: String(service._id),
  name: service.name,
  description: service.description ?? "",
  monitorIds: service.monitorIds.map((id) => String(id)),
  enabled: service.enabled,
});

export const loadServiceLites = async (pageId: string): Promise<ServiceLite[]> => {
  const rows = await StatusPageService.find({ pageId: new Types.ObjectId(pageId) })
    .sort({ order: 1 })
    .lean();
  return rows.map(toServiceLite);
};

export const publishPageStatusUpdate = async (
  page: Pick<IPublicStatusPage, "_id" | "ownerId">,
): Promise<void> => {
  const pageId = String(page._id);
  invalidateStatusCache(pageId);
  const services = await loadServiceLites(pageId);
  const snapshot = await buildStatusSnapshot(String(page.ownerId), services, Date.now());
  await publishDomainEvent("public.status.updated", { pageId, payload: snapshot.status });
};

export const publishPageUnpublished = async (pageId: string): Promise<void> => {
  invalidateStatusCache(pageId);
  await publishDomainEvent("public.page.unpublished", { pageId, payload: {} });
};

const incidentEventNames: Record<IncidentEventType, string> = {
  "incident.opened": "public.incident.created",
  "incident.acknowledged": "public.incident.updated",
  "incident.resolved": "public.incident.resolved",
};

export const findPublishedPagesForMonitor = async (
  ownerId: string,
  monitorId: string,
): Promise<IPublicStatusPage[]> => {
  const services = await StatusPageService.find({
    ownerId: new Types.ObjectId(ownerId),
    enabled: true,
    monitorIds: new Types.ObjectId(monitorId),
  })
    .select("pageId")
    .lean();
  const pageIds = [...new Set(services.map((service) => String(service.pageId)))];
  if (pageIds.length === 0) return [];
  return PublicStatusPage.find({
    _id: { $in: pageIds.map((id) => new Types.ObjectId(id)) },
    status: "published",
  }).lean() as unknown as Promise<IPublicStatusPage[]>;
};

export const publishPublicIncidentUpdates = async (input: {
  ownerId: string;
  monitorId: string;
  incidentId: string;
  eventType: IncidentEventType;
}): Promise<void> => {
  try {
    const pages = await findPublishedPagesForMonitor(input.ownerId, input.monitorId);
    if (pages.length === 0) return;
    const incident = await Incident.findById(input.incidentId)
      .select("monitorId status firstFailureAt openedAt acknowledgedAt resolvedAt")
      .lean();
    if (!incident) return;
    for (const page of pages) {
      const pageId = String(page._id);
      invalidateStatusCache(pageId);
      const services = await loadServiceLites(pageId);
      const names = serviceNamesByMonitor(services).get(input.monitorId) ?? [];
      const snapshot = await buildStatusSnapshot(String(page.ownerId), services, Date.now());
      await publishDomainEvent(incidentEventNames[input.eventType], {
        pageId,
        payload: toPublicIncident(
          {
            id: String(incident._id),
            monitorId: String(incident.monitorId),
            status: incident.status,
            firstFailureAt: new Date(incident.firstFailureAt).getTime(),
            openedAt: new Date(incident.openedAt).getTime(),
            acknowledgedAt: incident.acknowledgedAt
              ? new Date(incident.acknowledgedAt).getTime()
              : null,
            resolvedAt: incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : null,
          },
          names,
          Date.now(),
        ),
      });
      await publishDomainEvent("public.status.updated", { pageId, payload: snapshot.status });
    }
  } catch (error) {
    logger.warn({ err: error, incidentId: input.incidentId }, "Public status update failed");
  }
};

export const publishPublicStatusForMonitor = async (
  ownerId: string,
  monitorId: string,
): Promise<void> => {
  try {
    const pages = await findPublishedPagesForMonitor(ownerId, monitorId);
    for (const page of pages) await publishPageStatusUpdate(page);
  } catch (error) {
    logger.warn({ err: error, monitorId }, "Public status refresh failed");
  }
};
