import { Types } from "mongoose";
import { MonitorCheck } from "../checks/monitor-check.model.js";
import { Incident } from "../incidents/incident.model.js";
import { QUALIFYING_FAILURES } from "../incidents/incident.service.js";
import { Monitor } from "../monitors/monitor.model.js";
import {
  aggregateOverall,
  buildServiceBlock,
  classifyMonitor,
  statusMessages,
  type MonitorSnapshot,
} from "./status-calculation.js";
import type {
  MonitorState,
  PublicIncident,
  PublicIncidentStatus,
  ServiceStatusBlock,
  StatusBlock,
} from "./status-page.types.js";

export type ServiceLite = {
  id: string;
  name: string;
  description: string;
  monitorIds: string[];
  enabled: boolean;
};

export type IncidentLite = {
  id: string;
  monitorId: string;
  status: "open" | "acknowledged" | "resolved";
  firstFailureAt: number;
  openedAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
};

const cacheTtlMs = 10_000;
const cache = new Map<string, { expires: number; value: PageStatusSnapshot }>();

export type PageStatusSnapshot = { status: StatusBlock; activeIncidents: PublicIncident[] };

const historyCache = new Map<string, { expires: number; value: unknown }>();
const historyTtlMs = 60_000;

export const invalidateStatusCache = (pageId?: string): void => {
  if (!pageId) {
    cache.clear();
    historyCache.clear();
    return;
  }
  cache.delete(pageId);
  for (const key of historyCache.keys()) {
    if (key.startsWith(`${pageId}:`)) historyCache.delete(key);
  }
};

export const getCachedHistory = async <T>(
  pageId: string,
  range: string,
  loader: () => Promise<T>,
  now = Date.now(),
): Promise<T> => {
  const key = `${pageId}:${range}`;
  const cached = historyCache.get(key);
  if (cached && cached.expires > now) return cached.value as T;
  const value = await loader();
  historyCache.set(key, { expires: now + historyTtlMs, value });
  return value;
};

const toObjectIds = (ids: string[]) => ids.map((id) => new Types.ObjectId(id));

export const loadMonitorSnapshots = async (
  ownerId: string,
  monitorIds: string[],
): Promise<Map<string, MonitorSnapshot>> => {
  const result = new Map<string, MonitorSnapshot>();
  if (monitorIds.length === 0) return result;
  const unique = [...new Set(monitorIds)];
  const [monitors, incidents, latest] = await Promise.all([
    Monitor.find({ _id: { $in: toObjectIds(unique) }, userId: new Types.ObjectId(ownerId) })
      .select("name url active intervalSeconds")
      .lean(),
    Incident.find({
      monitorId: { $in: toObjectIds(unique) },
      userId: new Types.ObjectId(ownerId),
      status: { $in: ["open", "acknowledged"] },
    })
      .select("monitorId")
      .lean(),
    Promise.all(
      unique.map(async (id) => {
        const check = await MonitorCheck.findOne({
          monitorId: new Types.ObjectId(id),
          completedAt: { $ne: null },
          $or: [
            { status: "success" },
            {
              status: { $in: ["failure", "timeout"] },
              failureCategory: { $in: QUALIFYING_FAILURES },
            },
          ],
        })
          .sort({ completedAt: -1 })
          .select("status completedAt")
          .lean();
        return [id, check] as const;
      }),
    ),
  ]);
  const withIncident = new Set(incidents.map((incident) => String(incident.monitorId)));
  const latestById = new Map(latest);
  for (const monitor of monitors) {
    const id = String(monitor._id);
    const check = latestById.get(id);
    result.set(id, {
      id,
      name: monitor.name,
      url: monitor.url,
      active: monitor.active,
      intervalSeconds: monitor.intervalSeconds,
      hasActiveIncident: withIncident.has(id),
      latest:
        check?.completedAt &&
        (check.status === "success" || check.status === "failure" || check.status === "timeout")
          ? { status: check.status, completedAt: new Date(check.completedAt).getTime() }
          : null,
    });
  }
  return result;
};

export const monitorStateMap = (
  monitors: Map<string, MonitorSnapshot>,
  now: number,
): Map<string, MonitorState> =>
  new Map([...monitors.entries()].map(([id, monitor]) => [id, classifyMonitor(monitor, now)]));

export const computeServiceBlocks = async (
  ownerId: string,
  services: ServiceLite[],
  now: number,
): Promise<{ blocks: Map<string, ServiceStatusBlock>; monitors: Map<string, MonitorSnapshot> }> => {
  const monitors = await loadMonitorSnapshots(
    ownerId,
    services.flatMap((service) => service.monitorIds),
  );
  const blocks = new Map(
    services.map((service) => [service.id, buildServiceBlock(service, monitors, now)]),
  );
  return { blocks, monitors };
};

const publicStatusFor = (incident: IncidentLite): PublicIncidentStatus =>
  incident.status === "open"
    ? "investigating"
    : incident.status === "acknowledged"
      ? "acknowledged"
      : "resolved";

