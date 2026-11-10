export const pageStatuses = ["draft", "published", "unpublished"] as const;
export type PageStatus = (typeof pageStatuses)[number];

export type PublicStatus = "operational" | "partial_outage" | "major_outage" | "unknown";
export type MonitorState = "operational" | "down" | "paused" | "unknown";

export const subscriberStatuses = ["pending", "active", "unsubscribed"] as const;
export type SubscriberStatus = (typeof subscriberStatuses)[number];

export type SubscriberEvents = { opened: boolean; acknowledged: boolean; resolved: boolean };

export const defaultOfferedEvents: SubscriberEvents = {
  opened: true,
  acknowledged: false,
  resolved: true,
};

export const defaultSubscriberEvents: SubscriberEvents = {
  opened: true,
  acknowledged: false,
  resolved: true,
};

export type PublicIncidentStatus = "investigating" | "acknowledged" | "resolved";

export type PublicIncident = {
  id: string;
  title: string;
  status: PublicIncidentStatus;
  services: string[];
  startedAt: string;
  resolvedAt: string | null;
  durationMs: number;
  ongoing: boolean;
  updates: Array<{ at: string; status: PublicIncidentStatus; message: string }>;
};

export type ServiceStatusBlock = {
  id: string;
  name: string;
  description: string;
  status: PublicStatus;
  monitorCounts: {
    total: number;
    operational: number;
    down: number;
    paused: number;
    unknown: number;
  };
  lastCheckAt: string | null;
};

export type StatusBlock = {
  overall: PublicStatus;
  message: string;
  updatedAt: string;
  services: ServiceStatusBlock[];
};

export const eventKeyFor = {
  "incident.opened": "opened",
  "incident.acknowledged": "acknowledged",
  "incident.resolved": "resolved",
} as const;
