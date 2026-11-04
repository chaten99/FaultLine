import { cn } from "@/lib/utils";
import type { IncidentStatus } from "../types/incident.types";

interface IncidentStatusBadgeProps {
  status: IncidentStatus;
  className?: string;
}

export function IncidentStatusBadge({ status, className }: IncidentStatusBadgeProps) {
  const styles: Record<IncidentStatus, string> = {
    open: "border-destructive/30 bg-destructive/10 text-destructive",
    acknowledged: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  };

  const labels: Record<IncidentStatus, string> = {
    open: "Open",
    acknowledged: "Acknowledged",
    resolved: "Resolved",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight uppercase",
        styles[status],
        className,
      )}
    >
      {labels[status]}
    </span>
  );
}
