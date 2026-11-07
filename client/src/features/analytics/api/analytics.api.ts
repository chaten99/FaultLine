import { apiClient } from "@/lib/api-client";
import type {
  AnalyticsQuery,
  AvailabilityResponse,
  ExportType,
  IncidentsAnalyticsResponse,
  MonitorAnalyticsResponse,
  MonitorsAnalyticsResponse,
  MonitorsQuery,
  OverviewResponse,
  ResponseTimesResponse,
} from "../types/analytics.types";

const withoutEmpty = <T extends Record<string, unknown>>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );

export const getOverview = (params: AnalyticsQuery) =>
  apiClient.get<OverviewResponse>("/analytics/overview", { params: withoutEmpty(params) });

export const getResponseTimes = (params: AnalyticsQuery) =>
  apiClient.get<ResponseTimesResponse>("/analytics/response-times", {
    params: withoutEmpty(params),
  });

export const getAvailability = (params: AnalyticsQuery) =>
  apiClient.get<AvailabilityResponse>("/analytics/availability", { params: withoutEmpty(params) });

export const getMonitorsAnalytics = (params: MonitorsQuery) =>
  apiClient.get<MonitorsAnalyticsResponse>("/analytics/monitors", {
    params: withoutEmpty({
      ...params,
      status: params.status === "all" ? undefined : params.status,
      quality: params.quality === "all" ? undefined : params.quality,
    }),
  });

export const getIncidentsAnalytics = (params: AnalyticsQuery) =>
  apiClient.get<IncidentsAnalyticsResponse>("/analytics/incidents", {
    params: withoutEmpty(params),
  });

export const getMonitorAnalytics = (monitorId: string, params: Omit<AnalyticsQuery, "monitorId">) =>
  apiClient.get<MonitorAnalyticsResponse>(`/analytics/monitors/${monitorId}`, { params });

export const exportReport = (type: ExportType, params: AnalyticsQuery) =>
  apiClient.get<Blob>("/analytics/export", {
    params: withoutEmpty({ type, ...params }),
    responseType: "blob",
    timeout: 60_000,
  });
