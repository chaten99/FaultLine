import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePublicHistory } from "../hooks/use-public-status";
import { historyRanges } from "../lib/uptime";
import type { HistoryRange } from "../types/status-page.types";
import { UptimeLegend, UptimeStrip } from "./uptime-strip";

export function HistorySection({ slug }: { slug: string }) {
  const [range, setRange] = useState<HistoryRange>("90d");
  const history = usePublicHistory(slug, range);
  const rangeLabel = historyRanges.find((item) => item.value === range)?.label ?? range;

  return (
    <section aria-labelledby="history-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="history-heading" className="text-lg font-semibold tracking-tight">
          Uptime history
        </h2>
        <div
          role="tablist"
          aria-label="History range"
          className="flex rounded-md border border-border p-0.5"
        >
          {historyRanges.map((item) => (
            <button
              key={item.value}
              role="tab"
              type="button"
              aria-selected={range === item.value}
              onClick={() => setRange(item.value)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                range === item.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {history.isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading uptime history">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : history.isError || !history.data ? (
        <div role="alert" className="rounded-md border border-border p-4 text-sm">
          Uptime history is unavailable right now.{" "}
          <Button variant="ghost" size="sm" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-5 rounded-lg border border-border p-4">
          <UptimeStrip
            name="All services"
            rangeLabel={rangeLabel}
            availability={history.data.overall.availability}
            timeline={history.data.overall.timeline}
          />
          {history.data.services.map((service) => (
            <UptimeStrip
              key={service.id}
              name={service.name}
              rangeLabel={rangeLabel}
              availability={service.availability}
              timeline={service.timeline}
            />
          ))}
          <UptimeLegend />
          {history.data.note ? (
            <p className="text-xs text-muted-foreground">{history.data.note}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
