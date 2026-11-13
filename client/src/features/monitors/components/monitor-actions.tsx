import { Eye, MoreHorizontal, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCan } from "@/features/workspaces/hooks/use-workspaces";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/common/loading-spinner";
import type { Monitor } from "../api/monitors.api";

interface MonitorActionsProps {
  monitor: Monitor;
  isPending?: boolean;
  isChecking?: boolean;
  onEdit: (monitor: Monitor) => void;
  onToggleStatus: (monitor: Monitor) => void;
  onDelete: (monitor: Monitor) => void;
  onCheckNow?: (monitor: Monitor) => void;
}

export function MonitorActions({
  monitor,
  isPending = false,
  isChecking = false,
  onEdit,
  onToggleStatus,
  onDelete,
  onCheckNow,
}: MonitorActionsProps) {
  const isLoading = isPending || isChecking;
  const canWrite = useCan("monitors:write");

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`More actions for ${monitor.name}`}
              disabled={isLoading}
            >
              {isLoading ? <Spinner className="size-4" /> : <MoreHorizontal className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More actions</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link to={`/monitors/${monitor._id}`} className="flex items-center gap-2">
            <Eye className="size-4" />
            <span>View details</span>
          </Link>
        </DropdownMenuItem>

        {onCheckNow && canWrite && (
          <DropdownMenuItem
            onClick={() => onCheckNow(monitor)}
            disabled={isLoading || !monitor.active}
          >
            <RefreshCw className="size-4" />
            <span>Check now</span>
          </DropdownMenuItem>
        )}

        {canWrite && (
          <>
            <DropdownMenuItem onClick={() => onEdit(monitor)}>
              <Pencil className="size-4" />
              <span>Edit monitor</span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => onToggleStatus(monitor)} disabled={isPending}>
              {monitor.active ? (
                <>
                  <Pause className="size-4" />
                  <span>Pause monitor</span>
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  <span>Resume monitor</span>
                </>
              )}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => onDelete(monitor)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="size-4 text-destructive" />
              <span>Delete monitor</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
