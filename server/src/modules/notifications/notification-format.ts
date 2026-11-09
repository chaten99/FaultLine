import type { IncidentNotificationSnapshot } from "./notification.types.js";

export const formatUtcTimestamp = (value: string | Date | null | undefined): string => {
  if (!value) return "Unknown";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
};

export const formatDuration = (durationMs: number | null | undefined): string => {
  if (durationMs === null || durationMs === undefined || durationMs < 0) return "Unknown";
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
};

const failureLabels: Record<string, string> = {
  UNEXPECTED_STATUS: "Unexpected HTTP status",
  TIMEOUT: "Request timed out",
  NETWORK_ERROR: "Network error",
  DNS_FAILURE: "DNS resolution failed",
};

export const describeTrigger = (snapshot: IncidentNotificationSnapshot): string => {
  const label = snapshot.failureCategory
    ? (failureLabels[snapshot.failureCategory] ?? "Check failure")
    : "Check failure";
  return snapshot.statusCode ? `${label} (HTTP ${snapshot.statusCode})` : label;
};

export const sanitizeSubjectText = (value: string): string =>
  value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

export const escapeSlackText = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
