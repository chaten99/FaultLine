export type IncidentStatus = "open" | "acknowledged" | "resolved";
export type IncidentResolutionType = "automatic" | "manual";

export type IncidentTimelineEventType =
  | "incident.created"
  | "incident.acknowledged"
  | "incident.failure_observed"
  | "incident.recovery_progress"
  | "incident.resolved"
  | "incident.manually_resolved";

export type IncidentActorType = "system" | "user";

export type PopulatedMonitorRef = {
  _id: string;
  name: string;
  url: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  active?: boolean;
};

export type PopulatedActorRef = {
  _id: string;
  name: string;
  email: string;
};

export type Incident = {
  _id: string;
  monitorId: string | PopulatedMonitorRef;
  userId: string;
  title: string;
  status: IncidentStatus;
  firstFailureAt: string;
  lastFailureAt: string;
  openedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string | PopulatedActorRef;
  resolvedAt?: string;
  resolutionType?: IncidentResolutionType;
  resolutionReason?: string;
  firstFailureCheckId?: string;
  latestFailureCheckId?: string;
  recoveryCheckId?: string;
  failureCountAtCreation?: number;
  recoveryCheckCount?: number;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
};

export type IncidentTimelineItem = {
  _id: string;
  incidentId: string;
  monitorId: string;
  userId: string;
  type: IncidentTimelineEventType;
  actorType: IncidentActorType;
  actorId?: string | PopulatedActorRef;
  checkId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type IncidentCounts = {
  open: number;
  acknowledged: number;
  resolved: number;
  total: number;
};

export type IncidentList = {
  items: Incident[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: IncidentCounts;
};

export type IncidentDetailsResponse = {
  incident: Incident;
  timeline: IncidentTimelineItem[];
};

export type ListIncidentsParams = {
  page?: number;
  pageSize?: number;
  status?: "all" | "open" | "acknowledged" | "resolved";
  monitorId?: string;
  sortBy?: "createdAt" | "openedAt" | "resolvedAt";
  sortOrder?: "asc" | "desc";
};
