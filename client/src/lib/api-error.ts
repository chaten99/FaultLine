import axios from "axios";

type ApiErrorResponse = {
  status?: string;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const getApiFieldErrors = (error: unknown): Record<string, string> => {
  if (!axios.isAxiosError<ApiErrorResponse>(error)) return {};
  const fieldErrors = error.response?.data?.fieldErrors;
  return fieldErrors && typeof fieldErrors === "object" ? fieldErrors : {};
};

export const getApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (!error.response) {
      return error.code === "ECONNABORTED"
        ? "The service is temporarily unavailable. Please try again shortly."
        : "Unable to connect to the server. Check your connection and try again.";
    }
    if (error.response.status === 429) return "Too many attempts. Please try again later.";
    const message = error.response.data?.message;
    if (typeof message === "string" && message.trim()) return message;
    if (error.response.status >= 500)
      return "The service is temporarily unavailable. Please try again shortly.";
  }
  return "Something went wrong. Please try again.";
};
