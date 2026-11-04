import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMonitorSocket } from "@/features/monitors/realtime/monitor-socket";

type IncidentEventPayload = {
  incidentId?: string;
  monitorId?: string;
  title?: string;
  status?: string;
  resolvedAt?: string;
  durationMs?: number;
};

export const useIncidentSocket = (currentIncidentId?: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getMonitorSocket();

    const handleCreated = (payload: IncidentEventPayload) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["incidents-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
      if (payload.monitorId) {
        void queryClient.invalidateQueries({ queryKey: ["monitor", payload.monitorId] });
      }
      toast.error(payload.title ?? "Incident opened: check failures detected");
    };

    const handleUpdated = (payload: IncidentEventPayload) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["incidents-summary"] });
      if (payload.incidentId) {
        void queryClient.invalidateQueries({ queryKey: ["incident", payload.incidentId] });
      }
    };

    const handleAcknowledged = (payload: IncidentEventPayload) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["incidents-summary"] });
      if (payload.incidentId) {
        void queryClient.invalidateQueries({ queryKey: ["incident", payload.incidentId] });
      }
    };

    const handleResolved = (payload: IncidentEventPayload) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["incidents-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
      if (payload.incidentId) {
        void queryClient.invalidateQueries({ queryKey: ["incident", payload.incidentId] });
      }
      if (payload.monitorId) {
        void queryClient.invalidateQueries({ queryKey: ["monitor", payload.monitorId] });
      }
      toast.success("Incident resolved: service has recovered");
    };

    const handleRecoveryProgress = (payload: IncidentEventPayload) => {
      if (payload.incidentId) {
        void queryClient.invalidateQueries({ queryKey: ["incident", payload.incidentId] });
      }
    };

    socket.on("incident.created", handleCreated);
    socket.on("incident.updated", handleUpdated);
    socket.on("incident.acknowledged", handleAcknowledged);
    socket.on("incident.resolved", handleResolved);
    socket.on("incident.recovery_progress", handleRecoveryProgress);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off("incident.created", handleCreated);
      socket.off("incident.updated", handleUpdated);
      socket.off("incident.acknowledged", handleAcknowledged);
      socket.off("incident.resolved", handleResolved);
      socket.off("incident.recovery_progress", handleRecoveryProgress);
    };
  }, [currentIncidentId, queryClient]);
};
