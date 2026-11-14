import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMonitorSocket } from "@/features/monitors/realtime/monitor-socket";
import {
  acceptInvitation,
  createInvitation,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  leaveWorkspace,
  listAuditLogs,
  listInvitations,
  listMembers,
  listWorkspaces,
  removeMember,
  resendInvitation,
  revokeInvitation,
  transferOwnership,
  updateMemberRole,
  updateWorkspace,
  validateInvitation,
} from "../api/workspaces.api";
import { can, type Permission } from "../lib/permissions";
import { pickActiveWorkspace, planWorkspaceSwitch } from "../lib/switching";
import {
  selectActiveRole,
  selectActiveWorkspace,
  useWorkspaceStore,
} from "../store/workspace.store";
import type { AssignableRole } from "../types/workspace.types";

export const workspaceKeys = {
  list: ["workspaces"] as const,
  detail: (id: string) => ["workspace", id] as const,
  members: (id: string) => ["workspace-members", id] as const,
  invitations: (id: string) => ["workspace-invitations", id] as const,
  audit: (id: string, page: number, type: string) => ["workspace-audit", id, page, type] as const,
};

export const useActiveWorkspace = () => useWorkspaceStore(selectActiveWorkspace);
export const useActiveRole = () => useWorkspaceStore(selectActiveRole);
export const useCan = (permission: Permission): boolean => can(useActiveRole(), permission);

export const useWorkspacesQuery = (enabled = true) =>
  useQuery({
    queryKey: workspaceKeys.list,
    enabled,
    queryFn: async () => (await listWorkspaces()).data.items,
  });

export const useSwitchWorkspace = () => {
  const queryClient = useQueryClient();
  return useCallback(
    async (nextId: string) => {
      const state = useWorkspaceStore.getState();
      const plan = planWorkspaceSwitch(state.activeWorkspaceId, nextId, state.workspaces);
      if (!plan) return false;
      if (plan.cancelQueries) await queryClient.cancelQueries();
      if (plan.clearCache) queryClient.clear();
      useWorkspaceStore.getState().setActiveWorkspace(plan.persist);
      if (plan.emitSelect) getMonitorSocket().emit("workspace:select", { workspaceId: nextId });
      return true;
    },
    [queryClient],
  );
};

export const useRecoverFromLostWorkspace = () => {
  const queryClient = useQueryClient();
  const switchWorkspace = useSwitchWorkspace();
  return useCallback(async () => {
    try {
      const items = (await listWorkspaces()).data;
      useWorkspaceStore.getState().setWorkspaces(items.items);
      const current = useWorkspaceStore.getState().activeWorkspaceId;
      if (current && items.items.some((item) => item.id === current)) {
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
        return;
      }
      const next = pickActiveWorkspace(items.items, null);
      if (next) {
        await switchWorkspace(next.id);
        toast.info(`You no longer have access to that workspace. Switched to ${next.name}.`);
      }
    } catch {
      return;
    }
  }, [queryClient, switchWorkspace]);
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();
  const switchWorkspace = useSwitchWorkspace();
  return useMutation({
    mutationFn: async (name: string) => (await createWorkspace({ name })).data.workspace,
    onSuccess: async (workspace) => {
      const state = useWorkspaceStore.getState();
      state.setWorkspaces([...state.workspaces, workspace]);
      await switchWorkspace(workspace.id);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
    },
  });
};

export const useWorkspaceDetail = (id: string | null) =>
  useQuery({
    queryKey: workspaceKeys.detail(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => (await getWorkspace(id as string)).data,
  });

export const useUpdateWorkspace = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await updateWorkspace(id, { name })).data.workspace,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
      void queryClient.invalidateQueries({ queryKey: ["workspace-audit", id] });
    },
  });
};

export const useTransferOwnership = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { userId: string; password: string }) =>
      (await transferOwnership(id, payload)).data.workspace,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.members(id) });
    },
  });
};

export const useDeleteWorkspace = (id: string) =>
  useMutation({
    mutationFn: async (payload: { confirmName: string; password: string }) =>
      (await deleteWorkspace(id, payload)).data,
  });

export const useLeaveWorkspace = (id: string) =>
  useMutation({ mutationFn: async () => (await leaveWorkspace(id)).data });

export const useMembers = (id: string | null) =>
  useQuery({
    queryKey: workspaceKeys.members(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => (await listMembers(id as string)).data.items,
  });

export const useChangeMemberRole = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; role: AssignableRole }) =>
      (await updateMemberRole(id, input.memberId, input.role)).data.member,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.members(id) });
    },
  });
};

export const useRemoveMember = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => (await removeMember(id, memberId)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.members(id) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
    },
  });
};

export const useInvitations = (id: string | null, enabled = true) =>
  useQuery({
    queryKey: workspaceKeys.invitations(id ?? ""),
    enabled: Boolean(id) && enabled,
    queryFn: async () => (await listInvitations(id as string, "all")).data.items,
  });

export const useCreateInvitation = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { email: string; role: AssignableRole; message?: string }) =>
      (await createInvitation(id, payload)).data.invitation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.invitations(id) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
    },
  });
};

export const useResendInvitation = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => (await resendInvitation(id, invitationId)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.invitations(id) });
    },
  });
};

export const useRevokeInvitation = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => (await revokeInvitation(id, invitationId)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.invitations(id) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
    },
  });
};

export const useAuditLog = (id: string | null, page: number, type: string) =>
  useQuery({
    queryKey: workspaceKeys.audit(id ?? "", page, type),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
    queryFn: async () =>
      (
        await listAuditLogs(id as string, {
          page,
          pageSize: 20,
          ...(type !== "all" ? { type } : {}),
        })
      ).data,
  });

export const useInvitationPreview = (token: string | null) =>
  useQuery({
    queryKey: ["invitation-preview", token ? token.slice(-8) : ""],
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    queryFn: async () => (await validateInvitation(token as string)).data,
  });

export const useAcceptInvitation = () => {
  const switchWorkspace = useSwitchWorkspace();
  return useMutation({
    mutationFn: async (token: string) => (await acceptInvitation(token)).data,
    onSuccess: async (result) => {
      const items = (await listWorkspaces()).data.items;
      useWorkspaceStore.getState().setWorkspaces(items);
      await switchWorkspace(result.workspaceId);
    },
  });
};
