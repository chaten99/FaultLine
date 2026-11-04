import { apiClient } from "@/lib/api-client";

export type Monitor = {
  _id: string;
  name: string;
  url: string;
  method: "GET";
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCodes: number[];
  active: boolean;
  configRevision?: number;
  lastCheckAt?: string;
  lastCheckStatus?: "queued" | "running" | "success" | "failure" | "timeout" | "error";
  lastStatusCode?: number;
  lastResponseDurationMs?: number;
  lastCheckId?: string;
  lastFailureCategory?: string;
  lastErrorMessage?: string;
  failureThreshold?: number;
  recoveryThreshold?: number;
  activeIncidentId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MonitorCheck = {
  _id: string;
  monitorId: string;
  userId: string;
  runId: string;
  status: "queued" | "running" | "success" | "failure" | "timeout" | "error";
  startedAt: string;
  completedAt?: string;
  responseDurationMs?: number;
  statusCode?: number;
  failureCategory?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type MonitorInput = Omit<Monitor, "_id" | "createdAt" | "updatedAt">;

export type MonitorCounts = {
  total: number;
  active: number;
  paused: number;
};

export type MonitorList = {
  items: Monitor[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts?: MonitorCounts;
};

export type ListMonitorsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "active" | "paused";
  sortBy?: "createdAt" | "name" | "intervalSeconds" | "url";
  sortOrder?: "asc" | "desc";
};

export type ListChecksParams = {
  page?: number;
  pageSize?: number;
  status?: string;
};

export type CheckList = {
  items: MonitorCheck[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TriggerCheckResponse = {
  status: "queued";
  runId: string;
  message: string;
};

export const listMonitors = (params: number | ListMonitorsParams = 1) => {
  const queryParams = typeof params === "number" ? { page: params } : params;
  return apiClient.get<MonitorList>("/monitors", { params: queryParams });
};

export const getMonitor = (id: string) => apiClient.get<Monitor>(`/monitors/${id}`);

export const createMonitor = (payload: MonitorInput) =>
  apiClient.post<Monitor>("/monitors", payload);

export const updateMonitor = (id: string, payload: Partial<MonitorInput>) =>
  apiClient.patch<Monitor>(`/monitors/${id}`, payload);

export const deleteMonitor = (id: string) => apiClient.delete(`/monitors/${id}`);

export const triggerCheckNow = (id: string) =>
  apiClient.post<TriggerCheckResponse>(`/monitors/${id}/check-now`);

export const getMonitorChecks = (id: string, params?: ListChecksParams) =>
  apiClient.get<CheckList>(`/monitors/${id}/checks`, { params });
