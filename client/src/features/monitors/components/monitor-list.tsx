import { ArrowDown, ArrowUp, ArrowUpDown, Calendar, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MonitorActions } from "./monitor-actions";
import { formatInterval, formatStatusCodes } from "../schemas/monitor.schema";
import type { Monitor } from "../api/monitors.api";
import type { MonitorSortField, MonitorSortOrder } from "../hooks/use-monitors";

interface MonitorListProps {
  monitors: Monitor[];
  pendingStatusId?: string | null;
  sortBy?: MonitorSortField;
  sortOrder?: MonitorSortOrder;
  onToggleSort?: (field: MonitorSortField) => void;
  onEdit: (monitor: Monitor) => void;
  onToggleStatus: (monitor: Monitor) => void;
  onDelete: (monitor: Monitor) => void;
}

export function MonitorList({
  monitors,
  pendingStatusId,
  sortBy,
  sortOrder,
  onToggleSort,
  onEdit,
  onToggleStatus,
  onDelete,
}: MonitorListProps) {
  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied to clipboard");
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const renderSortIcon = (field: MonitorSortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="size-3 text-foreground" />
    ) : (
      <ArrowDown className="size-3 text-foreground" />
    );
  };

  return (
    <div>
      <div className="hidden rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[30%]">
                {onToggleSort ? (
                  <button
                    type="button"
                    onClick={() => onToggleSort("name")}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Endpoint</span>
                    {renderSortIcon("name")}
                  </button>
                ) : (
                  "Endpoint"
                )}
              </TableHead>

              <TableHead className="w-[9%]">Method</TableHead>

              <TableHead className="w-[15%]">
                {onToggleSort ? (
                  <button
                    type="button"
                    onClick={() => onToggleSort("intervalSeconds")}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Interval</span>
                    {renderSortIcon("intervalSeconds")}
                  </button>
                ) : (
                  "Interval"
                )}
              </TableHead>

              <TableHead className="w-[11%]">Expected</TableHead>

              <TableHead className="w-[13%]">Status</TableHead>

              <TableHead className="w-[11%]">
                {onToggleSort ? (
                  <button
                    type="button"
                    onClick={() => onToggleSort("createdAt")}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Created</span>
                    {renderSortIcon("createdAt")}
                  </button>
                ) : (
                  "Created"
                )}
              </TableHead>

              <TableHead className="w-[11%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monitors.map((monitor) => (
              <TableRow key={monitor._id}>
                <TableCell>
                  <div className="min-w-0">
                    <Link
                      to={`/monitors/${monitor._id}`}
                      className="truncate font-medium text-foreground hover:underline"
                    >
                      {monitor.name}
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className="max-w-xs truncate text-xs text-muted-foreground"
                        title={monitor.url}
                      >
                        {monitor.url}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(monitor.url)}
                            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none"
                            aria-label={`Copy endpoint URL for ${monitor.name}`}
                          >
                            <Copy className="size-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Copy URL</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {monitor.method}
                  </Badge>
                </TableCell>

                <TableCell>
                  <div className="text-xs">
                    <p className="font-medium text-foreground">
                      Every {formatInterval(monitor.intervalSeconds)}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">{monitor.timeoutMs}ms timeout</p>
                  </div>
                </TableCell>

                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatStatusCodes(monitor.expectedStatusCodes)}
                  </span>
                </TableCell>

                <TableCell>
                  <div>
                    {monitor.active ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-foreground/30 text-foreground"
                      >
                        <span className="size-1.5 rounded-full bg-foreground" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="muted" className="gap-1 text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                        Paused
                      </Badge>
                    )}
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      Not checked yet
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(monitor.createdAt)}
                  </span>
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end">
                    <MonitorActions
                      monitor={monitor}
                      isPending={pendingStatusId === monitor._id}
                      onEdit={onEdit}
                      onToggleStatus={onToggleStatus}
                      onDelete={onDelete}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {monitors.map((monitor) => (
          <article
            key={monitor._id}
            className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs transition-all duration-150 hover:border-foreground/20 hover:shadow-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/monitors/${monitor._id}`}
                    className="truncate font-medium text-foreground hover:underline"
                  >
                    {monitor.name}
                  </Link>
                  {monitor.active ? (
                    <Badge variant="outline" className="gap-1 text-[11px] text-foreground shrink-0">
                      <span className="size-1.5 rounded-full bg-foreground" />
                      Active
                    </Badge>
                  ) : (
                    <Badge
                      variant="muted"
                      className="gap-1 text-[11px] text-muted-foreground shrink-0"
                    >
                      <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                      Paused
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="truncate text-xs text-muted-foreground" title={monitor.url}>
                    {monitor.url}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(monitor.url)}
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none"
                        aria-label={`Copy URL for ${monitor.name}`}
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy URL</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <MonitorActions
                monitor={monitor}
                isPending={pendingStatusId === monitor._id}
                onEdit={onEdit}
                onToggleStatus={onToggleStatus}
                onDelete={onDelete}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
              <div>
                <span className="text-muted-foreground">Config: </span>
                <span className="font-medium text-foreground">
                  {monitor.method} · Every {formatInterval(monitor.intervalSeconds)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Timeout: </span>
                <span className="font-medium text-foreground">{monitor.timeoutMs}ms</span>
              </div>
              <div>
                <span className="text-muted-foreground">Expected: </span>
                <span className="font-mono text-foreground">
                  {formatStatusCodes(monitor.expectedStatusCodes)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Check status: </span>
                <span className="text-muted-foreground">Not checked yet</span>
              </div>
            </div>

            {monitor.createdAt && (
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Calendar className="size-3" />
                <span>Added {formatDate(monitor.createdAt)}</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
