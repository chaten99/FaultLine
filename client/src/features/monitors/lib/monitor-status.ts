import type { Monitor } from "../api/monitors.api";

export type ComputedMonitorStatus = "up" | "down" | "stale" | "checking" | "queued" | "not_checked";

export function getComputedStatus(
  monitor: Pick<Monitor, "active" | "lastCheckStatus" | "lastCheckAt" | "intervalSeconds">,
): ComputedMonitorStatus {
  if (monitor.lastCheckStatus === "queued") return "queued";
  if (monitor.lastCheckStatus === "running") return "checking";

  if (!monitor.lastCheckStatus || !monitor.lastCheckAt) {
    return "not_checked";
  }

  const lastCheckedMs = new Date(monitor.lastCheckAt).getTime();
  const isStale = Date.now() - lastCheckedMs > monitor.intervalSeconds * 2.5 * 1000;
  if (isStale) return "stale";

  if (monitor.lastCheckStatus === "success") return "up";
  return "down";
}

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}
