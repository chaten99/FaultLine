import { apiClient } from "@/lib/api-client";
import type {
  PasswordChangePayload,
  PasswordChangeResponse,
  ProfileResponse,
  ProfileUser,
  RevokeOthersResponse,
  RevokeSessionResponse,
  SessionsResponse,
} from "../types/profile.types";

export const getProfile = () => apiClient.get<ProfileResponse>("/profile");

export const updateProfile = (payload: { name: string }) =>
  apiClient.patch<{ user: ProfileUser }>("/profile", payload);

export const changePassword = (payload: PasswordChangePayload) =>
  apiClient.post<PasswordChangeResponse>("/auth/password", payload);

export const listSessions = () => apiClient.get<SessionsResponse>("/auth/sessions");

export const revokeSession = (id: string) =>
  apiClient.delete<RevokeSessionResponse>(`/auth/sessions/${id}`);

export const revokeOtherSessions = () =>
  apiClient.post<RevokeOthersResponse>("/auth/sessions/revoke-others");
