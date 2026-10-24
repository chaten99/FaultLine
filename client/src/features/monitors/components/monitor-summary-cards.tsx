import { Activity, CheckCircle2, PauseCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { MonitorCounts } from "../api/monitors.api";

interface MonitorSummaryCardsProps {
  counts: MonitorCounts;
  isLoading?: boolean;
}

export function MonitorSummaryCards({ counts, isLoading = false }: MonitorSummaryCardsProps) {
  if (isLoading) {
    return (
      <section className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </section>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <article className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-sm font-medium">Total monitors</span>
          <Activity className="size-4" />
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{counts.total}</p>
        <p className="mt-1 text-xs text-muted-foreground">Configured endpoints</p>
      </article>

      <article className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-sm font-medium">Active monitors</span>
          <CheckCircle2 className="size-4 text-foreground" />
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          {counts.active}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Enabled for monitoring</p>
      </article>

      <article className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-sm font-medium">Paused monitors</span>
          <PauseCircle className="size-4" />
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          {counts.paused}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Temporarily suspended</p>
      </article>
    </section>
  );
}
