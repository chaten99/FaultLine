import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeIncident,
  getIncidentSummary,
  listIncidents,
  resolveIncident,
} from "../api/incidents.api";
import type { ListIncidentsParams } from "../types/incident.types";

export const useIncidents = (params?: ListIncidentsParams) => {
  return useQuery({
    queryKey: ["incidents", params],
    queryFn: async () => {
      const response = await listIncidents(params);
      return response.data;
    },
  });
};

export const useIncidentSummary = () => {
  return useQuery({
    queryKey: ["incidents-summary"],
    queryFn: async () => {
      const response = await getIncidentSummary();
      return response.data;
    },
  });
};

export const useAcknowledgeIncident = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => acknowledgeIncident(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["incident", id] });
      void queryClient.invalidateQueries({ queryKey: ["incidents-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
    },
  });
};

export const useResolveIncident = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => resolveIncident(id, reason),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["incident", id] });
      void queryClient.invalidateQueries({ queryKey: ["incidents-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["monitors"] });
    },
  });
};
