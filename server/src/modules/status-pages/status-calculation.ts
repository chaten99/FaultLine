import { gapGraceMs } from "../analytics/analytics-intervals.js";
import type { MonitorState, PublicStatus, ServiceStatusBlock } from "./status-page.types.js";

export type MonitorSnapshot = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  intervalSeconds: number;
  hasActiveIncident: boolean;
  latest: { status: "success" | "failure" | "timeout"; completedAt: number } | null;
};

export const freshnessMs = (intervalSeconds: number): number => {
  const intervalMs = intervalSeconds * 1000;
  return 2 * intervalMs + gapGraceMs(intervalMs);
};

export const classifyMonitor = (monitor: MonitorSnapshot, now: number): MonitorState => {
  if (!monitor.active) return "paused";
  if (monitor.hasActiveIncident) return "down";
  const latest = monitor.latest;
  if (
    latest &&
    latest.status === "success" &&
    now - latest.completedAt <= freshnessMs(monitor.intervalSeconds)
  ) {
    return "operational";
  }
  return "unknown";
};

export const aggregateService = (states: MonitorState[]): PublicStatus => {
  const eligible = states.filter((state) => state !== "paused");
  if (eligible.length === 0) return "unknown";
  const down = eligible.filter((state) => state === "down").length;
  const operational = eligible.filter((state) => state === "operational").length;
  if (down === eligible.length) return "major_outage";
  if (down > 0) return "partial_outage";
  if (operational === eligible.length) return "operational";
  return "unknown";
};

export const aggregateOverall = (statuses: PublicStatus[]): PublicStatus => {
  if (statuses.length === 0) return "unknown";
  if (statuses.includes("major_outage")) return "major_outage";
  if (statuses.includes("partial_outage")) return "partial_outage";
  if (statuses.every((status) => status === "operational")) return "operational";
  return "unknown";
};

export const statusMessages: Record<PublicStatus, string> = {
  operational: "All monitored services are operating normally.",
  partial_outage: "Some services are experiencing disruptions.",
  major_outage: "One or more services are experiencing significant outages.",
  unknown: "We are currently unable to determine the status of all services.",
};

export const buildServiceBlock = (
  service: { id: string; name: string; description: string; monitorIds: string[] },
  monitors: Map<string, MonitorSnapshot>,
  now: number,
): ServiceStatusBlock => {
  const members = service.monitorIds
    .map((id) => monitors.get(id))
    .filter((monitor): monitor is MonitorSnapshot => Boolean(monitor));
  const states = members.map((monitor) => classifyMonitor(monitor, now));
  const counts = {
    total: states.length,
    operational: states.filter((state) => state === "operational").length,
    down: states.filter((state) => state === "down").length,
    paused: states.filter((state) => state === "paused").length,
    unknown: states.filter((state) => state === "unknown").length,
  };
  const latestTimes = members
    .map((monitor) => monitor.latest?.completedAt)
    .filter((value): value is number => typeof value === "number");
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    status: aggregateService(states),
    monitorCounts: counts,
    lastCheckAt: latestTimes.length > 0 ? new Date(Math.max(...latestTimes)).toISOString() : null,
  };
};

export const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};
