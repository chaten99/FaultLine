export type PublicStatus = "operational" | "partial_outage" | "major_outage" | "unknown";
export type MonitorState = "operational" | "down" | "paused" | "unknown";
export type PageStatus = "draft" | "published" | "unpublished";
export type IncidentStatus = "investigating" | "acknowledged" | "resolved";
export type TimelineState = "up" | "down" | "paused" | "unknown" | "insufficient";
export type SubscriberStatus = "pending" | "active" | "unsubscribed";
export type HistoryRange = "24h" | "7d" | "30d" | "90d";

export type SubscriberEvents = { opened: boolean; acknowledged: boolean; resolved: boolean };
export type Branding = { companyName: string; logoUrl: string | null };

export type PublicIncidentUpdate = { at: string; status: IncidentStatus; message: string };

export type PublicIncident = {
  id: string;
  title: string;
  status: IncidentStatus;
  services: string[];
  startedAt: string;
  resolvedAt: string | null;
  durationMs: number;
  ongoing: boolean;
  updates: PublicIncidentUpdate[];
};

export type MonitorCounts = {
  total: number;
  operational: number;
  down: number;
  paused: number;
  unknown: number;
};

export type ServiceStatusBlock = {
  id: string;
  name: string;
  description: string;
  status: PublicStatus;
  monitorCounts: MonitorCounts;
  lastCheckAt: string | null;
};

export type StatusBlock = {
  overall: PublicStatus;
  message: string;
  updatedAt: string;
  services: ServiceStatusBlock[];
};

export type PublicStatusPayload = {
  page: {
    name: string;
    slug: string;
    description: string;
    branding: Branding;
    subscribersEnabled: boolean;
    subscriberEvents: SubscriberEvents;
  };
  status: StatusBlock;
  incidents: { active: PublicIncident[] };
  preview?: boolean;
};

export type StatusPageSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: PageStatus;
  publicUrl: string;
  serviceCount: number;
  overallStatus: PublicStatus;
  branding: Branding;
  subscribersEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ServiceMonitor = {
  id: string;
  name: string;
  host: string | null;
  state: MonitorState;
};

export type ServiceDetail = {
  id: string;
  name: string;
  description: string;
  order: number;
  enabled: boolean;
  monitorIds: string[];
  monitors: ServiceMonitor[];
  status: PublicStatus;
  createdAt: string;
  updatedAt: string;
};

export type StatusPageDetail = StatusPageSummary & {
  services: ServiceDetail[];
  subscriberEvents: SubscriberEvents;
};

export type MonitorOption = {
  id: string;
  name: string;
  host: string | null;
  active: boolean;
  state: MonitorState;
};

export type SlugCheck = {
  slug: string;
  valid: boolean;
  available: boolean;
  message: string | null;
};

export type StatusPageInput = {
  name: string;
  slug: string;
  description?: string;
  branding?: { companyName?: string; logoUrl?: string | null };
  subscribersEnabled?: boolean;
};

export type StatusPagePatch = Partial<StatusPageInput> & {
  subscriberEvents?: Partial<SubscriberEvents>;
};

export type ServiceInput = {
  name: string;
  description?: string;
  monitorIds: string[];
  enabled?: boolean;
};

export type SubscriberItem = {
  id: string;
  emailMasked: string;
  status: SubscriberStatus;
  events: SubscriberEvents;
  verifiedAt: string | null;
  createdAt: string;
};

export type SubscriberList = {
  counts: Record<SubscriberStatus, number>;
  items: SubscriberItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SubscriberQuery = {
  page: number;
  pageSize: number;
  status: "all" | SubscriberStatus;
};

export type PageAnalytics = {
  status: PublicStatus;
  subscribers: Record<SubscriberStatus, number>;
  uptime: {
    rangeDays: number;
    availability: { percent: number | null; state: "ok" | "insufficient" };
    services: { id: string; name: string; percent: number | null; state: "ok" | "insufficient" }[];
  };
};

export type PreviewResponse = { preview: PublicStatusPayload; incidents: PublicIncident[] };

export type IncidentList = {
  items: PublicIncident[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TimelineCell = { start: string; end: string; state: TimelineState };
export type Availability = { percent: number | null; state: "ok" | "insufficient" };

export type HistoryResponse = {
  range: HistoryRange;
  window: { from: string; to: string; bucketSeconds: number };
  overall: { availability: Availability; timeline: TimelineCell[] };
  services: { id: string; name: string; availability: Availability; timeline: TimelineCell[] }[];
  note: string;
};

export type SubscribeInput = { email: string; events?: Partial<SubscriberEvents> };
