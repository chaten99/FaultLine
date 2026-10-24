import { apiClient } from "@/lib/api-client";
import type { AuthResponse, User } from "../types/auth.types";

export const login = (payload: { email: string; password: string }) =>
  apiClient.post<AuthResponse>("/auth/login", payload);
export const register = (payload: { name: string; email: string; password: string }) =>
  apiClient.post<AuthResponse>("/auth/register", payload);
export const refresh = () => apiClient.post<AuthResponse>("/auth/refresh");
export const currentUser = () => apiClient.get<{ user: User }>("/auth/me");
export const logout = () => apiClient.post("/auth/logout");
