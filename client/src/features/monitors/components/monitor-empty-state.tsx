import { Activity, Plus, RotateCcw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonitorEmptyStateProps {
  type: "empty" | "search-empty";
  searchQuery?: string;
  statusFilter?: string;
  onAddClick?: () => void;
  onResetFilters?: () => void;
}

export function MonitorEmptyState({
  type,
  searchQuery,
  statusFilter,
  onAddClick,
  onResetFilters,
}: MonitorEmptyStateProps) {
  if (type === "search-empty") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <SearchX className="size-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">No monitors found</h3>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {searchQuery && statusFilter && statusFilter !== "all"
            ? `No ${statusFilter} monitors match "${searchQuery}".`
            : searchQuery
              ? `No monitors match your search for "${searchQuery}".`
              : statusFilter && statusFilter !== "all"
                ? `No monitors with status "${statusFilter}" were found.`
                : "No monitors match your current filter and sort criteria."}{" "}
          Try adjusting your query or clear all filters to see your full monitor inventory.
        </p>
        {onResetFilters && (
          <Button variant="outline" size="sm" onClick={onResetFilters} className="mt-5 gap-2">
            <RotateCcw className="size-3.5" />
            Clear all filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Activity className="size-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">No monitors yet</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Configure your first API endpoint to start tracking availability and reliability in
        FaultLine.
      </p>
      {onAddClick && (
        <Button onClick={onAddClick} className="mt-6 gap-2">
          <Plus className="size-4" />
          Add monitor
        </Button>
      )}
    </div>
  );
}
