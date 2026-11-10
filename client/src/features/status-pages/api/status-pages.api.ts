import { apiClient } from "@/lib/api-client";
import type {
  HistoryRange,
  HistoryResponse,
  IncidentList,
  MonitorOption,
  PageAnalytics,
  PreviewResponse,
  PublicStatusPayload,
  ServiceDetail,
  ServiceInput,
  SlugCheck,
  StatusPageDetail,
  StatusPageInput,
  StatusPagePatch,
  StatusPageSummary,
  SubscribeInput,
  SubscriberList,
  SubscriberQuery,
} from "../types/status-page.types";

const base = "/status-pages";
const publicBase = (slug: string) => `/public/status-pages/${encodeURIComponent(slug)}`;

export const listStatusPages = () =>
  apiClient.get<{ items: StatusPageSummary[]; total: number }>(base);

export const createStatusPage = (payload: StatusPageInput) =>
  apiClient.post<{ page: StatusPageDetail }>(base, payload);

export const checkSlug = (slug: string, excludeId?: string) =>
  apiClient.get<SlugCheck>(`${base}/slug-available`, { params: { slug, excludeId } });

export const listMonitorOptions = (search: string) =>
  apiClient.get<{ items: MonitorOption[] }>(`${base}/monitor-options`, {
    params: { search: search || undefined },
  });

export const getStatusPage = (id: string) =>
  apiClient.get<{ page: StatusPageDetail }>(`${base}/${id}`);

export const updateStatusPage = (id: string, payload: StatusPagePatch) =>
  apiClient.patch<{ page: StatusPageDetail }>(`${base}/${id}`, payload);

export const deleteStatusPage = (id: string) => apiClient.delete<{ status: "ok" }>(`${base}/${id}`);

export const publishStatusPage = (id: string) =>
  apiClient.post<{ page: StatusPageDetail }>(`${base}/${id}/publish`);

export const unpublishStatusPage = (id: string) =>
  apiClient.post<{ page: StatusPageDetail }>(`${base}/${id}/unpublish`);

export const createService = (pageId: string, payload: ServiceInput) =>
  apiClient.post<{ service: ServiceDetail }>(`${base}/${pageId}/services`, payload);

export const updateService = (pageId: string, serviceId: string, payload: Partial<ServiceInput>) =>
  apiClient.patch<{ service: ServiceDetail }>(`${base}/${pageId}/services/${serviceId}`, payload);

export const deleteService = (pageId: string, serviceId: string) =>
  apiClient.delete<{ status: "ok" }>(`${base}/${pageId}/services/${serviceId}`);

export const reorderServices = (pageId: string, serviceIds: string[]) =>
  apiClient.post<{ items: ServiceDetail[] }>(`${base}/${pageId}/services/reorder`, { serviceIds });

export const previewStatusPage = (id: string) =>
  apiClient.post<PreviewResponse>(`${base}/${id}/preview`);

export const listSubscribers = (id: string, params: SubscriberQuery) =>
  apiClient.get<SubscriberList>(`${base}/${id}/subscribers`, { params });

export const getStatusPageAnalytics = (id: string) =>
  apiClient.get<PageAnalytics>(`${base}/${id}/analytics`);

export const getPublicStatus = (slug: string) =>
  apiClient.get<PublicStatusPayload>(publicBase(slug));

export const getPublicIncidents = (
  slug: string,
  params: { status: "all" | "active" | "resolved"; page: number; pageSize: number },
) => apiClient.get<IncidentList>(`${publicBase(slug)}/incidents`, { params });

export const getPublicHistory = (slug: string, range: HistoryRange) =>
  apiClient.get<HistoryResponse>(`${publicBase(slug)}/history`, { params: { range } });

export const subscribe = (slug: string, payload: SubscribeInput) =>
  apiClient.post<{ status: "ok"; message: string }>(`${publicBase(slug)}/subscribe`, payload);

export const verifySubscription = (slug: string, token: string) =>
  apiClient.post<{ status: "confirmed"; pageName: string }>(
    `${publicBase(slug)}/subscribe/verify`,
    {
      token,
    },
  );

export const resendConfirmation = (slug: string, email: string) =>
  apiClient.post<{ status: "ok"; message: string }>(`${publicBase(slug)}/subscribe/resend`, {
    email,
  });

export const getUnsubscribeInfo = (slug: string, token: string) =>
  apiClient.get<{ pageName: string; emailMasked: string; alreadyUnsubscribed: boolean }>(
    `${publicBase(slug)}/unsubscribe`,
    { params: { token } },
  );

export const confirmUnsubscribe = (slug: string, token: string) =>
  apiClient.post<{ status: "unsubscribed"; pageName: string }>(`${publicBase(slug)}/unsubscribe`, {
    token,
  });
