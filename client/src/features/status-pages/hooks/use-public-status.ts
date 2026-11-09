import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import {
  confirmUnsubscribe,
  getPublicHistory,
  getPublicIncidents,
  getPublicStatus,
  getUnsubscribeInfo,
  resendConfirmation,
  subscribe,
  verifySubscription,
} from "../api/status-pages.api";
import type { HistoryRange, SubscribeInput } from "../types/status-page.types";

export const publicKeys = {
  status: (slug: string) => ["public-status", slug] as const,
  incidents: (slug: string, filter: string) => ["public-incidents", slug, filter] as const,
  history: (slug: string, range: HistoryRange) => ["public-history", slug, range] as const,
};

const RESYNC_MS = 5 * 60_000;

export const usePublicStatus = (slug: string) =>
  useQuery({
    queryKey: publicKeys.status(slug),
    queryFn: async () => (await getPublicStatus(slug)).data,
    retry: (count, error) =>
      count < 1 && !(typeof error === "object" && error !== null && "response" in error),
    staleTime: 60_000,
    refetchInterval: () => (document.visibilityState === "visible" ? RESYNC_MS : false),
    refetchIntervalInBackground: false,
  });

export const usePastIncidents = (slug: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: publicKeys.incidents(slug, "resolved"),
    queryFn: async ({ pageParam }) =>
      (await getPublicIncidents(slug, { status: "resolved", page: pageParam, pageSize: 10 })).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled,
    staleTime: 60_000,
  });

export const usePublicHistory = (slug: string, range: HistoryRange) =>
  useQuery({
    queryKey: publicKeys.history(slug, range),
    queryFn: async () => (await getPublicHistory(slug, range)).data,
    staleTime: 60_000,
  });

export const useSubscribe = (slug: string) =>
  useMutation({
    mutationFn: async (payload: SubscribeInput) => (await subscribe(slug, payload)).data,
  });

export const useResendConfirmation = (slug: string) =>
  useMutation({
    mutationFn: async (email: string) => (await resendConfirmation(slug, email)).data,
  });

export const useVerifySubscription = (slug: string) =>
  useMutation({
    mutationFn: async (token: string) => (await verifySubscription(slug, token)).data,
  });

export const useUnsubscribeInfo = (slug: string, token: string) =>
  useQuery({
    queryKey: ["public-unsubscribe", slug, token] as const,
    queryFn: async () => (await getUnsubscribeInfo(slug, token)).data,
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
  });

export const useConfirmUnsubscribe = (slug: string) =>
  useMutation({
    mutationFn: async (token: string) => (await confirmUnsubscribe(slug, token)).data,
  });
