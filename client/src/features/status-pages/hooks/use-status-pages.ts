import { useCallback, useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkSlug,
  createService,
  createStatusPage,
  deleteService,
  deleteStatusPage,
  getStatusPage,
  getStatusPageAnalytics,
  listMonitorOptions,
  listStatusPages,
  listSubscribers,
  previewStatusPage,
  publishStatusPage,
  reorderServices,
  unpublishStatusPage,
  updateService,
  updateStatusPage,
} from "../api/status-pages.api";
import type {
  ServiceInput,
  StatusPageInput,
  StatusPagePatch,
  SubscriberQuery,
} from "../types/status-page.types";

export const statusPageKeys = {
  all: ["status-pages"] as const,
  list: ["status-pages", "list"] as const,
  detail: (id: string) => ["status-pages", "detail", id] as const,
  preview: (id: string) => ["status-pages", "preview", id] as const,
  subscribers: (id: string, query: SubscriberQuery) =>
    ["status-pages", "subscribers", id, query] as const,
  analytics: (id: string) => ["status-pages", "analytics", id] as const,
  monitorOptions: (search: string) => ["status-pages", "monitor-options", search] as const,
};

export const useStatusPages = () =>
  useQuery({
    queryKey: statusPageKeys.list,
    queryFn: async () => (await listStatusPages()).data,
  });

export const useStatusPage = (id: string) =>
  useQuery({
    queryKey: statusPageKeys.detail(id),
    queryFn: async () => (await getStatusPage(id)).data.page,
    enabled: Boolean(id),
  });

const useInvalidateStatusPages = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (id?: string) => {
      void queryClient.invalidateQueries({ queryKey: statusPageKeys.list });
      if (id) {
        void queryClient.invalidateQueries({ queryKey: statusPageKeys.detail(id) });
        void queryClient.invalidateQueries({ queryKey: statusPageKeys.preview(id) });
        void queryClient.invalidateQueries({ queryKey: statusPageKeys.analytics(id) });
      }
    },
    [queryClient],
  );
};

export const useCreateStatusPage = () => {
  const invalidate = useInvalidateStatusPages();
  return useMutation({
    mutationFn: async (payload: StatusPageInput) => (await createStatusPage(payload)).data.page,
    onSuccess: () => invalidate(),
  });
};

export const useUpdateStatusPage = () => {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateStatusPages();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: StatusPagePatch }) =>
      (await updateStatusPage(id, payload)).data.page,
    onSuccess: (page) => {
      queryClient.setQueryData(statusPageKeys.detail(page.id), page);
      invalidate(page.id);
    },
  });
};

export const useDeleteStatusPage = () => {
  const invalidate = useInvalidateStatusPages();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteStatusPage(id);
    },
    onSuccess: () => invalidate(),
  });
};

export const usePublishToggle = () => {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateStatusPages();
  return useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) =>
      (publish ? await publishStatusPage(id) : await unpublishStatusPage(id)).data.page,
    onSuccess: (page) => {
      queryClient.setQueryData(statusPageKeys.detail(page.id), page);
      invalidate(page.id);
    },
  });
};

export const useCreateService = (pageId: string) => {
  const invalidate = useInvalidateStatusPages();
  return useMutation({
    mutationFn: async (payload: ServiceInput) =>
      (await createService(pageId, payload)).data.service,
    onSuccess: () => invalidate(pageId),
  });
};

export const useUpdateService = (pageId: string) => {
  const invalidate = useInvalidateStatusPages();
  return useMutation({
    mutationFn: async ({
      serviceId,
      payload,
    }: {
      serviceId: string;
      payload: Partial<ServiceInput>;
    }) => (await updateService(pageId, serviceId, payload)).data.service,
    onSuccess: () => invalidate(pageId),
  });
};

export const useDeleteService = (pageId: string) => {
  const invalidate = useInvalidateStatusPages();
  return useMutation({
    mutationFn: async (serviceId: string) => {
      await deleteService(pageId, serviceId);
    },
    onSuccess: () => invalidate(pageId),
  });
};

export const useReorderServices = (pageId: string) => {
  const invalidate = useInvalidateStatusPages();
  return useMutation({
    mutationFn: async (serviceIds: string[]) => (await reorderServices(pageId, serviceIds)).data,
    onSuccess: () => invalidate(pageId),
  });
};

export const usePreview = (id: string) =>
  useQuery({
    queryKey: statusPageKeys.preview(id),
    queryFn: async () => (await previewStatusPage(id)).data,
    enabled: Boolean(id),
    staleTime: 30_000,
  });

export const useSubscribers = (id: string, query: SubscriberQuery) =>
  useQuery({
    queryKey: statusPageKeys.subscribers(id, query),
    queryFn: async () => (await listSubscribers(id, query)).data,
    placeholderData: keepPreviousData,
    enabled: Boolean(id),
  });

export const usePageAnalytics = (id: string) =>
  useQuery({
    queryKey: statusPageKeys.analytics(id),
    queryFn: async () => (await getStatusPageAnalytics(id)).data,
    enabled: Boolean(id),
    staleTime: 60_000,
  });

export const useMonitorOptions = (search: string, enabled = true) =>
  useQuery({
    queryKey: statusPageKeys.monitorOptions(search),
    queryFn: async () => (await listMonitorOptions(search)).data.items,
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

export const useDebouncedValue = <T>(value: T, delay = 400): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

export const useSlugCheck = (slug: string, valid: boolean, excludeId?: string) => {
  const debounced = useDebouncedValue(slug);
  return useQuery({
    queryKey: ["status-pages", "slug", debounced, excludeId ?? null] as const,
    queryFn: async () => (await checkSlug(debounced, excludeId)).data,
    enabled: valid && debounced.length > 0 && debounced === slug,
    staleTime: 15_000,
  });
};
