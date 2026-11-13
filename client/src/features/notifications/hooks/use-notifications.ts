import { useCallback, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSlackIntegration,
  createWebhookIntegration,
  deleteIntegration,
  getDelivery,
  getPreferences,
  listDeliveries,
  listIntegrations,
  retryDelivery,
  rotateIntegrationSecret,
  testEmail,
  testIntegration,
  updateIntegration,
  updatePreferences,
} from "../api/notifications.api";
import type {
  DeliveryQuery,
  IncidentEventType,
  Integration,
  IntegrationUpdate,
  PreferencesPatch,
} from "../types/notification.types";

export const notificationKeys = {
  preferences: ["notification-preferences"] as const,
  integrations: ["notification-integrations"] as const,
  deliveries: ["notification-deliveries"] as const,
  delivery: (id: string) => ["notification-delivery", id] as const,
};

export const usePreferences = () =>
  useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: async () => (await getPreferences()).data,
  });

export const useUpdatePreferences = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: PreferencesPatch) => (await updatePreferences(patch)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(notificationKeys.preferences, data);
    },
  });
};

export const useIntegrations = (enabled = true) =>
  useQuery({
    queryKey: notificationKeys.integrations,
    enabled,
    queryFn: async () => (await listIntegrations()).data.items,
  });

const useRefreshNotifications = () => {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.integrations });
    void queryClient.invalidateQueries({ queryKey: notificationKeys.deliveries });
  }, [queryClient]);
};

export const useCreateSlackIntegration = () => {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      webhookUrl: string;
      events: IncidentEventType[];
    }) => (await createSlackIntegration(payload)).data.integration,
    onSuccess: refresh,
  });
};

export const useUpdateIntegration = () => {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: IntegrationUpdate }) =>
      (await updateIntegration(id, payload)).data.integration,
    onSuccess: refresh,
  });
};

export const useDeleteIntegration = () => {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteIntegration(id);
    },
    onSuccess: refresh,
  });
};

export const useTestIntegration = () => {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: async (id: string) => (await testIntegration(id)).data.delivery,
    onSettled: refresh,
  });
};

export const useTestEmail = () => {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: async () => (await testEmail()).data.delivery,
    onSettled: refresh,
  });
};

export type SecretResult = { integration: Integration; signingSecret: string };

const useSecretAction = <TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<SecretResult>,
) => {
  const refresh = useRefreshNotifications();
  const [isPending, setIsPending] = useState(false);
  const run = useCallback(
    async (...args: TArgs): Promise<SecretResult> => {
      setIsPending(true);
      try {
        const result = await action(...args);
        refresh();
        return result;
      } finally {
        setIsPending(false);
      }
    },
    [action, refresh],
  );
  return { run, isPending };
};

const createWebhookAction = async (payload: {
  name: string;
  url: string;
  events: IncidentEventType[];
}): Promise<SecretResult> => (await createWebhookIntegration(payload)).data;

const rotateSecretAction = async (id: string): Promise<SecretResult> =>
  (await rotateIntegrationSecret(id)).data;

export const useCreateWebhookIntegration = () => useSecretAction(createWebhookAction);

export const useRotateWebhookSecret = () => useSecretAction(rotateSecretAction);

export const useDeliveries = (query: DeliveryQuery) =>
  useQuery({
    queryKey: [...notificationKeys.deliveries, query],
    queryFn: async () => (await listDeliveries(query)).data,
    placeholderData: keepPreviousData,
  });

export const useDeliveryDetail = (id: string | null) =>
  useQuery({
    queryKey: notificationKeys.delivery(id ?? ""),
    queryFn: async () => (await getDelivery(id ?? "")).data.delivery,
    enabled: Boolean(id),
  });

export const useRetryDelivery = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await retryDelivery(id)).data.delivery,
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.deliveries });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.integrations });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.delivery(id) });
    },
  });
};
