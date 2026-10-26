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

export type MonitorSortField = "createdAt" | "name" | "intervalSeconds" | "url";
export type MonitorSortOrder = "asc" | "desc";

export function useMonitors() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "paused">("all");
  const [sortBy, setSortBy] = useState<MonitorSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<MonitorSortOrder>("desc");
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryKey = [
    "monitors",
    {
      page,
      pageSize,
      search: debouncedSearch.trim(),
      status,
      sortBy,
      sortOrder,
    },
  ];

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await listMonitors({
        page,
        pageSize,
        search: debouncedSearch.trim() || undefined,
        status: status === "all" ? undefined : status,
        sortBy,
        sortOrder,
      });
      return response.data;
    },
  });

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("all");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  const toggleSort = (field: MonitorSortField) => {
    if (sortBy === field) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const setSorting = (field: MonitorSortField, order: MonitorSortOrder) => {
    setSortBy(field);
    setSortOrder(order);
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

  const hasActiveFilters = Boolean(
    search.trim() || status !== "all" || sortBy !== "createdAt" || sortOrder !== "desc",
  );

  return {
    monitors: data?.items ?? [],
    page,
    setPage,
    pageSize,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    totalPages: data?.totalPages ?? 1,
    totalCount: data?.total ?? 0,
    search,
    setSearch,
    status,
    setStatus: (newStatus: "all" | "active" | "paused") => {
      setStatus(newStatus);
      setPage(1);
    },
    sortBy,
    sortOrder,
    toggleSort,
    setSorting,
    resetFilters,
    hasActiveFilters,
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