export const toPublicIncident = (
  incident: IncidentLite,
  serviceNames: string[],
  now: number,
): PublicIncident => {
  const updates: PublicIncident["updates"] = [
    {
      at: new Date(incident.openedAt).toISOString(),
      status: "investigating",
      message: "We detected an issue and are investigating.",
    },
  ];
  if (incident.acknowledgedAt) {
    updates.push({
      at: new Date(incident.acknowledgedAt).toISOString(),
      status: "acknowledged",
      message: "We are aware of the issue and are working on it.",
    });
  }
  if (incident.resolvedAt) {
    updates.push({
      at: new Date(incident.resolvedAt).toISOString(),
      status: "resolved",
      message: "This incident has been resolved.",
    });
  }
  const title =
    serviceNames.length > 0
      ? `Service disruption: ${serviceNames.join(", ")}`.slice(0, 160)
      : "Service disruption";
  return {
    id: incident.id,
    title,
    status: publicStatusFor(incident),
    services: serviceNames,
    startedAt: new Date(incident.firstFailureAt).toISOString(),
    resolvedAt: incident.resolvedAt ? new Date(incident.resolvedAt).toISOString() : null,
    durationMs: Math.max(0, (incident.resolvedAt ?? now) - incident.firstFailureAt),
    ongoing: incident.resolvedAt === null,
    updates,
  };
};

export const serviceNamesByMonitor = (services: ServiceLite[]): Map<string, string[]> => {
  const result = new Map<string, string[]>();
  for (const service of services) {
    if (!service.enabled) continue;
    for (const monitorId of service.monitorIds) {
      const names = result.get(monitorId) ?? [];
      if (!names.includes(service.name)) names.push(service.name);
      result.set(monitorId, names);
    }
  }
  return result;
};

const toIncidentLite = (row: {
  _id: unknown;
  monitorId: unknown;
  status: "open" | "acknowledged" | "resolved";
  firstFailureAt: Date;
  openedAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}): IncidentLite => ({
  id: String(row._id),
  monitorId: String(row.monitorId),
  status: row.status,
  firstFailureAt: new Date(row.firstFailureAt).getTime(),
  openedAt: new Date(row.openedAt).getTime(),
  acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt).getTime() : null,
  resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).getTime() : null,
});

const incidentFields = "monitorId status firstFailureAt openedAt acknowledgedAt resolvedAt";

export const loadActiveIncidents = async (
  ownerId: string,
  monitorIds: string[],
): Promise<IncidentLite[]> => {
  if (monitorIds.length === 0) return [];
  const rows = await Incident.find({
    userId: new Types.ObjectId(ownerId),
    monitorId: { $in: toObjectIds([...new Set(monitorIds)]) },
    status: { $in: ["open", "acknowledged"] },
  })
    .sort({ firstFailureAt: -1 })
    .limit(50)
    .select(incidentFields)
    .lean();
  return rows.map(toIncidentLite);
};

export const buildStatusSnapshot = async (
  ownerId: string,
  services: ServiceLite[],
  now: number,
): Promise<PageStatusSnapshot> => {
  const enabled = services.filter((service) => service.enabled);
  const { blocks } = await computeServiceBlocks(ownerId, enabled, now);
  const serviceBlocks = enabled.map((service) => blocks.get(service.id) as ServiceStatusBlock);
  const overall = aggregateOverall(serviceBlocks.map((block) => block.status));
  const names = serviceNamesByMonitor(enabled);
  const active = await loadActiveIncidents(
    ownerId,
    enabled.flatMap((service) => service.monitorIds),
  );
  return {
    status: {
      overall,
      message: statusMessages[overall],
      updatedAt: new Date(now).toISOString(),
      services: serviceBlocks,
    },
    activeIncidents: active
      .filter((incident) => names.has(incident.monitorId))
      .map((incident) => toPublicIncident(incident, names.get(incident.monitorId) ?? [], now)),
  };
};

export const getCachedStatusSnapshot = async (
  pageId: string,
  ownerId: string,
  services: ServiceLite[],
  now = Date.now(),
): Promise<PageStatusSnapshot> => {
  const cached = cache.get(pageId);
  if (cached && cached.expires > now) return cached.value;
  const value = await buildStatusSnapshot(ownerId, services, now);
  cache.set(pageId, { expires: now + cacheTtlMs, value });
  return value;
};

export const listPublicIncidents = async (
  ownerId: string,
  services: ServiceLite[],
  query: { status: "all" | "active" | "resolved"; page: number; pageSize: number },
  now = Date.now(),
): Promise<{ items: PublicIncident[]; total: number }> => {
  const enabled = services.filter((service) => service.enabled);
  const monitorIds = [...new Set(enabled.flatMap((service) => service.monitorIds))];
  if (monitorIds.length === 0) return { items: [], total: 0 };
  const names = serviceNamesByMonitor(enabled);
  const filter: Record<string, unknown> = {
    userId: new Types.ObjectId(ownerId),
    monitorId: { $in: toObjectIds(monitorIds) },
    firstFailureAt: { $gte: new Date(now - 90 * 24 * 60 * 60 * 1000) },
  };
  if (query.status === "active") filter.status = { $in: ["open", "acknowledged"] };
  if (query.status === "resolved") filter.status = "resolved";
  const [rows, total] = await Promise.all([
    Incident.find(filter)
      .sort({ firstFailureAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .select(incidentFields)
      .lean(),
    Incident.countDocuments(filter),
  ]);
  return {
    items: rows.map((row) => {
      const lite = toIncidentLite(row);
      return toPublicIncident(lite, names.get(lite.monitorId) ?? [], now);
    }),
    total,
  };
};
