import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useCountUp, useElementWidth } from "../hooks/use-public-motion";
import { barsForWidth, bucketTimeline, staggerStyle, type UptimeBar } from "../lib/public-motion";
import { formatPercent, timelineStatePresentation } from "../lib/status-presentation";
import { hasAnyData, legendStates } from "../lib/uptime";
import type { Availability, TimelineCell } from "../types/status-page.types";
import { Shimmer } from "./public-skeleton";

const format = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const barLabel = (bar: UptimeBar): string => {
  const label = timelineStatePresentation[bar.state].label;
  const range = `${format(bar.start)} to ${format(bar.end)}`;
  if (bar.count === 1) return `${label}, ${range}`;
  const outages = bar.downCount > 0 ? `, ${bar.downCount} with outages` : "";
  return `${label}, ${range} (${bar.count} periods${outages})`;
};

export function AnimatedPercent({
  availability,
  className,
}: {
  availability: Availability;
  className?: string;
}) {
  const target = availability.state === "ok" ? availability.percent : null;
  const value = useCountUp(target);
  return (
    <span className={cn("tabular-nums", className)}>
      {value === null ? formatPercent(null, "insufficient") : `${value.toFixed(2)}%`}
    </span>
  );
}

export function UptimeBars({
  name,
  rangeLabel,
  availability,
  timeline,
}: {
  name: string;
  rangeLabel: string;
  availability: Availability;
  timeline: TimelineCell[];
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const bars = useMemo(() => bucketTimeline(timeline, barsForWidth(width)), [timeline, width]);
  const outages = timeline.filter((cell) => cell.state === "down").length;
  const summary = `${name}, last ${rangeLabel}: ${
    availability.state === "ok"
      ? `${formatPercent(availability.percent, "ok")} availability`
      : "not enough data"
  }${outages > 0 ? `, ${outages} outage period${outages === 1 ? "" : "s"}` : ""}.`;
  const hasData = timeline.length > 0 && hasAnyData(timeline);
  const activeBar = active !== null ? bars[active] : undefined;
  const position = activeBar ? ((active as number) + 0.5) / bars.length : 0;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (bars.length === 0) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActive((current) => Math.min(bars.length - 1, (current ?? -1) + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActive((current) => Math.max(0, (current ?? bars.length) - 1));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="sr-only">{summary}</span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {rangeLabel}
        </span>
        <AnimatedPercent
          availability={availability}
          className={cn(
            "text-sm font-medium",
            availability.state === "ok" ? "text-foreground" : "text-muted-foreground",
          )}
        />
      </div>
      {!hasData ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Not enough data for this period yet.
        </p>
      ) : (
        <div className="relative">
          <div
            role="group"
            tabIndex={0}
            aria-label={`${name} uptime bars. Use arrow keys to inspect periods.`}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="flex h-9 items-stretch gap-[2px] rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {bars.map((bar, index) => (
              <span
                key={bar.key}
                data-active={active === index}
                onPointerEnter={() => setActive(index)}
                onPointerDown={() => setActive(index)}
                style={staggerStyle(index, 7, 520)}
                className={cn(
                  "ps-bar min-w-[2px] flex-1 rounded-[3px]",
                  timelineStatePresentation[bar.state].className,
                )}
              />
            ))}
          </div>
          {activeBar ? (
            <div
              role="status"
              style={{ left: `${position * 100}%` }}
              className={cn(
                "ps-fade pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg",
                position < 0.2 ? "" : position > 0.8 ? "-translate-x-full" : "-translate-x-1/2",
              )}
            >
              <p className="font-semibold">{timelineStatePresentation[activeBar.state].label}</p>
              <p className="text-muted-foreground">
                {format(activeBar.start)} – {format(activeBar.end)}
              </p>
              {activeBar.count > 1 ? (
                <p className="text-muted-foreground">
                  {activeBar.count} periods
                  {activeBar.downCount > 0 ? ` · ${activeBar.downCount} with outages` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function UptimeBarsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="flex justify-between">
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-4 w-14" />
      </div>
      <Shimmer className="h-9 w-full" />
    </div>
  );
}

export function UptimeLegend() {
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
      aria-label="Legend"
    >
      {legendStates.map((state) => {
        const presentation = timelineStatePresentation[state];
        return (
          <li key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-3 rounded-[3px] ${presentation.className}`}
            />
            {presentation.label}
          </li>
        );
      })}
    </ul>
  );
}
