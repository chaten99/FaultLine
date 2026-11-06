import type {
  DeliveryEventType,
  DeliveryFilters,
  DeliveryQuery,
  DeliveryStatus,
  DeliverySummary,
  IncidentEventType,
  NotificationChannel,
} from "../types/notification.types";

export type StatusTone = "success" | "danger" | "warning" | "neutral";

export const incidentEventTypes: IncidentEventType[] = [
  "incident.opened",
  "incident.acknowledged",
  "incident.resolved",
];

export const eventLabels: Record<DeliveryEventType, string> = {
  "incident.opened": "Incident opened",
  "incident.acknowledged": "Incident acknowledged",
  "incident.resolved": "Incident resolved",
  "notification.test": "Test notification",
};

export const channelLabels: Record<NotificationChannel, string> = {
  email: "Email",
  slack: "Slack",
  webhook: "Webhook",
};

export const statusLabels: Record<DeliveryStatus, string> = {
  pending: "Pending",
  queued: "Queued",
  sending: "Sending",
  delivered: "Delivered",
  retrying: "Retrying",
  failed: "Failed",
};

export const deliveryStatuses = Object.keys(statusLabels) as DeliveryStatus[];
export const deliveryChannels = Object.keys(channelLabels) as NotificationChannel[];
export const deliveryEventTypes = Object.keys(eventLabels) as DeliveryEventType[];

export const statusTone = (status: DeliveryStatus): StatusTone => {
  if (status === "delivered") return "success";
  if (status === "failed") return "danger";
  if (status === "retrying") return "warning";
  return "neutral";
};

const failureLabels: Record<string, string> = {
  NETWORK_ERROR: "Network error",
  TIMEOUT: "Request timed out",
  RATE_LIMITED: "Rate limited by provider",
  PROVIDER_ERROR: "Provider error",
  INVALID_CREDENTIALS: "Credentials rejected",
  INVALID_CONFIGURATION: "Invalid configuration",
  SSRF_BLOCKED: "Destination not permitted",
  REDIRECT_BLOCKED: "Redirect blocked",
  PAYLOAD_REJECTED: "Payload rejected",
  RECIPIENT_UNVERIFIED: "Email address not verified",
  INTEGRATION_UNAVAILABLE: "Integration unavailable",
  UNKNOWN: "Unknown error",
};

export const failureCategoryLabel = (category: string | null): string => {
  if (!category) return "None";
  const known = failureLabels[category];
  if (known) return known;
  const words = category.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const formatRelativeTime = (iso: string | null | undefined, now = Date.now()): string => {
  if (!iso) return "Never";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "Unknown";
  const diffSeconds = Math.round((now - time) / 1000);
  const future = diffSeconds < 0;
  const seconds = Math.abs(diffSeconds);
  if (seconds < 45) return future ? "in a few seconds" : "just now";
  let value: number;
  let unit: string;
  if (seconds < 3600) {
    value = Math.max(1, Math.round(seconds / 60));
    unit = "minute";
  } else if (seconds < 86400) {
    value = Math.round(seconds / 3600);
    unit = "hour";
  } else {
    value = Math.round(seconds / 86400);
    unit = "day";
    if (value >= 30) {
      return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  }
  const text = `${value} ${unit}${value === 1 ? "" : "s"}`;
  return future ? `in ${text}` : `${text} ago`;
};

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export const formatDurationMs = (ms: number | null): string => {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
};

export const isDeliveryRetryable = (
  delivery: Pick<DeliverySummary, "status" | "retryable">,
): boolean => delivery.status === "failed" && delivery.retryable;

export const defaultDeliveryFilters: DeliveryFilters = {
  status: "all",
  channel: "all",
  eventType: "all",
  from: "",
  to: "",
};

const dayBoundaryIso = (value: string, time: string): string | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${time}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export const buildDeliveryQuery = (
  filters: DeliveryFilters,
  page: number,
  pageSize: number,
): DeliveryQuery => {
  const query: DeliveryQuery = { page, pageSize };
  if (filters.status !== "all") query.status = filters.status;
  if (filters.channel !== "all") query.channel = filters.channel;
  if (filters.eventType !== "all") query.eventType = filters.eventType;
  const from = dayBoundaryIso(filters.from, "00:00:00");
  const to = dayBoundaryIso(filters.to, "23:59:59.999");
  if (from) query.from = from;
  if (to) query.to = to;
  return query;
};

export const hasActiveFilters = (filters: DeliveryFilters): boolean =>
  filters.status !== "all" ||
  filters.channel !== "all" ||
  filters.eventType !== "all" ||
  Boolean(filters.from) ||
  Boolean(filters.to);

export const toggleEvent = (
  events: IncidentEventType[],
  event: IncidentEventType,
  checked: boolean,
): IncidentEventType[] => {
  const next = new Set(events);
  if (checked) next.add(event);
  else next.delete(event);
  return incidentEventTypes.filter((item) => next.has(item));
};

export const summarizeEvents = (events: IncidentEventType[]): string => {
  if (events.length === 0) return "No events";
  return events.map((event) => eventLabels[event].replace("Incident ", "")).join(", ");
};
