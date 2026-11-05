import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import type { IncidentTimelineEventType, IncidentTimelineItem } from "../types/incident.types";
import { cn } from "@/lib/utils";

interface IncidentTimelineViewProps {
  timeline: IncidentTimelineItem[];
  isLoading?: boolean;
}

const getEventConfig = (type: IncidentTimelineEventType) => {
  switch (type) {
    case "incident.created":
      return {
        icon: <AlertTriangle className="size-4 text-destructive" />,
        badge: "Incident opened",
        badgeStyle: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    case "incident.acknowledged":
      return {
        icon: <Clock className="size-4 text-amber-600 dark:text-amber-400" />,
        badge: "Acknowledged",
        badgeStyle: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      };
    case "incident.failure_observed":
      return {
        icon: <XCircle className="size-4 text-destructive" />,
        badge: "Failure observed",
        badgeStyle: "border-destructive/20 bg-destructive/5 text-destructive",
      };
    case "incident.recovery_progress":
      return {
        icon: <ShieldCheck className="size-4 text-blue-600 dark:text-blue-400" />,
        badge: "Recovery progress",
        badgeStyle: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
      };
    case "incident.resolved":
    case "incident.manually_resolved":
      return {
        icon: <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />,
        badge: type === "incident.resolved" ? "Auto resolved" : "Manually resolved",
        badgeStyle:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      };
    default:
      return {
        icon: <HelpCircle className="size-4 text-muted-foreground" />,
        badge: "Event",
        badgeStyle: "border-border bg-muted text-muted-foreground",
      };
  }
};

const formatTimestamp = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export function IncidentTimelineView({ timeline }: IncidentTimelineViewProps) {
  if (timeline.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No timeline events recorded for this incident yet.
      </div>
    );
  }

  return (
    <div className="relative pl-6 before:absolute before:bottom-0 before:left-2 before:top-2 before:w-[1px] before:bg-border">
      <div className="space-y-6">
        {timeline.map((item) => {
          const config = getEventConfig(item.type);
          const actorDisplay =
            typeof item.actorId === "object" && item.actorId
              ? `${item.actorId.name} (${item.actorId.email})`
              : item.actorType === "user"
                ? "User"
                : "System Automated";

          return (
            <div key={item._id} className="relative group">
              <div className="absolute -left-[30px] top-1 flex size-5 items-center justify-center rounded-full border border-border bg-background shadow-xs">
                {config.icon}
              </div>

              <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-tight",
                        config.badgeStyle,
                      )}
                    >
                      {config.badge}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {item.actorType === "user" && <User className="size-3" />}
                      {actorDisplay}
                    </span>
                  </div>
                  <time className="text-xs text-muted-foreground font-mono">
                    {formatTimestamp(item.createdAt)}
                  </time>
                </div>

                <p className="mt-2 text-sm text-foreground">{item.message}</p>

                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {"statusCode" in item.metadata && item.metadata.statusCode && (
                      <span className="rounded bg-muted px-2 py-0.5 font-mono">
                        Status: {String(item.metadata.statusCode)}
                      </span>
                    )}
                    {"failureCategory" in item.metadata && item.metadata.failureCategory && (
                      <span className="rounded bg-muted px-2 py-0.5 font-mono">
                        {String(item.metadata.failureCategory)}
                      </span>
                    )}
                    {"recoveryThreshold" in item.metadata && (
                      <span className="rounded bg-muted px-2 py-0.5">
                        Streak: {String(item.metadata.consecutiveSuccesses)}/
                        {String(item.metadata.recoveryThreshold)}
                      </span>
                    )}
                    {"durationMs" in item.metadata && (
                      <span className="rounded bg-muted px-2 py-0.5">
                        Duration: {Math.round(Number(item.metadata.durationMs) / 1000)}s
                      </span>
                    )}
                    {"errorMessage" in item.metadata && item.metadata.errorMessage && (
                      <span className="w-full text-xs text-destructive">
                        {String(item.metadata.errorMessage)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
