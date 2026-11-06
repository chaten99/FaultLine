import { cn } from "@/lib/utils";
import { statusLabels, statusTone, type StatusTone } from "../lib/notification-presentation";
import type { DeliveryStatus } from "../types/notification.types";

const toneStyles: Record<StatusTone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function DeliveryStatusBadge({
  status,
  className,
}: {
  status: DeliveryStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneStyles[statusTone(status)],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
