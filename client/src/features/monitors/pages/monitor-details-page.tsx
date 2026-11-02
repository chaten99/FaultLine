import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
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
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner, SpinnerCustom } from "@/components/common/loading-spinner";
import { EditMonitorDialog } from "../components/edit-monitor-dialog";
import { DeleteMonitorDialog } from "../components/delete-monitor-dialog";
import { MonitorStatusBadge } from "../components/monitor-status-badge";
import { formatRelativeTime } from "../lib/monitor-status";
import {
  deleteMonitor,
  getMonitor,
  getMonitorChecks,
  triggerCheckNow,
  updateMonitor,
  type CheckList,
  type MonitorCheck,
  type MonitorInput,
} from "../api/monitors.api";
import { formatInterval, formatStatusCodes } from "../schemas/monitor.schema";
import { getApiErrorMessage } from "@/lib/api-error";
import { useMonitorSocket } from "../realtime/use-monitor-socket";

export function MonitorDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [checkPage, setCheckPage] = useState(1);
  useMonitorSocket(id);

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

  const {
    data: checksData,
    isLoading: checksLoading,
    error: checksError,
    refetch: refetchChecks,
  } = useQuery<CheckList>({
    queryKey: ["monitorChecks", id, checkPage],
    queryFn: async () => {
      const res = await getMonitorChecks(id!, { page: checkPage, pageSize: 10 });
      return res.data;
    },
    enabled: Boolean(id),
  });

  const checkNowMutation = useMutation({
    mutationFn: async () => {
      if (!monitor) return;
      return triggerCheckNow(monitor._id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["monitor", id] }),
        queryClient.invalidateQueries({ queryKey: ["monitorChecks", id] }),
        queryClient.invalidateQueries({ queryKey: ["monitors"] }),
      ]);
      toast.success("Check queued");
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
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
        second: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const renderCheckStatusBadge = (check: MonitorCheck) => {
    switch (check.status) {
      case "success":
        return (
          <Badge variant="outline" className="gap-1.5 border-foreground/30 text-foreground">
            <span className="size-1.5 rounded-full bg-foreground" />
            Up
          </Badge>
        );
      case "failure":
        return (
          <Badge variant="outline" className="gap-1.5 border-destructive/50 text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" />
            Down
          </Badge>
        );
      case "timeout":
        return (
          <Badge variant="outline" className="gap-1.5 border-destructive/50 text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" />
            Timeout
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="gap-1.5 border-destructive/50 text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" />
            Error
          </Badge>
        );
      case "running":
        return (
          <Badge variant="outline" className="gap-1.5 border-foreground/30 text-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-foreground" />
            </span>
            Checking
          </Badge>
        );
      case "queued":
      default:
        return (
          <Badge variant="muted" className="gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" />
            Queued
          </Badge>
        );
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
                <MonitorStatusBadge monitor={monitor} />
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
                disabled={checkNowMutation.isPending || !monitor.active}
                onClick={() => checkNowMutation.mutate()}
                className="gap-2"
              >
                {checkNowMutation.isPending ? (
                  <SpinnerCustom>Queuing check…</SpinnerCustom>
                ) : (
                  <RotateCw className="size-4" />
                )}
                {!checkNowMutation.isPending && "Check now"}
              </Button>

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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-3">
                <Zap className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Last response duration
                  </span>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {typeof monitor.lastResponseDurationMs === "number"
                      ? `${monitor.lastResponseDurationMs}ms`
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Last checked</span>
                  <p className="mt-0.5 text-sm text-foreground">
                    {monitor.lastCheckAt ? `${formatRelativeTime(monitor.lastCheckAt)}` : "Never"}
                  </p>
                </div>
              </div>

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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Check history</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Recent probe executions and response time telemetry.
              </p>
            </div>
          </div>

          {checksLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : checksError ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">{getApiErrorMessage(checksError)}</p>
              <Button variant="outline" size="sm" onClick={() => void refetchChecks()}>
                <RotateCw className="mr-2 size-4" /> Retry history
              </Button>
            </div>
          ) : !checksData || checksData.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-14 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Activity className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                Monitoring hasn't started yet
              </h3>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                Probe runs and response time history will appear here once checks execute. Click
                "Check now" above to trigger an immediate probe.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[18%]">Status</TableHead>
                      <TableHead className="w-[16%]">HTTP Code</TableHead>
                      <TableHead className="w-[18%]">Response Time</TableHead>
                      <TableHead className="w-[28%]">Failure / Error</TableHead>
                      <TableHead className="w-[20%] text-right">Executed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checksData.items.map((check) => (
                      <TableRow key={check._id}>
                        <TableCell>{renderCheckStatusBadge(check)}</TableCell>

                        <TableCell>
                          {typeof check.statusCode === "number" ? (
                            <span className="font-mono text-xs text-foreground">
                              {check.statusCode}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell>
                          {typeof check.responseDurationMs === "number" ? (
                            <span className="font-mono text-xs text-foreground">
                              {check.responseDurationMs}ms
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell>
                          {check.errorMessage ? (
                            <span
                              className="block max-w-sm truncate text-xs text-destructive"
                              title={check.errorMessage}
                            >
                              {check.failureCategory ? `[${check.failureCategory}] ` : ""}
                              {check.errorMessage}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <span
                            className="text-xs text-muted-foreground"
                            title={formatDateTime(check.startedAt)}
                          >
                            {formatRelativeTime(check.startedAt)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {checksData.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span>
                    Page {checksData.page} of {checksData.totalPages} ({checksData.total} total
                    checks)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={checkPage <= 1}
                      onClick={() => setCheckPage((p) => Math.max(1, p - 1))}
                      className="gap-1"
                    >
                      <ChevronLeft className="size-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={checkPage >= checksData.totalPages}
                      onClick={() => setCheckPage((p) => p + 1)}
                      className="gap-1"
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
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
