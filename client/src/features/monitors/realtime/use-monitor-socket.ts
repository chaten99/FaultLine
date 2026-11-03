import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getMonitorSocket } from "./monitor-socket";
import { refresh } from "@/features/auth/api/auth.api";
import { useAuthStore } from "@/features/auth/store/auth.store";

type CheckEvent = { monitorId: string; runId: string; status: string; timestamp: string };

export const useMonitorSocket = (monitorId?: string) => {
  const queryClient = useQueryClient();
  const connectedBefore = useRef(false);

  useEffect(() => {
    const socket = getMonitorSocket();
    const deliver = (event: CheckEvent) => {
      if (["success", "failure", "timeout", "error"].includes(event.status)) {
        void queryClient.invalidateQueries({ queryKey: ["monitors"] });
        if (event.monitorId) {
          void queryClient.invalidateQueries({ queryKey: ["monitor", event.monitorId] });
          void queryClient.invalidateQueries({ queryKey: ["monitorChecks", event.monitorId] });
        }
      } else if (event.monitorId) {
        void queryClient.invalidateQueries({ queryKey: ["monitors"] });
        queryClient.setQueriesData({ queryKey: ["monitor", event.monitorId] }, (old: unknown) =>
          old && typeof old === "object" ? { ...old, lastCheckStatus: event.status } : old,
        );
      }
      queryClient.setQueriesData(
        { queryKey: ["monitorChecks", event.monitorId] },
        (old: unknown) => {
          if (!old || typeof old !== "object" || !("items" in old) || !Array.isArray(old.items))
            return old;
          return {
            ...old,
            items: old.items.map((item: Record<string, unknown>) =>
              item.runId === event.runId
                ? { ...item, status: event.status, startedAt: event.timestamp }
                : item,
            ),
          };
        },
      );
    };
    const events = [
      "monitor.check.queued",
      "monitor.check.started",
      "monitor.check.completed",
      "monitor.check.failed",
    ];
    events.forEach((name) => socket.on(name, deliver));
    const onConnect = () => {
      if (!connectedBefore.current) {
        connectedBefore.current = true;
        return;
      }
      if (monitorId) {
        void queryClient.invalidateQueries({ queryKey: ["monitor", monitorId] });
        void queryClient.invalidateQueries({ queryKey: ["monitorChecks", monitorId] });
      }
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
    };
    let refreshing = false;
    const onConnectError = async (error: Error) => {
      if (!error.message.toLowerCase().includes("authentication") || refreshing) return;
      refreshing = true;
      try {
        const { data } = await refresh();
        useAuthStore.getState().setSession(data.user, data.accessToken);
        socket.connect();
      } catch {
        useAuthStore.getState().clearSession();
      } finally {
        refreshing = false;
      }
    };
    const onDisconnect = (reason: string) => {
      if (reason === "io server disconnect") socket.connect();
    };
    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);
    socket.connect();
    return () => {
      events.forEach((name) => socket.off(name, deliver));
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, [monitorId, queryClient]);
};
