import type { Invitation, InvitationStatus } from "../types/workspace.types";

export const invitationStatusLabels: Record<InvitationStatus, string> = {
  pending: "Pending",
  expired: "Expired",
  accepted: "Accepted",
  revoked: "Revoked",
};

export const effectiveInvitationStatus = (
  invitation: Pick<Invitation, "status" | "expiresAt">,
  now = Date.now(),
): InvitationStatus =>
  invitation.status === "pending" && Date.parse(invitation.expiresAt) <= now
    ? "expired"
    : invitation.status;

export const describeExpiry = (expiresAt: string, now = Date.now()): string => {
  const remaining = Date.parse(expiresAt) - now;
  if (Number.isNaN(remaining)) return "Unknown";
  if (remaining <= 0) return "Expired";
  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 60) return `Expires in ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Expires in ${hours} h`;
  return `Expires in ${Math.floor(hours / 24)} days`;
};

export const canResendInvitation = (status: InvitationStatus): boolean =>
  status === "pending" || status === "expired";

export const canRevokeInvitation = (status: InvitationStatus): boolean => status === "pending";

export const invitationPathWithoutToken = "/invitations/accept";

export const buildTokenlessReplacement = (
  token: string,
): { to: string; state: { invitationToken: string } } => ({
  to: invitationPathWithoutToken,
  state: { invitationToken: token },
});

export const extractInvitationToken = (
  search: string,
  state: unknown,
): { token: string | null; shouldStrip: boolean } => {
  const fromState =
    state && typeof state === "object" && "invitationToken" in state
      ? (state as { invitationToken?: unknown }).invitationToken
      : null;
  if (typeof fromState === "string" && fromState.length > 0) {
    return { token: fromState, shouldStrip: false };
  }
  const fromUrl = new URLSearchParams(search).get("token");
  return fromUrl ? { token: fromUrl, shouldStrip: true } : { token: null, shouldStrip: false };
};

export const loginRedirectState = (token: string) => ({
  from: invitationPathWithoutToken,
  invitationToken: token,
});

export const resolvePostLoginTarget = (
  state: unknown,
): { to: string; state?: { invitationToken: string } } => {
  if (!state || typeof state !== "object") return { to: "/dashboard" };
  const { from, invitationToken } = state as { from?: unknown; invitationToken?: unknown };
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) {
    return { to: "/dashboard" };
  }
  if (from === invitationPathWithoutToken && typeof invitationToken === "string") {
    return { to: from, state: { invitationToken } };
  }
  return { to: from };
};
