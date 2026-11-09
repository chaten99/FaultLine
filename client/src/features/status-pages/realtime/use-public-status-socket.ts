import { useEffect } from "react";
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
import { disconnectPublicSocket, getPublicSocket } from "./public-socket";

export const usePublicStatusSocket = (slug: string, onUnpublished: () => void, enabled = true) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !slug) return;
    const socket = getPublicSocket();
    let cancelled = false;
    let hasConnectedBefore = false;

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

    socket.on("connect", subscribeToPage);
    socket.on("public.status.updated", onStatus);
    socket.on("public.incident.created", onIncident);
    socket.on("public.incident.updated", onIncident);
    socket.on("public.incident.resolved", onIncident);
    socket.on("public.page.unpublished", onUnpublishedEvent);
    socket.connect();

    return () => {
      cancelled = true;
      socket.off("connect", subscribeToPage);
      socket.off("public.status.updated", onStatus);
      socket.off("public.incident.created", onIncident);
      socket.off("public.incident.updated", onIncident);
      socket.off("public.incident.resolved", onIncident);
      socket.off("public.page.unpublished", onUnpublishedEvent);
      disconnectPublicSocket();
    };
  }, [enabled, onUnpublished, queryClient, slug]);
};
