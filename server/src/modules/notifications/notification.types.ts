export const incidentEventTypes = [
  "incident.opened",
  "incident.acknowledged",
  "incident.resolved",
] as const;
export type IncidentEventType = (typeof incidentEventTypes)[number];

export const testEventType = "notification.test" as const;
export type DeliveryEventType = IncidentEventType | typeof testEventType;

export const channelTypes = ["email", "slack", "webhook"] as const;
export type ChannelType = (typeof channelTypes)[number];

export const integrationTypes = ["slack", "webhook"] as const;
export type IntegrationType = (typeof integrationTypes)[number];

export const deliveryStatuses = [
  "pending",
  "queued",
  "sending",
  "delivered",
  "retrying",
  "failed",
] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

export type FailureCategory =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INVALID_CREDENTIALS"
  | "INVALID_PAYLOAD"
  | "DESTINATION_BLOCKED"
  | "REDIRECT_REJECTED"
  | "RESPONSE_TOO_LARGE"
  | "EMAIL_NOT_VERIFIED"
  | "INTEGRATION_UNAVAILABLE"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export type IncidentNotificationSnapshot = {
  incidentId: string;
  monitorId: string;
  monitorName: string;
  title: string;
  status: "open" | "acknowledged" | "resolved";
  openedAt: string;
  firstFailureAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  resolvedAt: string | null;
  resolutionType: "automatic" | "manual" | null;
  durationMs: number | null;
  failureCategory: string | null;
  statusCode: number | null;
  failureThreshold: number;
  recoveryThreshold: number | null;
  recoveryCheckCount: number | null;
  incidentUrl: string;
};

export type OutboundMessage = {
  deliveryId: string;
  eventId: string;
  eventType: DeliveryEventType;
  createdAt: string;
  snapshot: IncidentNotificationSnapshot | null;
};

export type ChannelResult =
  | { ok: true; responseCode: number | null; durationMs: number }
  | {
      ok: false;
      category: FailureCategory;
      transient: boolean;
      responseCode: number | null;
      retryAfterMs: number | null;
      durationMs: number;
    };

export const failureMessages: Record<FailureCategory, string> = {
  NETWORK_ERROR: "The destination could not be reached.",
  TIMEOUT: "The destination did not respond in time.",
  RATE_LIMITED: "The destination is rate limiting requests.",
  PROVIDER_ERROR: "The destination reported a temporary server error.",
  INVALID_CREDENTIALS: "The destination rejected the stored credentials or endpoint.",
  INVALID_PAYLOAD: "The destination rejected the notification payload.",
  DESTINATION_BLOCKED: "The destination address is not permitted.",
  REDIRECT_REJECTED: "The destination responded with a redirect, which is not followed.",
  RESPONSE_TOO_LARGE: "The destination response exceeded the allowed size.",
  EMAIL_NOT_VERIFIED: "The account email address is not verified.",
  INTEGRATION_UNAVAILABLE: "The integration was deleted or disabled.",
  CONFIGURATION_ERROR: "Notification delivery is not configured correctly.",
  UNKNOWN: "The notification could not be delivered.",
};
