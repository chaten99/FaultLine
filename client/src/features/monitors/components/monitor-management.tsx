import { useState } from "react";
import {
  AlertCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMonitors, type MonitorSortField, type MonitorSortOrder } from "../hooks/use-monitors";
import { MonitorSummaryCards } from "./monitor-summary-cards";
import { MonitorList } from "./monitor-list";
import { MonitorListSkeleton } from "./monitor-list-skeleton";
import { MonitorEmptyState } from "./monitor-empty-state";
import { AddMonitorDialog } from "./add-monitor-dialog";
import { EditMonitorDialog } from "./edit-monitor-dialog";
import { DeleteMonitorDialog } from "./delete-monitor-dialog";
import type { Monitor } from "../api/monitors.api";

export function MonitorManagement() {
  const {
    monitors,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalCount,
    search,
    setSearch,
    status,
    setStatus,
    sortBy,
    sortOrder,
    toggleSort,
    setSorting,
    resetFilters,
    hasActiveFilters,
    counts,
    isLoading,
    error,
    refetch,
    createMutation,
    updateMutation,
    toggleStatusMutation,
    deleteMutation,
    pendingStatusId,
  } = useMonitors();

  const [addOpen, setAddOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [deletingMonitor, setDeletingMonitor] = useState<Monitor | null>(null);

  const handleEdit = (monitor: Monitor) => {
    setEditingMonitor(monitor);
  };

  const handleDelete = (monitor: Monitor) => {
    setDeletingMonitor(monitor);
  };

  const handleToggleStatus = (monitor: Monitor) => {
    toggleStatusMutation.mutate(monitor);
  };

  const currentSortKey = `${sortBy}-${sortOrder}`;

  const handleSortChange = (value: string) => {
    const [field, order] = value.split("-") as [MonitorSortField, MonitorSortOrder];
    setSorting(field, order);
  };

  const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalCount);

  return (
    <div id="monitors" className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Monitors
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure and manage API endpoints to monitor their availability.
          </p>
        </div>

        <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
          <Plus className="size-4" />
          Add monitor
        </Button>
      </div>

      <MonitorSummaryCards counts={counts} isLoading={isLoading} />

      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or URL…"
              className="pl-9 pr-8"
              aria-label="Search monitors by name or URL"
            />
            {search && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Clear search</TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={status}
              onValueChange={(val) => setStatus(val as "all" | "active" | "paused")}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({counts.total})</SelectItem>
                <SelectItem value="active">Active ({counts.active})</SelectItem>
                <SelectItem value="paused">Paused ({counts.paused})</SelectItem>
              </SelectContent>
            </Select>

            <Select value={currentSortKey} onValueChange={handleSortChange}>
              <SelectTrigger className="w-48 gap-2">
                <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt-desc">Newest first</SelectItem>
                <SelectItem value="createdAt-asc">Oldest first</SelectItem>
                <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                <SelectItem value="intervalSeconds-asc">Interval (Fastest first)</SelectItem>
                <SelectItem value="intervalSeconds-desc">Interval (Slowest first)</SelectItem>
                <SelectItem value="url-asc">URL (A–Z)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(pageSize)} onValueChange={(val) => setPageSize(Number(val))}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Page size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="20">20 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Reset filters
              </Button>
            )}
          </div>
        </div>

        {hasActiveFilters && !isLoading && totalCount > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/60 pb-2">
            <span>
              Showing {totalCount} matching {totalCount === 1 ? "monitor" : "monitors"}
              {search.trim() ? ` for "${search.trim()}"` : ""}
              {status !== "all" ? ` (${status})` : ""}
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Clear filters
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <RotateCw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}

        {isLoading ? (
          <MonitorListSkeleton />
        ) : counts.total === 0 && !hasActiveFilters ? (
          <MonitorEmptyState type="empty" onAddClick={() => setAddOpen(true)} />
        ) : monitors.length === 0 && hasActiveFilters ? (
          <MonitorEmptyState
            type="search-empty"
            searchQuery={search}
            statusFilter={status}
            onResetFilters={resetFilters}
          />
        ) : (
          <div className="space-y-4">
            <MonitorList
              monitors={monitors}
              pendingStatusId={pendingStatusId}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onToggleSort={toggleSort}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4 text-xs text-muted-foreground">
              <span>
                Showing {startRecord}–{endRecord} of {totalCount}{" "}
                {totalCount === 1 ? "monitor" : "monitors"}
              </span>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={page <= 1}
                        onClick={() => setPage(1)}
                        aria-label="First page"
                      >
                        <ChevronsLeft className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>First page</TooltipContent>
                  </Tooltip>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 px-2.5"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="size-3.5" />
                    <span>Previous</span>
                  </Button>

                  <span className="px-2 text-xs font-medium text-foreground">
                    Page {page} of {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 px-2.5"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    <span>Next</span>
                    <ChevronRight className="size-3.5" />
                  </Button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={page >= totalPages}
                        onClick={() => setPage(totalPages)}
                        aria-label="Last page"
                      >
                        <ChevronsRight className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Last page</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AddMonitorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={async (data) => {
          await createMutation.mutateAsync(data);
        }}
      />

      <EditMonitorDialog
        monitor={editingMonitor}
        open={Boolean(editingMonitor)}
        onOpenChange={(open) => {
          if (!open) setEditingMonitor(null);
        }}
        onUpdate={async (id, data) => {
          await updateMutation.mutateAsync({ id, input: data });
        }}
      />

      <DeleteMonitorDialog
        monitor={deletingMonitor}
        open={Boolean(deletingMonitor)}
        onOpenChange={(open) => {
          if (!open) setDeletingMonitor(null);
        }}
        onConfirmDelete={async (id) => {
          await deleteMutation.mutateAsync(id);
        }}
      />
    </div>
  );
}
