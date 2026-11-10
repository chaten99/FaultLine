import axios from "axios";

type ErrorBody = { code?: string; message?: string; fieldErrors?: Record<string, string> };

export const getErrorCode = (error: unknown): string | null =>
  axios.isAxiosError<ErrorBody>(error) ? (error.response?.data?.code ?? null) : null;

export const isNotFound = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 404;

export const subscribeErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ErrorBody>(error)) {
    if (!error.response) {
      return "We couldn't reach the server. Check your connection and try again.";
    }
    if (error.response.status === 429) {
      return "Too many requests. Please wait a few minutes before trying again.";
    }
    if (error.response.status === 404) return "This status page is not accepting subscriptions.";
    const message = error.response.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Something went wrong. Please try again.";
};

export const tokenErrorMessage = (error: unknown): string => {
  if (getErrorCode(error) === "INVALID_TOKEN") {
    return "This link is invalid or has expired. Request a new one from the status page.";
  }
  return subscribeErrorMessage(error);
};

export const managementErrorMessage = (error: unknown): string => {
  const code = getErrorCode(error);
  if (code === "SLUG_TAKEN") return "That URL is already taken. Choose another.";
  if (code === "STATUS_PAGE_LIMIT_REACHED") {
    return "You have reached the maximum number of status pages.";
  }
  if (axios.isAxiosError<ErrorBody>(error)) {
    if (!error.response) return "Unable to connect to the server. Check your connection.";
    const message = error.response.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Something went wrong. Please try again.";
};
