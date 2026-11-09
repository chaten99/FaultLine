import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  presentAvailability,
  presentAvgResponse,
  presentDelta,
  presentDowntime,
  presentIncidentCount,
  presentSuccessRate,
  presentTotalChecks,
  type DeltaDisplay,
  type DeltaKind,
  type MetricDisplay,
} from "../lib/analytics-format";
import type { Comparison, Summary } from "../types/analytics.types";

type CardSpec = {
  key: string;
  title: string;
  help: string;
  display: MetricDisplay;
  delta: DeltaDisplay | null;
};

const buildCards = (summary: Summary, comparison: Comparison | null): CardSpec[] => {
  const delta = (kind: DeltaKind) => (comparison ? presentDelta(kind, comparison[kind]) : null);
  return [
    {
      key: "availability",
      title: "Overall availability",
      help: "Verified monitored time minus incident downtime, divided by verified monitored time. Paused periods and periods without enough completed checks are excluded, not counted as healthy.",
      display: presentAvailability(summary.availability),
      delta: delta("availabilityDeltaPoints"),
    },
    {
      key: "success-rate",
      title: "Check success rate",
      help: "Successful completed checks divided by all completed checks. Queued, running and infrastructure-failed checks are excluded.",
      display: presentSuccessRate(summary.successRate),
      delta: delta("successRateDeltaPoints"),
    },
    {
      key: "total-checks",
      title: "Total completed checks",
      help: "Checks that reached a genuine terminal result in the selected range.",
      display: presentTotalChecks(summary.totalChecks),
      delta: null,
    },
    {
      key: "avg-response",
      title: "Average response time",
      help: "Mean of measured response times from completed checks that received an HTTP response. Timeouts, DNS and network failures have no measured response and are excluded.",
      display: presentAvgResponse(summary.responseTime.avg, summary.responseTime.samples),
      delta: delta("avgResponseDeltaPercent"),
    },
    {
      key: "downtime",
      title: "Total downtime",
      help: "Combined length of recorded incident outage windows while monitoring was active, with overlapping incidents counted once and clipped to the selected range.",
      display: presentDowntime(summary.downtime),
      delta: delta("downtimeDeltaPercent"),
    },
    {
      key: "incidents",
      title: "Incidents",
      help: "Incidents whose first failure falls inside the selected range.",
      display: presentIncidentCount(summary.incidents.total, summary.incidents.open),
      delta: delta("incidentsDelta"),
    },
  ];
};

const toneClass: Record<DeltaDisplay["tone"], string> = {
  better: "text-emerald-700 dark:text-emerald-400",
  worse: "text-destructive",
  neutral: "text-muted-foreground",
};

export function SummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border bg-background p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function SummaryCards({
  summary,
  comparison = null,
  className,
}: {
  summary: Summary;
  comparison?: Comparison | null;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {buildCards(summary, comparison).map((card) => (
        <article
          key={card.key}
          className="min-w-0 space-y-2 rounded-lg border border-border bg-background p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{card.title}</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`How ${card.title} is calculated`}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-pretty whitespace-normal">
                {card.help}
              </TooltipContent>
            </Tooltip>
          </div>
          <p
            className={cn(
              "truncate font-semibold tracking-tight",
              card.display.state === "ok"
                ? "text-2xl sm:text-3xl"
                : "text-lg text-muted-foreground",
            )}
          >
            {card.display.value}
          </p>
          {card.delta ? (
            <p className={cn("text-xs font-medium", toneClass[card.delta.tone])}>
              {card.delta.text}
            </p>
          ) : null}
          {card.display.hint ? (
            <p className="text-xs text-muted-foreground">{card.display.hint}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
