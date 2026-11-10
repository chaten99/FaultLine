import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { disconnectMonitorSocket } from "@/features/monitors/realtime/monitor-socket";
import {
  changePassword,
  getProfile,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updateProfile,
} from "../api/profile.api";
import type { PasswordChangePayload, ProfileResponse } from "../types/profile.types";

export const profileKeys = {
  profile: ["profile"] as const,
  sessions: ["auth-sessions"] as const,
};

export const useProfile = () =>
  useQuery({
    queryKey: profileKeys.profile,
    queryFn: async () => (await getProfile()).data,
  });

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((state) => state.updateUser);
  return useMutation({
    mutationFn: async (name: string) => (await updateProfile({ name })).data.user,
    onSuccess: (user) => {
      queryClient.setQueryData<ProfileResponse>(profileKeys.profile, (previous) =>
        previous ? { ...previous, user } : previous,
      );
      updateUser({ name: user.name });
    },
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: async (payload: PasswordChangePayload) => (await changePassword(payload)).data,
  });

export const useSessions = () =>
  useQuery({
    queryKey: profileKeys.sessions,
    queryFn: async () => (await listSessions()).data.items,
  });

export const useRevokeSession = () =>
  useMutation({
    mutationFn: async (id: string) => (await revokeSession(id)).data,
  });

export const useRevokeOtherSessions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await revokeOtherSessions()).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.sessions });
    },
  });
};

export const useLocalSignOut = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);
  return useCallback(() => {
    disconnectMonitorSocket();
    clearSession();
    queryClient.clear();
    navigate("/login", { replace: true });
  }, [clearSession, navigate, queryClient]);
};
