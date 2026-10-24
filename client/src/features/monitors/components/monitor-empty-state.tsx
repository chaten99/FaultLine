import { Activity, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonitorEmptyStateProps {
  type: "empty" | "search-empty";
  onAddClick?: () => void;
  onResetFilters?: () => void;
}

export function MonitorEmptyState({ type, onAddClick, onResetFilters }: MonitorEmptyStateProps) {
  if (type === "search-empty") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-14 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <SearchX className="size-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">No monitors found</h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          No monitors match your search query or filter criteria. Try adjusting or clearing your
          filters.
        </p>
        {onResetFilters && (
          <Button variant="outline" size="sm" onClick={onResetFilters} className="mt-5">
            Clear filters
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
