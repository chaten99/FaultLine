export type IncidentEventType = "incident.opened" | "incident.acknowledged" | "incident.resolved";
export type DeliveryEventType = IncidentEventType | "notification.test";
export type NotificationChannel = "email" | "slack" | "webhook";
export type IntegrationType = "slack" | "webhook";
export type DeliveryStatus = "pending" | "queued" | "sending" | "delivered" | "retrying" | "failed";

export type NotificationPreferences = {
  enabled: boolean;
  channels: { email: boolean; slack: boolean; webhook: boolean };
  events: { opened: boolean; acknowledged: boolean; resolved: boolean };
  email: { address: string; verified: boolean };
  updatedAt: string | null;
};

export type PreferencesPatch = {
  enabled?: boolean;
  channels?: Partial<NotificationPreferences["channels"]>;
  events?: Partial<NotificationPreferences["events"]>;
};

export type IntegrationLastDelivery = {
  status: DeliveryStatus;
  eventType: DeliveryEventType;
  kind: "incident" | "test";
  at: string;
};

export type Integration = {
  id: string;
  type: IntegrationType;
  name: string;
  enabled: boolean;
  events: IncidentEventType[];
  urlHint: string;
  hasSigningSecret: boolean;
  lastDelivery: IntegrationLastDelivery | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationUpdate = {
  name?: string;
  enabled?: boolean;
  events?: IncidentEventType[];
  webhookUrl?: string;
  url?: string;
};

export type DeliverySummary = {
  id: string;
  kind: "incident" | "test";
  eventType: DeliveryEventType;
  channel: NotificationChannel;
  integrationId: string | null;
  integrationName: string | null;
  incidentId: string | null;
  incidentTitle: string | null;
  monitorName: string | null;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  nextRetryAt: string | null;
  responseCode: number | null;
  failureCategory: string | null;
  message: string | null;
  retryable: boolean;
  createdAt: string;
};

export type DeliveryAttempt = {
  attempt: number;
  at: string;
  outcome: "delivered" | "failed";
  responseCode: number | null;
  failureCategory: string | null;
  durationMs: number | null;
  willRetry: boolean;
};

export type DeliveryDetail = DeliverySummary & { attemptHistory: DeliveryAttempt[] };

export type DeliveryList = {
  items: DeliverySummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DeliveryFilters = {
  status: "all" | DeliveryStatus;
  channel: "all" | NotificationChannel;
  eventType: "all" | DeliveryEventType;
  from: string;
  to: string;
};

export type DeliveryQuery = {
  page: number;
  pageSize: number;
  status?: DeliveryStatus;
  channel?: NotificationChannel;
  eventType?: DeliveryEventType;
  from?: string;
  to?: string;
};
