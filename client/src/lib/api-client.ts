import axios from "axios";
import { useAuthStore } from "@/features/auth/store/auth.store";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 10_000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshRequest: Promise<string> | null = null;
apiClient.interceptors.response.use(undefined, async (error) => {
  const request = error.config;
  if (error.response?.status !== 401 || request?._retry || request?.url?.includes("/auth/"))
    throw error;
  request._retry = true;
  refreshRequest ??= apiClient
    .post<{ accessToken: string; expiresIn: number; user: unknown }>("/auth/refresh")
    .then(({ data }) => {
      useAuthStore.getState().setAccessToken(data.accessToken);
      return data.accessToken;
    })
    .finally(() => {
      refreshRequest = null;
    });
  request.headers.Authorization = `Bearer ${await refreshRequest}`;
  return apiClient(request);
});
