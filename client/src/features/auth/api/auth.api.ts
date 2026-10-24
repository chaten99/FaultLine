import { apiClient } from "@/lib/api-client";
import type { AuthResponse, User } from "../types/auth.types";

export const login = (payload: { email: string; password: string }) =>
  apiClient.post<AuthResponse>("/auth/login", payload);
export const register = (payload: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}) => apiClient.post<{ status: string; email: string }>("/auth/register", payload);
export const verifyEmail = (payload: { email: string; code: string; challengeId?: string }) =>
  apiClient.post<AuthResponse | { status: string }>("/auth/email-verification/verify", payload);
export const resendVerification = (payload: { email: string; challengeId?: string }) =>
  apiClient.post("/auth/email-verification/resend", payload);
export const forgotPassword = (payload: { email: string }) =>
  apiClient.post("/auth/forgot-password", payload);
export const verifyResetOtp = (payload: { email: string; code: string }) =>
  apiClient.post<{ grant: string }>("/auth/forgot-password/verify-otp", payload);
export const resetPassword = (payload: { grant: string; password: string }) =>
  apiClient.post("/auth/reset-password", payload);
export const refresh = () => apiClient.post<AuthResponse>("/auth/refresh");
export const currentUser = () => apiClient.get<{ user: User }>("/auth/me");
export const logout = () => apiClient.post("/auth/logout");
