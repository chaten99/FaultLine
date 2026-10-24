import { useState } from "react";
import { AlertCircle, Plus, RotateCw, Search, X } from "lucide-react";
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
import { useMonitors } from "../hooks/use-monitors";
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
    totalPages,
    totalCount,
    search,
    setSearch,
    status,
    setStatus,
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or URL…"
              className="pl-9 pr-8"
              aria-label="Search monitors"
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

          <div className="flex items-center gap-2">
            <Select
              value={status}
              onValueChange={(val) => setStatus(val as "all" | "active" | "paused")}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="paused">Paused only</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

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
        ) : totalCount === 0 && !hasActiveFilters ? (
          <MonitorEmptyState type="empty" onAddClick={() => setAddOpen(true)} />
        ) : monitors.length === 0 && hasActiveFilters ? (
          <MonitorEmptyState type="search-empty" onResetFilters={resetFilters} />
        ) : (
          <div className="space-y-4">
            <MonitorList
              monitors={monitors}
              pendingStatusId={pendingStatusId}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
            />

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
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
