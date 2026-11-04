import { useQuery } from "@tanstack/react-query";
import { getIncidentDetails } from "../api/incidents.api";

export const useIncidentDetails = (id: string | undefined) => {
  return useQuery({
    queryKey: ["incident", id],
    queryFn: async () => {
      if (!id) throw new Error("Incident ID is required");
      const response = await getIncidentDetails(id);
      return response.data;
    },
    enabled: Boolean(id),
  });
};
