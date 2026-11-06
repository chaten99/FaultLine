import { apiClient } from "@/lib/api-client";
import type {
  DeliveryDetail,
  DeliveryList,
  DeliveryQuery,
  DeliverySummary,
  IncidentEventType,
  Integration,
  IntegrationUpdate,
  NotificationPreferences,
  PreferencesPatch,
} from "../types/notification.types";

const TEST_TIMEOUT_MS = 25_000;

export const getPreferences = () =>
  apiClient.get<NotificationPreferences>("/notifications/preferences");

export const updatePreferences = (patch: PreferencesPatch) =>
  apiClient.patch<NotificationPreferences>("/notifications/preferences", patch);

export const listIntegrations = () =>
  apiClient.get<{ items: Integration[] }>("/notifications/integrations");

export const createSlackIntegration = (payload: {
  name: string;
  webhookUrl: string;
  events?: IncidentEventType[];
}) => apiClient.post<{ integration: Integration }>("/notifications/integrations/slack", payload);

export const createWebhookIntegration = (payload: {
  name: string;
  url: string;
  events?: IncidentEventType[];
}) =>
  apiClient.post<{ integration: Integration; signingSecret: string }>(
    "/notifications/integrations/webhooks",
    payload,
  );

export const updateIntegration = (id: string, payload: IntegrationUpdate) =>
  apiClient.patch<{ integration: Integration }>(`/notifications/integrations/${id}`, payload);

export const rotateIntegrationSecret = (id: string) =>
  apiClient.post<{ integration: Integration; signingSecret: string }>(
    `/notifications/integrations/${id}/rotate-secret`,
  );

export const deleteIntegration = (id: string) =>
  apiClient.delete<{ status: "ok" }>(`/notifications/integrations/${id}`);

export const testIntegration = (id: string) =>
  apiClient.post<{ delivery: DeliverySummary }>(
    `/notifications/integrations/${id}/test`,
    undefined,
    { timeout: TEST_TIMEOUT_MS },
  );

export const testEmail = () =>
  apiClient.post<{ delivery: DeliverySummary }>("/notifications/email/test", undefined, {
    timeout: TEST_TIMEOUT_MS,
  });

export const listDeliveries = (params: DeliveryQuery) =>
  apiClient.get<DeliveryList>("/notifications/deliveries", { params });

export const getDelivery = (id: string) =>
  apiClient.get<{ delivery: DeliveryDetail }>(`/notifications/deliveries/${id}`);

export const retryDelivery = (id: string) =>
  apiClient.post<{ delivery: DeliverySummary }>(`/notifications/deliveries/${id}/retry`);
