import { createApiError } from "../../lib/errors/create-api-error.js";
import { getScopedAvailability } from "../analytics/analytics.service.js";
import type { RangePreset } from "../analytics/analytics-range.js";
import { PublicStatusPage, type IPublicStatusPage } from "./status-page.model.js";
import { loadServiceLites } from "./status-page-realtime.service.js";
import {
  getCachedHistory,
  getCachedStatusSnapshot,
  listPublicIncidents,
} from "./status-page-snapshot.service.js";
import { toPublicPayload } from "./status-page-view.js";

export const findPublishedPage = async (slug: string): Promise<IPublicStatusPage> => {
  const page = await PublicStatusPage.findOne({ slug, status: "published" });
  if (!page) throw createApiError("Status page not found.", 404, "STATUS_PAGE_NOT_FOUND");
  return page as unknown as IPublicStatusPage;
};

export const findPageBySlug = async (slug: string): Promise<IPublicStatusPage | null> =>
  (await PublicStatusPage.findOne({ slug })) as unknown as IPublicStatusPage | null;

export const getPublicStatusPage = async (slug: string) => {
  const page = await findPublishedPage(slug);
  const services = await loadServiceLites(String(page._id));
  const snapshot = await getCachedStatusSnapshot(String(page._id), String(page.ownerId), services);
  return toPublicPayload(page, snapshot);
};

export const getPublicIncidents = async (
  slug: string,
  query: { status: "all" | "active" | "resolved"; page: number; pageSize: number },
) => {
  const page = await findPublishedPage(slug);
  const services = await loadServiceLites(String(page._id));
  const { items, total } = await listPublicIncidents(String(page.ownerId), services, query);
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
};

export const getPublicHistory = async (slug: string, range: RangePreset) => {
  const page = await findPublishedPage(slug);
  const pageId = String(page._id);
  const ownerId = String(page.ownerId);
  return getCachedHistory(pageId, range, async () => {
    const services = (await loadServiceLites(pageId)).filter((service) => service.enabled);
    const allMonitors = [...new Set(services.flatMap((service) => service.monitorIds))];
    const [overall, perService] = await Promise.all([
      getScopedAvailability(ownerId, allMonitors, { range }),
      Promise.all(
        services.map(async (service) => ({
          service,
          result: await getScopedAvailability(ownerId, service.monitorIds, { range }),
        })),
      ),
    ]);
    return {
      range,
      window: {
        from: overall.window.from,
        to: overall.window.to,
        bucketSeconds: overall.window.bucketSeconds,
      },
      overall: {
        availability: {
          percent: overall.availability.percent,
          state: overall.availability.state,
        },
        timeline: overall.timeline,
      },
      services: perService.map(({ service, result }) => ({
        id: service.id,
        name: service.name,
        availability: {
          percent: result.availability.percent,
          state: result.availability.state,
        },
        timeline: result.timeline,
      })),
      note: "Availability is calculated from recorded monitoring and incident windows. Periods without monitoring data, and paused periods, are excluded rather than counted as uptime or downtime.",
    };
  });
};
