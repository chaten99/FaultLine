import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatCount, formatDuration, formatPercent } from "../lib/analytics-format";
import { formatTimestamp, timelineMeta, timelineOrder } from "../lib/analytics-series";
import type { CoverageGap, TimelineCell } from "../types/analytics.types";
import { EmptyPanel } from "./section-state";

function CellDetails({ cell }: { cell: TimelineCell }) {
  const meta = timelineMeta[cell.state];
  return (
    <div className="rounded-lg border border-border bg-background p-4 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("size-3 rounded-sm", meta.swatch)} aria-hidden="true" />
        <p className="font-medium">{meta.label}</p>
        <p className="text-muted-foreground">
          {formatTimestamp(cell.start)} - {formatTimestamp(cell.end)}
        </p>
      </div>
      <p className="mt-1 text-muted-foreground">{meta.description}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Recorded checks</dt>
          <dd className="font-medium">{formatCount(cell.checks)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Failed checks</dt>
          <dd className="font-medium">{formatCount(cell.failedChecks)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Coverage</dt>
          <dd className="font-medium">{formatPercent(cell.coveragePercent, 0) ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Downtime</dt>
          <dd className="font-medium">{formatDuration(cell.downtimeMs)}</dd>
        </div>
      </dl>
      {cell.incidentId ? (
        <Link
          to={`/incidents/${cell.incidentId}`}
          className="mt-3 inline-block text-xs font-medium underline-offset-4 hover:underline"
        >
          View incident
        </Link>
      ) : null}
    </div>
  );
}

export function UptimeTimeline({
  timeline,
  gaps,
}: {
  timeline: TimelineCell[];
  gaps: CoverageGap[];
}) {
  const navigate = useNavigate();
  const [active, setActive] = useState<number | null>(null);

  if (timeline.length === 0) {
    return (
      <EmptyPanel
        title="No uptime history yet"
        description="History appears after the monitor has been tracked for a while."
      />
    );
  }

  const selected = active !== null ? timeline[active] : undefined;
  const first = timeline[0];
  const last = timeline[timeline.length - 1];

  return (
    <div className="space-y-4">
      <div
        role="list"
        aria-label="Availability history"
        className="flex h-12 w-full gap-px overflow-hidden rounded-md"
        onMouseLeave={() => setActive(null)}
      >
        {timeline.map((cell, index) => {
          const meta = timelineMeta[cell.state];
          const clickable = cell.state === "down" && cell.incidentId;
          return (
            <button
              key={`${cell.start}-${index}`}
              type="button"
              role="listitem"
              aria-label={`${meta.label}, ${formatTimestamp(cell.start)} to ${formatTimestamp(cell.end)}`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onClick={() => {
                if (clickable) void navigate(`/incidents/${cell.incidentId}`);
                else setActive(index);
              }}
              className={cn(
                "h-full min-w-px flex-1 transition-opacity focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                meta.swatch,
                active !== null && active !== index ? "opacity-70" : "",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{first ? formatTimestamp(first.start) : ""}</span>
        <span>{last ? formatTimestamp(last.end) : ""}</span>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-label="Legend">
        {timelineOrder.map((state) => (
          <li key={state} className="flex items-center gap-2">
            <span
              className={cn("size-3 rounded-sm", timelineMeta[state].swatch)}
              aria-hidden="true"
            />
            {timelineMeta[state].label}
          </li>
        ))}
      </ul>
      {selected ? (
        <CellDetails cell={selected} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Hover, focus or tap a segment for details. Select a red segment to open its incident.
        </p>
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Missing or delayed check periods</h3>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No gaps in check coverage were detected for this range.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {gaps.map((gap) => (
              <li
                key={`${gap.start}-${gap.end}`}
                className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  {formatTimestamp(gap.start)} - {formatTimestamp(gap.end)}
                </span>
                <span className="text-muted-foreground">
                  {formatDuration(gap.durationMs)} without checks
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
