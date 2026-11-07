import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { listMonitors } from "@/features/monitors/api/monitors.api";
import {
  exportReport,
  getAvailability,
  getIncidentsAnalytics,
  getMonitorAnalytics,
  getMonitorsAnalytics,
  getOverview,
  getResponseTimes,
} from "../api/analytics.api";
import type { AnalyticsQuery, ExportType, MonitorsQuery } from "../types/analytics.types";

export const analyticsKeys = {
  all: ["analytics"] as const,
  overview: (query: AnalyticsQuery) => ["analytics", "overview", query] as const,
  responseTimes: (query: AnalyticsQuery) => ["analytics", "response-times", query] as const,
  availability: (query: AnalyticsQuery) => ["analytics", "availability", query] as const,
  monitors: (query: MonitorsQuery) => ["analytics", "monitors", query] as const,
  incidents: (query: AnalyticsQuery) => ["analytics", "incidents", query] as const,
  monitor: (monitorId: string, query: Omit<AnalyticsQuery, "monitorId">) =>
    ["analytics", "monitor", monitorId, query] as const,
};

const STALE_TIME = 60_000;

export const useOverview = (query: AnalyticsQuery) =>
  useQuery({
    queryKey: analyticsKeys.overview(query),
    queryFn: async () => (await getOverview(query)).data,
    staleTime: STALE_TIME,
  });

export const useResponseTimes = (query: AnalyticsQuery) =>
  useQuery({
    queryKey: analyticsKeys.responseTimes(query),
    queryFn: async () => (await getResponseTimes(query)).data,
    staleTime: STALE_TIME,
  });

export const useAvailability = (query: AnalyticsQuery) =>
  useQuery({
    queryKey: analyticsKeys.availability(query),
    queryFn: async () => (await getAvailability(query)).data,
    staleTime: STALE_TIME,
  });

export const useMonitorsAnalytics = (query: MonitorsQuery) =>
  useQuery({
    queryKey: analyticsKeys.monitors(query),
    queryFn: async () => (await getMonitorsAnalytics(query)).data,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });

export const useIncidentsAnalytics = (query: AnalyticsQuery) =>
  useQuery({
    queryKey: analyticsKeys.incidents(query),
    queryFn: async () => (await getIncidentsAnalytics(query)).data,
    staleTime: STALE_TIME,
  });

export const useMonitorAnalytics = (monitorId: string, query: Omit<AnalyticsQuery, "monitorId">) =>
  useQuery({
    queryKey: analyticsKeys.monitor(monitorId, query),
    queryFn: async () => (await getMonitorAnalytics(monitorId, query)).data,
    staleTime: STALE_TIME,
  });

export const useMonitorOptions = () =>
  useQuery({
    queryKey: ["analytics", "monitor-options"],
    queryFn: async () => {
      const response = await listMonitors({ pageSize: 50, sortBy: "name", sortOrder: "asc" });
      return response.data.items.map((monitor) => ({ id: monitor._id, name: monitor.name }));
    },
    staleTime: 5 * 60_000,
  });

export const useExportReport = () =>
  useMutation({
    mutationFn: async ({ type, query }: { type: ExportType; query: AnalyticsQuery }) => {
      const response = await exportReport(type, query);
      const disposition = response.headers["content-disposition"] as string | undefined;
      return { blob: response.data, disposition: disposition ?? null };
    },
  });
