import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  mergeIncidentIntoList,
  mergeIncidentIntoPayload,
  mergeStatusBlock,
} from "../lib/public-cache";
import { publicKeys } from "../hooks/use-public-status";
import type {
  IncidentList,
  PublicIncident,
  PublicStatusPayload,
  StatusBlock,
} from "../types/status-page.types";
import { nextConnectionState, type ConnectionState } from "../lib/public-motion";
import { disconnectPublicSocket, getPublicSocket } from "./public-socket";

export const usePublicStatusSocket = (
  slug: string,
  onUnpublished: () => void,
  enabled = true,
): ConnectionState => {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>("offline");

  useEffect(() => {
    if (!enabled || !slug) return;
    const socket = getPublicSocket();
    let cancelled = false;
    let hasConnectedBefore = false;
    let everConnected = false;

    const onConnect = () => {
      everConnected = true;
      setConnection(nextConnectionState("connect", true));
      subscribeToPage();
    };
    const onDisconnect = () => setConnection(nextConnectionState("disconnect", everConnected));
    const onConnectError = () => setConnection(nextConnectionState("error", everConnected));

    const subscribeToPage = () => {
      socket.emit("subscribe", { slug }, (ack?: { ok?: boolean }) => {
        if (cancelled || !ack?.ok) return;
        if (hasConnectedBefore) {
          void queryClient.invalidateQueries({ queryKey: publicKeys.status(slug) });
          void queryClient.invalidateQueries({ queryKey: ["public-incidents", slug] });
        }
        hasConnectedBefore = true;
      });
    };

    const onStatus = (status: StatusBlock) => {
      queryClient.setQueryData<PublicStatusPayload | undefined>(
        publicKeys.status(slug),
        (current) => mergeStatusBlock(current, status),
      );
    };

    const onIncident = (incident: PublicIncident) => {
      queryClient.setQueryData<PublicStatusPayload | undefined>(
        publicKeys.status(slug),
        (current) => mergeIncidentIntoPayload(current, incident),
      );
      if (incident.status === "resolved") {
        void queryClient.invalidateQueries({ queryKey: publicKeys.incidents(slug, "resolved") });
      }
      queryClient.setQueryData<IncidentList | undefined>(
        publicKeys.incidents(slug, "active"),
        (current) => mergeIncidentIntoList(current, incident, "active"),
      );
    };

    const onUnpublishedEvent = () => {
      queryClient.removeQueries({ queryKey: publicKeys.status(slug) });
      onUnpublished();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("public.status.updated", onStatus);
    socket.on("public.incident.created", onIncident);
    socket.on("public.incident.updated", onIncident);
    socket.on("public.incident.resolved", onIncident);
    socket.on("public.page.unpublished", onUnpublishedEvent);
    socket.connect();

    return () => {
      cancelled = true;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("public.status.updated", onStatus);
      socket.off("public.incident.created", onIncident);
      socket.off("public.incident.updated", onIncident);
      socket.off("public.incident.resolved", onIncident);
      socket.off("public.page.unpublished", onUnpublishedEvent);
      disconnectPublicSocket();
    };
  }, [enabled, onUnpublished, queryClient, slug]);

  return enabled ? connection : "offline";
};
