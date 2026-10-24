import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  updateMonitor,
  type Monitor,
  type MonitorInput,
} from "../api/monitors.api";
import { getApiErrorMessage } from "@/lib/api-error";

export function useMonitors() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "paused">("all");
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryKey = ["monitors", { page, search: debouncedSearch.trim(), status }];

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await listMonitors({
        page,
        pageSize: 10,
        search: debouncedSearch.trim() || undefined,
        status: status === "all" ? undefined : status,
      });
      return response.data;
    },
  });

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("all");
    setPage(1);
  };

  const createMutation = useMutation({
    mutationFn: (input: MonitorInput) => createMonitor(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      toast.success("Monitor created successfully.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MonitorInput> }) =>
      updateMonitor(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      toast.success("Monitor updated successfully.");
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (monitor: Monitor) => {
      setPendingStatusId(monitor._id);
      return updateMonitor(monitor._id, { active: !monitor.active });
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      toast.success(response.data.active ? "Monitor resumed." : "Monitor paused.");
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
    onSettled: () => {
      setPendingStatusId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMonitor(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      toast.success("Monitor deleted successfully.");
    },
  });

  const counts = data?.counts ?? {
    total: data?.total ?? 0,
    active: data?.items?.filter((m) => m.active).length ?? 0,
    paused: data?.items?.filter((m) => !m.active).length ?? 0,
  };

  return {
    monitors: data?.items ?? [],
    page,
    setPage,
    totalPages: data?.totalPages ?? 1,
    totalCount: data?.total ?? 0,
    search,
    setSearch,
    status,
    setStatus: (newStatus: "all" | "active" | "paused") => {
      setStatus(newStatus);
      setPage(1);
    },
    resetFilters,
    hasActiveFilters: Boolean(search.trim() || status !== "all"),
    counts,
    isLoading,
    isFetching,
    error: error ? getApiErrorMessage(error) : null,
    refetch,
    createMutation,
    updateMutation,
    toggleStatusMutation,
    deleteMutation,
    pendingStatusId,
  };
}
