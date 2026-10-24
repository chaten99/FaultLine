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
