import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { IncidentSummaryCards } from "../components/incident-summary-cards";
import { IncidentStatusBadge } from "../components/incident-status-badge";
import { useIncidents, useIncidentSummary } from "../hooks/use-incidents";
import { useIncidentSocket } from "../realtime/use-incident-socket";
import type { IncidentStatus } from "../types/incident.types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const formatDuration = (ms?: number) => {
  if (ms === undefined || ms === null) return "Ongoing";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function IncidentsPage() {
  const [statusFilter, setStatusFilter] = useState<"all" | IncidentStatus>("all");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  useIncidentSocket();

  const { data: summaryData, isLoading: summaryLoading } = useIncidentSummary();
  const { data: listData, isLoading: listLoading } = useIncidents({
    page,
    pageSize,
    status: statusFilter,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const counts = summaryData ?? { open: 0, acknowledged: 0, resolved: 0, total: 0 };
  const items = listData?.items ?? [];
  const totalPages = listData?.totalPages ?? 1;

  const handleStatusChange = (status: "all" | IncidentStatus) => {
    setStatusFilter(status);
    setPage(1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-foreground">Incidents</p>
          <h1 className="mt-2 font-serif text-4xl">Service Incidents</h1>
          <p className="mt-2 text-muted-foreground">
            Review and respond to service incidents detected by FaultLine.
          </p>
        </div>

        <IncidentSummaryCards
          counts={counts}
          selectedStatus={statusFilter}
          onSelectStatus={handleStatusChange}
          isLoading={summaryLoading}
        />

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
          <div className="flex items-center gap-1">
            {(["all", "open", "acknowledged", "resolved"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => handleStatusChange(status)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  statusFilter === status
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {status}
              </button>
            ))}
          </div>

          <span className="text-xs text-muted-foreground">
            Showing {items.length} of {listData?.total ?? 0} incidents
          </span>
        </div>

        {listLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-xs">
            <AlertTriangle className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 text-base font-medium text-foreground">No incidents found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {statusFilter === "all"
                ? "No service incidents have been detected for your monitors."
                : `There are currently no incidents with status "${statusFilter}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((incident) => {
              const monitor =
                typeof incident.monitorId === "object" && incident.monitorId
                  ? incident.monitorId
                  : null;

              return (
                <div
                  key={incident._id}
                  className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xs transition-colors hover:border-foreground/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <IncidentStatusBadge status={incident.status} />
                      <h4 className="text-sm font-semibold text-foreground">{incident.title}</h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {monitor && (
                        <span className="font-medium text-foreground">{monitor.name}</span>
                      )}
                      <span>Opened: {formatDate(incident.openedAt)}</span>
                      <span>Duration: {formatDuration(incident.durationMs)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:self-center">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/incidents/${incident._id}`}>
                        View details
                        <ArrowRight className="ml-1 size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 size-4" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
