import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { getMonitorSocket } from "@/features/monitors/realtime/monitor-socket";
import { useRecoverFromLostWorkspace, workspaceKeys } from "../hooks/use-workspaces";
import { useWorkspaceStore } from "../store/workspace.store";

const workspaceEvents = [
  "workspace.member.invited",
  "workspace.member.accepted",
  "workspace.member.role_changed",
  "workspace.member.removed",
  "workspace.invitation.revoked",
  "workspace.settings_updated",
] as const;

export const useWorkspaceSocket = () => {
  const queryClient = useQueryClient();
  const recover = useRecoverFromLostWorkspace();
  const activeId = useWorkspaceStore((state) => state.activeWorkspaceId);

  useEffect(() => {
    const socket = getMonitorSocket();
    const select = () => {
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      if (workspaceId) socket.emit("workspace:select", { workspaceId });
    };
    let connectedBefore = socket.connected;
    const onConnect = () => {
      select();
      if (connectedBefore) {
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
        const id = useWorkspaceStore.getState().activeWorkspaceId;
        if (id) void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
      }
      connectedBefore = true;
    };
    const onTeamEvent = () => {
      const id = useWorkspaceStore.getState().activeWorkspaceId;
      if (!id) return;
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.members(id) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.invitations(id) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ["workspace-audit", id] });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
    };
    const onRevoked = (payload: { workspaceId?: string }) => {
      if (payload?.workspaceId === useWorkspaceStore.getState().activeWorkspaceId) {
        void recover();
        toast.warning("Your access to this workspace changed.");
      } else {
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
      }
    };
    const onRoleChanged = (payload: { workspaceId?: string }) => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.list });
      if (payload?.workspaceId) {
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(payload.workspaceId) });
      }
    };
    const onDisconnect = (reason: string) => {
      if (reason !== "io client disconnect") return;
      setTimeout(() => {
        if (useAuthStore.getState().status === "authenticated") socket.connect();
      }, 0);
    };

    workspaceEvents.forEach((name) => socket.on(name, onTeamEvent));
    socket.on("workspace.access_revoked", onRevoked);
    socket.on("workspace.role_changed", onRoleChanged);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) select();
    else socket.connect();
    return () => {
      workspaceEvents.forEach((name) => socket.off(name, onTeamEvent));
      socket.off("workspace.access_revoked", onRevoked);
      socket.off("workspace.role_changed", onRoleChanged);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [queryClient, recover]);

  useEffect(() => {
    const socket = getMonitorSocket();
    if (activeId && socket.connected) socket.emit("workspace:select", { workspaceId: activeId });
  }, [activeId]);
};
