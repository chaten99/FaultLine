import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getMonitorSocket } from "@/features/monitors/realtime/monitor-socket";

const REFRESH_INTERVAL_MS = 30_000;
const incidentEvents = ["incident.created", "incident.acknowledged", "incident.resolved"] as const;

export const useAnalyticsSocket = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getMonitorSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ["analytics", "overview"] });
        void queryClient.invalidateQueries({ queryKey: ["analytics", "incidents"] });
      }, REFRESH_INTERVAL_MS);
    };

    for (const event of incidentEvents) socket.on(event, schedule);
    if (!socket.connected) socket.connect();

    return () => {
      for (const event of incidentEvents) socket.off(event, schedule);
      if (timer) clearTimeout(timer);
    };
  }, [queryClient]);
};
