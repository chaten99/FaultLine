import { apiClient } from "@/lib/api-client";
import type {
  AcceptInvitationResult,
  AssignableRole,
  AuditLogResponse,
  Invitation,
  InvitationPreview,
  WorkspaceDetailResponse,
  WorkspaceItem,
  WorkspaceMember,
} from "../types/workspace.types";

export const listWorkspaces = () => apiClient.get<{ items: WorkspaceItem[] }>("/workspaces");

export const createWorkspace = (payload: { name: string }) =>
  apiClient.post<{ workspace: WorkspaceItem }>("/workspaces", payload);

export const getWorkspace = (id: string) =>
  apiClient.get<WorkspaceDetailResponse>(`/workspaces/${id}`);

export const updateWorkspace = (id: string, payload: { name: string }) =>
  apiClient.patch<{ workspace: WorkspaceDetailResponse["workspace"] }>(
    `/workspaces/${id}`,
    payload,
  );

export const deleteWorkspace = (id: string, payload: { confirmName: string; password: string }) =>
  apiClient.delete<{ status: "deleted"; purgeAfter: string }>(`/workspaces/${id}`, {
    data: payload,
  });

export const transferOwnership = (id: string, payload: { userId: string; password: string }) =>
  apiClient.post<{ workspace: WorkspaceDetailResponse["workspace"] }>(
    `/workspaces/${id}/transfer-ownership`,
    payload,
  );

export const leaveWorkspace = (id: string) =>
  apiClient.post<{ status: "ok" }>(`/workspaces/${id}/leave`);

export const listMembers = (id: string) =>
  apiClient.get<{ items: WorkspaceMember[] }>(`/workspaces/${id}/members`);

export const updateMemberRole = (id: string, memberId: string, role: AssignableRole) =>
  apiClient.patch<{ member: WorkspaceMember }>(`/workspaces/${id}/members/${memberId}`, { role });

export const removeMember = (id: string, memberId: string) =>
  apiClient.delete<{ status: "ok" }>(`/workspaces/${id}/members/${memberId}`);

export const listInvitations = (id: string, status: "pending" | "expired" | "all" = "all") =>
  apiClient.get<{ items: Invitation[] }>(`/workspaces/${id}/invitations`, { params: { status } });

export const createInvitation = (
  id: string,
  payload: { email: string; role: AssignableRole; message?: string },
) => apiClient.post<{ invitation: Invitation }>(`/workspaces/${id}/invitations`, payload);

export const resendInvitation = (id: string, invitationId: string) =>
  apiClient.post<{ invitation: Invitation }>(
    `/workspaces/${id}/invitations/${invitationId}/resend`,
  );

export const revokeInvitation = (id: string, invitationId: string) =>
  apiClient.post<{ invitation: Invitation }>(
    `/workspaces/${id}/invitations/${invitationId}/revoke`,
  );

export const validateInvitation = (token: string) =>
  apiClient.get<InvitationPreview>("/invitations/validate", { params: { token } });

export const acceptInvitation = (token: string) =>
  apiClient.post<AcceptInvitationResult>("/invitations/accept", { token });

export const listAuditLogs = (
  id: string,
  params: { page: number; pageSize: number; type?: string },
) => apiClient.get<AuditLogResponse>(`/workspaces/${id}/audit-logs`, { params });
