import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Calendar,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Pause,
  Pencil,
  Play,
  RotateCw,
  Server,
  ShieldCheck,
  Timer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/common/loading-spinner";
import { EditMonitorDialog } from "../components/edit-monitor-dialog";
import { DeleteMonitorDialog } from "../components/delete-monitor-dialog";
import { deleteMonitor, getMonitor, updateMonitor, type MonitorInput } from "../api/monitors.api";
import { formatInterval, formatStatusCodes } from "../schemas/monitor.schema";
import { getApiErrorMessage } from "@/lib/api-error";

export function MonitorDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    data: monitor,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["monitor", id],
    queryFn: async () => {
      const res = await getMonitor(id!);
      return res.data;
    },
    enabled: Boolean(id),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async () => {
      if (!monitor) return;
      return updateMonitor(monitor._id, { active: !monitor.active });
    },
    onSuccess: async (response) => {
      if (!response) return;
      await queryClient.invalidateQueries({ queryKey: ["monitor", id] });
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      toast.success(response.data.active ? "Monitor resumed." : "Monitor paused.");
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: Partial<MonitorInput>) => {
      if (!monitor) return;
      return updateMonitor(monitor._id, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["monitor", id] });
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      toast.success("Monitor updated successfully.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!monitor) return;
      return deleteMonitor(monitor._id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["monitors"] });
      toast.success("Monitor deleted successfully.");
      navigate("/monitors", { replace: true });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("URL copied to clipboard");
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return "—";
    try {
      return new Date(isoString).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-20" />
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !monitor) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Link
            to="/monitors"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Back to monitors
          </Link>
          <div
            role="alert"
            className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center"
          >
            <div className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
              <Server className="size-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">Monitor not found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {error ? getApiErrorMessage(error) : "The requested monitor could not be found."}
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => void refetch()}>
                <RotateCw className="size-4 mr-2" />
                Retry
              </Button>
              <Button asChild>
                <Link to="/monitors">Go to monitors</Link>
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <Link
            to="/monitors"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to monitors
          </Link>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {monitor.name}
                </h1>
                {monitor.active ? (
                  <Badge variant="outline" className="gap-1.5 border-foreground/30 text-foreground">
                    <span className="size-1.5 rounded-full bg-foreground" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="muted" className="gap-1.5 text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                    Paused
                  </Badge>
                )}
                <Badge variant="muted" className="text-xs text-muted-foreground">
                  Not checked yet
                </Badge>
              </div>

              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate max-w-xl font-mono text-xs">{monitor.url}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(monitor.url)}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none"
                      aria-label="Copy endpoint URL"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy URL</TooltipContent>
                </Tooltip>
                <a
                  href={monitor.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none"
                  aria-label="Open endpoint URL in new tab"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={toggleStatusMutation.isPending}
                onClick={() => toggleStatusMutation.mutate()}
                className="gap-2"
              >
                {toggleStatusMutation.isPending ? (
                  <Spinner className="size-4" />
                ) : monitor.active ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {monitor.active ? "Pause" : "Resume"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                className="gap-2"
              >
                <Pencil className="size-4" />
                Edit
              </Button>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="gap-2"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        </div>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Configuration
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="size-4" />
                <span className="text-xs font-medium">HTTP method</span>
              </div>
              <p className="mt-2 text-xl font-mono font-semibold text-foreground">
                {monitor.method}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Standard GET probe</p>
            </article>

            <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4" />
                <span className="text-xs font-medium">Check interval</span>
              </div>
              <p className="mt-2 text-xl font-semibold text-foreground">
                Every {formatInterval(monitor.intervalSeconds)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {monitor.intervalSeconds} seconds probe frequency
              </p>
            </article>

            <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="size-4" />
                <span className="text-xs font-medium">Request timeout</span>
              </div>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {monitor.timeoutMs.toLocaleString()}ms
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Max response threshold</p>
            </article>

            <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="size-4" />
                <span className="text-xs font-medium">Expected status</span>
              </div>
              <p className="mt-2 text-xl font-mono font-semibold text-foreground">
                {formatStatusCodes(monitor.expectedStatusCodes)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Healthy HTTP response codes</p>
            </article>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 text-sm text-card-foreground shadow-xs">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <Calendar className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Created date</span>
                  <p className="mt-0.5 text-sm text-foreground">
                    {formatDateTime(monitor.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Last updated</span>
                  <p className="mt-0.5 text-sm text-foreground">
                    {formatDateTime(monitor.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Check history</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Recent probe executions and response time telemetry.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <Activity className="size-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              Monitoring hasn't started yet
            </h3>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              Probe runs and response time history will appear here once the monitoring worker
              engine is active. No checks have been executed for this endpoint yet.
            </p>
          </div>
        </section>
      </div>

      <EditMonitorDialog
        monitor={monitor}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdate={async (_, data) => {
          await updateMutation.mutateAsync(data);
        }}
      />

      <DeleteMonitorDialog
        monitor={monitor}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirmDelete={async () => {
          await deleteMutation.mutateAsync();
        }}
      />
    </DashboardLayout>
  );
}
