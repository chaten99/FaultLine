import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getMonitorSocket } from "@/features/monitors/realtime/monitor-socket";
import { notificationKeys } from "../hooks/use-notifications";

type DeliveryUpdatedPayload = { deliveryId?: string; status?: string };

export const useNotificationSocket = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getMonitorSocket();

    const handleDeliveryUpdated = (payload: DeliveryUpdatedPayload) => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.deliveries });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.integrations });
      if (payload.deliveryId) {
        void queryClient.invalidateQueries({
          queryKey: notificationKeys.delivery(payload.deliveryId),
        });
      }
    };

    socket.on("notification.delivery_updated", handleDeliveryUpdated);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("notification.delivery_updated", handleDeliveryUpdated);
    };
  }, [queryClient]);
};
