import { Badge } from "@/components/ui/badge";
import { getComputedStatus } from "../lib/monitor-status";
import type { Monitor } from "../api/monitors.api";

interface MonitorStatusBadgeProps {
  monitor: Pick<Monitor, "active" | "lastCheckStatus" | "lastCheckAt" | "intervalSeconds">;
}

export function MonitorStatusBadge({ monitor }: MonitorStatusBadgeProps) {
  const computed = getComputedStatus(monitor);

  switch (computed) {
    case "up":
      return (
        <Badge variant="outline" className="gap-1.5 border-foreground/30 text-foreground">
          <span className="size-1.5 rounded-full bg-foreground" />
          Up
        </Badge>
      );
    case "down":
      return (
        <Badge variant="outline" className="gap-1.5 border-destructive/50 text-destructive">
          <span className="size-1.5 rounded-full bg-destructive" />
          Down
        </Badge>
      );
    case "stale":
      return (
        <Badge variant="outline" className="gap-1.5 border-border text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
          Stale
        </Badge>
      );
    case "checking":
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
      return (
        <Badge variant="muted" className="gap-1.5 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
          Queued
        </Badge>
      );
    case "not_checked":
    default:
      return (
        <Badge variant="muted" className="text-muted-foreground">
          Not checked yet
        </Badge>
      );
  }
}
