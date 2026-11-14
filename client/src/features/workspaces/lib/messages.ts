import axios from "axios";
import { getApiErrorMessage } from "@/lib/api-error";

const messages: Record<string, string> = {
  INSUFFICIENT_PERMISSIONS: "You don't have permission to do that in this workspace.",
  WORKSPACE_NOT_FOUND: "This workspace is no longer available to you.",
  OWNER_PROTECTED: "The workspace owner can't be changed this way. Transfer ownership instead.",
  PERSONAL_WORKSPACE: "Personal workspaces can't be deleted, transferred or left.",
  INVALID_ROLE: "That role can't be assigned.",
  ALREADY_MEMBER: "That person is already a member of this workspace.",
  INVITATION_EXISTS:
    "A pending invitation already exists for that email. Resend or revoke it instead.",
  INVITATION_INVALID: "This invitation is invalid or has expired.",
  REAUTHENTICATION_REQUIRED: "Your password is incorrect.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
};

export const getWorkspaceErrorCode = (error: unknown): string | null =>
  axios.isAxiosError(error) && typeof error.response?.data?.code === "string"
    ? (error.response.data.code as string)
    : null;

export const workspaceErrorMessage = (error: unknown): string => {
  const code = getWorkspaceErrorCode(error);
  if (code && messages[code]) return messages[code];
  return getApiErrorMessage(error);
};

export const expectedEmailFromError = (error: unknown): string | null => {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data?.data as { expectedEmailMasked?: unknown } | undefined;
  return typeof data?.expectedEmailMasked === "string" ? data.expectedEmailMasked : null;
};
