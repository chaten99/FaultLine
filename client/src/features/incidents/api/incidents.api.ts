import { apiClient } from "@/lib/api-client";
import type {
  Incident,
  IncidentCounts,
  IncidentDetailsResponse,
  IncidentList,
  ListIncidentsParams,
} from "../types/incident.types";

export const listIncidents = (params?: ListIncidentsParams) =>
  apiClient.get<IncidentList>("/incidents", { params });

export const getIncidentSummary = () => apiClient.get<IncidentCounts>("/incidents/summary");

export const getIncidentDetails = (id: string) =>
  apiClient.get<IncidentDetailsResponse>(`/incidents/${id}`);

export const acknowledgeIncident = (id: string) =>
  apiClient.post<Incident>(`/incidents/${id}/acknowledge`);

export const resolveIncident = (id: string, reason?: string) =>
  apiClient.post<Incident>(`/incidents/${id}/resolve`, { reason });
