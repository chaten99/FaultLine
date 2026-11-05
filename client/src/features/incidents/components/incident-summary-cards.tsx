import { AlertTriangle, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { IncidentCounts, IncidentStatus } from "../types/incident.types";
import { cn } from "@/lib/utils";

interface IncidentSummaryCardsProps {
  counts: IncidentCounts;
  selectedStatus?: "all" | IncidentStatus;
  onSelectStatus?: (status: "all" | IncidentStatus) => void;
  isLoading?: boolean;
}

export function IncidentSummaryCards({
  counts,
  selectedStatus,
  onSelectStatus,
  isLoading = false,
}: IncidentSummaryCardsProps) {
  if (isLoading) {
    return (
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </section>
    );
  }

  const cards = [
    {
      id: "open" as const,
      title: "Open incidents",
      value: counts.open,
      description: "Requires attention",
      icon: <AlertTriangle className="size-4 text-destructive" />,
      badgeColor: "text-destructive",
    },
    {
      id: "acknowledged" as const,
      title: "Acknowledged",
      value: counts.acknowledged,
      description: "Being investigated",
      icon: <Clock className="size-4 text-amber-600 dark:text-amber-400" />,
      badgeColor: "text-amber-600 dark:text-amber-400",
    },
    {
      id: "resolved" as const,
      title: "Resolved",
      value: counts.resolved,
      description: "Recovered endpoints",
      icon: <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />,
      badgeColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "all" as const,
      title: "Total incidents",
      value: counts.total,
      description: "Recorded incidents",
      icon: <ShieldAlert className="size-4" />,
      badgeColor: "text-foreground",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const isSelected = selectedStatus === card.id;
        return (
          <article
            key={card.id}
            onClick={() => onSelectStatus?.(card.id)}
            role={onSelectStatus ? "button" : undefined}
            tabIndex={onSelectStatus ? 0 : undefined}
            onKeyDown={(e) => {
              if (onSelectStatus && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelectStatus(card.id);
              }
            }}
            className={cn(
              "rounded-lg border bg-card p-5 text-card-foreground shadow-xs transition-all",
              onSelectStatus && "cursor-pointer hover:border-foreground/40",
              isSelected ? "border-foreground ring-1 ring-foreground" : "border-border",
            )}
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-sm font-medium">{card.title}</span>
              {card.icon}
            </div>
            <p className={cn("mt-3 text-3xl font-semibold tracking-tight", card.badgeColor)}>
              {card.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
          </article>
        );
      })}
    </section>
  );
}
