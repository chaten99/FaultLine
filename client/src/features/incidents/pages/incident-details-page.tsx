import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, ExternalLink, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { IncidentStatusBadge } from "../components/incident-status-badge";
import { IncidentTimelineView } from "../components/incident-timeline-view";
import { ResolveIncidentDialog } from "../components/resolve-incident-dialog";
import { useIncidentDetails } from "../hooks/use-incident-details";
import { useAcknowledgeIncident, useResolveIncident } from "../hooks/use-incidents";
import { useIncidentSocket } from "../realtime/use-incident-socket";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { ReadOnlyBadge } from "@/features/workspaces/components/read-only-badge";
import { useCan } from "@/features/workspaces/hooks/use-workspaces";

const formatDuration = (ms?: number) => {
  if (ms === undefined || ms === null) return "Ongoing";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export function IncidentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const canAcknowledge = useCan("incidents:acknowledge");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);

  useIncidentSocket(id);

  const { data, isLoading, error } = useIncidentDetails(id);
  const acknowledgeMutation = useAcknowledgeIncident();
  const resolveMutation = useResolveIncident();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <div className="rounded-lg border border-border bg-card p-12 text-center shadow-xs">
          <ShieldAlert className="mx-auto size-8 text-destructive" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">Incident not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The requested incident does not exist or you do not have permission to view it.
          </p>
          <div className="mt-6">
            <Button variant="outline" asChild>
              <Link to="/incidents">
                <ArrowLeft className="mr-1.5 size-4" />
                Back to incidents
              </Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { incident, timeline } = data;
  const monitor =
    typeof incident.monitorId === "object" && incident.monitorId ? incident.monitorId : null;

  const handleAcknowledge = async () => {
    try {
      await acknowledgeMutation.mutateAsync(incident._id);
      toast.success("Incident acknowledged.");
    } catch {
      toast.error("Failed to acknowledge incident. Please try again.");
    }
  };

  const handleResolve = async (reason?: string) => {
    try {
      await resolveMutation.mutateAsync({ id: incident._id, reason });
      toast.success("Incident manually resolved.");
    } catch {
      toast.error("Failed to resolve incident. Please try again.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link
            to="/incidents"
            className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 size-3.5" />
            Back to incidents
          </Link>

          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <IncidentStatusBadge status={incident.status} />
                <h1 className="font-serif text-3xl text-foreground">{incident.title}</h1>
              </div>

              {monitor && (
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>Monitor:</span>
                  <Link
                    to={`/monitors/${monitor._id}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {monitor.name}
                  </Link>
                  <a
                    href={monitor.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    {monitor.url}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              )}
            </div>

            {!canAcknowledge && (
              <ReadOnlyBadge reason="Viewers can't acknowledge or resolve incidents." />
            )}
            {canAcknowledge && (
              <div className="flex flex-wrap items-center gap-2">
                {incident.status === "open" && (
                  <Button
                    variant="outline"
                    onClick={handleAcknowledge}
                    disabled={acknowledgeMutation.isPending}
                  >
                    {acknowledgeMutation.isPending ? (
                      <SpinnerCustom>Acknowledging…</SpinnerCustom>
                    ) : (
                      <>
                        <Clock className="mr-1.5 size-4" />
                        Acknowledge
                      </>
                    )}
                  </Button>
                )}

                {incident.status !== "resolved" && (
                  <Button onClick={() => setResolveDialogOpen(true)}>
                    <CheckCircle2 className="mr-1.5 size-4" />
                    Resolve incident
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <span className="text-xs text-muted-foreground">Opened at</span>
            <p className="mt-1 text-sm font-medium font-mono text-foreground">
              {formatDate(incident.openedAt)}
            </p>
          </article>

          <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <span className="text-xs text-muted-foreground">Latest failure</span>
            <p className="mt-1 text-sm font-medium font-mono text-foreground">
              {formatDate(incident.lastFailureAt)}
            </p>
          </article>

          <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <span className="text-xs text-muted-foreground">Resolved at</span>
            <p className="mt-1 text-sm font-medium font-mono text-foreground">
              {incident.resolvedAt ? formatDate(incident.resolvedAt) : "Ongoing"}
            </p>
          </article>

          <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <span className="text-xs text-muted-foreground">Total duration</span>
            <p className="mt-1 text-sm font-medium text-foreground">
              {formatDuration(incident.durationMs)}
            </p>
          </article>
        </section>

        {incident.resolutionReason && (
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Resolution reason
            </div>
            <p className="mt-2 text-sm text-foreground">{incident.resolutionReason}</p>
          </div>
        )}

        <div className="space-y-4 pt-4">
          <div>
            <h2 className="font-serif text-2xl text-foreground">Incident Timeline</h2>
            <p className="text-sm text-muted-foreground">
              Chronological log of check outcomes, health streaks, and interventions.
            </p>
          </div>

          <IncidentTimelineView timeline={timeline} />
        </div>

        <ResolveIncidentDialog
          open={resolveDialogOpen}
          onOpenChange={setResolveDialogOpen}
          incidentTitle={incident.title}
          onResolve={handleResolve}
        />
      </div>
    </DashboardLayout>
  );
}
